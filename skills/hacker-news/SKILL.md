---
name: hacker-news
description: >
  Search and analyze Hacker News discussions, stories, Ask HN threads,
  and Show HN announcements using the mcp-hn MCP server.
version: "1.0.0"
user-invocable: false
allowed-tools:
  - mcp__plugin_jadlis-research_hn__search_stories
  - mcp__plugin_jadlis-research_hn__get_stories
  - mcp__plugin_jadlis-research_hn__get_story_info
  - mcp__plugin_jadlis-research_hn__get_user_info
  - mcp__claude_ai_Exa__web_search_exa
  - mcp__plugin_jadlis-research_exa__web_search_exa
---

# Hacker News Skill

Search and analyze Hacker News using the `mcp-hn` MCP server.

## Prerequisite

The `uvx mcp-hn` package must be installed and available before starting Claude Code. The MCP server starts automatically via `uvx mcp-hn` as declared in `.mcp.json`. If the server fails to start, all HN tools will be unavailable and the Exa fallback applies.

```bash
uvx mcp-hn  # run once to cache/install
```

## Tools

### `mcp__plugin_jadlis-research_hn__search_stories`

Searches HN using the Algolia search index. This is the **primary tool** for most research queries. Returns stories with title, URL, score (points), author, and comment count. Use this first for any topical query.

### `mcp__plugin_jadlis-research_hn__get_stories`

Fetches stories by category. Categories: `top`, `new`, `best`, `ask`, `show`, `job`. Use `ask` to find Ask HN threads (community Q&A), `show` for Show HN announcements (project launches). Use `top` or `best` for front-page monitoring. Does not accept a keyword query — category only.

### `mcp__plugin_jadlis-research_hn__get_story_info`

Fetches full story details including the complete comment thread for a specific story ID. Use this for deep analysis after identifying relevant stories via `search_stories`. High comment count (50+) signals significant community interest worth analyzing.

### `mcp__plugin_jadlis-research_hn__get_user_info`

Fetches an HN user profile: karma score, about text, account age, and submitted item IDs. Use to assess contributor authority or to investigate a prolific poster's submission history.

## Research Workflow

1. Start with `search_stories` for the research query — pass `limit: 10` for initial searches
2. For Ask HN or Show HN discovery, use `get_stories` with `ask` or `show` category
3. For the top 3–5 most relevant stories (high score or comment count), call `get_story_info` to retrieve the comment thread
4. Limit deep-dives with `get_story_info` to prevent excessive API calls — comments add context but diminish returns after a few threads

## Exa Fallback

When the HN MCP server is unavailable or any tool call fails:
- Use `mcp__claude_ai_Exa__web_search_exa` or `mcp__plugin_jadlis-research_exa__web_search_exa`
- Include `includeDomains: ["news.ycombinator.com"]` in the Exa call
- This returns indexed HN pages but loses structured comment access and real-time data
