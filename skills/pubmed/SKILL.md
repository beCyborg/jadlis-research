---
name: pubmed
description: "PubMed biomedical literature skill. 5 tools: search articles, fetch full content (BibTeX/RIS/MEDLINE/XML), traverse citation networks, generate PICO-structured research plans, and create publication charts. Primary domain source for health, clinical, and pharmacological queries."
user-invocable: false
allowed-tools: mcp__plugin_jadlis-research_pubmed__pubmed_search_articles, mcp__plugin_jadlis-research_pubmed__pubmed_fetch_contents, mcp__plugin_jadlis-research_pubmed__pubmed_article_connections, mcp__plugin_jadlis-research_pubmed__pubmed_research_agent, mcp__plugin_jadlis-research_pubmed__pubmed_generate_chart
---

## When to Use This Source

Primary domain source for:
- Biomedical and life sciences research
- Clinical trials and evidence-based medicine
- Pharmacology and drug research
- Public health and epidemiology
- MeSH-indexed literature (controlled vocabulary)

Use S2/OpenAlex for broad academic queries. PubMed is domain-specific. Use arXiv for preprints — PubMed covers peer-reviewed, MEDLINE-indexed literature. Use PubMed alongside Semantic Scholar for biomedical queries where citation metrics matter.

## Tool Decision Table

| Task | Tool | Notes |
|------|------|-------|
| Find articles by keyword or MeSH term | `pubmed_search_articles` | Returns PMIDs; follow with `pubmed_fetch_contents` for full data |
| Get full article data, export BibTeX/RIS/MEDLINE | `pubmed_fetch_contents` | Two-step: search first, then fetch |
| Find citing papers, similar articles, references | `pubmed_article_connections` | `relationshipType`: cited-by, similar, references |
| Generate structured PICO/hypothesis search plan | `pubmed_research_agent` | Produces a plan before searching |
| Visualize publication trends | `pubmed_generate_chart` | bar/line/scatter/pie/bubble/radar |

## Two-Step Pattern (Required Workflow)

`pubmed_fetch_contents` requires PMIDs as input — you must search first to get them:
1. `pubmed_search_articles` — retrieves PMIDs (lightweight)
2. `pubmed_fetch_contents` — fetches full content for the PMID list

This is not an optimization — it is the required call sequence. There is no way to fetch content without PMIDs.

## Key Parameters

**`pubmed_search_articles`:**
- MeSH field tags: `diabetes[MeSH Terms] AND insulin[MeSH Terms]`
- Boolean: AND, OR, NOT (uppercase only)
- Date range via `dateRange` object with `start`/`end` in `YYYY/MM/DD`
- Publication type filter: `clinical trial[pt]`, `review[pt]`, `meta-analysis[pt]`

**`pubmed_fetch_contents`:**
- `detailLevel`: `summary`, `abstract`, `full`
- `outputFormat`: `json`, `medline`, `xml`, `bibtex`, `ris`, `apa`, `mla`

**`pubmed_article_connections`:**
- `relationshipType`: `cited-by`, `similar`, `references`
- Note: `cited-by` requires PMC indexing — may return empty for articles without PMC full text

**`pubmed_research_agent`:**
- PICO components: `population`, `intervention`, `comparison`, `outcome`
- `framework`: `"pico"` or `"hypothesis"`

**`pubmed_generate_chart`:**
- `chartType`: `bar`, `line`, `scatter`, `pie`, `bubble`, `radar`
- Input: pass search results or PMID list from `pubmed_search_articles` / `pubmed_fetch_contents`

## Domain Fit

**Strong:** Biomedicine, clinical medicine, pharmacology, toxicology, genomics, molecular biology, biochemistry, public health, epidemiology, dentistry, veterinary medicine.

**Weak:** CS/engineering (use S2/arXiv), physics/math (use arXiv), social sciences/economics (use OpenAlex), preprints not yet MEDLINE-indexed (use arXiv or bioRxiv via OpenAlex).

## Limitations and Quirks

- PubMed indexes only MEDLINE-listed journals — recent/preprint content may be missing
- Citation data via `pubmed_article_connections` uses iCite; coverage varies by article age
- Rate limits: 3 req/s without API key, 10 req/s with `NCBI_API_KEY`
- `NCBI_EMAIL` required — NCBI can **block requests entirely** without a valid email (not just throttle). Always set this env var.
- **Capability trade-off:** Old plugin (v0.8.1) used JackKuo666/PubMed-MCP-Server (up to 34 tools in older versions). cyanheads provides 5 tools. This is an intentional downgrade to a more maintainable server with better output formats. Core PubMed use cases are covered.

## Installation Prerequisite

```bash
npm install -g @cyanheads/pubmed-mcp-server
```

Required before adding `pubmed` to `.mcp.json`. Without it, Claude Code's MCP handshake will timeout at 60 seconds on startup.

**`.mcp.json` server ID:** `pubmed` (maps to namespace prefix `mcp__plugin_jadlis-research_pubmed__`)

## Runtime Side Effect

Creates a `.pubmed-search/` temporary directory in the project root during operation. This directory is in `.gitignore` — do not commit it.

## Error Patterns

- `NCBI_EMAIL not set` → NCBI can block requests entirely; always set this env var
- Rate limit exceeded → Add `NCBI_API_KEY` to raise limit; add delay between calls
- No results → Overly specific MeSH query; broaden with OR or remove field tags
- `cited-by` returns empty → Article not in PMC citation network; use `similar` instead

## Cross-Reference

- **Semantic Scholar** (`jadlis-research:semantic-scholar`): use in parallel for citation metrics and CS/AI overlap
- **OpenAlex** (`jadlis-research:openalex`): secondary source for institution/venue analysis on biomedical topics
- **Crossref** (`jadlis-research:crossref`): format citations after finding PMIDs
- **Unpaywall** (`jadlis-research:unpaywall`): download full text when not available via PMC Open Access
