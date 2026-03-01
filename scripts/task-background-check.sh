#!/bin/bash
# task-background-check.sh — PreToolUse: Agent (Task)
# Hard-blocks background agent spawning — MCP tools unavailable in background context
# Input: hook JSON on stdin
# Output: exit 2 with stderr if background; exit 0 if foreground

INPUT=$(cat)
RUN_IN_BG=$(echo "$INPUT" | jq -r '.tool_input.run_in_background // false')

if [ "$RUN_IN_BG" = "true" ]; then
  echo "MCP tools unavailable in background agents. Remove run_in_background or set to false." >&2
  exit 2
fi

exit 0
