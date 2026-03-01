#!/bin/bash
# firecrawl-circuit-breaker.sh — PreToolUse: Firecrawl scrape/crawl/extract tools
# Blocks if credits exhausted or URL is on domain blocklist
# Input: hook JSON on stdin
# Output: JSON permissionDecision (deny) or exit 0

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')
FIRECRAWL_HEALTH="/tmp/jadlis-firecrawl-health-${SESSION_ID}.cache"
TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}')
URL=$(echo "$TOOL_INPUT" | jq -r '.url // ""')

# Check credits exhausted
if [ -f "$FIRECRAWL_HEALTH" ] && grep -q "CREDITS_EXHAUSTED" "$FIRECRAWL_HEALTH"; then
  cat <<'DENY'
{
  "hookSpecificOutput": {
    "permissionDecision": "deny",
    "permissionDecisionReason": "Firecrawl credits exhausted for this session. Use mcp__plugin_jadlis-research_exa__crawling_exa for content extraction instead."
  }
}
DENY
  exit 0
fi

# Check domain blocklist
BLOCKED_DOMAINS="linkedin.com facebook.com instagram.com twitter.com x.com tiktok.com"
for domain in $BLOCKED_DOMAINS; do
  if echo "$URL" | grep -qi "$domain"; then
    REASON="Domain ${domain} is unsupported by Firecrawl (anti-bot protection). Use mcp__plugin_jadlis-research_exa__crawling_exa or skip this source."
    printf '{\n  "hookSpecificOutput": {\n    "permissionDecision": "deny",\n    "permissionDecisionReason": "%s"\n  }\n}\n' "$REASON"
    exit 0
  fi
done

# Allow
exit 0
