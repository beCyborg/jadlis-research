#!/bin/bash
# read-error-recovery.sh
# PostToolUseFailure hook for Read tool
# Detects MaxFileReadToken errors and suggests offset/limit chunked reading
# Always exits 0

INPUT=$(cat)

ERROR=$(echo "$INPUT" | jq -r '.error // empty')

if [[ "$ERROR" == *MaxFileReadToken* ]]; then
  cat <<'JSON'
{
  "hookSpecificOutput": {
    "additionalContext": "File exceeds read token limit. Use offset and limit parameters to read in chunks. Example: Read with offset=0, limit=100 for first 100 lines; then offset=100, limit=100 for next batch."
  }
}
JSON
fi

exit 0
