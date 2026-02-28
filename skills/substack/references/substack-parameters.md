# Substack — Tool Parameter Reference

```
Tool namespace: mcp__plugin_jadlis-research_substack__<tool>
MCP server ID: substack
Package: dkyazzentwatwa/substack_mcp (GitHub)
Source: https://github.com/dkyazzentwatwa/substack_mcp
Auth: None required (public content only)
Transport: stdio
```

---

## Tool: `get_posts`

Full name: `mcp__plugin_jadlis-research_substack__get_posts`

Fetch recent posts from a Substack publication.

**Parameters:**
- `subdomain` (string, required) — publication subdomain (e.g., `stratechery` for `stratechery.substack.com`)
- `limit` (integer, optional) — number of posts to return

**Returns:** list of posts with title, date, preview, and URL

---

## Tool: `get_post_content`

Full name: `mcp__plugin_jadlis-research_substack__get_post_content`

Retrieve full content of a specific post.

**Parameters:**
- `url` (string, required) — full post URL (e.g., `https://publication.substack.com/p/post-slug`)

**Returns:** full article text, author, publication date

---

## Tool: `analyze_post`

Full name: `mcp__plugin_jadlis-research_substack__analyze_post`

Analyze a post for sentiment and readability.

**Parameters:**
- `url` (string, required) — post URL

**Returns:** sentiment classification (positive/negative/neutral), readability score

---

## Tool: `get_author_profile`

Full name: `mcp__plugin_jadlis-research_substack__get_author_profile`

Fetch author/publication profile.

**Parameters:**
- `subdomain` (string, required) — publication subdomain

**Returns:** bio, subscriber estimate, publication stats, social links

---

## Tool: `get_notes`

Full name: `mcp__plugin_jadlis-research_substack__get_notes`

Retrieve recent Substack Notes from a publication.

**Parameters:**
- `subdomain` (string, required) — publication subdomain
- `limit` (integer, optional) — number of notes

**Returns:** list of notes with text, date, reactions

**⚠ Reliability:** Single-author project. Verify this feature functions before relying on it. Mark `[BROKEN]` if it fails consistently — no equivalent fallback exists.

---

## Tool: `get_all_posts`

Full name: `mcp__plugin_jadlis-research_substack__get_all_posts`

Access the complete post archive with optional date filtering.

**Parameters:**
- `subdomain` (string, required) — publication subdomain
- `start_date` (string, optional) — ISO date filter (e.g., `2024-01-01`)
- `end_date` (string, optional) — ISO date filter

**Returns:** complete list of posts within date range

---

## Tool: `search_notes`

Full name: `mcp__plugin_jadlis-research_substack__search_notes`

Search Substack Notes by content text.

**Parameters:**
- `query` (string, required) — search keywords
- `limit` (integer, optional) — number of results

**Returns:** matching notes with text, author, date

**⚠ Reliability:** Same caveat as `get_notes`.

---

## Tool: `crawl_publication`

Full name: `mcp__plugin_jadlis-research_substack__crawl_publication`

Comprehensive publication data collection.

**Parameters:**
- `subdomain` (string, required) — publication subdomain

**Returns:** combined result with posts, notes, profile, and analysis

---

## Fallback Strategy

```
Primary: mcp__plugin_jadlis-research_substack__ tools

Fallback (discovery):
  Tool: mcp__claude_ai_Exa__web_search_exa
  Parameters: { query: "<topic>", includeDomains: ["substack.com"] }

Fallback (extraction):
  Tool: mcp__plugin_jadlis-research_firecrawl__firecrawl_scrape
  Parameters: { url: "<substack_article_url>" }
```

---

## Known Risks

- **Single-author project** (~10 stars). Not actively maintained. May break without warning.
- **Substack Notes search:** verify this feature functions before relying on it. Mark as `[BROKEN]` if it fails consistently.
- **No fallback for Notes** specifically — Exa/Firecrawl cannot replicate the Notes feed.
- **If server fails to start:** disable `substack` in `.mcp.json` and use Exa/Firecrawl only.

---

## Installation Note (no uvx entrypoint)

The package has **no `[project.scripts]`** entry in `pyproject.toml`. Standard `uvx <entrypoint>` pattern does not apply. The recommended `.mcp.json` command:

```json
"substack": {
  "command": "uv",
  "args": [
    "run",
    "--with",
    "git+https://github.com/dkyazzentwatwa/substack_mcp",
    "python",
    "-c",
    "import asyncio; from substack_mcp.mcp_server import main; asyncio.run(main())"
  ]
}
```
