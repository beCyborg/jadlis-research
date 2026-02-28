# Crossref MCP — Parameter Reference

## MCP Server

```
Plugin namespace:  mcp__plugin_jadlis-research_crossref__resolve_citation
Alternative:       mcp__crossref__resolve_citation

Server ID in .mcp.json: crossref
Install: uvx crossref-cite-mcp
```

Namespace uncertainty: official CC docs show `mcp__<server>__<tool>`, empirical plugin testing shows `mcp__plugin_jadlis-research_<server>__<tool>`. Section 16 verification smoke test confirms at runtime.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CROSSREF_MAILTO` | Recommended | — | Email for Crossref polite pool. Improves reliability and rate limits. Without it, tool still works but uses the lower-rate public pool. Export in `~/.zshrc`. |
| `CROSSREF_CACHE_TTL` | No | `1209600` (14 days) | Cache TTL for resolved citations in seconds. Repeated DOI lookups within TTL are instant — no API call made. |

---

## Tool: `resolve_citation`

Universal citation resolver. Accepts DOI, arXiv ID, PMID, or bibliographic title string. Returns metadata (CSL-JSON) and formatted citations in multiple styles. Single unified interface.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | — | Citation to resolve. Accepts: DOI, arXiv ID (`arXiv:1706.03762`), PMID (`PMID:12345678`), or title string |
| `formats` | list[string] | No | `["csl-json"]` | Output formats. Options: `"csl-json"`, `"bibtex"`, `"ris"`, `"formatted"` |
| `style` | string | No | `"apa"` | Citation style when `"formatted"` in formats. Options: `"apa"`, `"chicago-author-date"`, `"ieee"`, `"nature"`, `"harvard-cite-them-right"` |
| `filter_type` | string | No | `null` | Filter by publication type (useful for title string queries). Options: `"journal-article"`, `"book-chapter"`, `"proceedings-article"` |
| `search_only` | bool | No | `False` | If `True`, returns CSL-JSON metadata only without fetching formatted citations. Faster for metadata-only lookups. |
| `locale` | string | No | `"en-US"` | Locale for formatted citation output. |

### `formats` Options

| Value | Description |
|-------|-------------|
| `"csl-json"` | CSL JSON metadata (structured, machine-readable; for downstream processing) |
| `"bibtex"` | BibTeX entry (for LaTeX bibliography) |
| `"ris"` | RIS format (Zotero, Mendeley, EndNote) |
| `"formatted"` | Human-readable citation in the style specified by `style` |

### `style` Options (when `"formatted"` in formats)

| Value | Description |
|-------|-------------|
| `"apa"` | APA 7th edition (default) |
| `"chicago-author-date"` | Chicago Author-Date |
| `"ieee"` | IEEE citation style |
| `"nature"` | Nature journal style |
| `"harvard-cite-them-right"` | Harvard (Cite Them Right) |

---

## Input Type Examples

```
# DOI — most reliable; always prefer when available
"10.1038/nature12373"
"https://doi.org/10.1038/nature12373"   # URL form also accepted

# arXiv ID — case-insensitive prefix
"arXiv:1706.03762"
"arxiv:2106.15928"

# PMID
"PMID:12345678"

# Title string — fuzzy Crossref search; less precise
"Attention Is All You Need"
```

**Recommendation:** Use DOI when available. Title strings may return `ambiguous` status if multiple papers have similar titles.

---

## Response Schema

```json
{
  "status": "ok | not_found | ambiguous | error",
  "query": "<original input>",
  "csl_json": { "title": "...", "DOI": "...", "author": [...], "issued": {...}, ... },
  "bibtex": "@article{...}",
  "ris": "TY  - JOUR\n...",
  "formatted": "Smith, J. (2023). Title. Journal, 10(2), 1–15.",
  "message": "..."
}
```

### `status` Values

| Value | Meaning |
|-------|---------|
| `ok` | Citation resolved successfully |
| `not_found` | No matching record found in Crossref database |
| `ambiguous` | Title query matched multiple works; retry with DOI for precision |
| `error` | API error or malformed query |

Fields in response depend on which `formats` were requested. `message` appears on `error` and `ambiguous` status.

---

## Example Tool Calls

```json
// Get BibTeX for a DOI
{
  "query": "10.1145/3528233.3530733",
  "formats": ["bibtex"]
}

// Get APA citation for arXiv paper
{
  "query": "arXiv:1706.03762",
  "formats": ["formatted"],
  "style": "apa"
}

// Metadata only — fast, no formatted citation fetch
{
  "query": "10.1038/nature12373",
  "formats": ["csl-json"],
  "search_only": true
}

// Multiple formats + Chicago style
{
  "query": "10.1126/science.1171700",
  "formats": ["csl-json", "bibtex", "formatted"],
  "style": "chicago-author-date"
}

// PMID with IEEE format
{
  "query": "PMID:35637212",
  "formats": ["formatted"],
  "style": "ieee"
}

// Title with type filter to reduce ambiguity
{
  "query": "Attention Is All You Need",
  "formats": ["csl-json", "bibtex"],
  "filter_type": "proceedings-article"
}
```

---

## Usage Notes

**Cache behavior:** The server caches resolved citations for 14 days by default. Repeated lookups for the same DOI within the TTL return instantly. This makes iterative bibliography building efficient.

**`search_only` performance tip:** Most use cases need DOI metadata, not formatted output. Use `search_only=True` with `formats=["csl-json"]` for fastest response. Only add `"formatted"` to `formats` when you need the human-readable citation. Note: `search_only=True` suppresses the formatted citation fetch regardless of `formats`; combine with `formats=["csl-json"]` for clarity.

**`ambiguous` handling in pipelines:**
1. Add `filter_type` to narrow the result
2. Take first candidate's DOI from `csl_json` and retry with it
3. In interactive mode, surface candidates to the user for selection

**Rate limits:** Without `CROSSREF_MAILTO`, Crossref may throttle anonymous requests. Always set it in `~/.zshrc`.
