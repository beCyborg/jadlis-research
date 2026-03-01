---
name: firecrawl-extraction
description: "Firecrawl content extraction: scraping, crawling, structured extraction, browser automation. Covers all 12+ MCP tools."
user-invocable: false
allowed-tools: mcp__claude_ai_Firecrawl__firecrawl_scrape, mcp__claude_ai_Firecrawl__firecrawl_batch_scrape, mcp__claude_ai_Firecrawl__firecrawl_map, mcp__claude_ai_Firecrawl__firecrawl_crawl, mcp__claude_ai_Firecrawl__firecrawl_check_crawl_status, mcp__claude_ai_Firecrawl__firecrawl_extract, mcp__claude_ai_Firecrawl__firecrawl_agent, mcp__claude_ai_Firecrawl__firecrawl_agent_status, mcp__claude_ai_Firecrawl__firecrawl_browser_create, mcp__claude_ai_Firecrawl__firecrawl_browser_execute, mcp__claude_ai_Firecrawl__firecrawl_browser_delete, mcp__claude_ai_Firecrawl__firecrawl_browser_list
---

# Firecrawl Extraction Protocols

Firecrawl is the **primary** tool for deep page content extraction. WebFetch is not used (80%+ failure rate).

## Tool Decision Tree

| Task | Tool | Async? | Notes |
|------|------|--------|-------|
| Single known URL → content | `firecrawl_scrape` | No | Primary extraction tool |
| Multiple known URLs | `firecrawl_batch_scrape` | **Yes** | Poll via `check_crawl_status` |
| Search for URLs | `firecrawl_search` | No | **Use Exa instead** (not in allowed-tools) |
| All URLs on a site | `firecrawl_map` | No | Cheaper than full crawl |
| Full site content | `firecrawl_crawl` | **Yes** | Poll via `check_crawl_status` |
| Structured JSON from URLs | `firecrawl_extract` | No | Supports URL wildcards |
| Complex multi-page task | `firecrawl_agent` | **Yes** | **Last resort** — variable cost |
| Check async job | `check_crawl_status` / `agent_status` | — | For crawl/batch/agent |
| Browser automation | `browser_create` → `browser_execute` → `browser_delete` | No | Session lifecycle |

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
4. Auth required → browser session (`firecrawl_browser_*`)

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

1. Start job → get `jobId`
2. Poll: `firecrawl_check_crawl_status` (crawl/batch) or `firecrawl_agent_status` (agent)
   - Poll interval: 5s initially, 10s after 3 attempts
   - Max attempts: 30 (~300s)
3. Results expire 24h after completion
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
