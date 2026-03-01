#!/bin/bash
# subagent-stop-check.sh
# SubagentStop hook: validate worker wrote its scratchpad file
# Exit 2 if scratchpad missing; exit 0 if present (with metrics logging)

INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
AGENT_TYPE=$(echo "$INPUT" | jq -r '.agent_type // empty')
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

# Guard: empty agent_type = CC internal agent (prompt_suggestion etc.)
if [ -z "$AGENT_TYPE" ]; then
  exit 0
fi

# Guard: stop_hook_active = prevent infinite loop
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  exit 0
fi

# Strip optional jadlis-research: prefix
AGENT_TYPE="${AGENT_TYPE#jadlis-research:}"

# Map AGENT_TYPE to expected scratchpad filename
case "$AGENT_TYPE" in
  academic-worker)      EXPECTED_FILE="academic-track.md" ;;
  community-worker)     EXPECTED_FILE="community-track.md" ;;
  expert-worker)        EXPECTED_FILE="expert-track.md" ;;
  native-web-worker)    EXPECTED_FILE="native-web-track.md" ;;
  social-media-worker)  EXPECTED_FILE="social-media-track.md" ;;
  verification-worker)  EXPECTED_FILE="verification-report.md" ;;
  *) exit 0 ;; # Unknown worker type — not our concern
esac

SCRATCHPAD_PATH="${CWD}/.scratchpads/${SESSION_ID}/${EXPECTED_FILE}"

if [ ! -f "$SCRATCHPAD_PATH" ]; then
  echo "Worker ${AGENT_TYPE} did not write scratchpad: ${EXPECTED_FILE}" >&2
  exit 2
fi

# Collect metrics
LINE_COUNT=$(wc -l < "$SCRATCHPAD_PATH" 2>/dev/null || echo "0")
FILE_SIZE=$(wc -c < "$SCRATCHPAD_PATH" 2>/dev/null || echo "0")
METRICS_LOG="/tmp/jadlis-worker-metrics-${SESSION_ID}.log"
echo "$(date +%s) ${AGENT_TYPE} lines=${LINE_COUNT} bytes=${FILE_SIZE}" >> "$METRICS_LOG"

exit 0
