---
name: arxiv
description: "Domain source for CS/ML/physics preprints. 4 tools via blazickjp/arxiv-mcp-server: search preprints, download papers locally (the only source in this plugin with full-text access), list cached papers, and read downloaded content. Use for latest preprints, category-specific searches (cs.AI, cs.LG, math.ST), and full-text extraction."
user-invocable: false
allowed-tools: mcp__plugin_jadlis-research_arxiv__search_papers, mcp__plugin_jadlis-research_arxiv__download_paper, mcp__plugin_jadlis-research_arxiv__list_papers, mcp__plugin_jadlis-research_arxiv__read_paper
---

## When to Use This Source

arXiv is the domain-specialist for preprints in CS, ML, Physics, Mathematics. Use when:
- Query requires latest research not yet in journals (preprints from last 1-4 years)
- Paper found via Semantic Scholar but full text is needed — `download_paper` + `read_paper`
- Category-specific searches: cs.AI, cs.LG, cs.CL, math.ST, physics.hep-ph, etc.
- User explicitly requests preprints or arXiv papers

Do not use for biomedical/clinical (use PubMed) or social sciences (use OpenAlex).

## Tool Decision Table

| Task | Tool | Notes |
|------|------|-------|
| Search preprints by keyword/topic | `search_papers` | Category filter + date range |
| Download paper for full reading | `download_paper` | Stores to `ARXIV_STORAGE_PATH`, persists across sessions |
| Check cached papers | `list_papers` | Shows locally stored papers |
| Read downloaded paper content | `read_paper` | Must `download_paper` first |

Standard workflow: `search_papers` → `download_paper` (top candidates) → `read_paper`

## Key Parameters

**`search_papers`:**
- `query` — keyword or phrase
- `categories` — list of arXiv category codes, e.g., `["cs.AI", "cs.LG"]`
- `date_from` — YYYY-MM-DD string
- `max_results` — integer, default 10

**`download_paper` / `read_paper`:**
- `paper_id` — bare arXiv ID (e.g., `"2401.12345"`)
- **No `ARXIV:` prefix** — unlike Semantic Scholar which requires uppercase prefix. Use plain IDs.

**`list_papers`:**
- No parameters — lists all locally cached papers in `ARXIV_STORAGE_PATH`.

## Configuration

- `ARXIV_STORAGE_PATH` — sets storage directory (default: `~/.arxiv-mcp-server/papers`)
- Add `.arxiv-mcp-server/` to `.gitignore` to prevent PDF commits

> **Namespace note:** `allowed-tools` uses `mcp__plugin_jadlis-research_arxiv__` (empirically-observed). If tools fail silently, verify actual namespace at session start — it may be `mcp__arxiv__` instead. Update `allowed-tools` accordingly.

## Domain Fit

**Strong:** cs.AI, cs.LG, cs.CL, cs.CV, cs.NE, cs.RO, physics.*, math.*, stat.ML

**Weak:** biomedical (use PubMed), social sciences (use OpenAlex), humanities (limited coverage)

## Limitations and Quirks

- No official rate limit — v0.8.1 had `arxiv-throttle.sh` hook (5s delay). NOT ported to v0.1.0. Test manually; defer hook to v0.9.0+
- Bare IDs for this server: `2401.12345` not `ARXIV:2401.12345`
- Local storage grows over time — no automatic cleanup
- PDF text extraction quality varies; math/tables may not extract cleanly

## Error Patterns

- `read_paper` before `download_paper` → error; always download first
- Old-format arXiv IDs (pre-2007): `cs/0601001` format — try if standard ID fails
- Burst requests may be throttled — add delay between `download_paper` calls if errors occur

## Cross-Reference

- **Semantic Scholar** (`jadlis-research:semantic-scholar`): use S2 for citation context, arXiv `download_paper` for full text
- **Crossref** (`jadlis-research:crossref`): after finding arXiv papers, use `resolve_citation` with `arXiv:ID` format to get DOI + formatted citation
- See `skills/arxiv/references/arxiv-parameters.md` for full parameter tables and category codes
