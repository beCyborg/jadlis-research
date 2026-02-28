# PubMed MCP — Parameter Reference

## MCP Server

**Package:** `cyanheads/pubmed-mcp-server`
**Install:** `npm install -g @cyanheads/pubmed-mcp-server` (global pre-install required)
**Tool count:** 5 tools

## MCP Namespace

```
Empirically-observed: mcp__plugin_jadlis-research_pubmed__<tool>
Documented format:    mcp__pubmed__<tool>
```

Server ID in `.mcp.json`: `pubmed`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NCBI_EMAIL` | **Yes** | Email for NCBI EUtils polite pool. NCBI can block requests entirely without it (not just throttle). Rate limit: 3 req/s without key. |
| `NCBI_API_KEY` | No | Raises rate limit from 3 to 10 req/s. |

Export both in `~/.zshrc` before starting Claude Code.

---

## Tools

### `pubmed_search_articles`

Search PubMed for articles. Returns PMIDs only — lightweight first step. Follow with `pubmed_fetch_contents` for full data.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | — | PubMed search query. Supports MeSH field tags, Boolean AND/OR/NOT (uppercase), field tags like `[Title]`, `[Author]` |
| `maxResults` | integer | No | 20 | Max PMIDs to return (range 1–10,000) |
| `dateRange` | object | No | — | `{ "start": "YYYY/MM/DD", "end": "YYYY/MM/DD" }` |
| `publicationType` | string | No | — | Filter: `"Clinical Trial"`, `"Review"`, `"Meta-Analysis"`, `"Randomized Controlled Trial"`, `"Systematic Review"`, `"Case Reports"`, `"Journal Article"` |
| `sortBy` | string | No | `"relevance"` | Options: `"relevance"`, `"date"`, `"journal"`, `"author"`, `"title"` |

Example:
```json
{
  "query": "metformin type 2 diabetes [MeSH Terms] AND clinical trial",
  "maxResults": 50,
  "dateRange": { "start": "2020/01/01", "end": "2024/12/31" },
  "publicationType": "Randomized Controlled Trial",
  "sortBy": "date"
}
```

Returns: Array of PMID strings, e.g. `["37123456", "36987654"]`

---

### `pubmed_fetch_contents`

Fetch full article data for one or more PMIDs. Use as second step — `pubmed_fetch_contents` requires PMIDs as input, which must come from `pubmed_search_articles` first.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `pmids` | list[string] | Yes | — | PMIDs to fetch. Keep batches ≤ 200 for reliability |
| `detailLevel` | string | No | `"summary"` | Amount of data to return (see below) |
| `outputFormat` | string | No | `"json"` | Output format (see below) |

**`detailLevel` options:**
- `"summary"` — title, authors, journal, publication date, PMID, DOI if available
- `"abstract"` — all summary fields plus abstract text
- `"full"` — all fields: MeSH terms, grant numbers, author affiliations, keywords, conflict of interest, data availability

**`outputFormat` options:**
- `"json"` — structured JSON (easiest for downstream processing)
- `"medline"` — MEDLINE flat file (for reference managers)
- `"xml"` — PubMed XML (most complete, all NCBI fields)
- `"bibtex"` — BibTeX entries (for LaTeX bibliography)
- `"ris"` — RIS format (Zotero, Mendeley, EndNote)
- `"apa"` — APA 7th edition formatted citations
- `"mla"` — MLA 9th edition formatted citations

Example:
```json
{
  "pmids": ["37123456", "36987654"],
  "detailLevel": "abstract",
  "outputFormat": "bibtex"
}
```

Returns: String in requested format, or JSON array if `outputFormat` is `"json"`.

---

### `pubmed_article_connections`

Retrieve citation relationships for a single article.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `pmid` | string | Yes | — | PMID of target article |
| `relationshipType` | string | Yes | — | Type of relationship (see below) |
| `maxResults` | integer | No | 20 | Max related PMIDs to return |

**`relationshipType` options:**
- `"cited-by"` — articles that cite the target. **Note:** Requires PMC full-text indexing; articles without PMC coverage may return empty array.
- `"references"` — articles cited by the target
- `"similar"` — algorithmically similar articles (NCBI related-articles algorithm using MeSH + text similarity)

Example:
```json
{
  "pmid": "37123456",
  "relationshipType": "cited-by",
  "maxResults": 30
}
```

Returns: Array of PMID strings.

---

### `pubmed_research_agent`

Generate a structured research plan using PICO framework or hypothesis-based approach. **Does NOT search PubMed** — returns a search strategy only (recommended MeSH terms, filters, query strings). Execute the plan separately with `pubmed_search_articles`.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `question` | string | Yes | — | Research question or hypothesis |
| `framework` | string | No | `"pico"` | `"pico"` or `"hypothesis"` |
| `population` | string | No | — | PICO: patient population or problem |
| `intervention` | string | No | — | PICO: intervention or exposure |
| `comparison` | string | No | — | PICO: comparison or control |
| `outcome` | string | No | — | PICO: outcome being measured |
| `studyTypes` | list[string] | No | — | Preferred study designs: `"RCT"`, `"systematic_review"`, `"meta_analysis"`, `"cohort"`, `"case_control"`, `"cross_sectional"` |

Example:
```json
{
  "question": "Does metformin reduce cardiovascular mortality in type 2 diabetics?",
  "framework": "pico",
  "population": "adults with type 2 diabetes",
  "intervention": "metformin",
  "comparison": "other antidiabetic agents or placebo",
  "outcome": "cardiovascular mortality",
  "studyTypes": ["RCT", "meta_analysis"]
}
```

Returns: Structured object with recommended PubMed queries, MeSH terms, suggested filters, and search strategy explanation.

---

### `pubmed_generate_chart`

Generate a data visualization from PubMed search results. Returns chart data (not a rendered image).

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | — | PubMed query to gather data |
| `chartType` | string | Yes | — | Type of chart (see below) |
| `groupBy` | string | No | `"year"` | How to group: `"year"`, `"journal"`, `"author"`, `"mesh_term"`, `"publication_type"` |
| `dateRange` | object | No | — | `{ "start": "YYYY/MM/DD", "end": "YYYY/MM/DD" }` |
| `maxResults` | integer | No | 500 | Articles to analyze |
| `title` | string | No | — | Chart title |

**`chartType` options:**
- `"bar"` — categorical comparisons (publications per journal)
- `"line"` — trends over time
- `"scatter"` — correlation analysis
- `"pie"` — proportional breakdowns (publication type distribution)
- `"bubble"` — three-variable comparison
- `"radar"` — multi-axis comparisons

Example:
```json
{
  "query": "CRISPR gene editing",
  "chartType": "line",
  "groupBy": "year",
  "dateRange": { "start": "2012/01/01", "end": "2024/12/31" },
  "title": "CRISPR publications per year (2012-2024)"
}
```

Returns: Chart data object with labels and values for rendering.

---

## Common Patterns

### Two-Step Search (Required — Not Optional)

```
Step 1: pubmed_search_articles(query, maxResults=50) → [pmid1...pmid50]
Step 2: pubmed_fetch_contents(pmids=[pmid1..pmid10], detailLevel="abstract", outputFormat="json")
```

Fetch `detailLevel="full"` only for the papers you intend to use, not for the full result set.

### Citation Network Traversal

```
pubmed_search_articles(query) → pmids
pubmed_article_connections(pmid=pmids[0], relationshipType="references") → cited_pmids
pubmed_fetch_contents(pmids=cited_pmids[:5], detailLevel="abstract")
```

### MeSH Query Syntax

Boolean operators: uppercase `AND`, `OR`, `NOT`

Field tags:
- `[MeSH Terms]` — controlled vocabulary (most precise)
- `[Title/Abstract]` — title and abstract text
- `[Author]` — author name
- `[Journal]` — journal name
- `[PDAT]` — publication date

Example: `"diabetes mellitus, type 2"[MeSH Terms] AND metformin[Title/Abstract] AND "2020"[PDAT]`
