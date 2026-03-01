#!/bin/bash
# scratchpad-size-guard.sh
# Warns if a scratchpad file exceeds 80-line budget after a Write.
# Input: JSON via stdin (tool_name, tool_input containing file_path)
# Output: JSON warning if over budget
# Exit: always 0 (non-blocking — budget is a recommendation)

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

# Only act on scratchpad files
if ! echo "$FILE_PATH" | grep -q ".scratchpads/"; then
  exit 0
fi

# File must exist and be readable
[ ! -f "$FILE_PATH" ] && exit 0

LINE_COUNT=$(wc -l < "$FILE_PATH")
MAX_LINES=80

if [ "$LINE_COUNT" -gt "$MAX_LINES" ]; then
  jq -n --arg path "$FILE_PATH" --arg lines "$LINE_COUNT" '{
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: ("Scratchpad \($path) has \($lines) lines (budget: 80). Consider trimming older entries to stay within budget.")
    }
  }'
fi

exit 0
