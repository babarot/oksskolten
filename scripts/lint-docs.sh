#!/usr/bin/env bash
set -euo pipefail

SPEC_DIR="docs/spec"
GUIDE_DIR="docs/guides"
ADR_DIR="docs/adr"
REMARK="./node_modules/.bin/remark"
PROJECT_ROOT="$(pwd)"

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

mkdir -p "$tmpdir/spec" "$tmpdir/guides" "$tmpdir/adr"

# Collect all spec filenames as a JSON array for cross-file checks
all_filenames=$(printf '%s\n' "$SPEC_DIR"/*.md | xargs -I{} basename {} | jq -MRs 'split("\n") | map(select(. != ""))')

# Phase 1a: Convert spec files to JSON ASTs in parallel
for file in "$SPEC_DIR"/*.md; do
  [ -f "$file" ] || continue
  name=$(basename "$file")

  is_feature=false
  is_perf=false
  if [[ "$name" == *_feature_* ]]; then
    is_feature=true
  fi
  if [[ "$name" == *_perf_* ]]; then
    is_perf=true
  fi

  metadata=$(jq -Mn \
    --arg filename "$name" \
    --argjson is_feature "$is_feature" \
    --argjson is_perf "$is_perf" \
    --argjson all_filenames "$all_filenames" \
    '{metadata: {filename: $filename, is_feature: $is_feature, is_perf: $is_perf, all_filenames: $all_filenames}}')

  (
    "$REMARK" --tree-out < "$file" 2>/dev/null \
      | jq -M -s ".[0] * $metadata" \
      > "$tmpdir/spec/$name"
  ) &
done

# Phase 1b: Convert guide files to JSON ASTs in parallel
if [ -d "$GUIDE_DIR" ]; then
  for file in "$GUIDE_DIR"/*.md; do
    [ -f "$file" ] || continue
    name=$(basename "$file")

    metadata=$(jq -Mn \
      --arg filename "$name" \
      '{metadata: {filename: $filename}}')

    (
      "$REMARK" --tree-out < "$file" 2>/dev/null \
        | jq -M -s ".[0] * $metadata" \
        > "$tmpdir/guides/$name"
    ) &
  done
fi

# Phase 1c: Convert ADR files to JSON ASTs in parallel
if [ -d "$ADR_DIR" ]; then
  for file in "$ADR_DIR"/*.md; do
    [ -f "$file" ] || continue
    name=$(basename "$file")

    metadata=$(jq -Mn \
      --arg filename "$name" \
      '{metadata: {filename: $filename}}')

    (
      "$REMARK" --tree-out < "$file" 2>/dev/null \
        | jq -M -s ".[0] * $metadata" \
        > "$tmpdir/adr/$name"
    ) &
  done
fi

wait

# Phase 2: Run conftest separately for each policy scope
# cd into tmpdir subdirs so conftest shows basename-only paths
echo "conftest test --policy policy/spec"
(cd "$tmpdir/spec" && conftest test --parser json --policy "$PROJECT_ROOT/policy/spec" *.md)

if ls "$tmpdir/guides"/*.md &>/dev/null; then
  echo "conftest test --policy policy/guides"
  (cd "$tmpdir/guides" && conftest test --parser json --policy "$PROJECT_ROOT/policy/guides" *.md)
fi

if ls "$tmpdir/adr"/*.md &>/dev/null; then
  echo "conftest test --policy policy/adr"
  (cd "$tmpdir/adr" && conftest test --parser json --policy "$PROJECT_ROOT/policy/adr" *.md)
fi
