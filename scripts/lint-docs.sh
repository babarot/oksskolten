#!/usr/bin/env bash
set -euo pipefail

REMARK="./node_modules/.bin/remark"
PROJECT_ROOT="$(pwd)"

if [[ ! -x "$REMARK" ]]; then
  echo "Error: remark-cli not found. Run 'npm install' first." >&2
  exit 1
fi

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

# Collect all spec filenames as a JSON array for cross-file checks
all_spec_filenames=$(printf '%s\n' docs/spec/*.md | xargs -I{} basename {} | jq -MRs 'split("\n") | map(select(. != ""))')

# ── Helpers ──────────────────────────────────────────────────────────────────

# Convert markdown files to remark JSON ASTs in parallel.
# Usage: convert_to_ast <docs_dir> <scope> <metadata_fn>
#   docs_dir   — source directory (e.g., docs/spec)
#   scope      — subdirectory name under tmpdir (e.g., spec)
#   metadata_fn — function that receives a filename and prints a JSON metadata object
convert_to_ast() {
  local docs_dir="$1" scope="$2" metadata_fn="$3"
  [ -d "$docs_dir" ] || return 0
  mkdir -p "$tmpdir/$scope"
  for file in "$docs_dir"/*.md; do
    [ -f "$file" ] || continue
    local name
    name=$(basename "$file")
    local metadata
    metadata=$("$metadata_fn" "$name")
    (
      "$REMARK" --tree-out < "$file" 2>/dev/null \
        | jq -M -s ".[0] * $metadata" \
        > "$tmpdir/$scope/$name"
    ) &
  done
  wait
}

# Run conftest for a scope if AST files exist.
# Usage: run_conftest <scope>
run_conftest() {
  local scope="$1"
  ls "$tmpdir/$scope"/*.md &>/dev/null || return 0
  echo "conftest test --policy policy/$scope"
  (cd "$tmpdir/$scope" && conftest test --parser json --policy "$PROJECT_ROOT/policy/$scope" *.md)
}

# ── Metadata builders ────────────────────────────────────────────────────────

spec_metadata() {
  local name="$1"
  local is_feature=false is_perf=false
  [[ "$name" == *_feature_* ]] && is_feature=true
  [[ "$name" == *_perf_* ]] && is_perf=true
  jq -Mn \
    --arg filename "$name" \
    --argjson is_feature "$is_feature" \
    --argjson is_perf "$is_perf" \
    --argjson all_filenames "$all_spec_filenames" \
    '{metadata: {filename: $filename, is_feature: $is_feature, is_perf: $is_perf, all_filenames: $all_filenames}}'
}

simple_metadata() {
  local name="$1"
  jq -Mn --arg filename "$name" '{metadata: {filename: $filename}}'
}

# ── Phase 1: Convert to AST ─────────────────────────────────────────────────

convert_to_ast "docs/spec"   "spec"   spec_metadata   &
convert_to_ast "docs/guides" "guides" simple_metadata &
wait

# ── Phase 2: Run conftest ───────────────────────────────────────────────────

run_conftest "spec"
run_conftest "guides"
