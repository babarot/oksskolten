#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

REMOTE_HOST="${REMOTE_HOST:-mangu}"
REMOTE_DIR="${REMOTE_DIR:-/home/admin/oksskolten}"
PROJECT_NAME="${PROJECT_NAME:-oksskolten}"
DATA_DIR="${DATA_DIR:-./data}"
PUBLIC_URL="${PUBLIC_URL:-https://reader.qingqiuhe.cc.cd}"

usage() {
  cat <<'EOF'
Usage: scripts/deploy-mangu.sh

Sync the current repository working tree to the remote host and rebuild the
production Docker Compose stack in /home/admin/oksskolten.

Environment overrides:
  REMOTE_HOST   SSH host alias (default: mangu)
  REMOTE_DIR    Remote deploy directory (default: /home/admin/oksskolten)
  PROJECT_NAME  Docker Compose project name (default: oksskolten)
  DATA_DIR      Production data dir for compose (default: ./data)
  PUBLIC_URL    Public site URL to verify after deploy
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command not found: $1" >&2
    exit 1
  fi
}

require_cmd git
require_cmd rsync
require_cmd ssh
require_cmd curl

cd "$REPO_ROOT"

sync_with_rsync() {
  rsync \
    -az \
    --delete \
    --filter=':- .gitignore' \
    --filter='P .git/' \
    --filter='P .env' \
    --filter='P data/' \
    --filter='P data-prod/' \
    --exclude '.git/' \
    --exclude '.agents/' \
    --exclude '.vercel/' \
    --exclude 'AGENTS.md' \
    ./ "${REMOTE_HOST}:${REMOTE_DIR}/"
}

sync_with_tar_fallback() {
  local manifest
  manifest="$(mktemp)"
  trap 'rm -f "$manifest"' RETURN

  while IFS= read -r -d '' path; do
    case "$path" in
      .env|AGENTS.md|.git/*|.agents/*|.vercel/*|data/*|data-prod/*) continue ;;
    esac
    printf '%s\n' "$path"
  done < <(git ls-files -z --cached --modified --others --exclude-standard) > "$manifest"

  ssh "$REMOTE_HOST" "find '$REMOTE_DIR' -mindepth 1 -maxdepth 1 \
    ! -name '.env' ! -name 'data' ! -name 'data-prod' -exec rm -rf {} +"

  COPYFILE_DISABLE=1 tar -czf - -T "$manifest" | ssh "$REMOTE_HOST" "tar -xzf - -C '$REMOTE_DIR'"
}

git_commit="$(git rev-parse --short HEAD)"
git_tag="$(git describe --tags --always 2>/dev/null || echo "$git_commit")"
build_date="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
dirty_suffix=""

if ! git diff --quiet --ignore-submodules -- || ! git diff --cached --quiet --ignore-submodules --; then
  dirty_suffix="-dirty"
fi

echo "Deploy target: ${REMOTE_HOST}:${REMOTE_DIR}"
echo "Build metadata: commit=${git_commit}${dirty_suffix} tag=${git_tag} date=${build_date}"

ssh "$REMOTE_HOST" "mkdir -p '$REMOTE_DIR'"

if ssh "$REMOTE_HOST" "command -v rsync >/dev/null 2>&1"; then
  sync_with_rsync
else
  echo "Remote rsync not found; falling back to tar stream sync"
  sync_with_tar_fallback
fi

read -r -d '' remote_script <<EOF || true
set -euo pipefail
cd '$REMOTE_DIR'

export GIT_COMMIT='${git_commit}${dirty_suffix}'
export GIT_TAG='${git_tag}'
export BUILD_DATE='${build_date}'
export DATA_DIR='${DATA_DIR}'

compose() {
  docker compose -p '${PROJECT_NAME}' -f compose.yaml -f compose.prod.yaml "\$@"
}

server_name='${PROJECT_NAME}-server-1'

remove_stale_server_container() {
  if docker ps -aq --filter "name=^/\${server_name}\$" | grep -q .; then
    echo "Removing stale server container: \${server_name}"
    docker rm -f "\${server_name}" >/dev/null
  fi
}

build_server_image() {
  local mode="\$1"
  if [[ "\$mode" == "classic" ]]; then
    echo "Building server image with classic builder and --no-cache..."
    DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 compose build --no-cache server
    return 0
  fi

  if compose build server; then
    return 0
  fi

  return 1
}

start_stack() {
  remove_stale_server_container

  if ! compose up -d; then
    echo "docker compose up failed once; removing stale server container and retrying..."
    remove_stale_server_container
    compose up -d
  fi

  compose ps
}

validate_server() {
  local server_cid
  server_cid="\$(compose ps -q server)"
  if [[ -z "\$server_cid" ]]; then
    echo "Error: server container not found after deploy" >&2
    return 1
  fi

  local deadline server_health
  deadline=\$((SECONDS + 90))
  server_health=""
  while (( SECONDS < deadline )); do
    server_health="\$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "\$server_cid")"
    if [[ "\$server_health" == "healthy" || "\$server_health" == "running" ]]; then
      break
    fi
    sleep 2
  done

  if [[ "\$server_health" != "healthy" && "\$server_health" != "running" ]]; then
    echo "Error: server container is not healthy after waiting (status=\$server_health)" >&2
    return 1
  fi

  if docker exec "\$server_cid" test -s /app/dist/index.html; then
    echo "Server static bundle found at /app/dist/index.html."
  else
    echo "Error: /app/dist/index.html is missing or empty inside server container" >&2
    return 1
  fi

  if docker exec "\$server_cid" curl --fail --silent --show-error http://127.0.0.1:3000/api/health >/dev/null; then
    echo "Server healthcheck passed inside container."
  else
    echo "Error: in-container server healthcheck failed" >&2
    return 1
  fi

  local cloudflared_cid
  cloudflared_cid="\$(compose ps -q cloudflared)"
  if [[ -n "\$cloudflared_cid" ]]; then
    echo "Restarting cloudflared to refresh origin connections..."
    compose restart cloudflared
  fi
}

deploy_attempt() {
  local mode="\$1"
  build_server_image "\$mode"
  start_stack
  validate_server
}

if ! deploy_attempt buildkit; then
  echo "Initial deploy attempt failed; retrying with classic builder and --no-cache..."
  deploy_attempt classic
fi
EOF

ssh "$REMOTE_HOST" "$remote_script"

if [[ -n "$PUBLIC_URL" ]]; then
  echo "Verifying public URL: $PUBLIC_URL"
  curl --fail --silent --show-error --head "$PUBLIC_URL" >/dev/null
  public_health="$(curl --fail --silent --show-error "$PUBLIC_URL/api/health")"
  echo "Public /api/health: $public_health"
fi

echo
echo "Deployment finished."
echo "Remote host: $REMOTE_HOST"
echo "Remote dir:  $REMOTE_DIR"
