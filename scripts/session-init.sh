#!/bin/bash
# session-init.sh — SessionStart (startup matcher)
# Performs API checks, Reddit health probe, scratchpad cleanup, Firecrawl credit check
# Always exits 0; errors go to stderr

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
  echo "jadlis-research: jq not found, using grep/sed fallback" >&2
fi

# Guard: empty session_id (CC internal agents)
if [ -z "$SESSION_ID" ]; then
  exit 0
fi

LOCK_FILE="/tmp/jadlis-session-init-${SESSION_ID}.lock"
REDDIT_HEALTH_CACHE="/tmp/jadlis-reddit-health-${SESSION_ID}.cache"
FIRECRAWL_HEALTH_CACHE="/tmp/jadlis-firecrawl-health-${SESSION_ID}.cache"

# 1. Lock check (idempotent guard)
if [ -f "$LOCK_FILE" ]; then
  exit 0
fi
touch "$LOCK_FILE"

WARNINGS=""
CONTEXT_PARTS=""

# 2. Environment variable check
for VAR_NAME in EXA_API_KEY FIRECRAWL_API_KEY SEMANTIC_SCHOLAR_API_KEY; do
  if [ -z "${!VAR_NAME:-}" ]; then
    echo "jadlis-research: WARNING — ${VAR_NAME} is not set" >&2
    WARNINGS="${WARNINGS}${VAR_NAME} missing. "
  fi
done

# 3. Reddit health probe (5s curl timeout)
REDDIT_STATUS="UNKNOWN"
if HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "https://www.reddit.com/r/test.json" 2>/dev/null); then
  if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 400 ]; then
    REDDIT_STATUS="HEALTHY"
  else
    REDDIT_STATUS="UNHEALTHY"
    echo "jadlis-research: Reddit health check returned HTTP ${HTTP_CODE}" >&2
  fi
else
  REDDIT_STATUS="UNHEALTHY"
  echo "jadlis-research: Reddit health check timed out or failed" >&2
fi
echo "$REDDIT_STATUS" > "$REDDIT_HEALTH_CACHE"
CONTEXT_PARTS="Reddit: ${REDDIT_STATUS}"

# 4. Scratchpad cleanup (directories older than 7 days)
if [ -n "$CWD" ] && [ -d "${CWD}/.scratchpads" ]; then
  CLEANED=0
  while IFS= read -r -d '' dir; do
    dir_name=$(basename "$dir")
    # Don't delete current session's directory
    if [ "$dir_name" != "$SESSION_ID" ]; then
      rm -rf "$dir" && CLEANED=$((CLEANED + 1))
    fi
  done < <(find "${CWD}/.scratchpads" -mindepth 1 -maxdepth 1 -type d -mtime +7 -print0 2>/dev/null || true)
  if [ "$CLEANED" -gt 0 ]; then
    CONTEXT_PARTS="${CONTEXT_PARTS}. Cleaned ${CLEANED} stale scratchpad dirs"
  fi
fi

# 5. Cross-session Firecrawl credit check
FIRECRAWL_WARNING=""
SIX_HOURS_AGO=$(($(date +%s) - 21600))
for cache_file in /tmp/jadlis-firecrawl-health-*.cache; do
  [ -f "$cache_file" ] || continue
  if grep -q "CREDITS_EXHAUSTED" "$cache_file" 2>/dev/null; then
    FILE_MTIME=$(stat -f '%m' "$cache_file" 2>/dev/null || stat -c '%Y' "$cache_file" 2>/dev/null || echo "0")
    if [ "$FILE_MTIME" -gt "$SIX_HOURS_AGO" ]; then
      FIRECRAWL_WARNING="Firecrawl credits exhausted (recent session)"
      echo "jadlis-research: WARNING — ${FIRECRAWL_WARNING}" >&2
      break
    fi
  fi
done

# Write current session's Firecrawl health cache (consumed by firecrawl-circuit-breaker.sh)
if [ -n "$FIRECRAWL_WARNING" ]; then
  echo "CREDITS_EXHAUSTED" > "$FIRECRAWL_HEALTH_CACHE"
  CONTEXT_PARTS="${CONTEXT_PARTS}. ${FIRECRAWL_WARNING}"
else
  echo "OK" > "$FIRECRAWL_HEALTH_CACHE"
  CONTEXT_PARTS="${CONTEXT_PARTS}. Firecrawl: OK"
fi

if [ -n "$WARNINGS" ]; then
  CONTEXT_PARTS="${CONTEXT_PARTS}. Env warnings: ${WARNINGS}"
fi

# 6. Output JSON additionalContext
CONTEXT_MSG="Jadlis-Research session initialized. ${CONTEXT_PARTS}."
if [ "$HAS_JQ" = true ]; then
  jq -n --arg ctx "$CONTEXT_MSG" '{hookSpecificOutput: {additionalContext: $ctx}}'
else
  # Manual JSON — escape quotes in context message
  ESCAPED_MSG=$(echo "$CONTEXT_MSG" | sed 's/"/\\"/g')
  printf '{"hookSpecificOutput":{"additionalContext":"%s"}}\n' "$ESCAPED_MSG"
fi

exit 0
