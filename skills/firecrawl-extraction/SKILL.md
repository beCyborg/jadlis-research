---
name: firecrawl-extraction
description: "Firecrawl content extraction: scraping, crawling, browser automation. Covers 6 plugin MCP tools."
user-invocable: false
allowed-tools: mcp__plugin_jadlis-research_firecrawl__firecrawl_scrape, mcp__plugin_jadlis-research_firecrawl__firecrawl_batch_scrape, mcp__plugin_jadlis-research_firecrawl__firecrawl_map, mcp__plugin_jadlis-research_firecrawl__firecrawl_crawl, mcp__plugin_jadlis-research_firecrawl__firecrawl_agent, mcp__plugin_jadlis-research_firecrawl__firecrawl_browser
---

# Firecrawl Extraction Protocols

Firecrawl is the **primary** tool for deep page content extraction. WebFetch is not used (80%+ failure rate).

## Tool Decision Tree

| Task | Tool | Async? | Notes |
|------|------|--------|-------|
| Single known URL → content | `firecrawl_scrape` | No | Primary extraction tool |
| Multiple known URLs | `firecrawl_batch_scrape` | **Yes** | Async — check response for status |
| Search for URLs | `firecrawl_search` | No | **Use Exa instead** (not in allowed-tools) |
| All URLs on a site | `firecrawl_map` | No | Cheaper than full crawl |
| Full site content | `firecrawl_crawl` | **Yes** | Async — check response for status |
| Complex multi-page task | `firecrawl_agent` | **Yes** | **Last resort** — variable cost |
| Browser automation | `firecrawl_browser` | No | Single consolidated tool |

## Default Parameters

Every `firecrawl_scrape` MUST include:

```json
{
  "formats": ["markdown"],
  "onlyMainContent": true,
  "maxAge": 172800000,
  "storeInCache": true
}
```

- `formats: ["markdown"]` — default; add `"links"` if URL discovery needed
- `onlyMainContent: true` — strips nav, footer, ads
- `maxAge: 172800000` — 48h cache in **milliseconds** (500% speedup from cache)
- `storeInCache: true` — enables cache hits

## Proxy Strategy

| Proxy | When | Credit Cost |
|-------|------|-------------|
| None (default) | Most public sites | base (1) |
| `basic` | Simple sites, speed priority | base (1) |
| `stealth` | Anti-bot, Cloudflare, WAF | +4 credits (5 total) |
| `auto` | Unknown protection level | base → stealth (adaptive) |

Decision: default → no proxy. If 401/403 or empty → retry with `stealth`.

**MCP schema uses `"stealth"` (not `"enhanced"`).**

## JS-Rendered Pages (waitFor Escalation)

1. Standard `firecrawl_scrape` (no `waitFor`)
2. Empty result → retry with `waitFor: 2000`
3. Still empty → `waitFor: 5000` + `actions` if needed (see `references/firecrawl-parameters.md` for action types)
4. Auth required → browser session (`firecrawl_browser`)

## Blocked Domains

Skip extraction immediately. Record `[SKIPPED: blocked domain — {domain}]`.

| Domain | Reason |
|--------|--------|
| `pinterest.com` | Login walls |
| `quora.com` | Login walls |
| `medium.com` | Paywall |
| `linkedin.com` | Login walls |
| `instagram.com` | Hard-blocked by Firecrawl policy |
| `maps.google.com` | Not supported (dynamic JS, anti-bot) |
| `tiktok.com` | Hard-blocked by Firecrawl policy |

## Fallback Chain

1. `firecrawl_scrape` — standard with defaults
2. `firecrawl_scrape` + `waitFor: 2000` — JS rendering
3. `firecrawl_scrape` + `proxy: "stealth"` — anti-bot (+4 credits)
4. Exa `crawling_exa` with URL — `contents: { text: true }` — Exa fallback
5. Skip — `[EXTRACTION FAILED: {url}]`

Each step tried once. No loops. **Do NOT use WebFetch as fallback.**

## Credit Optimization

- Always `maxAge: 172800000` + `storeInCache: true`
- Avoid `"json"` format unless needed (+4 credits)
- Avoid `stealth` unless needed (+4 credits)
- `firecrawl_map` + selective `firecrawl_scrape` cheaper than `firecrawl_crawl`
- `deduplicateSimilarURLs: true` for crawls
- `firecrawl_agent` = **last resort** (variable cost)

## Async Polling Protocol

For `firecrawl_crawl`, `firecrawl_batch_scrape`, `firecrawl_agent`:

1. Start job → check response for job status/ID
2. Local MCP server may handle polling internally — no separate `check_crawl_status` or `agent_status` tools
3. If response includes a job ID without results, wait and check status via the server's response format
   - Wait interval: 5s initially, 10s after 3 attempts
   - Max attempts: 30 (~300s)
4. On timeout: skip, record `[TIMEOUT: async job {id}]`

## Error Patterns

| Error | Meaning | Action |
|-------|---------|--------|
| HTTP 401/403 | Auth/blocked | Retry with `stealth` |
| HTTP 429 | Rate limit | Backoff 5–10s, retry |
| `"insufficient credits"` | Credits exhausted | → Credits Exhausted Protocol |
| `"site-not-supported"` | Domain not supported | Fast skip → Exa fallback (step 4) |
| Timeout/empty | JS or slow server | Escalate `waitFor` |

## Credits Exhausted Protocol

When `"insufficient credits"` returned:
1. Stop ALL Firecrawl calls for this session
2. Switch remaining extractions to Exa `crawling_exa` with `contents: { text: true }`
3. Record: `[FIRECRAWL CREDITS EXHAUSTED — switched to Exa fallback]`
4. Do NOT retry Firecrawl

## Cross-Reference Warning

**CRITICAL — units differ:**
- **Firecrawl** `maxAge`: **milliseconds** → `172800000` = 48h
- **Exa** `maxAgeHours`: **hours** → `48` = 48h

Do NOT confuse. Passing hours to Firecrawl `maxAge` will result in ~48ms cache (near-zero).

## References

Full parameter reference: `references/firecrawl-parameters.md`
