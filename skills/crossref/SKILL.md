---
name: crossref
description: "Post-search citation utility. Single tool: resolve_citation. Resolves DOIs, arXiv IDs, PMIDs, and title strings to structured metadata and formatted citations (BibTeX, RIS, APA, Chicago, IEEE, CSL-JSON). 14-day cache. Use after primary sources identify papers."
user-invocable: false
allowed-tools: mcp__plugin_jadlis-research_crossref__resolve_citation
---

## When to Use This Source

Crossref is a post-search utility, not a discovery tool. Use it:
- After S2/OpenAlex/PubMed/arXiv have identified papers and formatted citations are needed
- To verify or enrich metadata via DOI lookup
- To export bibliography in BibTeX, RIS, APA, Chicago, IEEE, or other CSL styles
- When a paper's DOI is known but citation metadata needs validation

Do not use for initial paper discovery — single tool, no search/ranking capability.

## Tool Decision Table

| Task | Tool | Notes |
|------|------|-------|
| Format citation from DOI | `resolve_citation` | Primary use case |
| Look up metadata by arXiv ID | `resolve_citation` | Input: `arXiv:1706.03762` |
| Look up metadata by PMID | `resolve_citation` | Input: `PMID:12345678` |
| Look up by title string | `resolve_citation` | Fuzzy match; less reliable |
| Export BibTeX / RIS | `resolve_citation` | Set `formats` accordingly |
| Validate DOI (fast) | `resolve_citation` with `search_only=True` | Metadata only, no citation fetch |

## Key Parameters

- `query` — the citation to resolve. Accepted: DOI, arXiv ID (`arXiv:1706.03762`), PMID (`PMID:12345678`), or title string
- `formats` — list of output formats: `"csl-json"`, `"bibtex"`, `"ris"`, `"formatted"`
- `style` — citation style for `"formatted"`: `"apa"` (default), `"chicago-author-date"`, `"ieee"`, `"nature"`, `"harvard-cite-them-right"`
- `search_only` — boolean; if `True`, returns metadata only without fetching formatted citation (faster)

## Domain Fit

Source-agnostic — works for any DOI-registered content: journal articles, book chapters, conference proceedings, datasets. No domain specialization.

Best paired with:
- **Semantic Scholar**: use S2 for discovery, Crossref for BibTeX export
- **OpenAlex**: bibliometric analysis → Crossref for final citation formatting
- **PubMed**: provides PMIDs → pass with `PMID:` prefix to `resolve_citation`

## Caching

14-day cache by default (`CROSSREF_CACHE_TTL` env var). Repeated DOI lookups within the window are free and instant — no API call made. Efficient for iterative bibliography building.

## Limitations and Quirks

- Only one tool — not useful for discovery
- Title-based lookups are fuzzy; ambiguous/short titles may return wrong papers
- Response `status` field: `ok`, `not_found`, `ambiguous`, `error`
- `ambiguous` status: response may include candidates — pick best match manually. In automated pipelines, take the first candidate or skip if confidence is low; in interactive mode, surface candidates to the user for selection
- Without `CROSSREF_MAILTO`, uses public API pool with lower rate limits
- MCP namespace: `mcp__plugin_jadlis-research_crossref__resolve_citation`. If the tool silently fails (no response, no error), try the unprefixed form `mcp__crossref__resolve_citation` and update `allowed-tools` accordingly

## Error Patterns

- `status: not_found` → DOI may be incorrect; verify with original source
- `status: ambiguous` → title-based lookup matched multiple papers; inspect candidates or retry with DOI
- `status: error` → API unreachable or malformed request; retry once, then skip

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CROSSREF_MAILTO` | Recommended | Email for Crossref polite pool. Better reliability and rate limits. Without it, uses the public pool with lower rate limits — tool still works but may be throttled. |
| `CROSSREF_CACHE_TTL` | No | Cache TTL in seconds. Default: `1209600` (14 days). |

## Cross-Reference

- See `skills/crossref/references/crossref-parameters.md` for full parameter tables and response schema
- `academic-worker` loads this skill via `jadlis-research:crossref`
- `.mcp.json` uses server key `"crossref"`
