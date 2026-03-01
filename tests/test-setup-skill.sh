#!/usr/bin/env bash
# Tests for skills/setup/SKILL.md
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILL_FILE="$PROJECT_ROOT/skills/setup/SKILL.md"

PASS=0
FAIL=0

assert() {
  local desc="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "  PASS: $desc"
    ((PASS++))
  else
    echo "  FAIL: $desc"
    ((FAIL++))
  fi
}

echo "=== SKILL.md Structure Tests ==="

assert "SKILL.md exists" test -f "$SKILL_FILE"
assert "frontmatter has name: setup" grep -q "^name: setup$" "$SKILL_FILE"
assert "frontmatter has non-empty description" grep -qE "^description: .+" "$SKILL_FILE"
assert "frontmatter has disable-model-invocation: true" grep -q "^disable-model-invocation: true$" "$SKILL_FILE"
assert "body mentions AskUserQuestion" grep -q "AskUserQuestion" "$SKILL_FILE"
assert "body references env file path" grep -q '~/.jadlis-research/env' "$SKILL_FILE"
assert "body mentions EXA_API_KEY" grep -q "EXA_API_KEY" "$SKILL_FILE"
assert "body mentions FIRECRAWL_API_KEY" grep -q "FIRECRAWL_API_KEY" "$SKILL_FILE"
assert "body mentions health check" grep -qi "health check" "$SKILL_FILE"
assert "body prevents echoing keys back in full" grep -q "Received key (length" "$SKILL_FILE"

echo ""
echo "=== Env File Write Logic Tests ==="

# Create temp dir for isolated tests
TEST_TMP=$(mktemp -d)
trap 'rm -rf "$TEST_TMP"' EXIT

# Helper: run env-management test in isolated subshell
run_env_test() {
  local test_home="$TEST_TMP/.jadlis-research-$$-$RANDOM"
  JADLIS_HOME="$test_home" JADLIS_ENV_FILE="$test_home/env" \
    bash -c "source \"$PROJECT_ROOT/scripts/env-management.sh\"; $1"
}

assert "write_env_var to empty env creates managed block" run_env_test '
  write_env_var TEST_KEY abc123 &&
  grep -qF "# >>> jadlis-research managed env >>>" "$JADLIS_ENV_FILE" &&
  grep -qF "# <<< jadlis-research managed env <<<" "$JADLIS_ENV_FILE"
'

assert "write_env_var preserves content outside managed block" run_env_test '
  mkdir -p "$JADLIS_HOME"
  echo "# user line" > "$JADLIS_ENV_FILE"
  write_env_var MY_KEY val1
  grep -qF "# user line" "$JADLIS_ENV_FILE"
'

_test_sq_script="$TEST_TMP/test_sq.sh"
cat > "$_test_sq_script" << 'SQEOF'
#!/usr/bin/env bash
source "$1/scripts/env-management.sh"
write_env_var QUOTE_KEY "it's a test" || exit 1
# Verify the escape pattern '\'' exists in the output file
grep -q "\\\\'" "$JADLIS_ENV_FILE" || exit 1
SQEOF
_test_single_quote_escape() {
  local th="$TEST_TMP/.jadlis-research-sq-$$"
  JADLIS_HOME="$th" JADLIS_ENV_FILE="$th/env" bash "$_test_sq_script" "$PROJECT_ROOT"
}
assert "write_env_var escapes single quotes" _test_single_quote_escape

assert "write_env_var escapes dollar sign" run_env_test '
  write_env_var DOLLAR_KEY '"'"'$pecial'"'"' &&
  grep -qF "$pecial" "$JADLIS_ENV_FILE"
'

assert "write_env_var rejects empty value" run_env_test '
  ! write_env_var EMPTY_KEY ""
'

assert "write_env_var creates dir with chmod 700" run_env_test '
  write_env_var DIR_KEY val &&
  [[ $(stat -f "%Lp" "$JADLIS_HOME") == "700" ]]
'

assert "write_env_var applies chmod 600 to env file" run_env_test '
  write_env_var PERM_KEY val &&
  [[ $(stat -f "%Lp" "$JADLIS_ENV_FILE") == "600" ]]
'

assert "write_env_var replaces not duplicates on second call" run_env_test '
  write_env_var DUP_KEY first &&
  write_env_var DUP_KEY second &&
  [[ $(grep -c "DUP_KEY" "$JADLIS_ENV_FILE") -eq 1 ]]
'

echo ""
echo "=== Summary: $PASS passed, $FAIL failed ==="
[[ $FAIL -eq 0 ]]
