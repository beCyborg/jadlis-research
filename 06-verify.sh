#!/usr/bin/env bash
# 06-verify.sh — Verification for 06-core-pipeline
# Run from plugin root: bash 06-verify.sh

PLUGIN="$(dirname "$(realpath "$0")")"
PASS=0; FAIL=0; WARN=0

pass() { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }
warn() { echo "  WARN: $1"; WARN=$((WARN+1)); }

echo "=== 06-core-pipeline verification ==="
echo ""

# -----------------------------------------------
echo "--- 1. Directories ---"
for skill in shared-protocols query-understanding source-routing research-synthesis; do
  test -d "$PLUGIN/skills/$skill" \
    && pass "skills/$skill exists" \
    || fail "skills/$skill missing"
  test -d "$PLUGIN/skills/$skill/references" \
    && pass "skills/$skill/references exists" \
    || fail "skills/$skill/references missing"
done

# -----------------------------------------------
echo ""
echo "--- 2. shared-protocols SKILL.md ---"
SKILL="$PLUGIN/skills/shared-protocols/SKILL.md"
test -f "$SKILL" && pass "shared-protocols SKILL.md exists" || fail "shared-protocols SKILL.md missing"
grep -q "^name: shared-protocols" "$SKILL" && pass "name: shared-protocols" || fail "name: shared-protocols missing"
grep -q "^user-invocable: false" "$SKILL" && pass "user-invocable: false" || fail "user-invocable not set"
! grep -q "disable-model-invocation" "$SKILL" && pass "no disable-model-invocation (agent-loaded)" || fail "disable-model-invocation present (should be absent for agent-loaded)"
grep -q "scratchpad" "$SKILL" && pass "scratchpad protocol present" || fail "scratchpad missing"
grep -q "finding" "$SKILL" && pass "finding format present" || fail "finding format missing"
grep -qi "Tier" "$SKILL" && pass "source tiers present" || fail "source tiers missing"
grep -q "fallback" "$SKILL" && pass "fallback chains present" || fail "fallback chains missing"
grep -q "cache" "$SKILL" && pass "cache directive present" || fail "cache directive missing"
grep -q "citation" "$SKILL" && pass "citation format present" || fail "citation format missing"
grep -q "CLAUDE_SESSION_ID" "$SKILL" && pass "session isolation present" || fail "CLAUDE_SESSION_ID missing"
grep -q ".scratchpads/" "$SKILL" && pass "scratchpad path present" || fail ".scratchpads/ path missing"

# -----------------------------------------------
echo ""
echo "--- 3. shared-protocols references ---"
REF="$PLUGIN/skills/shared-protocols/references/finding-format.md"
test -f "$REF" && pass "finding-format.md exists" || fail "finding-format.md missing"
grep -qi "Claim\|Evidence" "$REF" && pass "finding examples present" || fail "Claim/Evidence examples missing"

# -----------------------------------------------
echo ""
echo "--- 4. query-understanding SKILL.md ---"
SKILL="$PLUGIN/skills/query-understanding/SKILL.md"
test -f "$SKILL" && pass "query-understanding SKILL.md exists" || fail "query-understanding SKILL.md missing"
grep -q "^name: query-understanding" "$SKILL" && pass "name: query-understanding" || fail "name: query-understanding missing"
grep -q "^user-invocable: false" "$SKILL" && pass "user-invocable: false" || fail "user-invocable not set"
grep -q "disable-model-invocation: true" "$SKILL" && pass "disable-model-invocation: true (pipeline-only)" || fail "disable-model-invocation: true missing"
grep -q "MECE" "$SKILL" && pass "MECE decomposition present" || fail "MECE missing"
grep -qi "expansion" "$SKILL" && pass "query expansion present" || fail "expansion missing"
grep -q "clarification" "$SKILL" && pass "clarification protocol present" || fail "clarification missing"
grep -q "sub_questions" "$SKILL" && pass "sub_questions output format present" || fail "sub_questions missing"
grep -q "query-analysis.md" "$SKILL" && pass "query-analysis.md scratchpad filename present" || fail "query-analysis.md missing"
! grep -q "mcp__" "$SKILL" && pass "no MCP namespaces (pipeline skill)" || fail "MCP namespace found (pipeline skills don't call MCP)"

# -----------------------------------------------
echo ""
echo "--- 5. query-understanding references ---"
REF="$PLUGIN/skills/query-understanding/references/taxonomy.md"
test -f "$REF" && pass "taxonomy.md exists" || fail "taxonomy.md missing"
grep -q "factual" "$REF" && pass "factual type in taxonomy" || fail "factual missing from taxonomy"
grep -q "exploratory" "$REF" && pass "exploratory type in taxonomy" || fail "exploratory missing from taxonomy"
grep -q "simple" "$REF" && pass "simple complexity in taxonomy" || fail "simple missing from taxonomy"
grep -q "complex" "$REF" && pass "complex complexity in taxonomy" || fail "complex missing from taxonomy"
grep -qi "tech" "$REF" && pass "tech domain in taxonomy" || fail "tech missing from taxonomy"
grep -qi "science" "$REF" && pass "science domain in taxonomy" || fail "science missing from taxonomy"

# -----------------------------------------------
echo ""
echo "--- 6. source-routing SKILL.md ---"
SKILL="$PLUGIN/skills/source-routing/SKILL.md"
test -f "$SKILL" && pass "source-routing SKILL.md exists" || fail "source-routing SKILL.md missing"
grep -q "^name: source-routing" "$SKILL" && pass "name: source-routing" || fail "name: source-routing missing"
grep -q "^user-invocable: false" "$SKILL" && pass "user-invocable: false" || fail "user-invocable not set"
grep -q "disable-model-invocation: true" "$SKILL" && pass "disable-model-invocation: true (pipeline-only)" || fail "disable-model-invocation: true missing"
grep -q "routing" "$SKILL" && pass "routing content present" || fail "routing missing"
grep -q "matrix" "$SKILL" && pass "matrix referenced" || fail "matrix missing"
grep -q "academic-worker" "$SKILL" && pass "academic-worker referenced" || fail "academic-worker missing"
grep -q "community-worker" "$SKILL" && pass "community-worker referenced" || fail "community-worker missing"
grep -q "verification" "$SKILL" && pass "verification requirement present" || fail "verification missing"
grep -q "routing-decision.md" "$SKILL" && pass "routing-decision.md scratchpad filename present" || fail "routing-decision.md missing"
grep -q "CLAUDE_SESSION_ID" "$SKILL" && pass "session isolation present" || fail "CLAUDE_SESSION_ID missing"
! grep -q "mcp__" "$SKILL" && pass "no MCP namespaces (pipeline skill)" || fail "MCP namespace found (pipeline skills don't call MCP)"

# -----------------------------------------------
echo ""
echo "--- 7. source-routing references ---"
REF="$PLUGIN/skills/source-routing/references/routing-matrix.md"
test -f "$REF" && pass "routing-matrix.md exists" || fail "routing-matrix.md missing"
grep -q "Academic" "$REF" && pass "Academic track in matrix" || fail "Academic missing from matrix"
grep -q "Community" "$REF" && pass "Community track in matrix" || fail "Community missing from matrix"
grep -Fiq 'Social Media' "$REF" && pass "Social Media track in matrix" || fail "Social Media missing from matrix"
grep -q "Expert" "$REF" && pass "Expert track in matrix" || fail "Expert missing from matrix"
grep -q "Web" "$REF" && pass "Web track in matrix" || fail "Web missing from matrix"
grep -qi "tech" "$REF" && pass "tech domain in matrix" || fail "tech domain missing from matrix"
grep -qi "science" "$REF" && pass "science domain in matrix" || fail "science domain missing from matrix"
grep -qi "business" "$REF" && pass "business domain in matrix" || fail "business domain missing from matrix"
grep -qi "health" "$REF" && pass "health domain in matrix" || fail "health domain missing from matrix"
grep -qi "social" "$REF" && pass "social domain in matrix" || fail "social domain missing from matrix"
grep -qi "general" "$REF" && pass "general domain in matrix" || fail "general domain missing from matrix"
grep -q "direct-only\|not-implemented" "$REF" && pass "status annotations present" || fail "status annotations missing"
grep -qi "fallback" "$REF" && pass "fallback primaries documented" || fail "fallback primaries missing"

# -----------------------------------------------
echo ""
echo "--- 8. research-synthesis SKILL.md ---"
SKILL="$PLUGIN/skills/research-synthesis/SKILL.md"
test -f "$SKILL" && pass "research-synthesis SKILL.md exists" || fail "research-synthesis SKILL.md missing"
grep -q "^name: research-synthesis" "$SKILL" && pass "name: research-synthesis" || fail "name: research-synthesis missing"
grep -q "^user-invocable: false" "$SKILL" && pass "user-invocable: false" || fail "user-invocable not set"
grep -q "disable-model-invocation: true" "$SKILL" && pass "disable-model-invocation: true (pipeline-only)" || fail "disable-model-invocation: true missing"
grep -q "triangulation" "$SKILL" && pass "triangulation present" || fail "triangulation missing"
grep -qi "confidence" "$SKILL" && pass "confidence calibration present" || fail "confidence missing"
grep -q "TLDR" "$SKILL" && pass "TLDR section present" || fail "TLDR missing"
grep -qi "methodology" "$SKILL" && pass "methodology section present" || fail "methodology missing"
grep -q "report.md" "$SKILL" && pass "report.md scratchpad filename present" || fail "report.md missing"
grep -qi "counterfactual" "$SKILL" && pass "counterfactual check present" || fail "counterfactual missing"
grep -q "CLAUDE_SESSION_ID" "$SKILL" && pass "session isolation present" || fail "CLAUDE_SESSION_ID missing"
! grep -q "mcp__" "$SKILL" && pass "no MCP namespaces (pipeline skill)" || fail "MCP namespace found (pipeline skills don't call MCP)"

# -----------------------------------------------
echo ""
echo "--- 9. research-synthesis references ---"
TMPL="$PLUGIN/skills/research-synthesis/references/report-template.md"
RULES="$PLUGIN/skills/research-synthesis/references/aggregation-rules.md"
test -f "$TMPL" && pass "report-template.md exists" || fail "report-template.md missing"
test -f "$RULES" && pass "aggregation-rules.md exists" || fail "aggregation-rules.md missing"
grep -q "TLDR" "$TMPL" && pass "TLDR in report template" || fail "TLDR missing from report template"
grep -qi "Главные выводы" "$TMPL" && pass "Главные выводы in report template" || fail "Главные выводы missing from report template"
grep -qi "Методология" "$TMPL" && pass "Методология in report template" || fail "Методология missing from report template"
grep -qi "Gap" "$TMPL" && pass "Gap Analysis in report template" || fail "Gap Analysis missing from report template"
grep -qi "confidence" "$RULES" && pass "confidence rules present" || fail "confidence missing from aggregation rules"
grep -qi "Tier" "$RULES" && pass "Tier weighting in aggregation rules" || fail "Tier missing from aggregation rules"
grep -qi "dedup" "$RULES" && pass "deduplication in aggregation rules" || fail "deduplication missing from aggregation rules"

# -----------------------------------------------
echo ""
echo "--- 10. hooks.json ---"
HOOKS="$PLUGIN/hooks/hooks.json"
test -f "$HOOKS" && pass "hooks/hooks.json exists" || fail "hooks/hooks.json missing"
jq empty "$HOOKS" 2>/dev/null && pass "hooks.json valid JSON" || fail "hooks.json invalid JSON"
HOOKS_COUNT=$(jq 'length' "$HOOKS" 2>/dev/null)
[ "${HOOKS_COUNT:-0}" -gt 0 ] && pass "hooks.json not empty" || fail "hooks.json is empty"
grep -q "PostToolUseFailure" "$HOOKS" && pass "PostToolUseFailure hook present" || fail "PostToolUseFailure hook missing"
grep -q "scratchpad" "$HOOKS" && pass "scratchpad guard hook present" || fail "scratchpad guard hook missing"
grep -q "CLAUDE_PLUGIN_ROOT" "$HOOKS" && pass "CLAUDE_PLUGIN_ROOT path variable used" || fail "CLAUDE_PLUGIN_ROOT missing"

# -----------------------------------------------
echo ""
echo "--- 11. Hook scripts ---"
test -f "$PLUGIN/scripts/mcp-error-recovery.sh" && pass "mcp-error-recovery.sh exists" || fail "mcp-error-recovery.sh missing"
test -x "$PLUGIN/scripts/mcp-error-recovery.sh" && pass "mcp-error-recovery.sh is executable" || fail "mcp-error-recovery.sh not executable"
test -f "$PLUGIN/scripts/scratchpad-size-guard.sh" && pass "scratchpad-size-guard.sh exists" || fail "scratchpad-size-guard.sh missing"
test -x "$PLUGIN/scripts/scratchpad-size-guard.sh" && pass "scratchpad-size-guard.sh is executable" || fail "scratchpad-size-guard.sh not executable"

# -----------------------------------------------
echo ""
echo "--- 12. CLAUDE.md updates ---"
CLAUDE="$PLUGIN/CLAUDE.md"
test -f "$CLAUDE" && pass "CLAUDE.md exists" || fail "CLAUDE.md missing"
grep -q "query-understanding" "$CLAUDE" && pass "query-understanding in CLAUDE.md" || fail "query-understanding missing from CLAUDE.md"
grep -q "source-routing" "$CLAUDE" && pass "source-routing in CLAUDE.md" || fail "source-routing missing from CLAUDE.md"
grep -q "research-synthesis" "$CLAUDE" && pass "research-synthesis in CLAUDE.md" || fail "research-synthesis missing from CLAUDE.md"
grep -q "shared-protocols" "$CLAUDE" && pass "shared-protocols in CLAUDE.md" || fail "shared-protocols missing from CLAUDE.md"

# -----------------------------------------------
echo ""
echo "--- 13. DMI cross-check ---"
# shared-protocols: NO disable-model-invocation (agent-loaded)
! grep -q "disable-model-invocation" "$PLUGIN/skills/shared-protocols/SKILL.md" \
  && pass "shared-protocols: no DMI (correct — agent-loaded)" \
  || fail "shared-protocols: has DMI (wrong — agent-loaded skill must not have DMI)"

# query-understanding: MUST have disable-model-invocation: true (pipeline-only)
grep -q "disable-model-invocation: true" "$PLUGIN/skills/query-understanding/SKILL.md" \
  && pass "query-understanding: DMI true (correct — pipeline-only)" \
  || fail "query-understanding: DMI missing (wrong — pipeline-only skill must have DMI)"

# source-routing: MUST have disable-model-invocation: true
grep -q "disable-model-invocation: true" "$PLUGIN/skills/source-routing/SKILL.md" \
  && pass "source-routing: DMI true (correct — pipeline-only)" \
  || fail "source-routing: DMI missing (wrong — pipeline-only skill must have DMI)"

# research-synthesis: MUST have disable-model-invocation: true
grep -q "disable-model-invocation: true" "$PLUGIN/skills/research-synthesis/SKILL.md" \
  && pass "research-synthesis: DMI true (correct — pipeline-only)" \
  || fail "research-synthesis: DMI missing (wrong — pipeline-only skill must have DMI)"

# -----------------------------------------------
echo ""
echo "--- 14. Security ---"
! grep -rq "AIza" \
    "$PLUGIN/skills/shared-protocols/" \
    "$PLUGIN/skills/query-understanding/" \
    "$PLUGIN/skills/source-routing/" \
    "$PLUGIN/skills/research-synthesis/" \
    "$PLUGIN/scripts/" \
  && pass "no hardcoded Google API keys in pipeline skills and scripts" \
  || fail "SECURITY: hardcoded Google API key found"

! grep -rEq 'sk-|api_key.*=.*[a-zA-Z0-9]{20}' \
    "$PLUGIN/skills/shared-protocols/" \
    "$PLUGIN/skills/query-understanding/" \
    "$PLUGIN/skills/source-routing/" \
    "$PLUGIN/skills/research-synthesis/" \
    "$PLUGIN/scripts/" \
  && pass "no generic secret patterns in skills/scripts" \
  || fail "SECURITY: potential secret pattern found"

# -----------------------------------------------
echo ""
echo "--- 15. .gitignore ---"
grep -q '\.scratchpads' "$PLUGIN/.gitignore" \
  && pass ".scratchpads/ in .gitignore" \
  || fail ".scratchpads/ missing from .gitignore"

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
