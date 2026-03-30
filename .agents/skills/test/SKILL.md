---
name: test
description: Run the optimal set of vitest tests and typecheck based on changed files or arguments
user_invocable: true
---

Run the most relevant tests for this project. Automatically determine scope from context.

## Arguments

`$ARGUMENTS` can be:

- Empty → detect changed files via `git diff` and run only affected tests
- `ci` → run all CI checks: typecheck + lint + all tests
- `all` → run all tests (both server and client)
- `server` → run server tests only
- `client` → run client tests only
- `typecheck` → run typecheck only
- `lint` → run lint only
- A file path or grep pattern → pass through to vitest

## Decision logic

1. If `$ARGUMENTS` is `ci`, run `npx tsc --noEmit`, `npx eslint src/ server/ shared/`, and `npx vitest run` (all three in parallel)
2. If `$ARGUMENTS` is `all`, run `npx vitest run`
3. If `$ARGUMENTS` is `server`, run `npx vitest run --project server`
4. If `$ARGUMENTS` is `client`, run `npx vitest run --project client`
5. If `$ARGUMENTS` is `typecheck`, run `npx tsc --noEmit`
6. If `$ARGUMENTS` is `lint`, run `npx eslint src/ server/ shared/`
7. If `$ARGUMENTS` is a specific path or pattern, run `npx vitest run $ARGUMENTS`
8. If `$ARGUMENTS` is empty, detect which files have changed:
   - Run `git diff --name-only HEAD` and `git diff --name-only --staged` to find changed files
   - If changes are only under `server/` → run `--project server`
   - If changes are only under `src/` → run `--project client`
   - If changes span both → run all tests
   - If no changes detected → run all tests

## Test structure

- **server** project: `server/**/*.test.ts` (environment: node, DATABASE_URL=:memory:)
- **client** project: `src/**/*.test.{ts,tsx}` (environment: jsdom)
- **typecheck**: `npx tsc --noEmit` (full project)

## Execution

Run via `npx vitest run` (not `npm test`, to avoid mise wrapper issues in some environments).
When running `ci`, typecheck / lint / vitest are independent — run them in parallel.
After completion, summarize: how many tests passed/failed/skipped, and whether typecheck/lint succeeded.
