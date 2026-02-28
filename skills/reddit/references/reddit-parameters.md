# Reddit MCP — Parameter Reference

**Namespace:** `mcp__claude_ai_Reddit__`

All meaningful operations use `mcp__claude_ai_Reddit__execute_operation` with an `operation_id` and a `parameters` JSON object.

## Discovery Tools

| Tool | Purpose |
|---|---|
| `mcp__claude_ai_Reddit__discover_operations` | List available operation_ids |
| `mcp__claude_ai_Reddit__get_operation_schema` | Get parameter schema for a given operation_id |
| `mcp__claude_ai_Reddit__execute_operation` | Execute an operation by operation_id |

## Operations

### discover_subreddits

Find relevant subreddits for a topic.

```json
{
  "operation_id": "discover_subreddits",
  "parameters": {
    "query": "rust async runtime comparison"
  }
}
```

Returns: array of subreddits with `name` and `confidence` (0.0–1.0).

### fetch_multiple

Fetch posts from 2+ subreddits in one call (~70% fewer API calls than individual `fetch_posts`). **Always prefer `fetch_multiple` over multiple `fetch_posts` calls when querying 2+ subreddits.**

```json
{
  "operation_id": "fetch_multiple",
  "parameters": {
    "subreddits": ["rust", "programming", "learnrust"]
  }
}
```

Returns: batched posts from all listed subreddits.

### search_subreddit

Keyword search within a single subreddit.

```json
{
  "operation_id": "search_subreddit",
  "parameters": {
    "subreddit": "rust",
    "query": "async runtime",
    "sort": "relevance",
    "time": "year"
  }
}
```

Optional: `sort` (`relevance`, `hot`, `top`, `new`, `comments`), `time` (`hour`, `day`, `week`, `month`, `year`, `all`).

### fetch_posts

Fetch posts from a single subreddit by sort order.

```json
{
  "operation_id": "fetch_posts",
  "parameters": {
    "subreddit": "rust",
    "sort": "hot"
  }
}
```

`sort`: `hot`, `new`, `top`, `rising`. Optional time filter for `top`: `day`, `week`, `month`, `year`, `all`.

### fetch_comments

Fetch the full comment thread for a specific post. Use only for the top 5 most relevant posts with 10+ comments.

```json
{
  "operation_id": "fetch_comments",
  "parameters": {
    "post_id": "abc123",
    "depth": 3
  }
}
```

`post_id` comes from the `id` field in `fetch_posts` / `fetch_multiple` results. `depth` controls how many comment levels to retrieve (default varies; specify explicitly for deep threads).

---

## Confidence Score Thresholds

| Confidence | Meaning | Action |
|---|---|---|
| >= 0.7 | High relevance | Search directly in that subreddit |
| 0.4–0.69 | Medium relevance | Multi-community approach — check several |
| < 0.4 | Low relevance | Refine query, try different keywords |

---

## Critical Quirk: parameters Must Be a JSON Object

The `parameters` field must be a **native JSON object**, not a JSON-encoded string.

**Correct:**
```json
{"operation_id": "discover_subreddits", "parameters": {"query": "rust async"}}
```

**Incorrect (silent failure, no error returned):**
```json
{"operation_id": "discover_subreddits", "parameters": "{\"query\": \"rust async\"}"}
```

---

## Exa Fallback Pattern

When an MCP tool call fails, use `web_search_exa` with `includeDomains: ["reddit.com"]`:

```json
{
  "query": "rust async runtime comparison",
  "includeDomains": ["reddit.com"],
  "numResults": 10
}
```

**Limitation:** Fallback loses subreddit discovery, confidence scores, and comment depth. Results are surface-level only.
