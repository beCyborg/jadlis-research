#!/usr/bin/env bash
# Tests for .mcp.json.example validity and security
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MCP_FILE="$PROJECT_ROOT/.mcp.json.example"

PASS=0
FAIL=0

pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }

echo "=== .mcp.json.example tests ==="

# Test 1: File is valid JSON
if jq empty "$MCP_FILE" 2>/dev/null; then
  pass "Valid JSON"
else
  fail "Invalid JSON"
fi

# Test 2: No absolute home paths in args
if grep -qE '"/Users/|"~/|"/home/' "$MCP_FILE" 2>/dev/null; then
  fail "Absolute home paths found in args"
else
  pass "No absolute home paths"
fi

# Test 3: No local vendor paths
if grep -q "vendors/" "$MCP_FILE" 2>/dev/null; then
  fail "Local vendor paths still present"
else
  pass "No local vendor paths"
fi

# Test 4: All env values use ${VAR} syntax
ENV_VALUES=$(jq -r '.. | objects | .env? // empty | to_entries[] | .value' "$MCP_FILE" 2>/dev/null)
BAD_ENV=0
while IFS= read -r val; do
  if [[ -n "$val" && ! "$val" =~ ^\$\{[A-Z_]+\}$ ]]; then
    BAD_ENV=1
  fi
done <<< "$ENV_VALUES"
if [[ $BAD_ENV -eq 0 ]]; then
  pass "All env values use \${VAR} syntax"
else
  fail "Some env values don't use \${VAR} syntax"
fi

# Test 5: .gitignore preserves vendors/ rule
if grep -q "^vendors/" "$PROJECT_ROOT/.gitignore" 2>/dev/null; then
  pass ".gitignore contains vendors/ rule"
else
  fail ".gitignore missing vendors/ rule"
fi

# Test 6: npx packages have version pins (@version)
NPX_UNPINNED=$(jq -r '.mcpServers | to_entries[] | select(.value.command == "npx") | .value.args[] | select(startswith("-") | not)' "$MCP_FILE" 2>/dev/null | grep -v '@' || true)
if [[ -z "$NPX_UNPINNED" ]]; then
  pass "All npx packages have version pins"
else
  fail "Unpinned npx packages: $NPX_UNPINNED"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]]
