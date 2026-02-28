# Firecrawl API — Full Parameter Reference

## MCP Tool Namespace

```
mcp__claude_ai_Firecrawl__firecrawl_scrape
mcp__claude_ai_Firecrawl__firecrawl_batch_scrape
mcp__claude_ai_Firecrawl__firecrawl_map
mcp__claude_ai_Firecrawl__firecrawl_crawl
mcp__claude_ai_Firecrawl__firecrawl_search
mcp__claude_ai_Firecrawl__firecrawl_extract
mcp__claude_ai_Firecrawl__firecrawl_check_crawl_status
mcp__claude_ai_Firecrawl__firecrawl_agent
mcp__claude_ai_Firecrawl__firecrawl_agent_status
mcp__claude_ai_Firecrawl__firecrawl_browser_create
mcp__claude_ai_Firecrawl__firecrawl_browser_execute
mcp__claude_ai_Firecrawl__firecrawl_browser_delete
mcp__claude_ai_Firecrawl__firecrawl_browser_list
```

---

## Tool: `firecrawl_scrape`

Single URL extraction. Primary extraction tool.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | **required** | URL to scrape |
| `formats` | string[] | `["markdown"]` | Output formats (see Formats Reference) |
| `onlyMainContent` | bool | `true` | Strip nav, footer, ads |
| `maxAge` | int (ms) | `172800000` | Cache freshness. `0` = always fresh. **Unit: milliseconds** |
| `storeInCache` | bool | `true` | Cache the result for reuse |
| `waitFor` | int (ms) | `0` | Wait before extraction. `2000`–`5000` for JS-heavy pages |
| `timeout` | int (ms) | `30000` | Max request time (max: 300000) |
| `proxy` | enum | none | `basic` / `stealth` / `auto` |
| `actions` | object[] | none | Browser actions (see Browser Actions Reference) |
| `mobile` | bool | `false` | Mobile user-agent emulation |
| `blockAds` | bool | `true` | Block ad scripts |
| `parsePDF` | enum | `auto` | `auto` / `fast` / `ocr` (see PDF Modes) |
| `jsonSchema` | object | none | JSON Schema for structured extraction |
| `headers` | object | none | Custom HTTP headers |
| `includeTags` | string[] | none | HTML tags to include |
| `excludeTags` | string[] | none | HTML tags to strip |
| `removeBase64Images` | bool | `true` | Remove embedded base64 images |
| `skipTlsVerification` | bool | `false` | Skip TLS certificate check |
| `mobile` | bool | `false` | Mobile user-agent emulation |
| `blockAds` | bool | `true` | Block ad scripts |
| `location` | object | none | `{ country: "US", languages: ["en-US"] }` |

```json
{
  "url": "https://example.com/article",
  "formats": ["markdown"],
  "onlyMainContent": true,
  "maxAge": 172800000,
  "storeInCache": true
}
```

---

## Tool: `firecrawl_batch_scrape`

Multiple URLs in one async job.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `urls` | string[] | **required** | URLs to scrape |
| `formats` | string[] | `["markdown"]` | Output formats |
| `onlyMainContent` | bool | `true` | Strip nav/footer |
| `maxAge` | int (ms) | `172800000` | Cache freshness |
| `storeInCache` | bool | `true` | Cache results |
| `waitFor` | int (ms) | `0` | JS wait time |
| `timeout` | int (ms) | `30000` | Max request time per URL |
| `proxy` | enum | none | `basic` / `stealth` / `auto` |
| `actions` | object[] | none | Browser actions applied to each URL |
| `parsePDF` | enum | `auto` | `auto` / `fast` / `ocr` |
| `headers` | object | none | Custom HTTP headers |
| `removeBase64Images` | bool | `true` | Remove embedded base64 images |

**Async:** Returns `{ jobId: string }`. Poll via `firecrawl_check_crawl_status`. Results expire 24h.

```json
{
  "urls": ["https://example.com/a", "https://example.com/b"],
  "formats": ["markdown"],
  "onlyMainContent": true,
  "maxAge": 172800000
}
```

---

## Tool: `firecrawl_map`

Discover URLs on a site. Cheaper than full crawl.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | **required** | Base URL |
| `limit` | int | `5000` | Max URLs (max: 100000). Recommend: 100 |
| `search` | string | none | Filter by keyword (ranked by relevance) |
| `sitemap` | enum | `include` | `skip` / `include` / `only` |
| `ignoreSitemap` | bool | `false` | Ignore XML sitemap |
| `includeSubdomains` | bool | `true` | Include subdomains |

**Cost:** 1 credit per call (not per URL).

```json
{
  "url": "https://docs.example.com",
  "limit": 100,
  "search": "authentication"
}
```

---

## Tool: `firecrawl_crawl`

Full site crawl. Async. Use `firecrawl_map` + selective scrape when possible.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | **required** | Start URL |
| `limit` | int | `10000` | Max pages (plugin cap: 20) |
| `maxDiscoveryDepth` | int | unlimited | Link depth from root (plugin cap: 3) |
| `formats` | string[] | `["markdown"]` | Output formats |
| `onlyMainContent` | bool | `true` | Strip nav/footer |
| `excludePaths` | string[] | none | Regex patterns to exclude |
| `includePaths` | string[] | none | Regex patterns to include |
| `allowBackwardLinks` | bool | `false` | Follow links to parent paths |
| `allowExternalLinks` | bool | `false` | Follow external domain links |
| `deduplicateSimilarURLs` | bool | `true` | Remove near-duplicate URLs |
| `delay` | number (s) | `0` | Delay between requests |
| `maxAge` | int (ms) | none | Cache freshness |
| `webhook` | string/object | none | Webhook URL or `{ url, headers, events }` |

**Webhook events:** `"completed"`, `"page"`, `"failed"`, `"paused"`.

**Async:** Returns `{ jobId: string }`. Poll via `firecrawl_check_crawl_status`.

```json
{
  "url": "https://docs.example.com",
  "limit": 20,
  "maxDiscoveryDepth": 3,
  "deduplicateSimilarURLs": true,
  "excludePaths": ["/blog/.*", "/changelog/.*"]
}
```

---

## Tool: `firecrawl_check_crawl_status`

Poll status of `firecrawl_crawl` or `firecrawl_batch_scrape` jobs.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `id` | string | **required** | Job ID from crawl/batch |

Returns: `{ status: "scraping" | "completed" | "failed", data: [...], next: cursor }`

Poll: 5s → 10s (after 3 attempts) → max 30 attempts (~300s).

---

## Tool: `firecrawl_search`

Web search + content extraction. **Workers should prefer Exa `web_search_exa`.**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | **required** | Search query (supports operators) |
| `limit` | int | `5` | Max results (plugin cap: 10, API max: 100) |
| `formats` | string[] | none | Extract content from results |
| `lang` | string | `en` | Language |
| `country` | string | `us` | ISO country code |
| `timeout` | int (ms) | `60000` | Max request time |
| `tbs` | string | none | Google time filter: `qdr:h/d/w/m/y` |
| `sources` | string[] | `["web"]` | `web`, `news`, `images` |
| `categories` | string[] | `[]` | `github`, `research`, `pdf` |
| `scrapeOptions` | object | none | Scrape params applied to each result |

Search operators: `""` (exact), `-` (exclude), `site:`, `inurl:`, `intitle:`, `related:`

---

## Tool: `firecrawl_extract`

Structured JSON extraction from URLs using LLM.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `urls` | string[] | **required** | URLs (supports wildcards: `https://site.com/*`) |
| `prompt` | string | none | Description of data to extract |
| `schema` | object | none | JSON Schema for structured output |
| `systemPrompt` | string | none | System context for extraction LLM |
| `allowExternalLinks` | bool | `false` | Follow external links |
| `enableWebSearch` | bool | `false` | Expand beyond provided URLs |
| `origin` | string | none | Source attribution |

**Cost:** Variable (LLM-based).

```json
{
  "urls": ["https://company.com/pricing", "https://company.com/*"],
  "prompt": "Extract pricing tiers with features and prices",
  "schema": { "type": "object", "properties": { "tiers": { "type": "array" } } }
}
```

---

## Tool: `firecrawl_agent`

Multi-step agentic browser task. **Last resort — variable cost.**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | string | **required** | Task description |
| `urls` | string[] | none | Starting URLs |
| `schema` | object | none | Expected output schema |
| `model` | enum | `spark-1-mini` | `spark-1-mini` / `spark-1-pro` |
| `maxSteps` | int | none | Max agent steps |
| `enableWebSearch` | bool | `false` | Allow web search |
| `enableExtract` | bool | `false` | Allow structured extraction |
| `allowExternalLinks` | bool | `false` | Follow external links |

**Async:** Returns `{ jobId: string }`. Poll via `firecrawl_agent_status`.

---

## Tool: `firecrawl_agent_status`

Poll status of `firecrawl_agent` jobs.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `id` | string | **required** | Job ID from `firecrawl_agent` |

Returns: `{ status: "running" | "completed" | "failed", output?: string }`

---

## Browser Session Tools

Lifecycle: `browser_create` → `browser_execute` (repeat) → `browser_delete`

### `firecrawl_browser_create`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `ttl` | int (s) | `300` | Session lifetime (max: 3600) |

Returns: `{ sessionId: string }`

### `firecrawl_browser_execute`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sessionId` | string | **required** | Session ID from `browser_create` |
| `code` | string | **required** | Code to execute |
| `language` | enum | `javascript` | `javascript` / `python` |

### `firecrawl_browser_delete`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sessionId` | string | **required** | Session to terminate |

### `firecrawl_browser_list`

No parameters. Returns all active sessions.

---

## Browser Actions Reference

9 action types for `firecrawl_scrape` `actions` parameter:

| Action | Parameters | Description |
|--------|-----------|-------------|
| `wait` | `milliseconds: int` | Wait specified time |
| `click` | `selector: string` | Click CSS selector |
| `write` | `selector: string`, `text: string` | Type into input field |
| `press` | `key: string` | Keyboard key (`"Enter"`, `"Tab"`, `"Escape"`) |
| `scroll` | `selector?: string`, `direction: "up"|"down"`, `amount: int` | Scroll page or element |
| `screenshot` | — | Capture current page screenshot |
| `scrape` | `formats?: string[]` | Scrape at current browser state |
| `executeJavascript` | `script: string` | Run JavaScript on page |
| `pdf` | — | Capture PDF of current page |

```json
{
  "url": "https://app.example.com/dashboard",
  "waitFor": 2000,
  "actions": [
    { "type": "click", "selector": "#load-more" },
    { "type": "wait", "milliseconds": 1500 },
    { "type": "scrape", "formats": ["markdown"] }
  ]
}
```

---

## Output Formats Reference

9 formats for `formats` parameter:

| Format | Value | Notes |
|--------|-------|-------|
| Markdown | `"markdown"` | Default, recommended. Cleaned text |
| HTML | `"html"` | Cleaned HTML |
| Raw HTML | `"rawHtml"` | Unprocessed original HTML |
| Links | `"links"` | Array of URLs on page |
| Images | `"images"` | Array of image URLs |
| Screenshot | `"screenshot"` | PNG as base64 |
| JSON | `"json"` | +4 credits; requires `jsonSchema` |
| Branding | `"branding"` | Logo URL, colors |
| Summary | `"summary"` | AI-generated summary |

---

## PDF Parsing Modes

`parsePDF` parameter on `firecrawl_scrape`:

| Mode | Value | When |
|------|-------|------|
| Auto | `"auto"` | Default — tries fast, falls back to OCR |
| Fast | `"fast"` | PDFs with embedded text (faster, cheaper) |
| OCR | `"ocr"` | Scanned or image-only PDFs |

---

## Crawl Webhook Configuration

`webhook` parameter on `firecrawl_crawl`:

```json
{
  "webhook": {
    "url": "https://your-server.com/hook",
    "headers": { "Authorization": "Bearer token" },
    "events": ["completed", "page", "failed"]
  }
}
```

Events: `"completed"` (full job), `"page"` (each page), `"failed"` (job failure), `"paused"`.

---

## Error Patterns

| Error | Meaning | Action |
|-------|---------|--------|
| HTTP 401/403 | Auth or blocked | Retry with `proxy: "stealth"` → Exa fallback |
| HTTP 404 | Page not found | Skip |
| HTTP 429 | Rate limit | Backoff 5–10s, retry once |
| HTTP 500+ | Server error | Retry once → Exa fallback |
| `"insufficient credits"` | Credits exhausted | Credits Exhausted Protocol (stop all FC calls) |
| `"site-not-supported"` | Unsupported domain | Fast skip → Exa fallback (step 4) |
| Timeout / empty content | JS rendering or slow server | `waitFor` escalation |
| `status: "failed"` in poll | Async job failed | Skip, use Exa fallback |

---

## Credit Costs Table

| Operation | Cost |
|-----------|------|
| `firecrawl_scrape` (no proxy) | 1 credit |
| `firecrawl_scrape` + `proxy: "basic"` | 2 credits |
| `firecrawl_scrape` + `proxy: "stealth"` | 5 credits |
| `firecrawl_scrape` + JSON format | 5 credits |
| `firecrawl_scrape` + stealth + JSON | 9 credits |
| `firecrawl_batch_scrape` | 1–5 credits/URL |
| `firecrawl_map` | 1 credit/call |
| `firecrawl_crawl` | 1 credit/page |
| `firecrawl_search` | ~1 credit/result *(unverified — check Firecrawl dashboard)* |
| `firecrawl_extract` | Variable (LLM-based) |
| `firecrawl_agent` (spark-1-mini) | Variable/step |
| `firecrawl_agent` (spark-1-pro) | Variable/step (higher) |
| `firecrawl_browser_create` | 1 credit |
| `firecrawl_browser_execute` | 1 credit/execution |

Failed requests are **not** charged (except Agent jobs).

Optimization: `maxAge: 172800000` + `storeInCache: true`, `deduplicateSimilarURLs: true`, map+selective scrape cheaper than crawl.

Rate limits (Free plan):

| Endpoint | RPM | Concurrent |
|----------|-----|-----------|
| `/scrape` | 10 | 2 browser sessions |
| `/map` | 10 | — |
| `/crawl` | 1 | 2 browser sessions |
| `/search` | 5 | — |

**Critical:** `/crawl` is limited to 1 RPM on Free plan. Browser sessions: max 2 concurrent.

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `FIRECRAWL_API_KEY` | API authentication key | For non-built-in usage only |

**Note:** Built-in `claude.ai` Firecrawl MCP (`mcp__claude_ai_Firecrawl__*`) handles auth internally. No `.mcp.json` or API key needed in the plugin.
