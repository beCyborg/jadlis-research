#!/usr/bin/env bash
# Tests for scripts/env-management.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Source the library under test
source "$PROJECT_ROOT/scripts/env-management.sh"

PASS=0
FAIL=0
TEST_TMPDIR=""

pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }

setup() {
  TEST_TMPDIR="$(mktemp -d)"
  # Override JADLIS_HOME to use temp dir instead of real ~/.jadlis-research
  export JADLIS_HOME="$TEST_TMPDIR/jadlis-research"
  export JADLIS_ENV_FILE="$JADLIS_HOME/env"
  export TEST_ZSHRC="$TEST_TMPDIR/zshrc"
}

teardown() {
  [[ -n "$TEST_TMPDIR" ]] && rm -rf "$TEST_TMPDIR"
}

# ========================================================
echo "=== write_env_var tests ==="

# T1: Creates managed block with correct markers on empty file
setup
write_env_var "EXA_API_KEY" "test_value_123"
if grep -qF "# >>> jadlis-research managed env >>>" "$JADLIS_ENV_FILE" && \
   grep -qF "# <<< jadlis-research managed env <<<" "$JADLIS_ENV_FILE"; then
  pass "T1: Creates managed block with correct markers"
else
  fail "T1: Missing managed block markers"
fi
teardown

# T2: Preserves content outside managed block
setup
mkdir -p "$JADLIS_HOME"
echo '# User custom content' > "$JADLIS_ENV_FILE"
echo 'export MY_CUSTOM_VAR=hello' >> "$JADLIS_ENV_FILE"
write_env_var "EXA_API_KEY" "test_val"
if grep -qF "# User custom content" "$JADLIS_ENV_FILE" && \
   grep -qF "export MY_CUSTOM_VAR=hello" "$JADLIS_ENV_FILE" && \
   grep -qF "export EXA_API_KEY=" "$JADLIS_ENV_FILE"; then
  pass "T2: Preserves content outside managed block"
else
  fail "T2: Content outside managed block was lost"
fi
teardown

# T3: Escapes single quotes in value
setup
write_env_var "KEY_WITH_QUOTE" "don't"
LINE=$(grep "^export KEY_WITH_QUOTE=" "$JADLIS_ENV_FILE")
# Sourcing the file should produce the correct value
VAL=$(bash -c "source '$JADLIS_ENV_FILE'; echo \"\$KEY_WITH_QUOTE\"")
if [[ "$VAL" == "don't" ]]; then
  pass "T3: Single quote in value is correctly escaped"
else
  fail "T3: Expected don't, got '$VAL'"
fi
teardown

# T4: Escapes dollar signs in value (safe inside single quotes)
setup
write_env_var "DOLLAR_KEY" 'price$100'
VAL=$(bash -c "source '$JADLIS_ENV_FILE'; echo \"\$DOLLAR_KEY\"")
if [[ "$VAL" == 'price$100' ]]; then
  pass "T4: Dollar sign in value preserved"
else
  fail "T4: Expected price\$100, got '$VAL'"
fi
teardown

# T5: Escapes backticks in value (safe inside single quotes)
setup
write_env_var "BACKTICK_KEY" 'value`cmd`end'
VAL=$(bash -c "source '$JADLIS_ENV_FILE'; echo \"\$BACKTICK_KEY\"")
if [[ "$VAL" == 'value`cmd`end' ]]; then
  pass "T5: Backtick in value preserved"
else
  fail "T5: Expected value\`cmd\`end, got '$VAL'"
fi
teardown

# T6: Rejects empty value
setup
if write_env_var "EMPTY_KEY" "" 2>/dev/null; then
  fail "T6: Should reject empty value"
else
  pass "T6: Empty value rejected with non-zero exit"
fi
teardown

# T7: Creates directory with chmod 700
setup
write_env_var "DIR_TEST" "val"
PERMS=$(stat -f "%Lp" "$JADLIS_HOME" 2>/dev/null || stat -c "%a" "$JADLIS_HOME" 2>/dev/null)
if [[ "$PERMS" == "700" ]]; then
  pass "T7: Directory created with chmod 700"
else
  fail "T7: Expected perms 700, got $PERMS"
fi
teardown

# T8: Sets chmod 600 on env file
setup
write_env_var "PERM_TEST" "val"
PERMS=$(stat -f "%Lp" "$JADLIS_ENV_FILE" 2>/dev/null || stat -c "%a" "$JADLIS_ENV_FILE" 2>/dev/null)
if [[ "$PERMS" == "600" ]]; then
  pass "T8: Env file has chmod 600"
else
  fail "T8: Expected perms 600, got $PERMS"
fi
teardown

# T9: Duplicate var is replaced, not duplicated
setup
write_env_var "DUP_KEY" "first"
write_env_var "DUP_KEY" "second"
COUNT=$(grep -c "^export DUP_KEY=" "$JADLIS_ENV_FILE")
VAL=$(bash -c "source '$JADLIS_ENV_FILE'; echo \"\$DUP_KEY\"")
if [[ "$COUNT" -eq 1 && "$VAL" == "second" ]]; then
  pass "T9: Duplicate replaced (count=$COUNT, value=$VAL)"
else
  fail "T9: Expected 1 line with 'second', got count=$COUNT value='$VAL'"
fi
teardown

# T17: Rejects invalid var_name (injection attempt)
setup
if write_env_var 'BAD$(id)NAME' "value" 2>/dev/null; then
  fail "T17: Should reject invalid var_name"
else
  pass "T17: Invalid var_name rejected"
fi
teardown

# T18: Rejects var_name with spaces
setup
if write_env_var 'HAS SPACE' "value" 2>/dev/null; then
  fail "T18: Should reject var_name with spaces"
else
  pass "T18: Var name with spaces rejected"
fi
teardown

# ========================================================
echo ""
echo "=== ensure_zshrc_source_line tests ==="

# T10: Adds source line to zshrc
setup
touch "$TEST_ZSHRC"
ensure_zshrc_source_line "$TEST_ZSHRC"
if grep -qF "source ~/.jadlis-research/env" "$TEST_ZSHRC"; then
  pass "T10: Source line added to zshrc"
else
  fail "T10: Source line not found in zshrc"
fi
teardown

# T11: Idempotent — no duplicate source line
setup
touch "$TEST_ZSHRC"
ensure_zshrc_source_line "$TEST_ZSHRC"
ensure_zshrc_source_line "$TEST_ZSHRC"
COUNT=$(grep -c "source ~/.jadlis-research/env" "$TEST_ZSHRC")
if [[ "$COUNT" -eq 1 ]]; then
  pass "T11: Idempotent — exactly one source line ($COUNT)"
else
  fail "T11: Expected 1 source line, got $COUNT"
fi
teardown

# T12: Creates missing zshrc
setup
rm -f "$TEST_ZSHRC"
ensure_zshrc_source_line "$TEST_ZSHRC"
if [[ -f "$TEST_ZSHRC" ]] && grep -qF "source ~/.jadlis-research/env" "$TEST_ZSHRC"; then
  pass "T12: Created missing zshrc with source line"
else
  fail "T12: Failed to create zshrc or add source line"
fi
teardown

# ========================================================
echo ""
echo "=== jadlis_source_env_to_claude tests ==="

# T13: Exports vars to CLAUDE_ENV_FILE
setup
write_env_var "KEY_A" "val_a"
write_env_var "KEY_B" "val_b"
CLAUDE_ENV_TMP="$TEST_TMPDIR/claude_env"
touch "$CLAUDE_ENV_TMP"
CLAUDE_ENV_FILE="$CLAUDE_ENV_TMP" jadlis_source_env_to_claude
if grep -qF "KEY_A=val_a" "$CLAUDE_ENV_TMP" && grep -qF "KEY_B=val_b" "$CLAUDE_ENV_TMP"; then
  pass "T13: Variables exported to CLAUDE_ENV_FILE"
else
  fail "T13: Expected KEY_A=val_a and KEY_B=val_b in $(cat "$CLAUDE_ENV_TMP")"
fi
teardown

# T14: Silently exits 0 if env file does not exist
setup
# Don't create any env file
if CLAUDE_ENV_FILE="/dev/null" jadlis_source_env_to_claude 2>/dev/null; then
  pass "T14: Exits 0 when env file does not exist"
else
  fail "T14: Should exit 0 when env file missing"
fi
teardown

# ========================================================
echo ""
echo "=== read_env_var tests ==="

# T15: Returns value for existing variable
setup
write_env_var "READ_TEST" "hello_world"
VAL=$(read_env_var "READ_TEST")
if [[ "$VAL" == "hello_world" ]]; then
  pass "T15: read_env_var returns correct value"
else
  fail "T15: Expected hello_world, got '$VAL'"
fi
teardown

# T16: Returns empty and exit 1 for missing variable
setup
write_env_var "EXISTS" "yes"
if VAL=$(read_env_var "MISSING_VAR" 2>/dev/null); then
  fail "T16: Should return non-zero for missing var"
else
  pass "T16: Returns non-zero for missing variable"
fi
teardown

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]]
