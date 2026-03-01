#!/usr/bin/env bash
# Run all tests
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TESTS_DIR="$PROJECT_ROOT/tests"

TOTAL_PASS=0
TOTAL_FAIL=0

for test_file in "$TESTS_DIR"/test-*.sh; do
  [[ -f "$test_file" ]] || continue
  echo "Running $(basename "$test_file")..."
  if bash "$test_file"; then
    ((TOTAL_PASS++))
  else
    ((TOTAL_FAIL++))
  fi
  echo ""
done

echo "=== Summary: $TOTAL_PASS test suites passed, $TOTAL_FAIL failed ==="
[[ $TOTAL_FAIL -eq 0 ]]
