---
name: reddit
description: "Search Reddit communities using the THREE-LAYER protocol: discover subreddits, batch-fetch posts, and deep-dive comments. Built-in claude.ai Reddit MCP. Falls back to Exa site:reddit.com on failure."
version: 1.0.0
user-invocable: false
allowed-tools:
  - mcp__claude_ai_Reddit__discover_operations
  - mcp__claude_ai_Reddit__get_operation_schema
  - mcp__claude_ai_Reddit__execute_operation
  - mcp__claude_ai_Exa__web_search_exa
  - mcp__plugin_jadlis-research_exa__web_search_exa
---

# Reddit Skill

Search Reddit communities using the built-in claude.ai Reddit MCP. Invoke this skill when the research query benefits from community discussion, opinions, lived experiences, or niche subreddit knowledge.

## THREE-LAYER Protocol

Always follow this sequence. Do not skip layers.

### Layer 1 — Discover Subreddits

Call `execute_operation` with `operation_id: "discover_subreddits"` and a natural-language query. Interpret the confidence scores returned:

| Confidence | Meaning | Action |
|---|---|---|
| >= 0.7 | High relevance | Search directly in that subreddit |
| 0.4–0.69 | Medium relevance | Multi-community approach — check several |
| < 0.4 | Low relevance | Refine query, try different keywords |

### Layer 2 — Batch-Fetch Posts

Use `execute_operation` with `operation_id: "fetch_multiple"` to fetch posts from 2+ subreddits in a single call. This saves ~70% of API calls compared to calling `fetch_posts` per subreddit individually. Always prefer `fetch_multiple` when querying multiple subreddits.

For single-subreddit queries, you may use:
- `search_subreddit` — keyword search within one subreddit
- `fetch_posts` — all posts by sort order (`hot`, `new`, `top`, `rising`)

Note: each `search_subreddit` or `fetch_posts` call counts as 1 call against the 15–20 budget. Do not call them for 5+ individual subreddits — use `fetch_multiple` instead.

### Layer 3 — Deep Comments

Use `execute_operation` with `operation_id: "fetch_comments"` for the **top 5 most relevant posts that have 10 or more comments**. Comment fetches are expensive — do not apply to every post.

## Budget

Limit Reddit MCP calls to **15–20 calls per research session**. Layer 1 (discover) = 1 call. Layer 2 (fetch_multiple) = 1 call per batch. Layer 3 (fetch_comments) = 1 call per post, max 5 posts. Calling `get_operation_schema` to inspect an unknown operation = 1 call.

## Critical Quirk: parameters Must Be a JSON Object

The `parameters` field in `execute_operation` must be a **native JSON object**, not a JSON-encoded string. Passing a string causes silent failures with no error message.

**Correct:**
```json
{
  "operation_id": "discover_subreddits",
  "parameters": {"query": "rust async runtime comparison"}
}
```

**Incorrect (will silently fail):**
```json
{
  "operation_id": "discover_subreddits",
  "parameters": "{\"query\": \"rust async runtime comparison\"}"
}
```

## Exa Fallback

When an MCP tool call fails, switch to `web_search_exa` with `includeDomains: ["reddit.com"]`:

```json
{
  "query": "rust async runtime comparison",
  "includeDomains": ["reddit.com"],
  "numResults": 10
}
```

**Capability loss on fallback:** Exa cannot replicate the THREE-LAYER protocol. Subreddit discovery and comment depth are unavailable. Results are surface-level post titles and snippets only.

## When to Call get_operation_schema

Before calling `execute_operation` with an `operation_id` you have not used before, call `get_operation_schema` first to inspect its parameter requirements. This prevents passing wrong parameters to an unfamiliar operation.

## Reference

See `references/reddit-parameters.md` for full operation parameter schemas.
