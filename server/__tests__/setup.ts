import { vi } from 'vitest'

// Mock DNS resolution to avoid real network lookups in tests.
// Without this, safeFetch → assertSafeUrl → dns.lookup() performs real DNS
// queries whose latency varies by environment, causing flaky timeouts.
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn().mockResolvedValue({ address: '93.184.216.34', family: 4 }),
}))

// Global Piscina mock for all server tests.
// Prevents worker threads from spawning during tests, which would fail
// because the worker (contentWorker.ts) imports .js extensions that
// only resolve at runtime with the tsx loader.
vi.mock('piscina', () => {
  return {
    Piscina: class MockPiscina {
      private handler: ((input: unknown) => unknown) | null = null
      private _loadPromise: Promise<void>
      constructor(opts: { filename: string }) {
        this.handler = null
        this._loadPromise = import(opts.filename).then(mod => {
          this.handler = mod.default
        })
      }
      async run(input: unknown) {
        await this._loadPromise
        return this.handler!(input)
      }
    },
  }
})
