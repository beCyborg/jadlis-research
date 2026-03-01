#!/bin/bash
# post-compact-state.sh — SessionStart (compact matcher)
# Re-injects scratchpad state after conversation compaction
# Always exits 0

set -uo pipefail

INPUT=$(cat)

# Parse JSON input — prefer jq, fall back to grep/sed
if command -v jq &>/dev/null; then
  SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
  CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
  HAS_JQ=true
else
  SESSION_ID=$(echo "$INPUT" | grep -o '"session_id":"[^"]*"' | head -1 | sed 's/.*:"\(.*\)"/\1/')
  CWD=$(echo "$INPUT" | grep -o '"cwd":"[^"]*"' | head -1 | sed 's/.*:"\(.*\)"/\1/')
  HAS_JQ=false
fi

# Guard: empty session_id or cwd
if [ -z "$SESSION_ID" ] || [ -z "$CWD" ]; then
  exit 0
fi

SCRATCHPAD_DIR="${CWD}/.scratchpads/${SESSION_ID}"

# No scratchpad dir = not in a research pipeline
if [ ! -d "$SCRATCHPAD_DIR" ]; then
  exit 0
fi

# List files with mtimes
FILE_LIST=""
while IFS= read -r -d '' file; do
  filename=$(basename "$file")
  mtime=$(stat -f '%Sm' -t '%Y-%m-%d %H:%M' "$file" 2>/dev/null || stat -c '%y' "$file" 2>/dev/null | cut -d'.' -f1 || echo "unknown")
  if [ -z "$FILE_LIST" ]; then
    FILE_LIST="${filename} (modified: ${mtime})"
  else
    FILE_LIST="${FILE_LIST}, ${filename} (modified: ${mtime})"
  fi
done < <(find "$SCRATCHPAD_DIR" -maxdepth 1 -type f -print0 2>/dev/null || true)

# No files found
if [ -z "$FILE_LIST" ]; then
  exit 0
fi

# Build additionalContext
CONTEXT_MSG="Research pipeline active. Session: ${SESSION_ID}. Tracks found: ${FILE_LIST}. Use Read tool to re-read any track file at ${SCRATCHPAD_DIR}/."

if [ "$HAS_JQ" = true ]; then
  jq -n --arg ctx "$CONTEXT_MSG" '{hookSpecificOutput: {additionalContext: $ctx}}'
else
  ESCAPED_MSG=$(echo "$CONTEXT_MSG" | sed 's/"/\\"/g')
  printf '{"hookSpecificOutput":{"additionalContext":"%s"}}\n' "$ESCAPED_MSG"
fi

exit 0
