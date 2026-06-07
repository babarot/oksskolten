import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

/**
 * Resolve the data directory.
 *
 * Priority:
 *   1. DATA_DIR environment variable (explicit override)
 *   2. ./data (when running inside the project — dev / Docker container)
 *   3. ~/.oksskolten/data (standalone: SSH + MCP server, etc.)
 */
export function resolveDataDir(
  env: string | undefined = process.env.DATA_DIR,
  localExists: () => boolean = () => {
    try { return fs.statSync(path.resolve('data')).isDirectory() } catch { return false }
  },
  homedir: string = os.homedir(),
): string {
  if (env) {
    return path.resolve(env)
  }

  if (localExists()) {
    return path.resolve('data')
  }

  return path.join(homedir, '.oksskolten', 'data')
}

export const DATA_DIR = resolveDataDir()

export function dataPath(...segments: string[]): string {
  return path.join(DATA_DIR, ...segments)
}

/**
 * Find the project root directory by walking up from __dirname until
 * package.json is found. Works under both tsx (source) and compiled
 * (dist/ or dist-server/) environments where __dirname depth differs.
 *
 * Assumes a single-package layout (no monorepo workspaces) where the
 * first package.json walking upward is the project root. Will produce
 * incorrect results in a multi-package workspace with nested
 * package.json files.
 */
export function findProjectRoot(dirname: string): string {
  let dir = dirname
  while (true) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return dir // hit filesystem root
    dir = parent
  }
}
