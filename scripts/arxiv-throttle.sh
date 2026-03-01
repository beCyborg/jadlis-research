#!/bin/bash
# arxiv-throttle.sh — PreToolUse: mcp__plugin_jadlis-research_arxiv__.*
# Enforces ArXiv rate limits via deny-then-suggest (no sleep)
# Input: hook JSON on stdin
# Output: JSON permissionDecision deny (with wait instruction) or exit 0 (allow)

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')
NOW=$(date +%s)

LAST_CALL_FILE="/tmp/jadlis-arxiv-last-call-${SESSION_ID}"
COOLDOWN_FILE="/tmp/jadlis-arxiv-cooldown-${SESSION_ID}"

# Determine minimum gap (15s if in cooldown, 5s otherwise)
MIN_GAP=5
if [ -f "$COOLDOWN_FILE" ]; then
  COOLDOWN_EXPIRY=$(cat "$COOLDOWN_FILE" 2>/dev/null)
  COOLDOWN_EXPIRY=${COOLDOWN_EXPIRY:-0}
  if [ "$NOW" -lt "$COOLDOWN_EXPIRY" ] 2>/dev/null; then
    MIN_GAP=15
  fi
fi

# Read last call timestamp
# NOTE: Race condition on first call — parallel workers may both see no file and both pass.
# Acceptable for ArXiv (initial burst of 2-3 is tolerable; subsequent calls are serialized).
if [ ! -f "$LAST_CALL_FILE" ]; then
  echo "$NOW" > "$LAST_CALL_FILE"
  exit 0
fi

LAST_CALL=$(cat "$LAST_CALL_FILE" 2>/dev/null)
LAST_CALL=${LAST_CALL:-0}
ELAPSED=$((NOW - LAST_CALL))

if [ "$ELAPSED" -lt "$MIN_GAP" ] 2>/dev/null; then
  WAIT_NEEDED=$((MIN_GAP - ELAPSED))
  cat <<DENY
{
  "hookSpecificOutput": {
    "permissionDecision": "deny",
    "permissionDecisionReason": "ArXiv rate limit: wait ${WAIT_NEEDED}s and retry. Current minimum gap: ${MIN_GAP}s between calls."
  }
}
DENY
  exit 0
fi

# Allow and update timestamp
echo "$NOW" > "$LAST_CALL_FILE"
exit 0
