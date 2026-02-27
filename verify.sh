#!/usr/bin/env bash
set -euo pipefail

PLUGIN_ROOT="/Users/cyborg/Documents/Claude Code/Jadlis-Research"
PASS=0
FAIL=0

check() {
  local desc="$1"; shift
  if "$@" > /dev/null 2>&1; then
    echo "  PASS: $desc"; PASS=$((PASS+1))
  else
    echo "  FAIL: $desc"; FAIL=$((FAIL+1))
  fi
}

check_grep() {
  local desc="$1" file="$2" pattern="$3"
  if grep -q "$pattern" "$file" 2>/dev/null; then
    echo "  PASS: $desc"; PASS=$((PASS+1))
  else
    echo "  FAIL: $desc"; FAIL=$((FAIL+1))
  fi
}

check_grep_i() {
  local desc="$1" file="$2" pattern="$3"
  if grep -qi "$pattern" "$file" 2>/dev/null; then
    echo "  PASS: $desc"; PASS=$((PASS+1))
  else
    echo "  FAIL: $desc"; FAIL=$((FAIL+1))
  fi
}

check_not() {
  local desc="$1"; shift
  if ! "$@" > /dev/null 2>&1; then
    echo "  PASS: $desc"; PASS=$((PASS+1))
  else
    echo "  FAIL: $desc"; FAIL=$((FAIL+1))
  fi
}

echo "=== Section 1: Directory Structure ==="
check "root dir" test -d "$PLUGIN_ROOT"
check ".claude-plugin/" test -d "$PLUGIN_ROOT/.claude-plugin"
check "agents/.gitkeep" test -f "$PLUGIN_ROOT/agents/.gitkeep"
check "skills/.gitkeep" test -f "$PLUGIN_ROOT/skills/.gitkeep"
check "scripts/.gitkeep" test -f "$PLUGIN_ROOT/scripts/.gitkeep"
check "hooks/" test -d "$PLUGIN_ROOT/hooks"
check_not "no commands/" test -d "$PLUGIN_ROOT/commands"
check ".gitignore" test -f "$PLUGIN_ROOT/.gitignore"
check "CLAUDE.md" test -f "$PLUGIN_ROOT/CLAUDE.md"
check "README.md" test -f "$PLUGIN_ROOT/README.md"
check "LICENSE" test -f "$PLUGIN_ROOT/LICENSE"
check ".mcp.json.example" test -f "$PLUGIN_ROOT/.mcp.json.example"
check_not "no .mcp.json" test -f "$PLUGIN_ROOT/.mcp.json"

echo "=== Section 2: plugin.json ==="
PJ="$PLUGIN_ROOT/.claude-plugin/plugin.json"
check "valid JSON" jq . "$PJ"
check "name=jadlis-research" test "$(jq -r .name "$PJ")" = "jadlis-research"
check "version=0.1.0" test "$(jq -r .version "$PJ")" = "0.1.0"
check "description non-empty" test -n "$(jq -r .description "$PJ" | tr -d '[:space:]')"
check "author=beCyborg" test "$(jq -r '.author.name' "$PJ")" = "beCyborg"
check "license=MIT" test "$(jq -r .license "$PJ")" = "MIT"
check "keywords>=3" test "$(jq '.keywords|length' "$PJ")" -ge 3
check_not "no inline hooks" test "$(jq 'has("hooks")' "$PJ")" = "true"
check_not "no inline mcpServers" test "$(jq 'has("mcpServers")' "$PJ")" = "true"

echo "=== Section 3: CLAUDE.md ==="
CM="$PLUGIN_ROOT/CLAUDE.md"
check_grep "jadlis-research" "$CM" "jadlis-research"
check_grep "v0.1.0" "$CM" "v0.1.0"
check_grep_i "pipeline" "$CM" "pipeline"
check_grep "Query Understanding" "$CM" "Query Understanding"
check_grep "Source Routing" "$CM" "Source Routing"
check_grep "Verification" "$CM" "Verification"
check_grep "Synthesis" "$CM" "Synthesis"
check_grep "CLAUDE_PLUGIN_ROOT" "$CM" "CLAUDE_PLUGIN_ROOT"
check_grep "disable-model-invocation" "$CM" "disable-model-invocation"
check_grep "WebSearch" "$CM" "WebSearch"
check_grep "WebFetch" "$CM" "WebFetch"
check_grep "ToolSearch" "$CM" "ToolSearch"
check_grep "mcp__plugin_jadlis-research" "$CM" "mcp__plugin_jadlis-research"
check_grep "EXA_API_KEY" "$CM" "EXA_API_KEY"

echo "=== Section 4: .gitignore ==="
GI="$PLUGIN_ROOT/.gitignore"
check_grep ".mcp.json" "$GI" '^\.mcp\.json$'
check_grep ".scratchpads/" "$GI" '\.scratchpads/'
check_grep ".DS_Store" "$GI" '\.DS_Store'
check_grep "node_modules/" "$GI" 'node_modules/'
check_grep "__pycache__/" "$GI" '__pycache__/'
check_grep "tmp/" "$GI" '^tmp/'
check_grep "*.local.md" "$GI" '\*\.local\.md'
check_grep ".env" "$GI" '^\.env$'

echo "=== Section 5: Templates ==="
check "mcp.json.example valid JSON" jq . "$PLUGIN_ROOT/.mcp.json.example"
check "hooks.json valid JSON" jq . "$PLUGIN_ROOT/hooks/hooks.json"
for ev in SessionStart PreToolUse PostToolUse SubagentStop PostToolUseFailure Stop SessionEnd; do
  check "hooks.$ev exists" jq -e ".hooks.$ev" "$PLUGIN_ROOT/hooks/hooks.json"
done

echo "=== Section 6: README + LICENSE ==="
check_grep "README: jadlis-research" "$PLUGIN_ROOT/README.md" "jadlis-research"
check_grep "LICENSE: MIT" "$PLUGIN_ROOT/LICENSE" "MIT License"

echo "=== Section 7: GitHub ==="
check "gh repo view" gh repo view beCyborg/jadlis-research
check "repo public" test "$(gh repo view beCyborg/jadlis-research --json isPrivate --jq '.isPrivate')" = "false"
check "git remote origin" git -C "$PLUGIN_ROOT" remote get-url origin
check_not ".mcp.json not tracked" test -n "$(git -C "$PLUGIN_ROOT" ls-files .mcp.json)"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
