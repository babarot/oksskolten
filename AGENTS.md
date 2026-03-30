# Oksskolten

See `README.md` for project overview and `docs/spec/` for detailed specs.

## Database

SQLite (libsql, WAL mode) at `./data/rss.db`.

- **Reads:** `sqlite3 ./data/rss.db` works fine while the server is running (WAL allows concurrent readers).
- **Writes:** Direct sqlite3 CLI writes do not work while the server is running. WAL mode causes the server process to hold the DB connection, so external writes are silently lost. Use API endpoints instead, or add a temporary admin endpoint in `server/routes/admin.ts` for one-off data injection.
- **API keys:** Create from Settings → Security → API Tokens. Use `read,write` scope for mutation endpoints. Example: `curl -H "Authorization: Bearer ok_..." http://localhost:3000/api/...`

## Language

- **Chat:** Respond in the same language the user speaks.
- **Issues, PRs, and commit messages:** Always use English.

## Deploy Notes

- For `mangu` production deploys, use [`scripts/deploy-mangu.sh`](/Users/te/workspace/codex/oksskolten/scripts/deploy-mangu.sh) instead of ad hoc compose commands.
- The live target on `mangu` is `/home/admin/oksskolten`, compose project `oksskolten`, and persistent data dir `./data`.
- Do not treat a successful sync or local container start as sufficient proof of success. Always verify external `/api/health` and compare `buildDate`.
- If public `/api/health` works but `/` returns `404`, check `/app/dist/index.html` inside `oksskolten-server-1` before blaming Cloudflare Tunnel.
- On this host, Docker BuildKit may fail during image export with `error reading from server: EOF`. Fall back to classic builder with `DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0` and rebuild `server` with `--no-cache`.
- If `docker compose up -d` fails with `container name ... already in use`, remove the stale `oksskolten-server-1` container explicitly and retry.
- `cloudflared` can hold stale origin connections after a rebuild. If the app is healthy but the public domain still fails, restart `cloudflared`.
- `searchReady` in `/api/health` is separate from basic site reachability. A deploy can be externally reachable while search indexing is still recovering.
