# Hacker News — Tool Parameter Reference

```
MCP namespace: mcp__plugin_jadlis-research_hn__<tool>
MCP server ID: hn
Install: uvx mcp-hn
Source: https://github.com/erithwik/mcp-hn
APIs: HN Firebase API (live) + Algolia (search)
Auth: None required
```

---

## Tool: `search_stories`

Full name: `mcp__plugin_jadlis-research_hn__search_stories`

Searches HN using the Algolia search index.

**Parameters:**
- `query` (string, required) — natural language or keyword search term
- `limit` (integer, optional) — number of results to return

**Returns:** list of stories with `objectID`, `title`, `url`, `points`, `author`, `num_comments`, `created_at`

---

## Tool: `get_stories`

Full name: `mcp__plugin_jadlis-research_hn__get_stories`

Fetches stories by category.

**Parameters:**
- `story_type` (string, required) — one of: `top`, `new`, `best`, `ask`, `show`, `job`

**Returns:** list of story IDs (not full objects) — follow up with `get_story_info` for each ID to retrieve full details

**Categories and use cases:**
- `top` — current front-page stories
- `new` — newest submissions
- `best` — highest-voted stories of all time
- `ask` — Ask HN threads (community Q&A)
- `show` — Show HN threads (project announcements)
- `job` — job postings

---

## Tool: `get_story_info`

Full name: `mcp__plugin_jadlis-research_hn__get_story_info`

Fetches full story details including the complete comment thread.

**Parameters:**
- `story_id` (integer or string, required) — HN item ID from search/fetch results

**Returns:** full story with `title`, `url`, `score`, `by`, `descendants` (comment count), `kids` (comment IDs), and nested comment tree

**Note:** Comment tree can be large for popular stories. Use selectively.

---

## Tool: `get_user_info`

Full name: `mcp__plugin_jadlis-research_hn__get_user_info`

Fetches an HN user profile.

**Parameters:**
- `username` (string, required) — HN username

**Returns:** `id`, `karma`, `about`, `created` (Unix timestamp), `submitted` (array of item IDs)

---

## Exa Fallback Pattern

```
Fallback trigger: HN MCP server unavailable or tool call fails

Fallback call:
  tool: web_search_exa
  parameters:
    query: <original research query> site:news.ycombinator.com
    includeDomains: ["news.ycombinator.com"]

Limitation: Returns indexed pages only. No structured comment access.
           Real-time data not available (Algolia index has delay).
```
