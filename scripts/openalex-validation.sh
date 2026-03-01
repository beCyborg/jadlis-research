#!/bin/bash
# openalex-validation.sh — PreToolUse: mcp__plugin_jadlis-research_openalex__.*
# Validates OpenAlex API parameters
# Input: hook JSON on stdin
# Output: JSON permissionDecision deny (with reason) or exit 0 (allow)

INPUT=$(cat)
TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}')

PER_PAGE=$(echo "$TOOL_INPUT" | jq -r '.per_page // 0')
SORT=$(echo "$TOOL_INPUT" | jq -r '.sort // ""')

# Check per_page > 200
if [ "$PER_PAGE" -gt 200 ] 2>/dev/null; then
  cat <<'DENY'
{
  "hookSpecificOutput": {
    "permissionDecision": "deny",
    "permissionDecisionReason": "per_page exceeds OpenAlex API maximum of 200. Set per_page to 200 or less and use cursor pagination for more results."
  }
}
DENY
  exit 0
fi

# TODO: add hard-block for known-broken OpenAlex tools when discovered

# Check invalid sort params (strip :asc/:desc direction suffix)
if [ -n "$SORT" ]; then
  SORT_FIELD="${SORT%%:*}"
  VALID_SORTS="cited_by_count publication_date relevance_score display_name works_count"
  IS_VALID=false
  for valid in $VALID_SORTS; do
    if [ "$SORT_FIELD" = "$valid" ]; then
      IS_VALID=true
      break
    fi
  done
  if [ "$IS_VALID" = "false" ]; then
    cat <<DENY
{
  "hookSpecificOutput": {
    "permissionDecision": "deny",
    "permissionDecisionReason": "Invalid sort parameter '$SORT'. Valid values: cited_by_count, publication_date, relevance_score, display_name, works_count."
  }
}
DENY
    exit 0
  fi
fi

# Allow
exit 0
