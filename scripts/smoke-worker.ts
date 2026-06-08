#!/usr/bin/env node --import tsx
/**
 * Smoke test: spawn the content fetcher's Piscina worker pool, run one
 * end-to-end parse, and exit non-zero on failure.
 *
 * Vitest's worker environment does not propagate the tsx loader the way
 * `tsx watch` does in real dev, so unit-level integration tests of the
 * Piscina pool silently break on imports inside the worker. This script
 * runs under plain `node --import tsx`, mirroring the production-relevant
 * worker spawn path, and catches regressions in:
 *
 * - Piscina options that fail Node's Worker validation (e.g. V8 flags
 *   like `--max-old-space-size` in execArgv).
 * - Worker entry filename resolution (.ts vs .js, missing file).
 * - Module graph errors inside contentWorker that prevent worker startup.
 */
import { createWorkerPool } from '../server/fetcher/content.js'

const TEST_HTML = `
<html>
  <head><title>Smoke test</title></head>
  <body>
    <article>
      <h1>Hello world</h1>
      <p>This is a smoke test article with enough body text to satisfy
      Readability's minimum extraction threshold. It contains several
      sentences so the parser has something substantive to work with.</p>
      <p>A second paragraph to push past the threshold comfortably.</p>
    </article>
  </body>
</html>
`

async function main() {
  const pool = createWorkerPool()
  try {
    const result = await pool.run({
      html: TEST_HTML,
      articleUrl: 'http://smoke-test.example.com/post',
      cleanerConfig: undefined,
    })
    if (!result.fullText.includes('Hello world')) {
      console.error('FAIL: worker returned unexpected output')
      console.error('  fullText:', result.fullText.slice(0, 200))
      process.exit(1)
    }
    console.log('OK: worker spawn and parse succeeded')
  } finally {
    await pool.destroy()
  }
}

main().catch((err) => {
  console.error('FAIL: worker pool error')
  console.error(err)
  process.exit(1)
})
