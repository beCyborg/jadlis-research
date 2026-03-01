#!/bin/bash
# exa-validation.sh — PreToolUse: mcp__plugin_jadlis-research_exa__.*
# Validates Exa API parameters to prevent cost overruns and invalid calls
# Input: hook JSON on stdin
# Output: JSON permissionDecision deny (with reason) or exit 0 (allow)

INPUT=$(cat)
TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}')

NUM_RESULTS=$(echo "$TOOL_INPUT" | jq -r '.numResults // 0')
CATEGORY=$(echo "$TOOL_INPUT" | jq -r '.category // ""')

# Check numResults > 25
if [ "$NUM_RESULTS" -gt 25 ] 2>/dev/null; then
  cat <<'DENY'
{
  "hookSpecificOutput": {
    "permissionDecision": "deny",
    "permissionDecisionReason": "numResults exceeds 25 (5x price penalty). Set numResults to 10-25 for cost efficiency."
  }
}
DENY
  exit 0
fi

# Check invalid category "github"
if [ "$CATEGORY" = "github" ]; then
  cat <<'DENY'
{
  "hookSpecificOutput": {
    "permissionDecision": "deny",
    "permissionDecisionReason": "category 'github' is not a valid Exa category and causes 400 errors. Valid categories: company, research paper, tweet, news, pdf, github repo, linkedin profile, personal site. Use 'github repo' for GitHub content."
  }
}
DENY
  exit 0
fi

# Check company/people + filter combination (causes 400)
if [ "$CATEGORY" = "company" ] || [ "$CATEGORY" = "people" ]; then
  HAS_FILTERS=$(echo "$TOOL_INPUT" | jq 'has("startPublishedDate") or has("text") or has("includeDomains") or has("excludeDomains")')
  if [ "$HAS_FILTERS" = "true" ]; then
    cat <<'DENY'
{
  "hookSpecificOutput": {
    "permissionDecision": "deny",
    "permissionDecisionReason": "category 'company' and 'people' cannot be combined with startPublishedDate, text, includeDomains, or excludeDomains (causes 400 error). Remove the filters or change category."
  }
}
DENY
    exit 0
  fi
fi

# Check deprecated highlights.numSentences
HAS_NUM_SENTENCES=$(echo "$TOOL_INPUT" | jq '(.highlights // {} | has("numSentences"))')
if [ "$HAS_NUM_SENTENCES" = "true" ]; then
  cat <<'DENY'
{
  "hookSpecificOutput": {
    "permissionDecision": "deny",
    "permissionDecisionReason": "highlights.numSentences is deprecated. Use highlights.maxCharacters instead (e.g., maxCharacters: 500)."
  }
}
DENY
  exit 0
fi

# Allow
exit 0
