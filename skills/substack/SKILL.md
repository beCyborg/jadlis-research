---
name: substack
description: >
  Read-only access to public Substack content via the substack_mcp package.
  Covers newsletter posts, author profiles, post sentiment analysis,
  Substack Notes search, publication crawling, and Exa/Firecrawl fallback.
version: "1.0.0"
user-invocable: false
allowed-tools:
  - mcp__plugin_jadlis-research_substack__get_posts
  - mcp__plugin_jadlis-research_substack__get_post_content
  - mcp__plugin_jadlis-research_substack__analyze_post
  - mcp__plugin_jadlis-research_substack__get_author_profile
  - mcp__plugin_jadlis-research_substack__get_notes
  - mcp__plugin_jadlis-research_substack__get_all_posts
  - mcp__plugin_jadlis-research_substack__search_notes
  - mcp__plugin_jadlis-research_substack__crawl_publication
  - mcp__claude_ai_Exa__web_search_exa
  - mcp__plugin_jadlis-research_exa__web_search_exa
  - mcp__plugin_jadlis-research_firecrawl__firecrawl_scrape
---

# Substack Skill

Read-only access to public Substack content using the `substack_mcp` MCP server.

## Authentication

**No authentication required.** This MCP only accesses publicly visible Substack content. Subscription-gated posts are not accessible via this skill.

## MCP Server

**Package:** `dkyazzentwatwa/substack_mcp` (GitHub)
**Transport:** stdio
**Server ID in `.mcp.json`:** `substack`
**Tool namespace:** `mcp__plugin_jadlis-research_substack__<tool>`

**Note on installation:** The package has no `[project.scripts]` entry in `pyproject.toml`, so standard `uvx <entrypoint>` is not available. The `.mcp.json` `substack` entry uses `uv run --with git+https://github.com/dkyazzentwatwa/substack_mcp python -c "..."`. If the server fails to start, fall back immediately to Exa + Firecrawl. If the package appears persistently broken, remove the `substack` entry from `.mcp.json` and rely on Exa/Firecrawl exclusively.

## Risk Disclosure

This is a **single-author project** with approximately 10 GitHub stars and no active maintenance signals. It may be abandoned without notice. If MCP tools return errors or the server fails to start, use the Exa + Firecrawl fallback and do not retry more than once.

## Tools

### `mcp__plugin_jadlis-research_substack__get_posts`

Fetch recent posts from a Substack publication. Takes a publication subdomain (e.g., `stratechery` for `stratechery.substack.com`) and returns a list of recent articles with titles, dates, and preview text.

### `mcp__plugin_jadlis-research_substack__get_post_content`

Retrieve the full content of a specific post by URL or slug. Use for extracting the complete text of a known article.

### `mcp__plugin_jadlis-research_substack__analyze_post`

Analyze a post for sentiment (positive/negative/neutral) and readability metrics. Use to assess tone of coverage or writing style.

### `mcp__plugin_jadlis-research_substack__get_author_profile`

Obtain author information: newsletter stats, subscriber estimate, bio, and publication metadata.

### `mcp__plugin_jadlis-research_substack__get_notes`

Retrieve recent Substack Notes from a publication. Substack Notes is the platform's short-form social feed — separate from newsletter articles, containing short posts, replies, and reposts. **This is a unique capability not replicable via Exa or Firecrawl.** Mark as `[BROKEN]` in usage if it fails consistently.

### `mcp__plugin_jadlis-research_substack__get_all_posts`

Access the complete post archive with optional date filtering. Use for systematic content collection across a publication's full history.

### `mcp__plugin_jadlis-research_substack__search_notes`

Query Substack Notes by content text. Useful for finding community discussions and reactions across the Notes feed. Subject to same reliability caveat as `get_notes`.

### `mcp__plugin_jadlis-research_substack__crawl_publication`

Comprehensive data collection: posts, notes, and profile analysis in a single call. Use when you need all data about a publication at once. Prefer calling `get_all_posts` + `get_notes` + `get_author_profile` separately when you only need specific subsets.

## When to Use This Skill

- Research involves newsletter authors, independent writers, or Substack publications
- Tracking opinion trends among thought leaders on Substack
- Discovering newsletters on a specific topic
- Monitoring a publication's content direction over time
- Accessing Substack Notes discussions (when MCP is functional)

## When to Prefer Firecrawl

- Extracting full content of a **single known post URL** → use `firecrawl_scrape` directly (equally effective, more reliable)
- Subscription-gated content is suspected → neither works; note limitation

## Fallback Chain

1. **Primary:** `mcp__plugin_jadlis-research_substack__` tools
2. **Discovery fallback:** `mcp__claude_ai_Exa__web_search_exa` with `includeDomains: ["substack.com"]`
3. **Extraction fallback:** `mcp__plugin_jadlis-research_firecrawl__firecrawl_scrape` for individual post content
4. Both Exa namespace variants are in `allowed-tools` for runtime configuration resilience
