---
name: twitter
description: >
  X/Twitter research via Grok-MCP (xAI official API). Agentic x_search with
  handle filtering, date ranges, image/video understanding, inline citations.
  Requires XAI_API_KEY from console.x.ai. Falls back to Exa category:tweet.
user-invocable: false
allowed-tools:
  - mcp__plugin_jadlis-research_twitter__x_search
  - mcp__plugin_jadlis-research_exa__web_search_advanced_exa
---

# X/Twitter Research Skill (Grok-MCP)

## Overview

This skill provides X/Twitter research via the **official xAI API** (Grok-MCP). Unlike raw tweet retrieval, `x_search` is an **agentic tool** — Grok processes the query, searches X, and returns a synthesized narrative with inline citations. Results are AI-interpreted summaries, not raw tweet data.

Requires a paid `XAI_API_KEY` from `console.x.ai`.

---

## Tool

### `mcp__plugin_jadlis-research_twitter__x_search`

Agentic X/Twitter search powered by Grok. Returns narrative synthesis with inline citations.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `prompt` | string | yes | The search query / question about X content |
| `model` | string | no | Grok model to use (default: `grok-3`) |
| `allowed_x_handles` | array | no | Up to 10 X handles to restrict search to (without @) |
| `excluded_x_handles` | array | no | X handles to exclude from results (without @) |
| `from_date` | string | no | Start date filter — format **DD-MM-YYYY** (NOT ISO!) |
| `to_date` | string | no | End date filter — format **DD-MM-YYYY** (NOT ISO!) |
| `include_image_understanding` | boolean | no | Analyze images in posts (default: false) |
| `include_video_understanding` | boolean | no | Analyze videos in posts (default: false) |
| `include_inline_citations` | boolean | no | Include inline citations in response (default: false) |
| `max_turns` | integer | no | Max agentic turns for search (default: 5) |

**Always set `include_inline_citations: true`** for research — this provides source attribution for every claim.

### Key behaviors

- Returns **narrative synthesis**, not raw tweets — Grok interprets and summarizes results
- Handle filtering (`allowed_x_handles`) replaces the old `get_twitter_user_tweets` workflow — search a specific user's content by restricting to their handle
- Date format is **DD-MM-YYYY** (e.g., `"01-01-2025"`), NOT ISO 8601
- Image/video understanding adds latency; enable only when visual content is relevant

---

## Lost Capabilities (No Replacement)

The following tools from the previous opentwitter-mcp proxy have **no equivalent** in Grok-MCP:

- **Deleted tweets** (`get_twitter_deleted_tweets`) — archive of removed posts; no alternative source exists
- **KOL followers** (`get_twitter_kol_followers`) — influential follower graph; not available via any other tool

When these capabilities are needed, document the data gap in research output rather than attempting to substitute.

### Partially replaced

- **User tweets** (`get_twitter_user_tweets`) — use `x_search` with `allowed_x_handles: ["username"]` to search a specific user's content. Note: returns Grok's synthesis, not raw tweet list.
- **User profile** (`get_twitter_user`) — no direct replacement. Basic profile info may appear in `x_search` results contextually.

---

## Exa Fallback

When `x_search` fails (XAI API down, key missing, rate limit):

1. Use `mcp__plugin_jadlis-research_exa__web_search_advanced_exa`
2. Pass `category: "tweet"` as the ONLY filter parameter

**CRITICAL CONSTRAINT: `category: "tweet"` prohibits ALL other parameters.**

- No `includeDomains`, no `excludeDomains`, no `moderation`, no other filters
- Adding ANY additional parameter alongside `category: "tweet"` causes a **500 server crash** that is not recoverable within the same call
- Use `category: "tweet"` alone — nothing else

```
{ "query": "your search query", "category": "tweet" }
```

Limitations of Exa fallback: loses agentic synthesis, handle filtering, date ranges, image/video understanding, and inline citations.

---

## Token Setup

Export `XAI_API_KEY` in `~/.zshrc` before starting Claude Code:

```bash
export XAI_API_KEY="your_key_from_console.x.ai"
```

Obtain a paid API key at `console.x.ai`.

See `references/twitter-parameters.md` for full parameter reference.
