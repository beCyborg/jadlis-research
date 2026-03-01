#!/bin/bash
# verify-07.sh — Sprint 07 deliverable validation
# Usage: bash scripts/verify-07.sh
# Exit: 0 if all checks pass, 1 if any fail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

PASS=0
FAIL=0
GREEN='\033[0;32m'
RED='\033[0;31m'
RESET='\033[0m'

check_pass() {
  PASS=$((PASS + 1))
  echo -e "${GREEN}[PASS]${RESET} $1"
}

check_fail() {
  FAIL=$((FAIL + 1))
  echo -e "${RED}[FAIL]${RESET} $1"
}

check() {
  local desc="$1"
  shift
  if eval "$@" > /dev/null 2>&1; then
    check_pass "$desc"
  else
    check_fail "$desc"
  fi
}

# Preflight: jq
if command -v jq &> /dev/null; then
  JQ_AVAILABLE=true
else
  echo "WARNING: jq not installed — JSON checks will be skipped"
  JQ_AVAILABLE=false
fi

# ═══════════════════════════════════════════
# Group 1: New Agent Files
# ═══════════════════════════════════════════
echo ""
echo "=== Group 1: Agent Files ==="

for agent in expert-worker native-web-worker verification-worker; do
  f="${PLUGIN_ROOT}/agents/${agent}.md"
  check "Agent ${agent}.md exists" "[ -f '$f' ]"
  check "Agent ${agent}.md has name: field" "grep -q '^name:' '$f'"
  check "Agent ${agent}.md has model: claude-opus-4-6" "grep -q 'model:.*claude-opus-4-6' '$f'"
  check "Agent ${agent}.md has permissionMode: dontAsk" "grep -q 'permissionMode:.*dontAsk' '$f'"
  check "Agent ${agent}.md has maxTurns:" "grep -q 'maxTurns:' '$f'"
  check "Agent ${agent}.md has skills:" "grep -q 'skills:' '$f'"
  check "Agent ${agent}.md has mcpServers:" "grep -q 'mcpServers:' '$f'"
done

# expert-worker specific
f="${PLUGIN_ROOT}/agents/expert-worker.md"
check "expert-worker skills include exa-search" "grep -A 20 'skills:' '$f' | grep -q 'exa-search'"
check "expert-worker skills include firecrawl-extraction" "grep -A 20 'skills:' '$f' | grep -q 'firecrawl-extraction'"
check "expert-worker skills include shared-protocols" "grep -A 20 'skills:' '$f' | grep -q 'shared-protocols'"
check "expert-worker mcpServers includes exa" "grep -A 10 'mcpServers:' '$f' | grep -q 'exa'"
check "expert-worker mcpServers includes firecrawl" "grep -A 10 'mcpServers:' '$f' | grep -q 'firecrawl'"
check "expert-worker disallowedTools includes WebSearch" "grep -q 'WebSearch' '$f'"
check "expert-worker disallowedTools includes WebFetch" "grep -q 'WebFetch' '$f'"
check "expert-worker disallowedTools includes ToolSearch" "grep -q 'ToolSearch' '$f'"
check "expert-worker disallowedTools includes Task" "grep -q 'Task' '$f'"
check "expert-worker disallowedTools includes firecrawl_search" "grep -q 'firecrawl_search' '$f'"
check "expert-worker does NOT mention Substack" "! grep -qi 'substack' '$f'"
check "expert-worker has memory: user" "grep -q 'memory:.*user' '$f'"

# native-web-worker specific
f="${PLUGIN_ROOT}/agents/native-web-worker.md"
check "native-web-worker skills include shared-protocols" "grep -A 20 'skills:' '$f' | grep -q 'shared-protocols'"
check "native-web-worker mentions cross-validat" "grep -qi 'cross.validat' '$f'"
check "native-web-worker mentions always runs/spawns" "grep -qi 'always' '$f'"
check "native-web-worker has memory: user" "grep -q 'memory:.*user' '$f'"

# verification-worker specific
f="${PLUGIN_ROOT}/agents/verification-worker.md"
check "verification-worker maxTurns is 30" "grep -q 'maxTurns:.*30' '$f'"
check "verification-worker skills include shared-protocols" "grep -A 20 'skills:' '$f' | grep -q 'shared-protocols'"
check "verification-worker skills include exa-search" "grep -A 20 'skills:' '$f' | grep -q 'exa-search'"
check "verification-worker skills include firecrawl-extraction" "grep -A 20 'skills:' '$f' | grep -q 'firecrawl-extraction'"
check "verification-worker mcpServers includes exa" "grep -A 10 'mcpServers:' '$f' | grep -q 'exa'"
check "verification-worker mcpServers includes firecrawl" "grep -A 10 'mcpServers:' '$f' | grep -q 'firecrawl'"
check "verification-worker has NO memory: line" "! grep -q '^  *memory:' '$f'"
check "verification-worker mentions Verified Claims" "grep -q 'Verified Claims' '$f'"
check "verification-worker mentions Contradictions" "grep -q 'Contradictions' '$f'"
check "verification-worker mentions Unverified Claims" "grep -q 'Unverified Claims' '$f'"
check "verification-worker mentions Gaps" "grep -q 'Gaps' '$f'"

# ═══════════════════════════════════════════
# Group 2: Main Research Skill
# ═══════════════════════════════════════════
echo ""
echo "=== Group 2: Main Research Skill ==="

f="${PLUGIN_ROOT}/skills/deep-research/SKILL.md"
check "Main skill exists" "[ -f '$f' ]"
check "Main skill has context: fork" "grep -q 'context:.*fork' '$f'"
check "Main skill has disable-model-invocation: true" "grep -q 'disable-model-invocation:.*true' '$f'"
check "Main skill has name: research" "grep -q 'name:.*research' '$f'"
check "Main skill has agent: general-purpose" "grep -q 'agent:.*general-purpose' '$f'"
check "Main skill has maxTurns: 100" "grep -q 'maxTurns:.*100' '$f'"
check "Main skill allowed-tools includes Read" "grep -A 20 'allowed-tools:' '$f' | grep -q 'Read'"
check "Main skill allowed-tools includes Write" "grep -A 20 'allowed-tools:' '$f' | grep -q 'Write'"
check "Main skill allowed-tools includes Task" "grep -A 20 'allowed-tools:' '$f' | grep -q 'Task'"
check "Main skill allowed-tools includes Skill" "grep -A 20 'allowed-tools:' '$f' | grep -q 'Skill'"
check "Main skill mentions early pipeline stages" "grep -qi 'stage [01]' '$f'"
check "Main skill mentions late pipeline stages" "grep -qi 'stage 7' '$f'"
check "Main skill mentions AskUserQuestion" "grep -q 'AskUserQuestion' '$f'"
check "Main skill mentions retry" "grep -qi 'retry' '$f'"
check "Main skill mentions .abort" "grep -q '\.abort' '$f'"
check "Main skill mentions post-routing" "grep -qi 'post.routing' '$f'"
check "Main skill mentions report copy" "grep -qi 'report.*copy\|stage 7\.5\|copy.*report' '$f'"

# ═══════════════════════════════════════════
# Group 3: hooks.json Structure
# ═══════════════════════════════════════════
echo ""
echo "=== Group 3: hooks.json ==="

f="${PLUGIN_ROOT}/hooks/hooks.json"
check "hooks.json exists" "[ -f '$f' ]"

if [ "$JQ_AVAILABLE" = true ]; then
  check "hooks.json is valid JSON" "jq . '$f'"
  check "hooks.json has SessionStart key" "jq -e '.hooks.SessionStart' '$f'"
  check "hooks.json has PreToolUse key" "jq -e '.hooks.PreToolUse' '$f'"
  check "hooks.json has PostToolUse key" "jq -e '.hooks.PostToolUse' '$f'"
  check "hooks.json has SubagentStop key" "jq -e '.hooks.SubagentStop' '$f'"
  check "hooks.json has PostToolUseFailure key" "jq -e '.hooks.PostToolUseFailure' '$f'"
  check "hooks.json has Stop key" "jq -e '.hooks.Stop' '$f'"
  check "SessionStart has startup matcher" "jq -e '.hooks.SessionStart[] | select(.matcher == \"startup\")' '$f'"
  check "SessionStart has compact matcher" "jq -e '.hooks.SessionStart[] | select(.matcher == \"compact\")' '$f'"
  check "PreToolUse has WebSearch matcher" "jq -e '.hooks.PreToolUse[] | select(.matcher | test(\"WebSearch\"))' '$f'"
  check "PreToolUse has firecrawl matcher" "jq -e '.hooks.PreToolUse[] | select(.matcher | test(\"firecrawl\"))' '$f'"
  check "PreToolUse has Agent matcher" "jq -e '.hooks.PreToolUse[] | select(.matcher == \"Agent\")' '$f'"
  check "PreToolUse has exa matcher" "jq -e '.hooks.PreToolUse[] | select(.matcher | test(\"exa\"))' '$f'"
  check "PreToolUse has openalex matcher" "jq -e '.hooks.PreToolUse[] | select(.matcher | test(\"openalex\"))' '$f'"
  check "PreToolUse has arxiv matcher" "jq -e '.hooks.PreToolUse[] | select(.matcher | test(\"arxiv\"))' '$f'"
  check "SubagentStop matcher contains worker" "jq -e '.hooks.SubagentStop[] | select(.matcher | test(\"worker\"))' '$f'"
  check "Script paths use CLAUDE_PLUGIN_ROOT" "grep -q 'CLAUDE_PLUGIN_ROOT' '$f'"
  if grep -q '\\"${CLAUDE_PLUGIN_ROOT}' "$f"; then
    check_pass "Script paths have escaped quotes"
  else
    check_fail "Script paths have escaped quotes"
  fi
else
  echo "  (JSON checks skipped — jq not available)"
fi

# ═══════════════════════════════════════════
# Group 4: Hook Scripts Exist and Executable
# ═══════════════════════════════════════════
echo ""
echo "=== Group 4: Hook Scripts ==="

SCRIPTS=(
  session-init.sh
  post-compact-state.sh
  websearch-gate.sh
  firecrawl-circuit-breaker.sh
  task-background-check.sh
  firecrawl-search-block.sh
  exa-validation.sh
  openalex-validation.sh
  arxiv-throttle.sh
  subagent-stop-check.sh
  mcp-error-recovery.sh
  read-error-recovery.sh
  stop-pipeline-check.sh
  scratchpad-size-guard.sh
)

for script in "${SCRIPTS[@]}"; do
  f="${PLUGIN_ROOT}/scripts/${script}"
  check "Script ${script} exists" "[ -f '$f' ]"
  check "Script ${script} is executable" "[ -x '$f' ]"
  check "Script ${script} has bash shebang" "head -1 '$f' | grep -q '#!/bin/bash'"
done

# ═══════════════════════════════════════════
# Group 5: CLAUDE.md Updated
# ═══════════════════════════════════════════
echo ""
echo "=== Group 5: CLAUDE.md ==="

f="${PLUGIN_ROOT}/CLAUDE.md"
check "CLAUDE.md contains expert-worker" "grep -q 'expert-worker' '$f'"
check "CLAUDE.md contains native-web-worker" "grep -q 'native-web-worker' '$f'"
check "CLAUDE.md contains verification-worker" "grep -q 'verification-worker' '$f'"
check "CLAUDE.md contains pre-research" "grep -q 'pre-research' '$f'"
check "CLAUDE.md contains local track" "grep -qi 'local.*track\|track.*local' '$f'"
check "CLAUDE.md contains .abort" "grep -q '\.abort' '$f'"
check "CLAUDE.md contains hooks reference" "grep -qi 'hooks' '$f'"

# ═══════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════
echo ""
TOTAL=$((PASS + FAIL))
echo "Summary: ${PASS}/${TOTAL} checks passed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
