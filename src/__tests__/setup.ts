import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Node.js 25+ ships a built-in localStorage that lacks full Web Storage API.
// Provide a proper in-memory implementation for tests.
const localStore = new Map<string, string>()

const localStorageMock: Storage = {
  get length() {
    return localStore.size
  },
  clear() {
    localStore.clear()
  },
  getItem(key: string) {
    return localStore.get(key) ?? null
  },
  key(index: number) {
    return [...localStore.keys()][index] ?? null
  },
  removeItem(key: string) {
    localStore.delete(key)
  },
  setItem(key: string, value: string) {
    localStore.set(key, String(value))
  },
}

const sessionStore = new Map<string, string>()

const sessionStorageMock: Storage = {
  get length() {
    return sessionStore.size
  },
  clear() {
    sessionStore.clear()
  },
  getItem(key: string) {
    return sessionStore.get(key) ?? null
  },
  key(index: number) {
    return [...sessionStore.keys()][index] ?? null
  },
  removeItem(key: string) {
    sessionStore.delete(key)
  },
  setItem(key: string, value: string) {
    sessionStore.set(key, String(value))
  },
}

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
})

Object.defineProperty(globalThis, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true,
  configurable: true,
})

afterEach(() => {
  cleanup()
  localStore.clear()
  sessionStore.clear()
})

// Radix UI Dialog/AlertDialog needs ResizeObserver and scrollTo in jsdom
if (typeof window !== 'undefined') {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof window.ResizeObserver
  }
  if (!window.scrollTo) {
    window.scrollTo = () => {}
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }
}

// window.matchMedia is not implemented in jsdom / happy-dom
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}
