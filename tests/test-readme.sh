#!/usr/bin/env bash
# Tests for README.md
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
README="$PROJECT_ROOT/README.md"

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

echo "=== README.md Tests ==="

assert "contains English Quick Start section" grep -q "## Quick Start" "$README"
assert "contains Russian section" grep -qE "Быстрый старт|Установка" "$README"
assert "contains marketplace add command" grep -q "plugin marketplace add beCyborg/jadlis-research" "$README"
assert "contains plugin install command" grep -q "plugin install jadlis-research" "$README"
assert "contains Data Sources table" grep -qE "Data Sources|Источники данных" "$README"
assert "contains Exa in table" grep -qE "Exa" "$README"
assert "contains EXA_API_KEY" grep -q "EXA_API_KEY" "$README"
assert "contains FIRECRAWL_API_KEY" grep -q "FIRECRAWL_API_KEY" "$README"
assert "mentions /jadlis-research:setup" grep -q "/jadlis-research:setup" "$README"
assert "mentions Core tier" grep -q "Core" "$README"
assert "mentions Recommended tier" grep -qE "Recommended|Рекомендуемые" "$README"
assert "mentions Optional tier" grep -qE "Optional|Опциональные" "$README"
assert "mentions Free tier" grep -qE "Free|Бесплатно" "$README"
assert "no 'Coming soon' placeholder" bash -c "! grep -qi 'coming soon' '$README'"
assert "contains pipeline diagram" grep -qE "Query Understanding|Source Routing" "$README"
assert "length > 500 lines" bash -c "[ \$(wc -l < '$README') -gt 500 ]"

echo ""
echo "=== Summary: $PASS passed, $FAIL failed ==="
[[ $FAIL -eq 0 ]]
