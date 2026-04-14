#!/usr/bin/env node
/**
 * MCP stdio server that exposes RSS Reader tools to Claude Code.
 *
 * Usage:
 *   tsx server/chat/mcp-server.ts
 *
 * When TOOL_LOG_PATH is set, tool execution results are appended to that file
 * so the Claude Code adapter can reconstruct tool_use/tool_result blocks.
 */
import { logger } from '../logger.js'

const log = logger.child('mcp-server')

import fs from 'node:fs'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { TOOLS } from './tools.js'

log.error('boot', {
  pid: process.pid,
  toolCount: TOOLS.length,
  toolLogPath: process.env.TOOL_LOG_PATH ?? null,
})

/**
 * Convert a flat JSON Schema properties object to a zod shape.
 * Supports: string, number, boolean (the types used in tools.ts inputSchema).
 */
function jsonSchemaToZod(
  schema: { type: 'object'; properties: Record<string, any>; required?: string[] },
): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {}
  const required = new Set(schema.required ?? [])

  for (const [key, prop] of Object.entries(schema.properties)) {
    let zodType: z.ZodTypeAny
    switch (prop.type) {
      case 'number':
        zodType = z.number()
        break
      case 'boolean':
        zodType = z.boolean()
        break
      case 'array':
        if (prop.items?.type === 'number') {
          zodType = z.array(z.number())
        } else if (prop.items?.type === 'string') {
          zodType = z.array(z.string())
        } else {
          throw new Error(`Unsupported array item type: ${prop.items?.type}`)
        }
        break
      case 'string':
        zodType = z.string()
        break
      default:
        throw new Error(`Unsupported type: ${prop.type}`)
    }

    if (prop.description) {
      zodType = zodType.describe(prop.description)
    }

    if (!required.has(key)) {
      zodType = zodType.optional()
    }

    shape[key] = zodType
  }

  return shape
}

const server = new McpServer({ name: 'oksskolten', version: '1.0.0' })

for (const tool of TOOLS) {
  const shape = jsonSchemaToZod(tool.inputSchema)
  server.tool(tool.name, tool.description, shape, async (input) => {
    log.error('tool start', { name: tool.name, input })
    const result = await tool.execute(input as Record<string, unknown>)

    // Log tool execution for the Claude Code adapter to reconstruct
    if (process.env.TOOL_LOG_PATH) {
      fs.appendFileSync(
        process.env.TOOL_LOG_PATH,
        JSON.stringify({ name: tool.name, input, result }) + '\n',
      )
    }

    log.error('tool done', { name: tool.name })
    return { content: [{ type: 'text' as const, text: result }] }
  })
}

const transport = new StdioServerTransport()
log.error('connecting stdio transport', { pid: process.pid })
await server.connect(transport)
log.error('connected stdio transport', { pid: process.pid })
