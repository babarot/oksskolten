# Changelog

## [v0.4.3](https://github.com/babarot/oksskolten/compare/v0.4.2...v0.4.3) - 2026-03-26
### Others
- Add fallback mechanism for RSS description as article content by @asonas in https://github.com/babarot/oksskolten/pull/46

## [v0.4.2](https://github.com/babarot/oksskolten/compare/v0.4.1...v0.4.2) - 2026-03-26
### Improvements
- Add support for custom key bindings in settings by @asonas in https://github.com/babarot/oksskolten/pull/37
- Refactor `safeFetch` to exclude certain HTTP status codes as redirects by @asonas in https://github.com/babarot/oksskolten/pull/42
- Update keyboard navigation to include prefetching on near-end items by @asonas in https://github.com/babarot/oksskolten/pull/43
- Expose article original URL as data-original-url attribute on all car… by @asonas in https://github.com/babarot/oksskolten/pull/44

## [v0.4.1](https://github.com/babarot/oksskolten/compare/v0.4.0...v0.4.1) - 2026-03-23
### Bug fixes
- Fix multibyte URL lookup returning 404 by @babarot in https://github.com/babarot/oksskolten/pull/31

## [v0.4.0](https://github.com/babarot/oksskolten/compare/v0.3.0...v0.4.0) - 2026-03-20
### New Features
- Add Ollama as a self-hosted LLM provider by @asonas in https://github.com/babarot/oksskolten/pull/25
- Add retention policy with configurable article cleanup by @babarot in https://github.com/babarot/oksskolten/pull/24
### Bug fixes
- Fix mojibake on non-UTF-8 articles and feeds by @Just2enough in https://github.com/babarot/oksskolten/pull/23
### Improvements
- Perf/score recalc daily batch by @asonas in https://github.com/babarot/oksskolten/pull/19
- Update article excerpt generation to strip Markdown syntax by @asonas in https://github.com/babarot/oksskolten/pull/21
- Improve decodeResponse portability and test coverage by @babarot in https://github.com/babarot/oksskolten/pull/26

## [v0.3.0](https://github.com/babarot/oksskolten/compare/v0.2.0...v0.3.0) - 2026-03-19
### New Features
- Feature/keyboard navigation by @asonas in https://github.com/babarot/oksskolten/pull/12
### Bug fixes
- Feature/retry backoff by @asonas in https://github.com/babarot/oksskolten/pull/18
### Others
- Reject http:// URLs in feed and clip endpoints by @babarot in https://github.com/babarot/oksskolten/pull/15
- Add mocks for unused components and hooks in `article-list.test.tsx` by @asonas in https://github.com/babarot/oksskolten/pull/16

## [v0.2.0](https://github.com/babarot/oksskolten/compare/v0.1.1...v0.2.0) - 2026-03-18
### New Features
- Add similar article detection across feeds by @babarot in https://github.com/babarot/oksskolten/pull/11
### Bug fixes
- Update task model section to include Claude Code Ready in key checks by @asonas in https://github.com/babarot/oksskolten/pull/13

## [v0.1.1](https://github.com/babarot/oksskolten/compare/v0.1.0...v0.1.1) - 2026-03-17
- Fix category select dropdown not appearing above modal overlay by @gymynnym in https://github.com/babarot/oksskolten/pull/7

## [v0.1.0](https://github.com/babarot/oksskolten/commits/v0.1.0) - 2026-03-15
- Update name in Wrangler configuration file to match deployed Worker by @cloudflare-workers-and-pages[bot] in https://github.com/babarot/oksskolten/pull/2
