#!/usr/bin/env bash
# Tests for session-init.sh modifications (first-run, env sourcing)
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SCRIPT="$PROJECT_ROOT/scripts/session-init.sh"

PASS=0
FAIL=0
TEST_TMPDIR=""

pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }

setup() {
  TEST_TMPDIR="$(mktemp -d)"
  export FAKE_HOME="$TEST_TMPDIR/home"
  mkdir -p "$FAKE_HOME"
  # Unique session ID per test to avoid lock collisions
  TEST_SESSION_ID="test-$(date +%s)-$$-$RANDOM"
}

teardown() {
  # Clean up lock and cache files
  rm -f "/tmp/jadlis-session-init-${TEST_SESSION_ID}.lock"
  rm -f "/tmp/jadlis-reddit-health-${TEST_SESSION_ID}.cache"
  rm -f "/tmp/jadlis-firecrawl-health-${TEST_SESSION_ID}.cache"
  [[ -n "$TEST_TMPDIR" ]] && rm -rf "$TEST_TMPDIR"
}

run_init_capture() {
  local session_id="${1:-$TEST_SESSION_ID}"
  local json_input="{\"session_id\":\"$session_id\",\"cwd\":\"$TEST_TMPDIR\"}"
  HOME="$FAKE_HOME" CLAUDE_ENV_FILE="${TEST_TMPDIR}/claude_env" \
    bash -c "echo '$json_input' | bash '$SCRIPT'" 2>/dev/null || true
}

echo "=== session-init first-run tests ==="

# T1: First run (no marker file) → JSON output contains "First run detected"
setup
OUTPUT=$(run_init_capture)
if echo "$OUTPUT" | grep -qF "First run detected"; then
  pass "T1: First run outputs 'First run detected'"
else
  # Check inside JSON additionalContext
  CTX=$(echo "$OUTPUT" | jq -r '.hookSpecificOutput.additionalContext // empty' 2>/dev/null)
  if echo "$CTX" | grep -qF "First run detected"; then
    pass "T1: First run outputs 'First run detected' in additionalContext"
  else
    fail "T1: Expected 'First run detected', got: $OUTPUT"
  fi
fi
teardown

# T2: First run creates marker file with version
setup
run_init_capture > /dev/null
if [[ -f "$FAKE_HOME/.jadlis-research/.install-version" ]]; then
  VER=$(cat "$FAKE_HOME/.jadlis-research/.install-version")
  if [[ "$VER" == "0.9.0" ]]; then
    pass "T2: Marker file created with version 0.9.0"
  else
    fail "T2: Marker file has wrong version: $VER"
  fi
else
  fail "T2: Marker file not created"
fi
teardown

# T3: First run creates ~/.jadlis-research/ with chmod 700
setup
run_init_capture > /dev/null
if [[ -d "$FAKE_HOME/.jadlis-research" ]]; then
  PERMS=$(stat -f "%Lp" "$FAKE_HOME/.jadlis-research" 2>/dev/null || stat -c "%a" "$FAKE_HOME/.jadlis-research" 2>/dev/null)
  if [[ "$PERMS" == "700" ]]; then
    pass "T3: Directory created with chmod 700"
  else
    fail "T3: Expected perms 700, got $PERMS"
  fi
else
  fail "T3: ~/.jadlis-research not created"
fi
teardown

# T4: Version upgrade (marker has old version) → output contains "First run detected"
setup
mkdir -p "$FAKE_HOME/.jadlis-research"
echo "0.8.1" > "$FAKE_HOME/.jadlis-research/.install-version"
OUTPUT=$(run_init_capture)
if echo "$OUTPUT" | grep -qF "First run detected"; then
  pass "T4: Version upgrade outputs 'First run detected'"
else
  fail "T4: Expected 'First run detected' on version upgrade, got: $(echo "$OUTPUT" | head -1)"
fi
teardown

# T5: Version upgrade updates marker to new version
setup
mkdir -p "$FAKE_HOME/.jadlis-research"
echo "0.8.1" > "$FAKE_HOME/.jadlis-research/.install-version"
run_init_capture > /dev/null
VER=$(cat "$FAKE_HOME/.jadlis-research/.install-version")
if [[ "$VER" == "0.9.0" ]]; then
  pass "T5: Marker updated to 0.9.0 after upgrade"
else
  fail "T5: Expected 0.9.0, got $VER"
fi
teardown

# T6: Normal run (matching marker) → no "First run detected"
setup
mkdir -p "$FAKE_HOME/.jadlis-research"
echo "0.9.0" > "$FAKE_HOME/.jadlis-research/.install-version"
OUTPUT=$(run_init_capture)
if echo "$OUTPUT" | grep -q "First run detected"; then
  fail "T6: Should not output 'First run detected' on normal run"
else
  pass "T6: No first-run message on normal run"
fi
teardown

# T7: Env file exists → vars written to CLAUDE_ENV_FILE
setup
mkdir -p "$FAKE_HOME/.jadlis-research"
echo "0.9.0" > "$FAKE_HOME/.jadlis-research/.install-version"
cat > "$FAKE_HOME/.jadlis-research/env" <<'ENVEOF'
# >>> jadlis-research managed env >>>
export EXA_API_KEY='test_exa_key_123'
export FIRECRAWL_API_KEY='test_fc_key_456'
# <<< jadlis-research managed env <<<
ENVEOF
touch "$TEST_TMPDIR/claude_env"
run_init_capture > /dev/null
if grep -q "EXA_API_KEY=test_exa_key_123" "$TEST_TMPDIR/claude_env" 2>/dev/null; then
  pass "T7: EXA_API_KEY written to CLAUDE_ENV_FILE"
else
  fail "T7: EXA_API_KEY not found in CLAUDE_ENV_FILE (content: $(cat "$TEST_TMPDIR/claude_env" 2>/dev/null))"
fi
teardown

# T8: Env file missing → no error, script exits 0
setup
mkdir -p "$FAKE_HOME/.jadlis-research"
echo "0.9.0" > "$FAKE_HOME/.jadlis-research/.install-version"
# No env file — script should still produce valid JSON output
OUTPUT=$(run_init_capture)
if echo "$OUTPUT" | jq . > /dev/null 2>&1; then
  pass "T8: No error when env file missing (valid JSON output)"
else
  fail "T8: Script should produce valid JSON even without env file"
fi
teardown

# T9: Idempotent — second run skips (lock file)
setup
mkdir -p "$FAKE_HOME/.jadlis-research"
echo "0.9.0" > "$FAKE_HOME/.jadlis-research/.install-version"
SID="idem-test-$$-$RANDOM"
run_init_capture "$SID" > /dev/null
OUTPUT2=$(run_init_capture "$SID")
if [[ -z "$OUTPUT2" ]]; then
  pass "T9: Second run produces no output (idempotent)"
else
  fail "T9: Second run should produce no output, got: $(echo "$OUTPUT2" | head -1)"
fi
# Clean up lock
rm -f "/tmp/jadlis-session-init-${SID}.lock"
rm -f "/tmp/jadlis-reddit-health-${SID}.cache"
rm -f "/tmp/jadlis-firecrawl-health-${SID}.cache"
teardown

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]]
