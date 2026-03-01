#!/bin/bash
# mcp-error-recovery.sh
# PostToolUseFailure hook for mcp__.*
# Updates circuit breaker state and injects recovery guidance into additionalContext
# Always exits 0 (recovery hooks are advisory only)

INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
ERROR=$(echo "$INPUT" | jq -r '.error // empty')

# Guard: no session ID -> skip state writes to avoid polluting /tmp
if [ -z "$SESSION_ID" ]; then
  exit 0
fi

TOOL_BASE=$(echo "$TOOL_NAME" | sed 's/.*__//')

ADDITIONAL_CONTEXT=""

# 1. Firecrawl billing errors
if echo "$ERROR" | grep -qiE "(credits|payment required|billing)" && echo "$TOOL_NAME" | grep -qi "firecrawl"; then
  echo "CREDITS_EXHAUSTED" > "/tmp/jadlis-firecrawl-health-${SESSION_ID}.cache"
  # Also write Exa counter to 999 to unlock WebSearch emergency fallback,
  # because without Firecrawl, Exa becomes the sole extraction tool and may also exhaust
  echo "999" > "/tmp/jadlis-circuit-exa-${SESSION_ID}.count"
  ADDITIONAL_CONTEXT="Firecrawl credits exhausted. All Firecrawl tools blocked for this session. Use mcp__plugin_jadlis-research_exa__crawling_exa for content extraction. WebSearch emergency fallback is now also available."

# 2. Firecrawl site-not-supported
elif echo "$ERROR" | grep -qi "site-not-supported"; then
  ADDITIONAL_CONTEXT="This URL is not supported by Firecrawl. Do NOT retry with waitFor or stealth options — they will also fail. Go directly to mcp__plugin_jadlis-research_exa__crawling_exa for this URL."

# 3. Exa billing/quota
elif echo "$ERROR" | grep -qiE "(quota|billing|rate.limit)" && echo "$TOOL_NAME" | grep -qi "exa"; then
  echo "999" > "/tmp/jadlis-circuit-exa-${SESSION_ID}.count"
  ADDITIONAL_CONTEXT="Exa API quota exhausted. WebSearch emergency fallback is now available via the websearch-gate."

# 4. ArXiv 429
elif echo "$ERROR" | grep -qi "429\|too many requests" && echo "$TOOL_NAME" | grep -qi "arxiv"; then
  COOLDOWN_EXPIRY=$(( $(date +%s) + 600 ))
  echo "$COOLDOWN_EXPIRY" > "/tmp/jadlis-arxiv-cooldown-${SESSION_ID}"
  ADDITIONAL_CONTEXT="ArXiv rate limit hit (429). Cooldown active for 10 minutes. ArXiv calls will require 15s minimum gap."

# 5. Reddit encoding/surrogate errors
elif echo "$ERROR" | grep -qiE "(surrogate|encoding|codec)"; then
  ADDITIONAL_CONTEXT="Reddit encoding error on this specific post. Skip this post and continue with remaining posts. Reddit service is still operational."

# 6. Generic MCP failure — increment counter
else
  COUNTER_FILE="/tmp/jadlis-mcp-failures-${TOOL_BASE}-${SESSION_ID}.count"
  CURRENT=$(cat "$COUNTER_FILE" 2>/dev/null || echo "0")
  NEW_COUNT=$((CURRENT + 1))
  echo "$NEW_COUNT" > "$COUNTER_FILE"

  # Also increment Exa circuit counter for Exa tools (feeds websearch-gate.sh)
  if echo "$TOOL_NAME" | grep -qi "exa"; then
    EXA_COUNTER="/tmp/jadlis-circuit-exa-${SESSION_ID}.count"
    EXA_CURRENT=$(cat "$EXA_COUNTER" 2>/dev/null || echo "0")
    echo "$((EXA_CURRENT + 1))" > "$EXA_COUNTER"
  fi

  if [ "$NEW_COUNT" -ge 3 ]; then
    ADDITIONAL_CONTEXT="MCP tool ${TOOL_BASE} has failed ${NEW_COUNT} times this session. Consider switching to fallback chain per shared-protocols."
  fi
fi

# Output JSON additionalContext if non-empty (use jq for safe escaping)
if [ -n "$ADDITIONAL_CONTEXT" ]; then
  jq -n --arg ctx "$ADDITIONAL_CONTEXT" '{"hookSpecificOutput":{"additionalContext":$ctx}}'
fi

exit 0
