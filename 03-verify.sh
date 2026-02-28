#!/usr/bin/env bash
# 03-verify.sh — Verification for 03-scientific-sources implementation
# Run from plugin root: bash 03-verify.sh
# Exit 0 = all checks passed. Exit 1 = one or more FAIL.

set -euo pipefail

PLUGIN="/Users/cyborg/Documents/Claude Code/Jadlis-Research"
PASS=0
FAIL=0
WARN=0

pass() { echo "PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL+1)); }
warn() { echo "WARN: $1"; WARN=$((WARN+1)); }

# --- Section 01: Directories ---
for source in semantic-scholar openalex pubmed arxiv crossref unpaywall; do
  test -d "$PLUGIN/skills/$source" \
    && pass "dir: skills/$source" \
    || fail "dir: skills/$source missing"
  test -d "$PLUGIN/skills/$source/references" \
    && pass "dir: skills/$source/references" \
    || fail "dir: skills/$source/references missing"
done

# --- Section 02: Semantic Scholar SKILL.md ---
SKILL="$PLUGIN/skills/semantic-scholar/SKILL.md"
test -f "$SKILL" && pass "file: semantic-scholar/SKILL.md" || fail "file: semantic-scholar/SKILL.md missing"

grep -q "^name: semantic-scholar" "$SKILL" \
  && pass "s2: name field" || fail "s2: name field"
grep -q "^user-invocable: false" "$SKILL" \
  && pass "s2: user-invocable: false" || fail "s2: user-invocable: false"
! grep -q "disable-model-invocation" "$SKILL" \
  && pass "s2: no DMI" || fail "s2: DMI present (must not be)"
grep -q "allowed-tools:" "$SKILL" \
  && pass "s2: allowed-tools" || fail "s2: allowed-tools missing"

for tool in search_papers get_paper_details get_paper_citations get_paper_references \
            search_authors get_author_details get_author_top_papers \
            find_duplicate_authors consolidate_authors \
            get_recommendations get_related_papers \
            list_tracked_papers clear_tracked_papers export_bibtex; do
  grep -q "$tool" "$SKILL" \
    && pass "s2: tool $tool" || fail "s2: tool $tool missing"
done

(grep -q "mcp__plugin_jadlis-research_semantic-scholar__" "$SKILL" \
  || grep -q "mcp__semantic-scholar__" "$SKILL") \
  && pass "s2: MCP namespace in allowed-tools" \
  || fail "s2: no recognized MCP namespace in allowed-tools"

(grep -q "consolidate_authors" "$SKILL" \
  && grep -qi "WARNING\|permanent\|irreversible" "$SKILL") \
  && pass "s2: consolidate_authors warning" \
  || warn "s2: consolidate_authors warning missing"

grep -q "top_n" "$SKILL" \
  && pass "s2: top_n rate limit note" \
  || warn "s2: top_n rate limit note missing"

# --- Section 03: Semantic Scholar Parameters Reference ---
REF="$PLUGIN/skills/semantic-scholar/references/semantic-scholar-parameters.md"
test -f "$REF" && pass "file: s2-parameters.md" || fail "file: s2-parameters.md missing"

(grep -q "mcp__plugin_jadlis-research_semantic-scholar" "$REF" \
  || grep -q "mcp__semantic-scholar" "$REF") \
  && pass "s2-ref: namespace documented" || fail "s2-ref: namespace not documented"

for tool in search_papers get_paper_details get_paper_citations get_paper_references \
            search_authors get_author_details get_author_top_papers \
            find_duplicate_authors consolidate_authors \
            get_recommendations get_related_papers \
            list_tracked_papers clear_tracked_papers export_bibtex; do
  grep -q "$tool" "$REF" \
    && pass "s2-ref: $tool" || fail "s2-ref: $tool not documented"
done

grep -q "DOI:\|ARXIV:" "$REF" \
  && pass "s2-ref: uppercase prefix quirk" \
  || fail "s2-ref: DOI:/ARXIV: prefix quirk missing"

# --- Section 04: OpenAlex SKILL.md ---
SKILL="$PLUGIN/skills/openalex/SKILL.md"
test -f "$SKILL" && pass "file: openalex/SKILL.md" || fail "file: openalex/SKILL.md missing"

grep -q "^name: openalex" "$SKILL" && pass "oa: name field" || fail "oa: name field"
grep -q "^user-invocable: false" "$SKILL" && pass "oa: user-invocable" || fail "oa: user-invocable"
! grep -q "disable-model-invocation" "$SKILL" && pass "oa: no DMI" || fail "oa: DMI present"

for tool in search_works search_in_journal_list find_seminal_papers find_review_articles \
            analyze_topic_trends get_trending_topics find_open_access_version; do
  grep -q "$tool" "$SKILL" && pass "oa: $tool" || fail "oa: $tool missing"
done

grep -qi "claimed\|verify\|unverified" "$SKILL" \
  && pass "oa: boolean uncertainty note" || warn "oa: boolean uncertainty note missing"

(grep -q "get_trending_topics" "$SKILL" \
  && grep -qi "test\|verify\|broken\|caution" "$SKILL") \
  && pass "oa: get_trending_topics caution" || warn "oa: get_trending_topics caution missing"

# --- Section 05: OpenAlex Parameters Reference ---
REF="$PLUGIN/skills/openalex/references/openalex-parameters.md"
test -f "$REF" && pass "file: oa-parameters.md" || fail "file: oa-parameters.md missing"

for preset in utd24 ft50 abs4star top_ai_conferences nature_science; do
  grep -q "$preset" "$REF" && pass "oa-ref: preset $preset" || fail "oa-ref: preset $preset missing"
done

grep -q "search_works\|get_work\|search_by_topic\|get_related_works\|autocomplete" "$REF" \
  && pass "oa-ref: Literature Search tools" || fail "oa-ref: Literature Search tools missing"
grep -q "analyze_geographic_distribution\|analyze_topic_trends\|compare_research_areas" "$REF" \
  && pass "oa-ref: Trends tools" || fail "oa-ref: Trends tools missing"

# --- Section 06: PubMed SKILL.md ---
SKILL="$PLUGIN/skills/pubmed/SKILL.md"
test -f "$SKILL" && pass "file: pubmed/SKILL.md" || fail "file: pubmed/SKILL.md missing"

grep -q "^name: pubmed" "$SKILL" && pass "pm: name field" || fail "pm: name field"
grep -q "^user-invocable: false" "$SKILL" && pass "pm: user-invocable" || fail "pm: user-invocable"
! grep -q "disable-model-invocation" "$SKILL" && pass "pm: no DMI" || fail "pm: DMI present"

for tool in pubmed_search_articles pubmed_fetch_contents pubmed_article_connections \
            pubmed_research_agent pubmed_generate_chart; do
  grep -q "$tool" "$SKILL" && pass "pm: $tool" || fail "pm: $tool missing"
done

grep -q "cyanheads\|npm install -g" "$SKILL" \
  && pass "pm: install prerequisite" || warn "pm: install prerequisite missing"

# --- Section 07: PubMed Parameters Reference ---
REF="$PLUGIN/skills/pubmed/references/pubmed-parameters.md"
test -f "$REF" && pass "file: pubmed-parameters.md" || fail "file: pubmed-parameters.md missing"

for tool in pubmed_search_articles pubmed_fetch_contents pubmed_article_connections \
            pubmed_research_agent pubmed_generate_chart; do
  grep -q "$tool" "$REF" && pass "pm-ref: $tool" || fail "pm-ref: $tool not documented"
done

grep -qi "bibtex\|medline\|xml\|ris" "$REF" \
  && pass "pm-ref: output formats" || fail "pm-ref: output formats missing"

# --- Section 08: arXiv SKILL.md ---
SKILL="$PLUGIN/skills/arxiv/SKILL.md"
test -f "$SKILL" && pass "file: arxiv/SKILL.md" || fail "file: arxiv/SKILL.md missing"

grep -q "^name: arxiv" "$SKILL" && pass "ax: name field" || fail "ax: name field"
grep -q "^user-invocable: false" "$SKILL" && pass "ax: user-invocable" || fail "ax: user-invocable"
! grep -q "disable-model-invocation" "$SKILL" && pass "ax: no DMI" || fail "ax: DMI present"

for tool in search_papers download_paper list_papers read_paper; do
  grep -q "$tool" "$SKILL" && pass "ax: $tool" || fail "ax: $tool missing"
done

grep -q "ARXIV_STORAGE_PATH\|arxiv-mcp-server/papers" "$SKILL" \
  && pass "ax: storage path" || warn "ax: storage path not mentioned"

# --- Section 09: arXiv Parameters Reference ---
REF="$PLUGIN/skills/arxiv/references/arxiv-parameters.md"
test -f "$REF" && pass "file: arxiv-parameters.md" || fail "file: arxiv-parameters.md missing"

grep -q "cs.AI\|cs.LG\|cs.CL" "$REF" \
  && pass "ax-ref: arXiv categories" || fail "ax-ref: arXiv categories missing"
grep -q "date_from\|categories" "$REF" \
  && pass "ax-ref: search_papers params" || fail "ax-ref: search_papers params missing"

# --- Section 10: Crossref SKILL.md ---
SKILL="$PLUGIN/skills/crossref/SKILL.md"
test -f "$SKILL" && pass "file: crossref/SKILL.md" || fail "file: crossref/SKILL.md missing"

grep -q "^name: crossref" "$SKILL" && pass "cr: name field" || fail "cr: name field"
grep -q "^user-invocable: false" "$SKILL" && pass "cr: user-invocable" || fail "cr: user-invocable"
! grep -q "disable-model-invocation" "$SKILL" && pass "cr: no DMI" || fail "cr: DMI present"
grep -q "resolve_citation" "$SKILL" && pass "cr: resolve_citation" || fail "cr: resolve_citation missing"
grep -qi "post.search\|after.*search\|utility\|formatting" "$SKILL" \
  && pass "cr: post-search positioning" || warn "cr: post-search positioning not clear"

# --- Section 11: Crossref Parameters Reference ---
REF="$PLUGIN/skills/crossref/references/crossref-parameters.md"
test -f "$REF" && pass "file: crossref-parameters.md" || fail "file: crossref-parameters.md missing"

grep -q "resolve_citation" "$REF" && pass "cr-ref: resolve_citation" || fail "cr-ref: tool not documented"
grep -qi "bibtex\|ris\|csl-json\|formatted" "$REF" \
  && pass "cr-ref: output formats" || fail "cr-ref: output formats missing"
grep -q "APA\|Chicago\|IEEE" "$REF" \
  && pass "cr-ref: citation styles" || fail "cr-ref: citation styles missing"

# --- Section 12: Unpaywall SKILL.md ---
SKILL="$PLUGIN/skills/unpaywall/SKILL.md"
test -f "$SKILL" && pass "file: unpaywall/SKILL.md" || fail "file: unpaywall/SKILL.md missing"

grep -q "^name: unpaywall" "$SKILL" && pass "uw: name field" || fail "uw: name field"
grep -q "^user-invocable: false" "$SKILL" && pass "uw: user-invocable" || fail "uw: user-invocable"
! grep -q "disable-model-invocation" "$SKILL" && pass "uw: no DMI" || fail "uw: DMI present"

for tool in paper_download paper_get_metadata; do
  grep -q "$tool" "$SKILL" && pass "uw: $tool" || fail "uw: $tool missing"
done

grep -qi "Sci-Hub\|copyright\|jurisdiction\|legal" "$SKILL" \
  && pass "uw: Sci-Hub disclosure" || fail "uw: Sci-Hub disclosure MISSING"

# --- Section 13: Unpaywall Parameters Reference ---
REF="$PLUGIN/skills/unpaywall/references/unpaywall-parameters.md"
test -f "$REF" && pass "file: unpaywall-parameters.md" || fail "file: unpaywall-parameters.md missing"

grep -q "paper_download\|paper_get_metadata" "$REF" \
  && pass "uw-ref: tools documented" || fail "uw-ref: tools not documented"
grep -qi "parallel\|to_markdown\|batch" "$REF" \
  && pass "uw-ref: batch params" || fail "uw-ref: batch params missing"

# --- Section 14: academic-worker Agent ---
AGENT="$PLUGIN/agents/academic-worker.md"
test -f "$AGENT" && pass "file: agents/academic-worker.md" || fail "file: agents/academic-worker.md missing"

grep -q "^name: academic-worker" "$AGENT" && pass "aw: name field" || fail "aw: name field"
grep -q "permissionMode: dontAsk" "$AGENT" && pass "aw: permissionMode" || fail "aw: permissionMode"
grep -q "maxTurns: 50" "$AGENT" && pass "aw: maxTurns: 50" || fail "aw: maxTurns"
grep -qE "model: (opus|claude-opus)" "$AGENT" && pass "aw: model" || fail "aw: model"

for skill in jadlis-research:semantic-scholar jadlis-research:openalex \
             jadlis-research:pubmed jadlis-research:arxiv \
             jadlis-research:crossref jadlis-research:unpaywall; do
  grep -q "$skill" "$AGENT" && pass "aw: skill $skill" || fail "aw: skill $skill missing"
done

for server in semantic-scholar openalex pubmed arxiv crossref paper-download; do
  grep -q "$server" "$AGENT" && pass "aw: mcpServer $server" || fail "aw: mcpServer $server missing"
done

grep -q "disallowedTools" "$AGENT" && pass "aw: disallowedTools" || fail "aw: disallowedTools missing"
grep -q "WebSearch\|WebFetch" "$AGENT" && pass "aw: web tools blocked" || fail "aw: web tools not blocked"

# --- Section 15: .mcp.json ---
MCP="$PLUGIN/.mcp.json"
test -f "$MCP" && pass "file: .mcp.json" || fail "file: .mcp.json missing"

jq empty "$MCP" 2>/dev/null \
  && pass "mcp: valid JSON" || fail "mcp: invalid JSON"

for server in semantic-scholar openalex pubmed arxiv crossref paper-download; do
  jq -e ".mcpServers[\"$server\"]" "$MCP" > /dev/null 2>&1 \
    && pass "mcp: server $server" || fail "mcp: server $server missing"
done

for server in semantic-scholar openalex pubmed arxiv crossref paper-download; do
  cmd=$(jq -r ".mcpServers[\"$server\"].command" "$MCP" 2>/dev/null)
  [ -n "$cmd" ] && [ "$cmd" != "null" ] \
    && pass "mcp: $server command" || fail "mcp: $server has no command"
done

! grep -q 'sk-\|api_key.*=.*[a-zA-Z0-9]\{20\}' "$MCP" \
  && pass "mcp: no hardcoded secrets" || fail "mcp: possible hardcoded API key"

# --- Section 16: Namespace Smoke Test ---
for server in semantic-scholar openalex pubmed arxiv crossref paper-download; do
  skill_dir="$server"
  [ "$server" = "paper-download" ] && skill_dir="unpaywall"

  (grep -q "mcp__plugin_jadlis-research_${server}__\|mcp__${server}__" \
    "$PLUGIN/skills/$skill_dir/SKILL.md" 2>/dev/null) \
    && pass "ns: $server namespace in SKILL.md" \
    || warn "ns: $server namespace not found in skills/$skill_dir/SKILL.md"
done

# --- arXiv .gitignore check ---
test -f "$PLUGIN/.gitignore" \
  && (grep -q "arxiv-mcp-server\|ARXIV_STORAGE" "$PLUGIN/.gitignore" \
    && pass "gitignore: arXiv storage" \
    || warn "gitignore: add .arxiv-mcp-server/ to prevent PDF commits") \
  || warn "gitignore: .gitignore missing"

# --- Summary ---
echo ""
echo "Results: ${PASS} passed, ${FAIL} failed, ${WARN} warnings"

if [ "$FAIL" -gt 0 ]; then
  echo "STATUS: FAIL — fix all FAIL items before proceeding"
  exit 1
else
  echo "STATUS: PASS — all required checks passed"
  exit 0
fi
