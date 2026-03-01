#!/usr/bin/env bash
# 05-verify.sh — Verification for 05-social-sources-extended
# Run from plugin root: bash 05-verify.sh

PLUGIN="$(dirname "$(realpath "$0")")"
PASS=0; FAIL=0; WARN=0

pass() { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }
warn() { echo "  WARN: $1"; WARN=$((WARN+1)); }

echo "=== 05-social-sources-extended verification ==="
echo ""

# -----------------------------------------------
echo "--- 1. Directories ---"
for source in google-maps instagram; do
  test -d "$PLUGIN/skills/$source" \
    && pass "skills/$source exists" \
    || fail "skills/$source missing"
  test -d "$PLUGIN/skills/$source/references" \
    && pass "skills/$source/references exists" \
    || fail "skills/$source/references missing"
done
# TikTok is conditional (bonus scope)
if test -d "$PLUGIN/skills/tiktok"; then
  pass "skills/tiktok exists (bonus)"
  test -d "$PLUGIN/skills/tiktok/references" \
    && pass "skills/tiktok/references exists" \
    || fail "skills/tiktok/references missing"
else
  warn "skills/tiktok missing (bonus — skipped)"
fi

# -----------------------------------------------
echo ""
echo "--- 2. Google Maps SKILL.md ---"
SKILL="$PLUGIN/skills/google-maps/SKILL.md"
test -f "$SKILL" && pass "google-maps SKILL.md exists" || fail "google-maps SKILL.md missing"
grep -q "^name: google-maps" "$SKILL" && pass "name: google-maps" || fail "name: google-maps missing"
grep -q "^user-invocable: false" "$SKILL" && pass "user-invocable: false" || fail "user-invocable not set"
! grep -q "disable-model-invocation" "$SKILL" && pass "no disable-model-invocation" || fail "disable-model-invocation present"
grep -q "allowed-tools:" "$SKILL" && pass "allowed-tools present" || fail "allowed-tools missing"
grep -q "mcp__plugin_jadlis-research_google-maps__" "$SKILL" && pass "Google Maps MCP namespace" || fail "Google Maps MCP namespace missing"
grep -q "mcp__plugin_jadlis-research_serpapi__" "$SKILL" && pass "SerpAPI tool referenced" || fail "SerpAPI tool missing"
grep -q "mcp__claude_ai_Exa__web_search_exa" "$SKILL" && pass "Exa fallback referenced" || fail "Exa fallback missing"
grep -q "data_id" "$SKILL" && pass "data_id documented" || fail "data_id missing"
grep -q "place_id" "$SKILL" && pass "place_id documented" || fail "place_id missing"
grep -qi "yelp.com\|tripadvisor.com" "$SKILL" && pass "fallback chain documented" || fail "fallback chain missing"
grep -q "INVALID_API_KEY\|OVER_QUERY_LIMIT" "$SKILL" && pass "error patterns documented" || fail "error patterns missing"
! grep -q "AIza" "$SKILL" && pass "no hardcoded Google API keys" || fail "SECURITY: hardcoded Google API key"

# -----------------------------------------------
echo ""
echo "--- 3. Google Maps parameters.md ---"
REF="$PLUGIN/skills/google-maps/references/google-maps-parameters.md"
test -f "$REF" && pass "google-maps-parameters.md exists" || fail "google-maps-parameters.md missing"
grep -q "maps_search_places" "$REF" && pass "maps_search_places documented" || fail "maps_search_places missing"
grep -q "maps_place_details" "$REF" && pass "maps_place_details documented" || fail "maps_place_details missing"
grep -q "maps_geocode" "$REF" && pass "maps_geocode documented" || fail "maps_geocode missing"
grep -q "google_maps_reviews" "$REF" && pass "SerpAPI engine documented" || fail "SerpAPI engine missing"
grep -q "data_id" "$REF" && pass "data_id in ref" || fail "data_id missing from ref"
grep -qi "pagination\|token" "$REF" && pass "pagination documented" || fail "pagination missing"
! grep -q "AIza" "$REF" && pass "no hardcoded keys in ref" || fail "SECURITY: hardcoded key in ref"

# -----------------------------------------------
echo ""
echo "--- 4. Instagram SKILL.md ---"
SKILL="$PLUGIN/skills/instagram/SKILL.md"
test -f "$SKILL" && pass "instagram SKILL.md exists" || fail "instagram SKILL.md missing"
grep -q "^name: instagram" "$SKILL" && pass "name: instagram" || fail "name: instagram missing"
grep -q "^user-invocable: false" "$SKILL" && pass "user-invocable: false" || fail "user-invocable not set"
! grep -q "disable-model-invocation" "$SKILL" && pass "no disable-model-invocation" || fail "disable-model-invocation present"
grep -q "mcp__plugin_jadlis-research_xpoz__" "$SKILL" && pass "Xpoz namespace referenced" || fail "Xpoz namespace missing"
! grep -q "<.*_tool>" "$SKILL" && pass "no placeholder tool names" || fail "placeholder tool names found"
grep -qi "ToS\|Terms of Service\|legal\|disclaimer" "$SKILL" && pass "ToS disclaimer present" || fail "ToS disclaimer missing"
grep -q "401\|403\|OAuth\|token.*expir" "$SKILL" && pass "OAuth error handling documented" || fail "OAuth error handling missing"
grep -q "credit" "$SKILL" && pass "credit consumption documented" || fail "credit consumption missing"
grep -qi "public.*only\|private.*account" "$SKILL" && pass "public-data-only limitation" || fail "public-data-only missing"

# -----------------------------------------------
echo ""
echo "--- 5. Instagram parameters.md ---"
REF="$PLUGIN/skills/instagram/references/instagram-parameters.md"
test -f "$REF" && pass "instagram-parameters.md exists" || fail "instagram-parameters.md missing"
grep -q "mcp__plugin_jadlis-research_xpoz__" "$REF" && pass "Xpoz namespace in ref" || fail "Xpoz namespace missing from ref"
grep -qi "credit" "$REF" && pass "credit calculation in ref" || fail "credit calculation missing from ref"
grep -qi "rate.*limit\|limit.*rate" "$REF" && pass "rate limits in ref" || fail "rate limits missing from ref"

# -----------------------------------------------
echo ""
echo "--- 6. TikTok (conditional) ---"
if test -d "$PLUGIN/skills/tiktok"; then
  SKILL="$PLUGIN/skills/tiktok/SKILL.md"
  test -f "$SKILL" && pass "tiktok SKILL.md exists" || fail "tiktok SKILL.md missing"
  grep -q "^name: tiktok" "$SKILL" && pass "name: tiktok" || fail "name: tiktok missing"
  grep -q "^user-invocable: false" "$SKILL" && pass "user-invocable: false" || fail "user-invocable not set"
  ! grep -q "disable-model-invocation" "$SKILL" && pass "no disable-model-invocation" || fail "disable-model-invocation present"
  grep -q "mcp__plugin_jadlis-research_xpoz__" "$SKILL" && pass "Xpoz namespace" || fail "Xpoz namespace missing"
  ! grep -q "<.*_tool>" "$SKILL" && pass "no placeholder tool names" || fail "placeholder tool names found"
else
  # TikTok does not exist — verify agent does NOT reference it
  ! grep -q "jadlis-research:tiktok" "$PLUGIN/agents/social-media-worker.md" \
    && pass "agent does not reference tiktok skill (correct)" \
    || fail "agent references tiktok skill but skill does not exist"
fi

# -----------------------------------------------
echo ""
echo "--- 7. Social Media Worker Agent ---"
AGENT="$PLUGIN/agents/social-media-worker.md"
test -f "$AGENT" && pass "social-media-worker.md exists" || fail "social-media-worker.md missing"
grep -q "^name: social-media-worker" "$AGENT" && pass "name: social-media-worker" || fail "name field missing"
grep -q "model: claude-opus-4-6" "$AGENT" && pass "model: opus" || fail "model field missing"
grep -q "permissionMode: dontAsk" "$AGENT" && pass "permissionMode: dontAsk" || fail "permissionMode missing"
grep -q "memory: user" "$AGENT" && pass "memory: user" || fail "memory missing"
grep -q "maxTurns: 50" "$AGENT" && pass "maxTurns: 50" || fail "maxTurns missing"
grep -q "jadlis-research:google-maps" "$AGENT" && pass "google-maps skill listed" || fail "google-maps skill missing"
grep -q "jadlis-research:instagram" "$AGENT" && pass "instagram skill listed" || fail "instagram skill missing"
grep -q "google-maps" "$AGENT" && pass "google-maps in mcpServers" || fail "google-maps missing from mcpServers"
grep -q "serpapi" "$AGENT" && pass "serpapi in mcpServers" || fail "serpapi missing from mcpServers"
grep -q "xpoz" "$AGENT" && pass "xpoz in mcpServers" || fail "xpoz missing from mcpServers"
grep -q "mcp__claude_ai_Firecrawl__firecrawl_scrape" "$AGENT" && pass "Firecrawl explicitly blocked" || fail "Firecrawl not blocked"
! grep -q "mcp__claude_ai_Firecrawl__\*" "$AGENT" && pass "no wildcard Firecrawl blocks" || fail "wildcard Firecrawl block found"
! grep -q "^  - mcp__claude_ai_Exa__web_search_exa" "$AGENT" && pass "Exa not in disallowedTools" || fail "Exa blocked (needed as fallback)"
grep -q "WebSearch" "$AGENT" && pass "WebSearch blocked" || fail "WebSearch not blocked"
grep -q "WebFetch" "$AGENT" && pass "WebFetch blocked" || fail "WebFetch not blocked"
grep -q "CLAUDE_SESSION_ID" "$AGENT" && pass "scratchpad convention documented" || fail "scratchpad convention missing"
grep -qi "source-routing\|sprint 06\|TODO" "$AGENT" && pass "sprint 06 TODO noted" || fail "sprint 06 TODO missing"

# -----------------------------------------------
echo ""
echo "--- 8. MCP Configuration (.mcp.json) ---"
MCP="$PLUGIN/.mcp.json"
test -f "$MCP" && pass "mcp.json exists" || fail "mcp.json missing"
jq empty "$MCP" 2>/dev/null && pass "mcp.json valid JSON" || fail "mcp.json invalid JSON"
jq -e '.mcpServers["google-maps"]' "$MCP" > /dev/null 2>&1 && pass "google-maps server present" || fail "google-maps server missing"
jq -e '.mcpServers["serpapi"]' "$MCP" > /dev/null 2>&1 && pass "serpapi server present" || fail "serpapi server missing"
jq -e '.mcpServers["xpoz"]' "$MCP" > /dev/null 2>&1 && pass "xpoz server present" || fail "xpoz server missing"
[ "$(jq -r '.mcpServers["google-maps"].command' "$MCP")" = "npx" ] && pass "google-maps uses npx" || fail "google-maps command wrong"
[ "$(jq -r '.mcpServers["serpapi"].command' "$MCP")" = "uv" ] && pass "serpapi uses uv" || fail "serpapi command wrong"
[ "$(jq -r '.mcpServers["xpoz"].type' "$MCP")" = "streamable-http" ] && pass "xpoz is streamable-http" || fail "xpoz type wrong"
KEY_VAL=$(jq -r '.mcpServers["google-maps"].env.GOOGLE_MAPS_API_KEY' "$MCP" 2>/dev/null)
echo "$KEY_VAL" | grep -q '${' && pass "GOOGLE_MAPS_API_KEY uses \${VAR}" || fail "GOOGLE_MAPS_API_KEY hardcoded or missing"
KEY_VAL=$(jq -r '.mcpServers["serpapi"].env.SERPAPI_KEY' "$MCP" 2>/dev/null)
echo "$KEY_VAL" | grep -q '${' && pass "SERPAPI_KEY uses \${VAR}" || fail "SERPAPI_KEY hardcoded or missing"
! grep -q 'AIza' "$MCP" && pass "no hardcoded Google key in mcp.json" || fail "SECURITY: hardcoded Google key in mcp.json"
! grep -Eq 'sk-|api_key.*=.*[a-zA-Z0-9]{20}' "$MCP" && pass "no hardcoded secrets" || fail "SECURITY: hardcoded secret found"

# -----------------------------------------------
echo ""
echo "--- 9. .mcp.json.example ---"
EXAMPLE="$PLUGIN/.mcp.json.example"
test -f "$EXAMPLE" && pass "mcp.json.example exists" || fail "mcp.json.example missing"
grep -q "google-maps" "$EXAMPLE" && pass "google-maps entry present" || fail "google-maps entry missing"
grep -q "serpapi" "$EXAMPLE" && pass "serpapi entry present" || fail "serpapi entry missing"
grep -q '"uv"' "$EXAMPLE" && pass "serpapi uses uv" || fail "serpapi not using uv"
grep -q "xpoz" "$EXAMPLE" && pass "xpoz entry present" || fail "xpoz entry missing"
grep -q "streamable-http" "$EXAMPLE" && pass "xpoz transport type" || fail "xpoz transport type missing"
! grep -q 'AIza' "$EXAMPLE" && pass "no hardcoded Google key in example" || fail "SECURITY: hardcoded key in example"

# -----------------------------------------------
echo ""
echo "--- 10. CLAUDE.md Updates ---"
CLAUDE="$PLUGIN/CLAUDE.md"
test -f "$CLAUDE" && pass "CLAUDE.md exists" || fail "CLAUDE.md missing"
grep -q "Google Maps" "$CLAUDE" && pass "Google Maps mentioned" || fail "Google Maps missing"
grep -q "Instagram" "$CLAUDE" && pass "Instagram mentioned" || fail "Instagram missing"
grep -q "social-media-worker" "$CLAUDE" && pass "social-media-worker mentioned" || fail "social-media-worker missing"
grep -q "GOOGLE_MAPS_API_KEY" "$CLAUDE" && pass "GOOGLE_MAPS_API_KEY documented" || fail "GOOGLE_MAPS_API_KEY missing"
grep -q "SERPAPI_KEY" "$CLAUDE" && pass "SERPAPI_KEY documented" || fail "SERPAPI_KEY missing"

# -----------------------------------------------
echo ""
echo "--- 11. Namespace Checks ---"
grep -q "mcp__plugin_jadlis-research_google-maps__" "$PLUGIN/skills/google-maps/SKILL.md" \
  && pass "google-maps: correct MCP namespace" || fail "google-maps: MCP namespace missing"
grep -q "mcp__plugin_jadlis-research_serpapi__" "$PLUGIN/skills/google-maps/SKILL.md" \
  && pass "google-maps: SerpAPI namespace present" || fail "google-maps: SerpAPI namespace missing"
grep -q "mcp__plugin_jadlis-research_xpoz__" "$PLUGIN/skills/instagram/SKILL.md" \
  && pass "instagram: Xpoz namespace present" || fail "instagram: Xpoz namespace missing"
if test -d "$PLUGIN/skills/tiktok"; then
  grep -q "mcp__plugin_jadlis-research_xpoz__" "$PLUGIN/skills/tiktok/SKILL.md" \
    && pass "tiktok: Xpoz namespace present" || fail "tiktok: Xpoz namespace missing"
fi

# -----------------------------------------------
echo ""
echo "--- 12. Security Checks ---"
! grep -rq "AIza" \
    "$PLUGIN/skills/google-maps/" \
    "$PLUGIN/skills/instagram/" \
    "$PLUGIN/agents/social-media-worker.md" \
  && pass "no hardcoded Google API keys in skills/agent" \
  || fail "SECURITY: hardcoded Google API key found"

SECURITY_PATHS=("$PLUGIN/skills/google-maps/" "$PLUGIN/skills/instagram/" "$PLUGIN/agents/social-media-worker.md")
if test -d "$PLUGIN/skills/tiktok"; then
  SECURITY_PATHS+=("$PLUGIN/skills/tiktok/")
fi

! grep -rEq 'sk-|api_key.*=.*[a-zA-Z0-9]{20}' "${SECURITY_PATHS[@]}" \
  && pass "no generic secret patterns in skills/agent" \
  || fail "SECURITY: potential secret pattern found"

if test -d "$PLUGIN/skills/tiktok"; then
  ! grep -rq "AIza" "$PLUGIN/skills/tiktok/" \
    && pass "no hardcoded keys in tiktok skill" \
    || fail "SECURITY: hardcoded key in tiktok skill"
fi

# -----------------------------------------------
echo ""
echo "Results: $PASS passed, $FAIL failed, $WARN warnings"
if [ "$FAIL" -eq 0 ]; then
  echo "STATUS: PASS"
  exit 0
else
  echo "STATUS: FAIL"
  exit 1
fi
