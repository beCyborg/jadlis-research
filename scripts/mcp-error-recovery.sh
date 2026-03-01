#!/bin/bash
# mcp-error-recovery.sh
# Tracks MCP failures per server. After 3 failures → suggest fallback chain.
# Input: JSON via stdin (tool_name, session_id, error)
# Output: JSON with hookSpecificOutput if threshold reached
# Exit: always 0 (non-blocking; Claude decides whether to use fallback)

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')

# Extract server name from namespace: mcp__plugin_jadlis-research_{server}__{tool}
SERVER=$(echo "$TOOL_NAME" | sed -n 's/.*mcp__[^_]*_[^_]*_\([^_]*\)__.*/\1/p')
[ -z "$SERVER" ] && SERVER=$(echo "$TOOL_NAME" | awk -F'__' '{print $2}' | rev | cut -d'_' -f1 | rev)
[ -z "$SERVER" ] && SERVER="unknown"

COUNTER_FILE="/tmp/jadlis-mcp-failures-${SESSION_ID}-${SERVER}.count"

# Increment counter
COUNT=1
[ -f "$COUNTER_FILE" ] && COUNT=$(( $(cat "$COUNTER_FILE") + 1 ))
echo "$COUNT" > "$COUNTER_FILE"

# Suggest fallback after threshold
if [ "$COUNT" -ge 3 ]; then
  jq -n --arg server "$SERVER" --arg count "$COUNT" '{
    hookSpecificOutput: {
      hookEventName: "PostToolUseFailure",
      additionalContext: ("MCP server \($server) failed \($count) times this session. Switch to fallback chain per shared-protocols.")
    }
  }'
fi

exit 0
