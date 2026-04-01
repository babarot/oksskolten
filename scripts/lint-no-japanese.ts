import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// Unicode ranges for Japanese characters
// Hiragana: U+3040-U+309F, Katakana: U+30A0-U+30FF, CJK: U+4E00-U+9FFF
// Also catches fullwidth forms (U+FF00-U+FFEF) and CJK punctuation (U+3000-U+303F)
const JAPANESE_RE =
  /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3000-\u303F\uFF00-\uFFEF]/

const ALLOWLIST: RegExp[] = [
  // i18n translation files
  /^src\/lib\/i18n\.ts$/,
  /^src\/lib\/demo\/i18n\.ts$/,
  /^src\/lib\/i18n\.test\.ts$/,

  // Test files — assertions often contain Japanese text
  /\.test\.tsx?$/,
  /\/__snapshots__\//,

  // Test fixtures (HTML cleaner Japanese corpus)
  /^server\/lib\/cleaner\/fixtures\//,

  // Demo / seed data
  /^src\/lib\/demo\/seed\//,

  // Font metadata (Japanese font names)
  /^src\/data\/articleFonts\.ts$/,

  // HTML cleaner boilerplate dictionary (Japanese stop-words)
  /^server\/lib\/cleaner\/boilerplate-text\.ts$/,

  // Translation provider implementation (Japanese in markdown protection logic)
  /^server\/providers\/translate\//,

  // Feishu notification card/test payloads intentionally contain Chinese copy
  /^server\/notifications\/feishu\.ts$/,

  // Binary / non-text assets
  /\.(png|jpg|jpeg|gif|ico|svg|woff2?|ttf|eot|webp|avif)$/,

  // JSON data files (seed, lock, etc.)
  /\.json$/,

  // SQL migrations may contain seed data
  /^migrations\//,

  // OPA policy tests (contain Japanese string assertions)
  /^policy\//,

  // Fetcher uses Japanese punctuation in sentence-splitting regex
  /^server\/fetcher\/content\.ts$/,
]

function isAllowed(filePath: string): boolean {
  return ALLOWLIST.some(re => re.test(filePath))
}

function main(): void {
  const trackedFiles = execSync('git ls-files -z', { encoding: 'utf-8' })
    .split('\0')
    .filter(Boolean)

  const violations: { file: string; line: number; text: string }[] = []

  for (const file of trackedFiles) {
    if (isAllowed(file)) continue

    let content: string
    try {
      content = readFileSync(file, 'utf-8')
    } catch {
      continue // skip unreadable files (deleted, binary, etc.)
    }

    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (JAPANESE_RE.test(lines[i])) {
        violations.push({ file, line: i + 1, text: lines[i].trim() })
      }
    }
  }

  if (violations.length === 0) {
    console.log('No Japanese characters found outside allowed files.')
    process.exit(0)
  }

  console.error(
    `Found Japanese characters in ${new Set(violations.map(v => v.file)).size} file(s):\n`,
  )
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`)
    console.error(`    ${v.text.slice(0, 120)}`)
  }
  console.error(
    `\nIf this file legitimately needs Japanese, add a pattern to scripts/lint-no-japanese.ts ALLOWLIST.`,
  )
  process.exit(1)
}

main()
