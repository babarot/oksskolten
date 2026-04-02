import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Message, TextBlock, ToolUseBlock, ToolResultBlock } from './types.js'
import type { ChatTurnParams, RunChatTurnResult } from './adapter.js'
import { logger } from '../logger.js'

const log = logger.child('claude-code')

const CLAUDE_CODE_TIMEOUT_MS = 90_000

/**
 * Build a text prompt from DB-stored Anthropic-format messages.
 * Includes tool_use / tool_result blocks as text so Claude Code can
 * understand the full conversation context.
 */
function buildPrompt(messages: Message[]): string {
  const turns: string[] = []

  for (const msg of messages) {
    const role = msg.role === 'user' ? 'User' : 'Assistant'
    if (typeof msg.content === 'string') {
      turns.push(`${role}: ${msg.content}`)
      continue
    }

    const parts: string[] = []
    for (const block of msg.content) {
      if (block.type === 'text') {
        parts.push((block as TextBlock).text)
      } else if (block.type === 'tool_use') {
        const tu = block as ToolUseBlock
        parts.push(`[Tool: ${tu.name}(${JSON.stringify(tu.input)})]`)
      } else if (block.type === 'tool_result') {
        const tr = block as ToolResultBlock
        parts.push(`[Tool Result (${tr.tool_use_id}): ${tr.content}]`)
      }
    }
    if (parts.length > 0) {
      turns.push(`${role}: ${parts.join('\n')}`)
    }
  }

  return `<conversation_history>\n${turns.join('\n\n')}\n</conversation_history>`
}

/**
 * Spawn `claude -p` as a subprocess and map stream-json output to ChatSSEEvent.
 * Uses MCP config to expose RSS Reader tools.
 * Does NOT use --session-id/--resume — DB is the single source of truth.
 */
export async function runClaudeCodeTurn(params: ChatTurnParams): Promise<RunChatTurnResult> {
  const { messages, system, model, onEvent, scope } = params

  // Create tool log temp file for MCP server to write to
  const toolLogPath = path.join(os.tmpdir(), `oksskolten-tool-log-${Date.now()}.jsonl`)
  const mcpServerPath = path.resolve(import.meta.dirname, 'mcp-server.ts')
  const tsxCliPath = path.resolve(import.meta.dirname, '../../node_modules/tsx/dist/cli.mjs')

  // Build MCP config pointing to our MCP server
  const mcpConfig = {
    mcpServers: {
      'oksskolten': {
        command: process.execPath,
        args: [tsxCliPath, mcpServerPath],
        env: {
          TOOL_LOG_PATH: toolLogPath,
          ...(scope ? { CHAT_SCOPE_JSON: JSON.stringify(scope) } : {}),
        },
      },
    },
  }

  // Build the text prompt from conversation history
  const prompt = buildPrompt(messages)

  const args = [
    '-p',
    '--verbose',
    '--mcp-debug',
    '--include-partial-messages',
    '--output-format', 'stream-json',
    '--model', model,
    '--system-prompt', system,
    '--mcp-config', JSON.stringify(mcpConfig),
    '--no-session-persistence',
    '--dangerously-skip-permissions',
    '--disallowedTools', 'Bash,Edit,Write,Read,Glob,Grep,WebFetch,WebSearch,NotebookEdit,Agent',
  ]

  return new Promise<RunChatTurnResult>((resolve, reject) => {
    if (!fs.existsSync(tsxCliPath)) {
      log.error('tsx CLI not found', { tsxCliPath })
      reject(new Error(`tsx CLI not found at ${tsxCliPath}`))
      return
    }

    log.error('spawn start', {
      model,
      mcpCommand: process.execPath,
      mcpArgs: [tsxCliPath, mcpServerPath],
      toolLogPath,
    })

    const proc = spawn('claude', args, {
      env: { ...process.env, CLAUDECODE: '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    log.error('spawned', { pid: proc.pid ?? null })
    proc.stdin.write(prompt)
    proc.stdin.end()

    let accumulatedText = ''
    let totalUsage = { input_tokens: 0, output_tokens: 0 }
    let buffer = ''
    let stderrText = ''
    let timeoutMessage: string | null = null
    let sawTextDelta = false
    const activeThinkingBlocks = new Set<number>()
    let sawStdout = false
    let sawStderr = false

    // Track tool_use blocks by index for matching start/stop
    const activeToolBlocks = new Map<number, { name: string; id: string }>()
    let timeoutId: NodeJS.Timeout | null = null

    const refreshTimeout = () => {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        timeoutMessage = `Claude Code timed out after ${Math.round(CLAUDE_CODE_TIMEOUT_MS / 1000)}s`
        log.error('timeout', { pid: proc.pid ?? null, timeoutMs: CLAUDE_CODE_TIMEOUT_MS })
        proc.kill('SIGKILL')
      }, CLAUDE_CODE_TIMEOUT_MS)
    }

    refreshTimeout()

    proc.stdout.on('data', (chunk: Buffer) => {
      refreshTimeout()
      if (!sawStdout) {
        sawStdout = true
        log.error('first stdout chunk', {
          pid: proc.pid ?? null,
          bytes: chunk.length,
          preview: chunk.toString().slice(0, 500),
        })
      }
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line)
          handleStreamEvent(event, onEvent, activeToolBlocks, activeThinkingBlocks, {
            appendText: (t: string) => { accumulatedText += t },
            setUsage: (u: { input_tokens: number; output_tokens: number }) => { totalUsage = u },
            hasTextDelta: () => sawTextDelta,
            markTextDelta: () => { sawTextDelta = true },
          })
        } catch {
          // Skip non-JSON lines
        }
      }
    })

    proc.stderr.on('data', (chunk: Buffer) => {
      refreshTimeout()
      // Log stderr but don't fail — Claude Code emits progress info
      const text = chunk.toString().trim()
      if (text) {
        if (!sawStderr) {
          sawStderr = true
          log.error('first stderr chunk', {
            pid: proc.pid ?? null,
            bytes: chunk.length,
            preview: text.slice(0, 500),
          })
        }
        stderrText = [stderrText, text].filter(Boolean).join('\n').slice(-4000)
        log.error('stderr', text)
      }
    })

    proc.on('close', (code) => {
      if (timeoutId) clearTimeout(timeoutId)
      log.error('close', {
        pid: proc.pid ?? null,
        code,
        sawStdout,
        sawStderr,
        accumulatedTextLength: accumulatedText.length,
      })

      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer)
          handleStreamEvent(event, onEvent, activeToolBlocks, activeThinkingBlocks, {
            appendText: (t: string) => { accumulatedText += t },
            setUsage: (u: { input_tokens: number; output_tokens: number }) => { totalUsage = u },
            hasTextDelta: () => sawTextDelta,
            markTextDelta: () => { sawTextDelta = true },
          })
        } catch {
          // ignore
        }
      }

      // Read tool log to reconstruct structured messages
      const toolLogs = readToolLog(toolLogPath)

      // Build allMessages for DB storage
      const allMessages = buildAllMessages(messages, accumulatedText, toolLogs)

      if (timeoutMessage) {
        reject(new Error(timeoutMessage))
        return
      }

      if (code !== 0 && !accumulatedText) {
        const suffix = stderrText ? `: ${stderrText}` : ''
        reject(new Error(`claude process exited with code ${code}${suffix}`))
        return
      }

      onEvent({ type: 'done', usage: totalUsage })
      resolve({ allMessages, usage: totalUsage })
    })

    proc.on('error', (err) => {
      log.error('process error', {
        pid: proc.pid ?? null,
        message: err.message,
      })
      onEvent({ type: 'error', error: `Failed to start claude: ${err.message}` })
      reject(err)
    })
  })
}

interface StreamHandlers {
  appendText: (text: string) => void
  setUsage: (usage: { input_tokens: number; output_tokens: number }) => void
  hasTextDelta: () => boolean
  markTextDelta: () => void
}

const loggedUnhandledEventTypes = new Set<string>()

/**
 * Map Claude Code stream-json events to ChatSSEEvent.
 */
function handleStreamEvent(
  event: any,
  onEvent: (event: import('./adapter.js').ChatSSEEvent) => void,
  activeToolBlocks: Map<number, { name: string; id: string }>,
  activeThinkingBlocks: Set<number>,
  handlers: StreamHandlers,
): void {
  if (event.type === 'system') {
    return
  }

  if (event.type === 'stream_event' && event.event) {
    handleStreamEvent(event.event, onEvent, activeToolBlocks, activeThinkingBlocks, handlers)
    return
  }

  if (event.type === 'message_start' || event.type === 'message_stop') {
    return
  }

  if (event.type === 'message_delta') {
    if (event.usage) {
      handlers.setUsage({
        input_tokens: event.usage.input_tokens ?? 0,
        output_tokens: event.usage.output_tokens ?? 0,
      })
    }
    return
  }

  // Claude Code stream-json emits full messages by default:
  // system(init) -> assistant/user messages -> result.
  if (event.type === 'assistant') {
    if (handlers.hasTextDelta()) return
    const content = event.message?.content ?? event.content ?? []
    for (const block of content) {
      if (block?.type === 'text' && typeof block.text === 'string' && block.text) {
        handlers.appendText(block.text)
        onEvent({ type: 'text_delta', text: block.text })
      } else if ((block?.type === 'tool_use' || block?.type === 'server_tool_use') && block.name && block.id) {
        onEvent({ type: 'tool_use_start', name: block.name, tool_use_id: block.id })
        onEvent({ type: 'tool_use_end', name: block.name, tool_use_id: block.id })
      }
    }
    return
  }

  // Text delta
  if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
    const text = event.delta.text
    handlers.markTextDelta()
    handlers.appendText(text)
    onEvent({ type: 'text_delta', text })
    return
  }

  if (event.type === 'content_block_delta' && event.delta?.type === 'thinking_delta') {
    onEvent({ type: 'thinking_start' })
    return
  }

  // Tool use start
  if (event.type === 'content_block_start' && event.content_block?.type === 'thinking') {
    const index = event.index ?? 0
    activeThinkingBlocks.add(index)
    onEvent({ type: 'thinking_start' })
    return
  }

  if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
    const { name, id } = event.content_block
    const index = event.index ?? 0
    activeToolBlocks.set(index, { name, id })
    onEvent({ type: 'tool_use_start', name, tool_use_id: id })
    return
  }

  // Tool use end (content_block_stop for a tool_use index)
  if (event.type === 'content_block_stop') {
    const index = event.index ?? 0
    if (activeThinkingBlocks.has(index)) {
      onEvent({ type: 'thinking_end' })
      activeThinkingBlocks.delete(index)
      return
    }
    const toolBlock = activeToolBlocks.get(index)
    if (toolBlock) {
      onEvent({ type: 'tool_use_end', name: toolBlock.name, tool_use_id: toolBlock.id })
      activeToolBlocks.delete(index)
    }
    return
  }

  // Result event — contains final usage
  if (event.type === 'result') {
    if (!handlers.hasTextDelta() && typeof event.result === 'string' && event.result) {
      handlers.appendText(event.result)
      onEvent({ type: 'text_delta', text: event.result })
    }
    if (event.usage) {
      handlers.setUsage({
        input_tokens: event.usage.input_tokens ?? 0,
        output_tokens: event.usage.output_tokens ?? 0,
      })
    }
    return
  }

  const eventType = typeof event?.type === 'string' ? event.type : 'unknown'
  if (!loggedUnhandledEventTypes.has(eventType)) {
    loggedUnhandledEventTypes.add(eventType)
    log.error('unhandled event type', {
      type: eventType,
      preview: JSON.stringify(event).slice(0, 500),
    })
  }
}

interface ToolLogEntry {
  name: string
  input: Record<string, unknown>
  result: string
}

/**
 * Read tool execution log written by MCP server.
 */
function readToolLog(logPath: string): ToolLogEntry[] {
  try {
    if (!fs.existsSync(logPath)) return []
    const content = fs.readFileSync(logPath, 'utf-8')
    const entries: ToolLogEntry[] = []
    for (const line of content.split('\n')) {
      if (!line.trim()) continue
      try {
        entries.push(JSON.parse(line))
      } catch {
        // skip malformed lines
      }
    }
    // Clean up temp file
    fs.unlinkSync(logPath)
    return entries
  } catch {
    return []
  }
}

/**
 * Build Anthropic-format allMessages array for DB storage.
 * Includes structured tool_use/tool_result blocks reconstructed from MCP log.
 */
function buildAllMessages(
  existingMessages: Message[],
  assistantText: string,
  toolLogs: ToolLogEntry[],
): Message[] {
  const allMessages = [...existingMessages]

  if (toolLogs.length > 0) {
    const assistantContent: ToolUseBlock[] = []
    const toolResultContent: ToolResultBlock[] = []

    for (let i = 0; i < toolLogs.length; i++) {
      const log = toolLogs[i]
      const toolUseId = `gen-${i + 1}`
      assistantContent.push({
        type: 'tool_use',
        id: toolUseId,
        name: log.name,
        input: log.input,
      })
      toolResultContent.push({
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: log.result,
      })
    }

    allMessages.push({ role: 'assistant', content: assistantContent })
    allMessages.push({ role: 'user', content: toolResultContent })
    if (assistantText) {
      allMessages.push({
        role: 'assistant',
        content: [{ type: 'text', text: assistantText }],
      })
    }
  } else if (assistantText) {
    allMessages.push({
      role: 'assistant',
      content: [{ type: 'text', text: assistantText }],
    })
  }

  return allMessages
}
