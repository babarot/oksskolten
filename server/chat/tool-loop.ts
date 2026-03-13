import type { Message, ToolUseBlock, ToolResultBlock, ContentBlock } from './types.js'
import type { ChatTurnParams, RunChatTurnResult, ChatSSEEvent } from './adapter.js'
import { executeTool } from './tools.js'

export const MAX_TOOL_ROUNDS = 10
export const CHAT_MAX_TOKENS = 4096

export interface ProviderCallResult {
  content: ContentBlock[]
  usage: { input_tokens: number; output_tokens: number }
}

export type ProviderCallFn = (
  allMessages: Message[],
  onEvent: (event: ChatSSEEvent) => void,
) => Promise<ProviderCallResult>

export async function runToolLoop(
  params: ChatTurnParams,
  callProvider: ProviderCallFn,
): Promise<RunChatTurnResult> {
  const { messages, onEvent, timeZone } = params
  const allMessages = [...messages]
  let totalUsage = { input_tokens: 0, output_tokens: 0 }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const result = await callProvider(allMessages, onEvent)

    totalUsage.input_tokens += result.usage.input_tokens
    totalUsage.output_tokens += result.usage.output_tokens

    allMessages.push({ role: 'assistant', content: result.content })

    const toolUseBlocks = result.content.filter(
      (b): b is ToolUseBlock => b.type === 'tool_use',
    )

    if (toolUseBlocks.length === 0) {
      onEvent({ type: 'done', usage: totalUsage })
      return { allMessages, usage: totalUsage }
    }

    const settled = await Promise.allSettled(
      toolUseBlocks.map(async (toolUse) => {
        try {
          const r = await executeTool(toolUse.name, toolUse.input, { timeZone })
          return { type: 'tool_result' as const, tool_use_id: toolUse.id, content: r }
        } catch (err) {
          return {
            type: 'tool_result' as const,
            tool_use_id: toolUse.id,
            content: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
            is_error: true as const,
          }
        } finally {
          onEvent({ type: 'tool_use_end', name: toolUse.name, tool_use_id: toolUse.id })
        }
      }),
    )
    const toolResults: ToolResultBlock[] = settled.map((s) =>
      s.status === 'fulfilled'
        ? s.value
        : { type: 'tool_result' as const, tool_use_id: '', content: JSON.stringify({ error: 'Unexpected failure' }), is_error: true as const },
    )

    allMessages.push({ role: 'user', content: toolResults })
  }

  onEvent({ type: 'error', error: 'Maximum tool call rounds exceeded' })
  onEvent({ type: 'done', usage: totalUsage })
  return { allMessages, usage: totalUsage }
}
