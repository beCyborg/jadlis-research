# Exa API — Full Parameter Reference

## MCP Tool Namespace

```
mcp__claude_ai_Exa__web_search_exa
mcp__claude_ai_Exa__web_search_advanced_exa
mcp__claude_ai_Exa__crawling_exa
mcp__claude_ai_Exa__company_research_exa
mcp__claude_ai_Exa__people_search_exa
mcp__claude_ai_Exa__get_code_context_exa
mcp__claude_ai_Exa__deep_researcher_start
mcp__claude_ai_Exa__deep_researcher_check
```

`find_similar_exa` and `answer_exa` are NOT MCP tools — REST-only (see section 3).

---

## MCP Tools — Full Parameter Reference

### Tool 1: `web_search_exa`

General-purpose semantic search.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | **required** | Search query |
| `numResults` | int | 10 | Number of results. **>25 = 5× price** |
| `type` | enum | `auto` | `auto` / `fast` / `deep` |
| `livecrawl` | enum | `auto` | `never` / `fallback` / `always` / `auto` (deprecated; use `maxAgeHours`) |
| `maxAgeHours` | int | none | Content freshness: `-1`=no limit, `0`=always livecrawl, `24`=last day |
| `category` | string | none | See categories table |
| `includeDomains` | string[] | none | Restrict to domains (max 1,200) |
| `excludeDomains` | string[] | none | Exclude domains (max 1,200) |
| `startCrawlDate` | ISO 8601 | none | Filter by crawl date (start) |
| `endCrawlDate` | ISO 8601 | none | Filter by crawl date (end) |
| `contextMaxCharacters` | int | none | Limit total context chars |
| `contents` | object | none | Content extraction options (see Content Options) |
| `userLocation` | string | none | ISO country code, e.g. `"PL"` |

Unavailable types: `instant`, `deep-reasoning`, `deep-max`, `neural` (use `web_search_advanced_exa` for `neural`).

**Date filtering:** `startCrawlDate`/`endCrawlDate` filter by when the page was crawled. For filtering by **publish date**, use `web_search_advanced_exa` (`startPublishedDate`/`endPublishedDate`).

```json
{
  "query": "Claude Code plugin development",
  "numResults": 10,
  "type": "auto",
  "maxAgeHours": 168,
  "contents": { "highlights": { "maxCharacters": 500 } }
}
```

---

### Tool 2: `web_search_advanced_exa`

Full parameter set including date filters, text filters, and `neural` type.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | **required** | Search query |
| `numResults` | int | 10 | Number of results. **>25 = 5× price** |
| `type` | enum | `auto` | `auto` / `fast` / `deep` / `neural` |
| `maxAgeHours` | int | none | Content freshness |
| `category` | string | none | See categories table |
| `includeDomains` | string[] | none | Restrict to domains |
| `excludeDomains` | string[] | none | Exclude domains |
| `startPublishedDate` | ISO 8601 | none | Filter by publish date (start) |
| `endPublishedDate` | ISO 8601 | none | Filter by publish date (end) |
| `startCrawlDate` | ISO 8601 | none | Filter by crawl date (start) |
| `endCrawlDate` | ISO 8601 | none | Filter by crawl date (end) |
| `includeText` | string | none | Results must contain this text |
| `excludeText` | string | none | Results must NOT contain this text |
| `moderation` | bool | none | Enable content moderation filter |
| `useAutoprompt` | bool | false | AI query enhancement |
| `additionalQueries` | string[] | none | Query variations (only with `type: "deep"`) |
| `subpages` | int | none | Crawl N subpages per result (1–10) |
| `subpageTarget` | string[] | none | Subpage types, e.g. `["pricing", "about"]` |
| `linksPerResult` | int | none | Number of links to include |
| `userLocation` | string | none | ISO country code |
| `contents` | object | none | Content extraction options |
| `highlights` | object | none | Shorthand for `contents.highlights` |
| `summary` | object | none | Shorthand for `contents.summary` |
| `text` | object | none | Shorthand for `contents.text` |
| `numSentences` | int | none | (deprecated) Use `highlights.maxCharacters` |
| `highlightsPerUrl` | int | none | (deprecated) Use `highlights.maxCharacters` |

**⚠️ `tweet` + `moderation` = 500 server crash.** See categories table.

```json
{
  "query": "machine learning production 2025",
  "type": "deep",
  "startPublishedDate": "2025-01-01T00:00:00Z",
  "numResults": 15,
  "additionalQueries": ["ML deployment challenges", "MLOps best practices 2025"],
  "contents": { "highlights": { "maxCharacters": 800 } }
}
```

---

### Tool 3: `crawling_exa`

Fetch content from a known URL. Primary Firecrawl fallback.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | **required** | URL to crawl |
| `maxCharacters` | int | none | Max content characters |
| `livecrawl` | enum | `always` | `never` / `fallback` / `always` / `auto` |
| `contents` | object | none | Content extraction options |

```json
{
  "url": "https://example.com/article",
  "livecrawl": "always",
  "contents": { "text": { "maxCharacters": 10000 } }
}
```

---

### Tool 4: `company_research_exa`

Specialized company research with 1B+ company database.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `companyName` | string | **required** | Company name |
| `numResults` | int | 10 | Number of results |
| `contents` | object | none | Content extraction options |

**Forbidden:** date filters, `includeText`/`excludeText`, `excludeDomains`, `includeDomains`. Causes API errors. (Unlike `people_search_exa`, no domain filter is accepted.)

```json
{
  "companyName": "Anthropic",
  "numResults": 5,
  "contents": { "subpages": 3, "subpageTarget": ["pricing", "about", "careers"] }
}
```

---

### Tool 5: `people_search_exa`

People profile search (1B+ records, LinkedIn-indexed).

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | **required** | Person description or name |
| `numResults` | int | 10 | Number of results |
| `includeDomains` | string[] | none | **LinkedIn only:** `["linkedin.com"]` |
| `contents` | object | none | Content extraction options |

**Forbidden:** date filters, `includeText`/`excludeText`, `excludeDomains`. Causes API errors.

```json
{
  "query": "AI researcher NLP transformer models",
  "numResults": 5,
  "includeDomains": ["linkedin.com"]
}
```

---

### Tool 6: `get_code_context_exa`

Code-optimized search with token-level control.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | **required** | Code search query |
| `tokensNum` | int | none | Target token count for context |
| `numResults` | int | 10 | Number of results |
| `contents` | object | none | Content extraction options |

```json
{
  "query": "Claude Code plugin hook implementation Python",
  "tokensNum": 8000,
  "numResults": 5
}
```

---

### Tool 7: `deep_researcher_start`

Start async deep research job (agentic multi-step).

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | **required** | Research question |
| `researchType` | enum | `exa-research` | `"exa-research"` (P90: ~90s) or `"exa-research-pro"` (P90: ~180s). Optional — defaults to `exa-research` if omitted. |

Returns: `{ jobId: string }`

```json
{
  "query": "current state of quantum computing error correction 2025",
  "researchType": "exa-research"
}
```

---

### Tool 8: `deep_researcher_check`

Poll deep research job status.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `jobId` | string | **required** | Job ID from `deep_researcher_start` |

Returns: `{ status: "pending" | "complete" | "error", result?: string }`

Polling protocol: 5s → 10s (after 3 attempts) → max 30 attempts (~300s total). On timeout: skip.

```json
{ "jobId": "abc123xyz" }
```

---

## REST-Only Endpoints

Not available via MCP. Documented for completeness.

| Endpoint | Description | Key Parameters |
|----------|-------------|----------------|
| `/findSimilar` | Pages similar to a URL | `url`, `numResults`, `excludeSourceDomain`, `contents` |
| `/answer` | Direct answer with citations | `query`, `contents` |
| `/research/v1` | REST equivalent of `deep_researcher_start` | `query`, `researchType` |
| `/context` | Condensed LLM-ready content | `query`, `maxCharacters` |
| `/contents` | Fetch content for known URLs | `ids: string[]`, `contents` |
| `/search` | Base search (supports `instant`/`deep-reasoning`/`deep-max`) | `query`, `type`, ... |

`instant`: sub-200ms. `deep-reasoning` / `deep-max`: extended reasoning. All REST-only.

---

## Category Restrictions Table

| Category | Description | Forbidden Parameters | Failure Mode |
|----------|-------------|---------------------|--------------|
| `general` | Default (no category) | None | — |
| `news` | News articles | None | — |
| `research paper` | Academic papers | None | — |
| `pdf` | PDF documents | None | — |
| `personal site` | Personal blogs | None | — |
| `financial report` | SEC filings | None | — |
| `github` | NOT VALID | — | No results |
| `company` | Company info | date filters, text filters, `excludeDomains` | API error (recoverable) |
| `people` | People profiles | date filters, text filters, `excludeDomains`; `includeDomains` → LinkedIn only | API error (recoverable) |
| `tweet` | Twitter/X | domain filters, text filters, **`moderation`** | **500 Server Error (crash)** |

**`github` is NOT a valid category.** Use `includeDomains: ["github.com"]`.

---

## Content Options Reference

The `contents` object controls what is returned per result.

### `text`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maxCharacters` | int | none | Truncate at N characters |
| `includeHtmlTags` | bool | false | Include HTML markup |

### `highlights`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | string | none | Highlight query (defaults to search query) |
| `maxCharacters` | int | 500 | Max chars per highlight |
| `numHighlights` | int | 3 | Number of highlights per result |

~10× fewer tokens than `text`. Use by default.

### `summary`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | string | none | Summary focus query |
| `schema` | object | none | JSON schema for structured summary |

### `maxAgeHours` (freshness)

| Value | Behavior |
|-------|----------|
| Not set | Use cache, fallback to livecrawl |
| `0` | Always livecrawl (real-time) |
| `24` | Cache if < 24h old, else livecrawl |
| `168` | Cache if < 7 days old |
| `720` | Cache if < 30 days old |
| `-1` | Never livecrawl (cache only) |

**⚠️ `maxAgeHours` is a TOP-LEVEL parameter**, not a sub-field of `contents`. Pass it at the root level:
```json
{ "query": "...", "maxAgeHours": 24, "contents": { "highlights": {} } }
```

**⚠️ WARNING:** Exa `maxAgeHours` = **hours**. Firecrawl `maxAge` = **milliseconds**. Do NOT confuse.

---

## Error Status Tags

| Tag | Meaning | Action |
|-----|---------|--------|
| `CRAWL_NOT_FOUND` | 404 — page does not exist | Skip, no retry |
| `CRAWL_TIMEOUT` | Request timed out | Retry once, then skip |
| `CRAWL_FAILED` | Generic crawl failure | Try `livecrawl: "always"`, then skip |
| `CRAWL_BLOCKED` | Blocked by site | Skip, use Firecrawl or web search |
| `CRAWL_NO_CONTENT` | Empty content returned | Skip or try different content options |

---

## Pricing Table

| Operation | Price |
|-----------|-------|
| Search (`auto`/`fast`) | $5 / 1K queries |
| Search (`deep`) | $15 / 1K queries |
| Contents | $1 / 1K requests |
| Answer | $5 / 1K queries |
| Research | $5 / 1K queries |
| `numResults > 25` | 5× price multiplier |

Rate limits (tier-dependent): `/search` ~10 QPS, `/contents` ~100 QPS. On rate limit: backoff 2–3 seconds.

---

## Domain Filters for Common Platforms

| Platform | Filter |
|----------|--------|
| Reddit | `includeDomains: ["reddit.com"]` |
| Hacker News | `includeDomains: ["news.ycombinator.com"]` |
| Substack | `includeDomains: ["substack.com"]` |
| GitHub | `includeDomains: ["github.com"]` |
| Stack Overflow | `includeDomains: ["stackoverflow.com"]` |
| ArXiv | `includeDomains: ["arxiv.org"]` |
| Twitter/X | `category: "tweet"` (no domain filter needed) |

Max 1,200 domains per filter. Supports subdomains (`*.example.com`) and paths (`github.com/org`).
