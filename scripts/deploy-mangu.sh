#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

REMOTE_HOST="${REMOTE_HOST:-mangu}"
REMOTE_PORT="${REMOTE_PORT:-22}"
REMOTE_DIR="${REMOTE_DIR:-/home/admin/oksskolten}"
PROJECT_NAME="${PROJECT_NAME:-oksskolten}"
DATA_DIR="${DATA_DIR:-./data}"
PUBLIC_URL="${PUBLIC_URL:-https://reader.qingqiuhe.cc.cd}"
SERVER_IMAGE="${SERVER_IMAGE:-}"
MEILI_MASTER_KEY="${MEILI_MASTER_KEY:-}"
TUNNEL_TOKEN="${TUNNEL_TOKEN:-}"
GHCR_USERNAME="${GHCR_USERNAME:-}"
GHCR_TOKEN="${GHCR_TOKEN:-}"
EXPECTED_GIT_COMMIT="${EXPECTED_GIT_COMMIT:-}"
EXPECTED_GIT_TAG="${EXPECTED_GIT_TAG:-}"
EXPECTED_BUILD_DATE="${EXPECTED_BUILD_DATE:-}"
SSH_OPTS="${SSH_OPTS:-}"

usage() {
  cat <<'EOF'
Usage: scripts/deploy-mangu.sh

Deploy a pre-built server image to mangu by syncing production compose files,
updating the remote .env, pulling the target image, and validating health.

Required environment:
  SERVER_IMAGE  Fully-qualified image reference or digest to deploy

Optional overrides:
  REMOTE_HOST           SSH target (default: mangu)
  REMOTE_PORT           SSH port (default: 22)
  REMOTE_DIR            Remote deploy directory (default: /home/admin/oksskolten)
  PROJECT_NAME          Docker Compose project name (default: oksskolten)
  DATA_DIR              Production data dir for compose (default: ./data)
  PUBLIC_URL            Public site URL to verify after deploy
  MEILI_MASTER_KEY      Persist to remote .env if provided
  TUNNEL_TOKEN          Persist to remote .env if provided
  GHCR_USERNAME         Optional GHCR username for remote docker login
  GHCR_TOKEN            Optional GHCR token for remote docker login
  EXPECTED_GIT_COMMIT   Optional metadata check against /api/health
  EXPECTED_GIT_TAG      Optional metadata check against /api/health
  EXPECTED_BUILD_DATE   Optional metadata check against /api/health
  SSH_OPTS              Extra ssh options, split on spaces
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ -z "$SERVER_IMAGE" ]]; then
  echo "Error: SERVER_IMAGE is required" >&2
  usage >&2
  exit 1
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command not found: $1" >&2
    exit 1
  fi
}

require_cmd rsync
require_cmd ssh
require_cmd curl

cd "$REPO_ROOT"

declare -a SSH_CMD
SSH_CMD=(ssh)
RSYNC_RSH="ssh"

if [[ -n "$REMOTE_PORT" ]]; then
  SSH_CMD+=(-p "$REMOTE_PORT")
  RSYNC_RSH+=" -p ${REMOTE_PORT}"
fi

if [[ -n "$SSH_OPTS" ]]; then
  # shellcheck disable=SC2206
  EXTRA_SSH_OPTS=($SSH_OPTS)
  SSH_CMD+=("${EXTRA_SSH_OPTS[@]}")
  RSYNC_RSH+=" ${SSH_OPTS}"
fi

remote_exec() {
  "${SSH_CMD[@]}" "$REMOTE_HOST" "$@"
}

remote_bash() {
  "${SSH_CMD[@]}" "$REMOTE_HOST" "bash -s" -- "$@"
}

sync_manifests() {
  rsync \
    -az \
    -e "$RSYNC_RSH" \
    compose.yaml \
    compose.prod.yaml \
    "${REMOTE_HOST}:${REMOTE_DIR}/"
}

get_remote_current_image() {
  remote_bash "$REMOTE_DIR" "$PROJECT_NAME" <<'EOF'
set -euo pipefail
remote_dir="$1"
project_name="$2"
cd "$remote_dir" 2>/dev/null || exit 0

if [[ -f .env ]]; then
  current_env_image="$(sed -n 's/^SERVER_IMAGE=//p' .env | tail -n 1)"
  if [[ -n "$current_env_image" ]]; then
    printf '%s\n' "$current_env_image"
    exit 0
  fi
fi

server_cid="$(docker compose -p "$project_name" -f compose.yaml -f compose.prod.yaml ps -q server 2>/dev/null || true)"
if [[ -n "$server_cid" ]]; then
  docker inspect -f '{{.Config.Image}}' "$server_cid" 2>/dev/null || true
fi
EOF
}

deploy_remote_image() {
  local remote_cmd
  printf -v remote_cmd \
    'REMOTE_DIR=%q PROJECT_NAME=%q DATA_DIR=%q SERVER_IMAGE=%q MEILI_MASTER_KEY=%q TUNNEL_TOKEN=%q GHCR_USERNAME=%q GHCR_TOKEN=%q EXPECTED_GIT_COMMIT=%q EXPECTED_GIT_TAG=%q EXPECTED_BUILD_DATE=%q bash -s' \
    "$REMOTE_DIR" \
    "$PROJECT_NAME" \
    "$DATA_DIR" \
    "$SERVER_IMAGE" \
    "$MEILI_MASTER_KEY" \
    "$TUNNEL_TOKEN" \
    "$GHCR_USERNAME" \
    "$GHCR_TOKEN" \
    "$EXPECTED_GIT_COMMIT" \
    "$EXPECTED_GIT_TAG" \
    "$EXPECTED_BUILD_DATE"

  remote_exec "$remote_cmd" <<'EOF'
set -euo pipefail

remote_dir="$REMOTE_DIR"
project_name="$PROJECT_NAME"
data_dir="$DATA_DIR"
server_image="$SERVER_IMAGE"
meili_master_key="$MEILI_MASTER_KEY"
tunnel_token="$TUNNEL_TOKEN"
ghcr_username="$GHCR_USERNAME"
ghcr_token="$GHCR_TOKEN"
expected_git_commit="$EXPECTED_GIT_COMMIT"
expected_git_tag="$EXPECTED_GIT_TAG"
expected_build_date="$EXPECTED_BUILD_DATE"

cd "$remote_dir"
touch .env

set_env() {
  local key="$1"
  local value="$2"
  local tmp
  tmp="$(mktemp)"
  if [[ -f .env ]]; then
    grep -v "^${key}=" .env > "$tmp" || true
  fi
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" .env
}

get_env() {
  local key="$1"
  sed -n "s/^${key}=//p" .env | tail -n 1
}

compose() {
  docker compose -p "$project_name" -f compose.yaml -f compose.prod.yaml "$@"
}

wait_for_server_health() {
  local server_cid deadline status
  server_cid="$(compose ps -q server)"
  if [[ -z "$server_cid" ]]; then
    echo "Error: server container not found after deploy" >&2
    return 1
  fi

  deadline=$((SECONDS + 120))
  while (( SECONDS < deadline )); do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$server_cid")"
    if [[ "$status" == "healthy" ]]; then
      return 0
    fi
    if [[ "$status" == "unhealthy" || "$status" == "exited" ]]; then
      echo "Error: server container entered bad state: $status" >&2
      docker logs --tail 120 "$server_cid" >&2 || true
      return 1
    fi
    sleep 2
  done

  echo "Error: timed out waiting for healthy server container" >&2
  docker logs --tail 120 "$server_cid" >&2 || true
  return 1
}

validate_health_json() {
  local health_json="$1"

  if [[ -n "$expected_git_commit" && "$health_json" != *"\"gitCommit\":\"$expected_git_commit\""* ]]; then
    echo "Error: gitCommit mismatch in /api/health: $health_json" >&2
    return 1
  fi

  if [[ -n "$expected_git_tag" && "$health_json" != *"\"gitTag\":\"$expected_git_tag\""* ]]; then
    echo "Error: gitTag mismatch in /api/health: $health_json" >&2
    return 1
  fi

  if [[ -n "$expected_build_date" && "$health_json" != *"\"buildDate\":\"$expected_build_date\""* ]]; then
    echo "Error: buildDate mismatch in /api/health: $health_json" >&2
    return 1
  fi
}

rollback_to_previous() {
  local previous_server_image="$1"
  if [[ -z "$previous_server_image" ]]; then
    echo "No previous SERVER_IMAGE found; skipping remote rollback" >&2
    return 0
  fi

  echo "Rolling back remote server image to ${previous_server_image}" >&2
  set_env SERVER_IMAGE "$previous_server_image"
  compose pull server || true
  compose up -d meilisearch rss-bridge flaresolverr server || true
  if wait_for_server_health; then
    if compose ps -q cloudflared >/dev/null 2>&1; then
      compose restart cloudflared || true
    else
      compose up -d cloudflared || true
    fi
  fi
}

previous_server_image="$(get_env SERVER_IMAGE || true)"
if [[ -z "$previous_server_image" ]]; then
  server_cid="$(compose ps -q server 2>/dev/null || true)"
  if [[ -n "$server_cid" ]]; then
    previous_server_image="$(docker inspect -f '{{.Config.Image}}' "$server_cid" 2>/dev/null || true)"
  fi
fi

cleanup_on_error() {
  local exit_code="$1"
  if (( exit_code != 0 )); then
    rollback_to_previous "$previous_server_image"
  fi
  exit "$exit_code"
}

trap 'cleanup_on_error $?' EXIT

if [[ -n "$ghcr_username" && -n "$ghcr_token" ]]; then
  printf '%s' "$ghcr_token" | docker login ghcr.io -u "$ghcr_username" --password-stdin >/dev/null
fi

set_env SERVER_IMAGE "$server_image"
set_env DATA_DIR "$data_dir"

if [[ -n "$meili_master_key" ]]; then
  set_env MEILI_MASTER_KEY "$meili_master_key"
fi

if [[ -n "$tunnel_token" ]]; then
  set_env TUNNEL_TOKEN "$tunnel_token"
fi

compose pull server
compose up -d meilisearch rss-bridge flaresolverr server
wait_for_server_health

health_json="$(curl --fail --silent --show-error http://127.0.0.1:3000/api/health)"
validate_health_json "$health_json"

cloudflared_cid="$(compose ps -q cloudflared || true)"
if [[ -n "$cloudflared_cid" ]]; then
  compose restart cloudflared
else
  compose up -d cloudflared
fi

trap - EXIT

printf 'PREVIOUS_SERVER_IMAGE=%s\n' "$previous_server_image"
printf 'REMOTE_HEALTH_JSON=%s\n' "$health_json"
EOF
}

rollback_remote_image() {
  local previous_server_image="$1"
  if [[ -z "$previous_server_image" ]]; then
    echo "No previous SERVER_IMAGE available for rollback" >&2
    return 1
  fi

  remote_bash "$REMOTE_DIR" "$PROJECT_NAME" "$previous_server_image" <<'EOF'
set -euo pipefail

remote_dir="$1"
project_name="$2"
previous_server_image="$3"

cd "$remote_dir"
touch .env

set_env() {
  local key="$1"
  local value="$2"
  local tmp
  tmp="$(mktemp)"
  if [[ -f .env ]]; then
    grep -v "^${key}=" .env > "$tmp" || true
  fi
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" .env
}

compose() {
  docker compose -p "$project_name" -f compose.yaml -f compose.prod.yaml "$@"
}

wait_for_server_health() {
  local server_cid deadline status
  server_cid="$(compose ps -q server)"
  deadline=$((SECONDS + 120))
  while (( SECONDS < deadline )); do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$server_cid")"
    if [[ "$status" == "healthy" ]]; then
      return 0
    fi
    sleep 2
  done
  return 1
}

set_env SERVER_IMAGE "$previous_server_image"
compose pull server
compose up -d meilisearch rss-bridge flaresolverr server
wait_for_server_health

cloudflared_cid="$(compose ps -q cloudflared || true)"
if [[ -n "$cloudflared_cid" ]]; then
  compose restart cloudflared
else
  compose up -d cloudflared
fi
EOF
}

wait_for_public_health() {
  if [[ -z "$PUBLIC_URL" ]]; then
    return 0
  fi

  local deadline public_health
  deadline=$((SECONDS + 120))
  while (( SECONDS < deadline )); do
    if public_health="$(curl --fail --silent --show-error "${PUBLIC_URL}/api/health" 2>/dev/null)"; then
      if [[ -n "$EXPECTED_GIT_COMMIT" && "$public_health" != *"\"gitCommit\":\"$EXPECTED_GIT_COMMIT\""* ]]; then
        sleep 3
        continue
      fi
      if [[ -n "$EXPECTED_GIT_TAG" && "$public_health" != *"\"gitTag\":\"$EXPECTED_GIT_TAG\""* ]]; then
        sleep 3
        continue
      fi
      if [[ -n "$EXPECTED_BUILD_DATE" && "$public_health" != *"\"buildDate\":\"$EXPECTED_BUILD_DATE\""* ]]; then
        sleep 3
        continue
      fi
      printf '%s\n' "$public_health"
      return 0
    fi
    sleep 3
  done

  return 1
}

echo "Deploy target: ${REMOTE_HOST}:${REMOTE_DIR}"
echo "Server image:  ${SERVER_IMAGE}"
if [[ -n "$EXPECTED_GIT_COMMIT" || -n "$EXPECTED_GIT_TAG" || -n "$EXPECTED_BUILD_DATE" ]]; then
  echo "Expected metadata: commit=${EXPECTED_GIT_COMMIT:-<skip>} tag=${EXPECTED_GIT_TAG:-<skip>} date=${EXPECTED_BUILD_DATE:-<skip>}"
fi

remote_exec "mkdir -p '$REMOTE_DIR'"
sync_manifests

previous_server_image="$(get_remote_current_image || true)"
remote_output="$(deploy_remote_image)"
printf '%s\n' "$remote_output"

public_health=""
if [[ -n "$PUBLIC_URL" ]]; then
  echo "Verifying public URL: ${PUBLIC_URL}"
  if ! public_health="$(wait_for_public_health)"; then
    echo "Public verification failed; rolling back remote server image" >&2
    rollback_remote_image "$previous_server_image" || true
    exit 1
  fi
  echo "Public /api/health: ${public_health}"
fi

echo
echo "Deployment finished."
echo "Remote host: ${REMOTE_HOST}"
echo "Remote dir:  ${REMOTE_DIR}"
