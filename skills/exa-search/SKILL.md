---
name: exa-search
description: "Exa API optimization: search types, categories, domain filters, content extraction, people/company research, code context. Covers all 8 MCP tools."
user-invocable: false
allowed-tools: mcp__claude_ai_Exa__web_search_exa, mcp__claude_ai_Exa__web_search_advanced_exa, mcp__claude_ai_Exa__crawling_exa, mcp__claude_ai_Exa__company_research_exa, mcp__claude_ai_Exa__people_search_exa, mcp__claude_ai_Exa__get_code_context_exa, mcp__claude_ai_Exa__deep_researcher_start, mcp__claude_ai_Exa__deep_researcher_check
---

# Exa Search Protocols

## Tool Selection Matrix

| Task | Tool |
|------|------|
| General web search | `web_search_exa` |
| Search with filters (date, domain, category) | `web_search_advanced_exa` |
| Fetch content from known URL | `crawling_exa` |
| Company research | `company_research_exa` |
| People research | `people_search_exa` |
| Code search / context | `get_code_context_exa` |
| Start deep async research | `deep_researcher_start` |
| Poll deep research result | `deep_researcher_check` |

`web_search_exa` is the default; escalate to `web_search_advanced_exa` when filters are needed.

**REST-only tools (NOT callable through MCP):** `find_similar_exa`, `answer_exa` — documented in `references/exa-parameters.md`.

## Search Types

| Type | When | Latency (P50) | Cost/1K |
|------|------|---------------|---------|
| `auto` | Default, balanced | ~1,000ms | $5 |
| `fast` | Quick lookup, known answers | <350ms | $5 |
| `deep` | Complex/multi-hop research | 3,500–5,000ms | $15 |

**`deep` search:** Agentic mode — expands query, runs parallel variations, iterative search. 96% on FRAMES benchmark. Use `additionalQueries` for directed variations.

**REST-only search types** (NOT available via MCP — for awareness):
- `instant` — sub-200ms, REST only
- `deep-reasoning` / `deep-max` — extended reasoning, REST only
- `neural` — legacy embeddings; available ONLY via `web_search_advanced_exa`. Use when relevance `score` values are needed (`auto` does not return scores).

## Categories and Restrictions

| Category | Prohibited Parameters | Failure Mode |
|----------|----------------------|--------------|
| `tweet` | domain filters, text filters, `moderation` | **500 server crash** (not recoverable) |
| `company` | date filters, text filters, `excludeDomains` | API error (recoverable) |
| `people` | date filters, text filters, `excludeDomains`; `includeDomains` → LinkedIn only | API error (recoverable) |
| `research paper` | — | — |
| `news` | — | — |
| `personal site` | — | — |
| `pdf` | — | — |
| `financial report` | — | — |

**`github` is NOT a valid category.** Use `includeDomains: ["github.com"]`.

Common patterns:

| Platform | Filter |
|----------|--------|
| Reddit | `includeDomains: ["reddit.com"]` |
| Hacker News | `includeDomains: ["news.ycombinator.com"]` |
| Substack | `includeDomains: ["substack.com"]` |
| GitHub | `includeDomains: ["github.com"]` |
| Stack Overflow | `includeDomains: ["stackoverflow.com"]` |
| ArXiv | `category: "research paper"` + `includeDomains: ["arxiv.org"]` |
| Twitter | `category: "tweet"` — zero other filters |

## Content Extraction Strategy

| Mode | When | Token cost |
|------|------|-----------|
| `highlights` | Default | ~10x fewer tokens |
| `text` | Full content needed | High |
| `summary` | Quick overview | Low |

`maxAgeHours` strategy:
- `24` — news/recent content
- `-1` — static/evergreen content
- `0` — always live-crawl (real-time)

**Cross-reference warning:** Exa uses `maxAgeHours` (hours). Firecrawl uses `maxAge` (milliseconds). Do NOT confuse.

## Key Parameters

| Parameter | When | Value |
|-----------|------|-------|
| `maxAgeHours` | Real-time queries | `24` (content not older than 24h). `0` = always livecrawl |
| `userLocation` | Regional/local research | ISO country code, e.g. `"PL"` |
| `additionalQueries` | Deep search variations | Array of strings (only with `type: "deep"`) |
| `subpages` + `subpageTarget` | Company research (pricing, features) | `subpages: 3`, `subpageTarget: ["pricing", "about"]` |

## Budget and Rate Limits

- `numResults ≤ 25` — above 25 costs 5× per result ($5 → $25/1K)
- Default: 10 results
- Rate limits: `/search` ~10 QPS, `/contents` ~100 QPS (tier-dependent)
- On rate limit: backoff 2–3 seconds

## Async Polling Protocol

For `deep_researcher_start` + `deep_researcher_check`:

1. Call `deep_researcher_start` → get `requestId`
2. Poll `deep_researcher_check` with `requestId`
   - Poll interval: 5s initially, 10s after 3 attempts
   - Max attempts: 30 (~300s total)
3. P90 latency: exa-research ~90s, exa-research-pro ~180s
4. On timeout: skip, note gap in scratchpad

## Fallback Role

Exa as Firecrawl fallback (step 4 in Firecrawl fallback chain):
- When Firecrawl fails, use `crawling_exa` with `contents: { text: true }` for URL-level extraction
- Provides content even when Firecrawl is blocked or credits exhausted

## References

Full parameter reference: `references/exa-parameters.md`
