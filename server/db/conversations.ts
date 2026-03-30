import { getDb, runNamed, allNamed } from './connection.js'
import type { Conversation, ChatMessage } from './types.js'
import { getCurrentUserId } from '../identity.js'

function resolveUserId(userId?: number | null): number | null {
  return userId ?? getCurrentUserId()
}

export function createConversation(data: {
  id: string
  title?: string | null
  article_id?: number | null
  user_id?: number | null
}): Conversation {
  const scopedUserId = data.user_id ?? resolveUserId()
  runNamed(`
    INSERT INTO conversations (id, user_id, title, article_id)
    VALUES (@id, @user_id, @title, @article_id)
  `, {
    id: data.id,
    user_id: scopedUserId ?? null,
    title: data.title ?? null,
    article_id: data.article_id ?? null,
  })
  return getDb().prepare('SELECT * FROM conversations WHERE id = ?').get(data.id) as Conversation
}

export function getConversations(opts?: {
  article_id?: number
  limit?: number
  userId?: number | null
}): Conversation[] {
  const conditions: string[] = []
  const params: Record<string, unknown> = {}
  const scopedUserId = resolveUserId(opts?.userId)

  if (scopedUserId != null) {
    conditions.push('c.user_id = @user_id')
    params.user_id = scopedUserId
  }

  if (opts?.article_id) {
    conditions.push('c.article_id = @article_id')
    params.article_id = opts.article_id
  }

  conditions.push('EXISTS (SELECT 1 FROM chat_messages m WHERE m.conversation_id = c.id)')

  const where = 'WHERE ' + conditions.join(' AND ')
  const limit = opts?.limit ?? 50

  return allNamed<Conversation & {
    message_count: number
    article_title: string | null
    article_url: string | null
    article_og_image: string | null
    first_user_message: string | null
    first_assistant_preview: string | null
  }>(`
    SELECT c.*,
           (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id AND m.content LIKE '%"type":"text"%') AS message_count,
           a.title AS article_title,
           a.url AS article_url,
           a.og_image AS article_og_image,
           (SELECT content FROM chat_messages m WHERE m.conversation_id = c.id AND m.role = 'user' ORDER BY m.id ASC LIMIT 1) AS first_user_message,
           (SELECT content FROM chat_messages m WHERE m.conversation_id = c.id AND m.role = 'assistant' AND content LIKE '%"type":"text"%' ORDER BY m.id ASC LIMIT 1) AS first_assistant_preview
    FROM conversations c
    LEFT JOIN active_articles a ON c.article_id = a.id
    ${where}
    ORDER BY c.updated_at DESC
    LIMIT ${Number(limit)}
  `, params)
}

export function getConversationById(id: string, userId?: number | null): Conversation | undefined {
  const scopedUserId = resolveUserId(userId)
  return getDb().prepare(
    `SELECT * FROM conversations WHERE id = ? ${scopedUserId == null ? '' : 'AND user_id = ?'}`,
  ).get(...(scopedUserId == null ? [id] : [id, scopedUserId])) as Conversation | undefined
}

export function updateConversation(
  id: string,
  data: { title?: string },
  userId?: number | null,
): Conversation | undefined {
  const conv = getConversationById(id, userId)
  if (!conv) return undefined
  const scopedUserId = resolveUserId(userId)

  const fields: string[] = ["updated_at = datetime('now')"]
  const params: Record<string, unknown> = { id }

  if (data.title !== undefined) {
    fields.push('title = @title')
    params.title = data.title
  }

  if (scopedUserId != null) {
    params.user_id = scopedUserId
    runNamed(`UPDATE conversations SET ${fields.join(', ')} WHERE id = @id AND user_id = @user_id`, params)
  } else {
    runNamed(`UPDATE conversations SET ${fields.join(', ')} WHERE id = @id`, params)
  }
  return getDb().prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Conversation
}

export function deleteConversation(id: string, userId?: number | null): boolean {
  const scopedUserId = resolveUserId(userId)
  const result = getDb().prepare(
    `DELETE FROM conversations WHERE id = ? ${scopedUserId == null ? '' : 'AND user_id = ?'}`,
  ).run(...(scopedUserId == null ? [id] : [id, scopedUserId]))
  return result.changes > 0
}

// --- Chat message queries ---

export function insertChatMessage(data: {
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  user_id?: number | null
}): ChatMessage {
  const scopedUserId = data.user_id
    ?? resolveUserId()
    ?? (getDb().prepare('SELECT user_id FROM conversations WHERE id = ?').get(data.conversation_id) as { user_id: number | null } | undefined)?.user_id
  return getDb().transaction(() => {
    const info = runNamed(`
      INSERT INTO chat_messages (user_id, conversation_id, role, content)
      VALUES (@user_id, @conversation_id, @role, @content)
    `, {
      user_id: scopedUserId ?? null,
      conversation_id: data.conversation_id,
      role: data.role,
      content: data.content,
    })
    getDb().prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(data.conversation_id)
    return getDb().prepare('SELECT * FROM chat_messages WHERE id = ?').get(info.lastInsertRowid) as ChatMessage
  })()
}

export function getChatMessages(conversationId: string, userId?: number | null): ChatMessage[] {
  const scopedUserId = resolveUserId(userId)
  return getDb().prepare(
    `SELECT * FROM chat_messages
     WHERE conversation_id = ?
       ${scopedUserId == null ? '' : 'AND user_id = ?'}
     ORDER BY id ASC`,
  ).all(...(scopedUserId == null ? [conversationId] : [conversationId, scopedUserId])) as ChatMessage[]
}

export function deleteChatMessage(id: number, userId?: number | null): boolean {
  const scopedUserId = resolveUserId(userId)
  return getDb().transaction(() => {
    const message = getDb().prepare(
      `SELECT conversation_id FROM chat_messages WHERE id = ? ${scopedUserId == null ? '' : 'AND user_id = ?'}`,
    ).get(...(scopedUserId == null ? [id] : [id, scopedUserId])) as { conversation_id: string } | undefined
    if (!message) return false
    const result = getDb().prepare(
      `DELETE FROM chat_messages WHERE id = ? ${scopedUserId == null ? '' : 'AND user_id = ?'}`,
    ).run(...(scopedUserId == null ? [id] : [id, scopedUserId]))
    if (result.changes > 0) {
      getDb().prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(message.conversation_id)
    }
    return result.changes > 0
  })()
}

export function replaceChatMessages(
  conversationId: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  userId?: number | null,
): void {
  const scopedUserId = resolveUserId(userId)
  const tx = getDb().transaction(() => {
    getDb().prepare(
      `DELETE FROM chat_messages WHERE conversation_id = ? ${scopedUserId == null ? '' : 'AND user_id = ?'}`,
    ).run(...(scopedUserId == null ? [conversationId] : [conversationId, scopedUserId]))
    const insertSql = `
      INSERT INTO chat_messages (user_id, conversation_id, role, content)
      VALUES (@user_id, @conversation_id, @role, @content)
    `
    for (const message of messages) {
      runNamed(insertSql, {
        user_id: scopedUserId ?? null,
        conversation_id: conversationId,
        role: message.role,
        content: message.content,
      })
    }
    getDb().prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(conversationId)
  })
  tx()
}
