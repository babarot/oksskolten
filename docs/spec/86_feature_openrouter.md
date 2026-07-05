# Oksskolten Spec — OpenRouter LLM Provider

> [Back to Overview](./01_overview.md)

## Overview

Add OpenRouter as an LLM provider. OpenRouter is a hosted gateway that exposes hundreds of models from many vendors (OpenAI, Anthropic, Google, Meta, Mistral, etc.) behind a single OpenAI-compatible API and one API key. Users can run summarization, translation, and chat against any OpenRouter model.

## Motivation

- **Single key, many models**: Access models from many providers without managing a separate API key per vendor.
- **Flexibility**: Route to the cheapest or most capable model per task without new integration work.
- **Fallbacks & availability**: OpenRouter transparently handles provider routing and failover.

## Design

### OpenAI-Compatible API

OpenRouter exposes `/chat/completions` compatible with the OpenAI SDK. The provider reuses the `openai` npm package with a custom `baseURL`, avoiding a new SDK dependency. This mirrors the Ollama and vLLM providers.

### Provider Registration

A new `openrouter` provider is added to the LLM provider system:

- **Provider key**: `openrouter`
- **API key**: Required. `requireKey()` throws `OPENROUTER_KEY_NOT_SET` when `api_key.openrouter` is unset. The key is stored in the settings DB (`PROVIDER_KEY_MAP.openrouter = 'api_key.openrouter'`).
- **Base URL**: Resolved in order: (1) `openrouter.base_url` DB setting, (2) `OPENROUTER_BASE_URL` environment variable, (3) `https://openrouter.ai/api/v1`. Overridable for self-hosted proxies; end users normally leave the default.
- **Client**: Uses the `openai` npm package with `baseURL` set to the resolved base URL and the OpenRouter key. An optional `X-Title` attribution header is attached via `defaultHeaders`. The client is re-created when the base URL or key changes.

### Dynamic Model Discovery

OpenRouter's model catalog is large and changes over time, so there is no static model list. Models are discovered via:

```
GET {base_url}/models
```

Response shape (relevant fields): `{ "data": [{ "id": "openai/gpt-4o-mini", "name": "OpenAI: GPT-4o mini" }] }`. The `id` is used as the model value; `name` is used as the display label. A new API route exposes this list to the frontend.

### Token Usage and Billing

OpenRouter returns token usage in the OpenAI-compatible response format (`usage.prompt_tokens`, `usage.completion_tokens`), recorded like other providers. `AiBillingMode` in `server/fetcher/ai.ts` is extended with `'openrouter'`. `getModelPricing()` returns `undefined` for OpenRouter model IDs (not in `MODELS_BY_PROVIDER`); the UI shows "—" where a cost would normally appear.

### Chat Adapter

The chat adapter reuses `runOpenAITurn()` from `adapter-openai.ts`. When the provider is `openrouter`, `adapter.ts` passes the OpenRouter client as `externalClient`, which skips the OpenAI API-key check. No separate adapter is needed.

### Configuration

Settings are stored in the SQLite settings table. `openrouter.base_url` is added to `PREF_KEYS` and `PREF_ALLOWED` (`null`, accept any string). `openrouter` is added to the allowed values for `chat.provider`, `summary.provider`, and `translate.provider`.

| Setting Key | Type | Default | Description |
|---|---|---|---|
| `api_key.openrouter` | string | — | OpenRouter API key (`sk-or-...`) |
| `openrouter.base_url` | string | `$OPENROUTER_BASE_URL` or `https://openrouter.ai/api/v1` | OpenRouter API base URL |
| `chat.provider` | string | — | Set to `openrouter` to use OpenRouter for chat |
| `chat.model` | string | — | OpenRouter model ID (e.g. `openai/gpt-4o-mini`) |
| `summary.provider` / `summary.model` | string | — | OpenRouter provider/model for summarization |
| `translate.provider` / `translate.model` | string | — | OpenRouter provider/model for translation |

### Model Validation

OpenRouter model IDs are dynamic, so `validateProviderModel()` in `settings.ts` skips model validation when the provider is `openrouter` (as with `ollama`, `vllm`, `google-translate`, and `deepl`). The `*.model` preference save path also accepts any string when the paired provider is `openrouter`.

### `shared/models.ts` Changes

- Add `openrouter` to `DEFAULT_MODELS`, `SUB_AGENT_MODELS` (empty string — no static default; sub-agent title generation is skipped).
- Add `openrouter` to `PROVIDER_LABELS` with label key `provider.openrouter` (i18n value `"OpenRouter"`).
- Add `openrouter` to `LLM_TASK_PROVIDERS`.
- `MODELS_BY_PROVIDER` does **not** include `openrouter` (models are dynamic).

### API Endpoints

**List OpenRouter Models** — `GET /api/settings/openrouter/models`

Proxies `GET {base_url}/models` and returns `{ "models": [{ "name": "openai/gpt-4o-mini", "label": "OpenAI: GPT-4o mini" }] }`. Returns `{ "models": [] }` if unreachable.

**Test OpenRouter Connection** — `GET /api/settings/openrouter/status`

Calls `GET {base_url}/models`. Response: `{ "ok": true, "model_count": 320 }` or `{ "ok": false, "error": "..." }`.

### Settings UI

- A dedicated `OpenRouterCard` component under the LLM provider section provides an API-key (secret) input, an optional base-URL input, and a "Test Connection" button that calls `GET /api/settings/openrouter/status`.
- Unlike Ollama/vLLM, OpenRouter requires a key, so `configuredKeys['openrouter']` reflects the actual key status (`GET /api/settings/api-keys/openrouter`), and the provider button is disabled until a key is saved.
- When `openrouter` is selected for a task, `ModelSelect` fetches `/api/settings/openrouter/models` via SWR and auto-selects the first model; otherwise the static `getModelGroups()` path is used.

### Test Plan

- **Unit tests** (`server/providers/llm/openrouter.test.ts`): `createMessage` request format and token counts, base URL resolution from settings/env/default, API key retrieval, `requireKey` throw/no-throw.
- **Integration**: Manual test against a live OpenRouter key. Not required for CI.

### Out of Scope

- **Per-model pricing display**: OpenRouter model pricing is not surfaced in the UI.
- **Provider routing preferences**: OpenRouter's `provider` routing options (order, allow/deny lists) are not configurable.
- **Model-specific sampling parameters**: Temperature, top-p, etc. are not configurable per provider in the current architecture.

### Key Files

| File | Purpose |
|---|---|
| `server/providers/llm/openrouter.ts` | OpenRouter LLM provider implementation |
| `server/providers/llm/index.ts` | Register `openrouter` in the provider map |
| `server/chat/adapter.ts` | Add `openrouter` routing case |
| `server/fetcher/ai.ts` | Add `'openrouter'` to `AiBillingMode` union |
| `shared/models.ts` | Add OpenRouter to provider constants and label map |
| `server/routes/settings.ts` | Add `openrouter` to allowed providers, key map, and API endpoints |
| `src/pages/settings/sections/provider-config-section.tsx` | Add `OpenRouterCard` component |
| `src/pages/settings/sections/task-model-section.tsx` | Dynamic model selector and key status for OpenRouter |
| `src/lib/i18n.ts` | Add `provider.openrouter` and OpenRouter-related i18n keys |
| `server/providers/llm/openrouter.test.ts` | Unit tests for OpenRouter provider |
