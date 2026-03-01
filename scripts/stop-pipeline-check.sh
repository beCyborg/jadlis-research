#!/bin/bash
# stop-pipeline-check.sh
# Stop hook (no matcher) — fires on every agent stop
# Blocks if research track files exist but report.md is missing
# Provides .abort escape hatch via sentinel file

INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

# Guard: stop_hook_active prevents infinite loop
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  exit 0
fi

SCRATCHPAD_DIR="${CWD}/.scratchpads/${SESSION_ID}"

# No scratchpad dir -> not in a research pipeline
if [ ! -d "$SCRATCHPAD_DIR" ]; then
  exit 0
fi

# .abort sentinel -> user explicitly abandoned
if [ -f "${SCRATCHPAD_DIR}/.abort" ]; then
  exit 0
fi

# Check for any track files (use find for space-safe path handling)
TRACK_FILES=$(find "${SCRATCHPAD_DIR}" -maxdepth 1 -name '*-track.md' 2>/dev/null | head -1)
if [ -z "$TRACK_FILES" ]; then
  exit 0
fi

# Track files exist but no report.md -> pipeline incomplete
if [ ! -f "${SCRATCHPAD_DIR}/report.md" ]; then
  echo "Research pipeline incomplete: findings exist but report not generated. To abort without completing, create ${SCRATCHPAD_DIR}/.abort" >&2
  exit 2
fi

# Track files + report -> all good
exit 0
