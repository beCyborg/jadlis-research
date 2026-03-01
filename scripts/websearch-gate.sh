#!/bin/bash
# websearch-gate.sh — PreToolUse: WebSearch|WebFetch
# Blocks WebSearch/WebFetch unless Exa has failed >= 3 times (emergency fallback)
# Input: hook JSON on stdin
# Output: JSON permissionDecision (allow/deny)

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')
EXA_COUNTER_FILE="/tmp/jadlis-circuit-exa-${SESSION_ID}.count"

EXA_FAILS=0
if [ -f "$EXA_COUNTER_FILE" ]; then
  EXA_FAILS=$(cat "$EXA_COUNTER_FILE" 2>/dev/null)
  EXA_FAILS=${EXA_FAILS:-0}
fi

if [ "$EXA_FAILS" -ge 3 ] 2>/dev/null; then
  cat <<'ALLOW'
{
  "hookSpecificOutput": {
    "permissionDecision": "allow",
    "additionalContext": "Emergency fallback: Exa has failed 3+ times this session. WebSearch/WebFetch permitted as backup. Prefer returning to Exa when possible."
  }
}
ALLOW
else
  cat <<'DENY'
{
  "hookSpecificOutput": {
    "permissionDecision": "deny",
    "permissionDecisionReason": "WebSearch/WebFetch is disabled. Use web_search_exa or web_search_advanced_exa instead. WebSearch only unlocks after 3+ Exa failures."
  }
}
DENY
fi
exit 0
