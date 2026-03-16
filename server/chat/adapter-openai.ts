import type OpenAI from 'openai'
import type { Message, ContentBlock, TextBlock, ToolUseBlock, ToolResultBlock } from './types.js'
import { getOpenAIClient } from '../providers/llm/openai.js'
import { getSetting } from '../db.js'
import { toOpenAITools } from './tools.js'
import type { ChatTurnParams, RunChatTurnResult } from './adapter.js'
import { runToolLoop, CHAT_MAX_TOKENS } from './tool-loop.js'

// --- Neutral → OpenAI message conversion ---

function convertMessagesToOpenAI(
  messages: Message[],
  system: string,
): OpenAI.ChatCompletionMessageParam[] {
  const result: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: system },
  ]

  for (const msg of messages) {
    const blocks = Array.isArray(msg.content)
      ? msg.content
      : [{ type: 'text' as const, text: String(msg.content) }]

    if (msg.role === 'user') {
      const toolResults = blocks.filter((b): b is ToolResultBlock => b.type === 'tool_result')
      if (toolResults.length > 0) {
        for (const tr of toolResults) {
          result.push({
            role: 'tool',
            tool_call_id: tr.tool_use_id,
            content: tr.content,
          })
        }
        continue
      }

      const textParts = blocks.filter((b): b is TextBlock => b.type === 'text').map(b => b.text)
      result.push({ role: 'user', content: textParts.join('\n') || String(msg.content) })
    } else if (msg.role === 'assistant') {
      const textParts = blocks.filter((b): b is TextBlock => b.type === 'text').map(b => b.text)
      const toolUses = blocks.filter((b): b is ToolUseBlock => b.type === 'tool_use')

      const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = {
        role: 'assistant',
        content: textParts.join('\n') || null,
      }

      if (toolUses.length > 0) {
        assistantMsg.tool_calls = toolUses.map(tu => ({
          id: tu.id,
          type: 'function' as const,
          function: {
            name: tu.name,
            arguments: JSON.stringify(tu.input),
          },
        }))
      }

      result.push(assistantMsg)
    }
  }

  return result
}

// --- OpenAI response → neutral format conversion ---

function convertResponseToNeutral(
  text: string | null,
  toolCalls: Array<{ id: string; name: string; arguments: string }>,
): ContentBlock[] {
  const content: ContentBlock[] = []
  if (text) {
    content.push({ type: 'text', text })
  }
  for (const tc of toolCalls) {
    let input: Record<string, unknown> = {}
    try { input = JSON.parse(tc.arguments) } catch { /* fallback to {} on malformed JSON from LLM */ }
    content.push({
      type: 'tool_use',
      id: tc.id,
      name: tc.name,
      input,
    })
  }
  return content
}

export async function runOpenAITurn(params: ChatTurnParams): Promise<RunChatTurnResult> {
  if (!getSetting('api_key.openai')) {
    throw new Error('OPENAI_KEY_NOT_SET')
  }

  const { system, model } = params
  const client = getOpenAIClient()
  const tools = toOpenAITools()

  return runToolLoop(params, async (allMessages, onEvent) => {
    const openaiMessages = convertMessagesToOpenAI(allMessages, system)

    const stream = await client.chat.completions.create({
      model,
      max_completion_tokens: CHAT_MAX_TOKENS,
      messages: openaiMessages,
      tools,
      stream: true,
      stream_options: { include_usage: true },
    })

    // Accumulate streamed response
    let responseText = ''
    const toolCallAccum: Map<number, { id: string; name: string; arguments: string }> = new Map()
    let finishReason: string | null = null
    let usage = { input_tokens: 0, output_tokens: 0 }

    for await (const chunk of stream) {
      const choice = chunk.choices[0]
      if (choice) {
        const textDelta = choice.delta?.content
        if (textDelta) {
          responseText += textDelta
          onEvent({ type: 'text_delta', text: textDelta })
        }

        if (choice.delta?.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            const idx = tc.index
            if (!toolCallAccum.has(idx)) {
              toolCallAccum.set(idx, { id: tc.id ?? '', name: tc.function?.name ?? '', arguments: '' })
              if (tc.function?.name) {
                onEvent({ type: 'tool_use_start', name: tc.function.name, tool_use_id: tc.id ?? '' })
              }
            }
            const accum = toolCallAccum.get(idx)!
            if (tc.id) accum.id = tc.id
            if (tc.function?.name) accum.name = tc.function.name
            if (tc.function?.arguments) accum.arguments += tc.function.arguments
          }
        }

        if (choice.finish_reason) {
          finishReason = choice.finish_reason
        }
      }

      if (chunk.usage) {
        usage.input_tokens += chunk.usage.prompt_tokens ?? 0
        usage.output_tokens += chunk.usage.completion_tokens ?? 0
      }
    }

    const toolCalls = [...toolCallAccum.values()]

    // Only include tool_use blocks when finish_reason indicates tool execution
    if (finishReason !== 'tool_calls') {
      return {
        content: convertResponseToNeutral(responseText || null, []),
        usage,
      }
    }

    return {
      content: convertResponseToNeutral(responseText || null, toolCalls),
      usage,
    }
  })
}
