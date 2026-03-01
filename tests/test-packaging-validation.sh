#!/usr/bin/env bash
# test-packaging-validation.sh — Section 08: Packaging & Validation
# Run: bash scripts/test-packaging-validation.sh
# Expected: all PASS, exit 0

set -uo pipefail
PLUGIN_ROOT="${PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PASS=0; FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== Block 1: Plugin manifest validation ==="
PJ="$PLUGIN_ROOT/.claude-plugin/plugin.json"
jq . "$PJ" > /dev/null 2>&1 && pass "plugin.json valid JSON" || fail "plugin.json invalid JSON"
[[ "$(jq -r .version "$PJ")" == "0.9.0" ]] && pass "plugin.json version 0.9.0" || fail "plugin.json version not 0.9.0"
[[ -n "$(jq -r .name "$PJ")" ]] && pass "plugin.json has name" || fail "plugin.json missing name"
[[ -n "$(jq -r .description "$PJ")" ]] && pass "plugin.json has description" || fail "plugin.json missing description"
[[ -n "$(jq -r '.author.name' "$PJ")" ]] && pass "plugin.json author.name" || fail "plugin.json missing author.name"
[[ -n "$(jq -r .homepage "$PJ")" ]] && pass "plugin.json has homepage" || fail "plugin.json missing homepage"
[[ -n "$(jq -r .repository "$PJ")" ]] && pass "plugin.json has repository" || fail "plugin.json missing repository"
[[ -n "$(jq -r .license "$PJ")" ]] && pass "plugin.json has license" || fail "plugin.json missing license"
KEYWORDS_LEN=$(jq '.keywords | length' "$PJ" 2>/dev/null)
[[ "$KEYWORDS_LEN" -gt 0 ]] && pass "plugin.json keywords non-empty" || fail "plugin.json keywords empty"

echo ""
echo "=== Block 2: marketplace.json validation ==="
MJ="$PLUGIN_ROOT/.claude-plugin/marketplace.json"
[[ -f "$MJ" ]] && pass "marketplace.json exists" || fail "marketplace.json missing"
jq . "$MJ" > /dev/null 2>&1 && pass "marketplace.json valid JSON" || fail "marketplace.json invalid JSON"
[[ -n "$(jq -r .name "$MJ" 2>/dev/null)" ]] && pass "marketplace.json has name" || fail "marketplace.json missing name"
[[ -n "$(jq -r .owner "$MJ" 2>/dev/null)" ]] && pass "marketplace.json has owner" || fail "marketplace.json missing owner"
[[ "$(jq -r '.plugins[0].source' "$MJ" 2>/dev/null)" == "./" ]] && pass "marketplace plugins[0].source=./" || fail "marketplace plugins[0].source wrong"
[[ "$(jq -r '.plugins[0].name' "$MJ" 2>/dev/null)" == "jadlis-research" ]] && pass "marketplace plugins[0].name=jadlis-research" || fail "marketplace plugins[0].name wrong"
PLUGINS_LEN=$(jq '.plugins | length' "$MJ" 2>/dev/null)
[[ "$PLUGINS_LEN" -gt 0 ]] && pass "marketplace has plugins array" || fail "marketplace plugins array empty"

echo ""
echo "=== Block 3: .gitignore correctness ==="
GI="$PLUGIN_ROOT/.gitignore"
grep -qx ".mcp.json" "$GI" 2>/dev/null && pass ".gitignore excludes .mcp.json" || fail ".gitignore missing .mcp.json"
grep -q "\.env" "$GI" 2>/dev/null && pass ".gitignore excludes .env" || fail ".gitignore missing .env"
grep -q "vendors/" "$GI" 2>/dev/null && pass ".gitignore excludes vendors/" || fail ".gitignore missing vendors/"
grep -q "\.scratchpads/" "$GI" 2>/dev/null && pass ".gitignore excludes .scratchpads/" || fail ".gitignore missing .scratchpads/"
grep -q "\.pubmed-search/" "$GI" 2>/dev/null && pass ".gitignore excludes .pubmed-search/" || fail ".gitignore missing .pubmed-search/"
grep -q "\.arxiv-mcp-server/" "$GI" 2>/dev/null && pass ".gitignore excludes .arxiv-mcp-server/" || fail ".gitignore missing .arxiv-mcp-server/"
# .mcp.json.example should be tracked
[[ -n "$(git -C "$PLUGIN_ROOT" ls-files .mcp.json.example 2>/dev/null)" ]] && pass ".mcp.json.example tracked" || fail ".mcp.json.example not tracked"

echo ""
echo "=== Block 4: No secrets in tracked files ==="
SECRET_FILES=$(cd "$PLUGIN_ROOT" && git ls-files | xargs grep -lE 'sk-[a-zA-Z0-9]{20,}|exa-[a-zA-Z0-9]{20,}|fc-[a-zA-Z0-9]{20,}|AIza[a-zA-Z0-9]{30,}|AKIA[A-Z0-9]{16}' 2>/dev/null || true)
[[ -z "$SECRET_FILES" ]] && pass "no secrets in tracked files" || fail "secrets found in: $SECRET_FILES"
MCP_TRACKED=$(git -C "$PLUGIN_ROOT" ls-files .mcp.json 2>/dev/null)
[[ -z "$MCP_TRACKED" ]] && pass ".mcp.json not tracked" || fail ".mcp.json is tracked"

echo ""
echo "=== Block 5: Script permissions and shebangs ==="
ALL_EXEC=true
for f in "$PLUGIN_ROOT"/scripts/*.sh; do
  [[ -x "$f" ]] || { fail "$(basename "$f") not executable"; ALL_EXEC=false; }
done
$ALL_EXEC && pass "all scripts executable"
SHEBANG_OK=true
for f in "$PLUGIN_ROOT"/scripts/*.sh; do
  head -1 "$f" | grep -qE '^#!/(usr/)?bin/(env )?bash' || { fail "$(basename "$f") missing bash shebang"; SHEBANG_OK=false; }
done
$SHEBANG_OK && pass "all scripts have bash shebang"

echo ""
echo "=== Block 6: \${CLAUDE_PLUGIN_ROOT} path resolution ==="
HARDCODED_HOOKS=$(jq -r '.hooks | .. | strings' "$PLUGIN_ROOT/hooks/hooks.json" 2>/dev/null | grep '/Users/' || true)
[[ -z "$HARDCODED_HOOKS" ]] && pass "no /Users/ paths in hooks.json" || fail "hardcoded paths in hooks.json"
# Check scripts (excluding test/verify scripts)
HARDCODED_SCRIPTS=$(grep -rl '/Users/' "$PLUGIN_ROOT"/scripts/*.sh 2>/dev/null | grep -v 'verify\|test-packaging' || true)
[[ -z "$HARDCODED_SCRIPTS" ]] && pass "no /Users/ paths in scripts" || fail "hardcoded paths in scripts: $HARDCODED_SCRIPTS"

echo ""
echo "=== Block 7: .mcp.json.example correctness ==="
MCE="$PLUGIN_ROOT/.mcp.json.example"
jq . "$MCE" > /dev/null 2>&1 && pass ".mcp.json.example valid JSON" || fail ".mcp.json.example invalid JSON"
! grep -q 'vendors/' "$MCE" 2>/dev/null && pass "no vendors/ paths in .mcp.json.example" || fail "vendors/ path in .mcp.json.example"
# Verify env vars use ${VAR} syntax, not hardcoded values
HARDCODED_VALS=$(jq -r '.. | .env? // empty | to_entries[]? | select(.value | test("^\\$\\{") | not) | .key' "$MCE" 2>/dev/null || true)
[[ -z "$HARDCODED_VALS" ]] && pass "env vars use \${VAR} syntax" || fail "hardcoded env values: $HARDCODED_VALS"

echo ""
echo "=== Block 8: Marketplace install simulation ==="
CLONE_DIR=$(mktemp -d)
git clone --quiet "$PLUGIN_ROOT" "${CLONE_DIR}/jadlis-research" 2>/dev/null
[[ -f "${CLONE_DIR}/jadlis-research/.claude-plugin/plugin.json" ]] && pass "cloned: plugin.json" || fail "cloned: missing plugin.json"
[[ -f "${CLONE_DIR}/jadlis-research/.claude-plugin/marketplace.json" ]] && pass "cloned: marketplace.json" || fail "cloned: missing marketplace.json"
[[ -f "${CLONE_DIR}/jadlis-research/skills/setup/SKILL.md" ]] && pass "cloned: setup skill" || fail "cloned: missing setup skill"
[[ -d "${CLONE_DIR}/jadlis-research/scripts" ]] && pass "cloned: scripts/" || fail "cloned: missing scripts/"
[[ -f "${CLONE_DIR}/jadlis-research/README.md" ]] && pass "cloned: README.md" || fail "cloned: missing README.md"
[[ ! -f "${CLONE_DIR}/jadlis-research/.mcp.json" ]] && pass "cloned: no .mcp.json" || fail "cloned: .mcp.json leaked"
[[ ! -d "${CLONE_DIR}/jadlis-research/vendors" ]] && pass "cloned: no vendors/" || fail "cloned: vendors/ present"
rm -rf "${CLONE_DIR}"

echo ""
echo "=== Block 9: Version consistency ==="
grep -q "0.9.0" "$PLUGIN_ROOT/.claude-plugin/plugin.json" && pass "version in plugin.json" || fail "version missing from plugin.json"
grep -q "v0.9.0" "$PLUGIN_ROOT/CLAUDE.md" && pass "version in CLAUDE.md" || fail "version missing from CLAUDE.md"
grep -q "v0.9.0" "$PLUGIN_ROOT/README.md" && pass "version in README.md" || fail "version missing from README.md"
! grep -q "v0.8.1" "$PLUGIN_ROOT/CLAUDE.md" && pass "no old v0.8.1 in CLAUDE.md" || fail "old v0.8.1 in CLAUDE.md"

echo ""
echo "═══════════════════════════════════════"
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
