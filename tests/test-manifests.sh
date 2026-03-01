#!/usr/bin/env bash
# Tests for marketplace.json and plugin.json
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MARKETPLACE="$PROJECT_ROOT/.claude-plugin/marketplace.json"
PLUGIN="$PROJECT_ROOT/.claude-plugin/plugin.json"

PASS=0
FAIL=0

pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }

echo "=== marketplace.json tests ==="

# M1: Valid JSON
if jq . "$MARKETPLACE" > /dev/null 2>&1; then
  pass "Valid JSON"
else
  fail "Invalid JSON"
fi

# M2: Required top-level fields
if jq -e '.name and .owner and .plugins' "$MARKETPLACE" > /dev/null 2>&1; then
  pass "Required fields present (name, owner, plugins)"
else
  fail "Missing required fields"
fi

# M3: plugins[0].source is "./"
if [ "$(jq -r '.plugins[0].source' "$MARKETPLACE" 2>/dev/null)" = "./" ]; then
  pass "plugins[0].source is ./"
else
  fail "plugins[0].source should be ./"
fi

# M4: plugins[0].name matches plugin.json name
MARKET_NAME=$(jq -r '.plugins[0].name' "$MARKETPLACE" 2>/dev/null)
PLUGIN_NAME=$(jq -r '.name' "$PLUGIN" 2>/dev/null)
if [[ -n "$MARKET_NAME" && -n "$PLUGIN_NAME" && "$MARKET_NAME" = "$PLUGIN_NAME" ]]; then
  pass "Plugin names match ($MARKET_NAME)"
else
  fail "Name mismatch: marketplace=$MARKET_NAME plugin=$PLUGIN_NAME"
fi

# M4b: Top-level marketplace name matches plugin.json name
TOP_NAME=$(jq -r '.name' "$MARKETPLACE" 2>/dev/null)
if [[ -n "$TOP_NAME" && "$TOP_NAME" = "$PLUGIN_NAME" ]]; then
  pass "Top-level marketplace name matches plugin.json ($TOP_NAME)"
else
  fail "Top-level name mismatch: marketplace=$TOP_NAME plugin=$PLUGIN_NAME"
fi

# M5: No version in marketplace plugins entry
if jq -e '.plugins[0] | has("version") | not' "$MARKETPLACE" > /dev/null 2>&1; then
  pass "No version field in plugins entry"
else
  fail "plugins entry should not have version field"
fi

# M6: Not a reserved name
NAME=$(jq -r '.name' "$MARKETPLACE" 2>/dev/null)
if [[ "$NAME" != "anthropic-"* && "$NAME" != "claude-code-marketplace" ]]; then
  pass "Not a reserved name"
else
  fail "Name '$NAME' is reserved"
fi

# M7: Has category
if jq -e '.plugins[0].category' "$MARKETPLACE" > /dev/null 2>&1; then
  pass "Has category field"
else
  fail "Missing category field"
fi

# M8: Has non-empty tags array
if jq -e '.plugins[0].tags | type == "array" and length > 0' "$MARKETPLACE" > /dev/null 2>&1; then
  pass "Has non-empty tags array"
else
  fail "Missing, empty, or invalid tags"
fi

echo ""
echo "=== plugin.json tests ==="

# P1: Valid JSON
if jq . "$PLUGIN" > /dev/null 2>&1; then
  pass "Valid JSON"
else
  fail "Invalid JSON"
fi

# P2: Version is 0.9.0
if [ "$(jq -r '.version' "$PLUGIN" 2>/dev/null)" = "0.9.0" ]; then
  pass "Version is 0.9.0"
else
  fail "Version should be 0.9.0, got $(jq -r '.version' "$PLUGIN" 2>/dev/null)"
fi

# P3: Name is jadlis-research
if [ "$(jq -r '.name' "$PLUGIN" 2>/dev/null)" = "jadlis-research" ]; then
  pass "Name is jadlis-research"
else
  fail "Name should be jadlis-research"
fi

# P4: Required fields present
if jq -e '.name and .version and .description and .author and .homepage and .repository and .license and .keywords' "$PLUGIN" > /dev/null 2>&1; then
  pass "All required fields present"
else
  fail "Missing required fields"
fi

# P5: Keywords is non-empty array
if jq -e '.keywords | type == "array" and length > 0' "$PLUGIN" > /dev/null 2>&1; then
  pass "Keywords is non-empty array"
else
  fail "Keywords missing or empty"
fi

# P6: Author has name
if jq -e '.author.name' "$PLUGIN" > /dev/null 2>&1; then
  pass "Author has name"
else
  fail "Author missing name"
fi

# P7: No auto-discovered fields
ALL_ABSENT=true
for field in hooks mcpServers agents skills; do
  if jq -e ".$field != null" "$PLUGIN" > /dev/null 2>&1; then
    fail "$field should not be in plugin.json"
    ALL_ABSENT=false
  fi
done
if $ALL_ABSENT; then
  pass "No auto-discovered fields (hooks, mcpServers, agents, skills)"
fi

# V1: claude plugin validate passes
echo ""
echo "=== plugin validate ==="
if cd "$PROJECT_ROOT" && claude plugin validate . > /dev/null 2>&1; then
  pass "claude plugin validate passed"
else
  fail "claude plugin validate failed"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]]
