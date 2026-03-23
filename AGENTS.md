# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the React 19 client: page entry points in `src/pages/`, reusable UI in `src/components/`, hooks in `src/hooks/`, and browser-side utilities in `src/lib/`. `server/` holds the Fastify API, fetch pipeline, auth, chat adapters, and database access layers (`server/routes/`, `server/db/`, `server/fetcher/`, `server/providers/`). Shared contracts live in `shared/`. Static assets belong in `public/`, schema changes in `migrations/`, and longer design notes in `docs/` and `policy/`.

## Build, Test, and Development Commands
Use Node `22.x` as defined in `package.json`.

- `npm run dev`: start the Vite frontend.
- `npm run dev:server`: run the Fastify server with local `.env` loading.
- `docker compose up --build`: run frontend and backend together with the expected local stack.
- `npm run build`: create the production Vite bundle.
- `npm run lint`: run ESLint across `src/`, `server/`, and `shared/`.
- `npm run typecheck`: run TypeScript without emitting files.
- `npm test`: run all Vitest projects once.
- `npm run test:watch`: run Vitest in watch mode.

## Coding Style & Naming Conventions
Write TypeScript with clear separation between contracts, state, and implementation. Use 2-space indentation, `PascalCase` for React components, `camelCase` for functions/hooks, and `kebab-case` for file names unless a framework convention requires otherwise. Keep shared types in `shared/` or explicit API modules rather than duplicating shapes. ESLint enforces `@typescript-eslint/no-floating-promises` and React Hooks rules; fix warnings before opening a PR.

## Testing Guidelines
Follow TDD when changing behavior: write or update a failing test first, make it pass, then refactor. Client tests live next to source as `*.test.ts(x)` under `src/`; server tests mirror runtime files under `server/`. Vitest runs separate `client` and `server` projects, with JSDOM for UI tests and Node for API/database tests. Prefer focused assertions over snapshot-heavy coverage.

## Commit & Pull Request Guidelines
Recent history uses short imperative subjects such as `Clarify AUTH_DISABLED requires NODE_ENV=development`; keep commits concise and specific. Pull requests should explain user-visible impact, list key implementation points, link related issues, and include screenshots for UI changes. Note any env, migration, or auth changes explicitly so reviewers can validate them quickly.

## Security & Configuration Tips
Keep secrets in `.env` and never commit provider keys. Use `.env.example` as the starting point, and verify auth-related changes with both normal and `AUTH_DISABLED=1` development flows when relevant.
