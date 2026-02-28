---
name: twitter
description: >
  Twitter/X research via opentwitter-mcp proxy. Provides 8 tools for tweet
  search, user profiling, follower analysis, deleted tweet retrieval, and KOL
  discovery. Requires OPENTWITTER_API_KEY from https://6551.io/mcp. Falls back
  to Exa category:tweet search when unavailable.
user-invocable: false
allowed-tools:
  - mcp__plugin_jadlis-research_twitter__search_twitter
  - mcp__plugin_jadlis-research_twitter__search_twitter_advanced
  - mcp__plugin_jadlis-research_twitter__get_twitter_user
  - mcp__plugin_jadlis-research_twitter__get_twitter_user_by_id
  - mcp__plugin_jadlis-research_twitter__get_twitter_user_tweets
  - mcp__plugin_jadlis-research_twitter__get_twitter_follower_events
  - mcp__plugin_jadlis-research_twitter__get_twitter_deleted_tweets
  - mcp__plugin_jadlis-research_twitter__get_twitter_kol_followers
  - mcp__claude_ai_Exa__web_search_advanced_exa
  - mcp__plugin_jadlis-research_exa__web_search_advanced_exa
---

# Twitter/X Research Skill

## ⚠️ Proxy Risk Warning

**This skill routes all queries through a third-party proxy (`ai.6551.io`), not the official Twitter API.**

- Data comes from `ai.6551.io` — sourcing methodology is non-transparent
- The proxy service (`6551Team/opentwitter-mcp`) may be discontinued without notice
- **Do NOT use for sensitive, confidential, or legally sensitive research topics**
- Requires a free token from `https://6551.io/mcp` stored as `OPENTWITTER_API_KEY` in `~/.zshrc`
- If `OPENTWITTER_API_KEY` is missing or expired, fall back to Exa immediately

---

## Tools

### `mcp__plugin_jadlis-research_twitter__search_twitter`

Basic tweet search with time and engagement filters. Primary tool for finding recent discussion on a topic.

Key parameters: `query`, `start_time`, `end_time`, `min_likes`, `min_retweets`, `limit`

### `mcp__plugin_jadlis-research_twitter__search_twitter_advanced`

Advanced tweet search with hashtag filtering and engagement thresholds. Use when you need precise filters beyond basic search.

Key parameters: `query`, `hashtags`, `min_likes`, `min_retweets`, `start_time`, `end_time`, `limit`

### `mcp__plugin_jadlis-research_twitter__get_twitter_user`

User profile by handle: bio, follower count, verified status, account metadata.

Key parameters: `username` (without @)

### `mcp__plugin_jadlis-research_twitter__get_twitter_user_by_id`

Same as `get_twitter_user` but by numeric Twitter user ID.

Key parameters: `user_id`

### `mcp__plugin_jadlis-research_twitter__get_twitter_user_tweets`

Recent tweets from a specific user. Useful for tracking what a person or account has been saying.

Key parameters: `username`, `limit`, `start_time`, `end_time`

### `mcp__plugin_jadlis-research_twitter__get_twitter_follower_events`

Who started or stopped following a user — change tracking over time.

Key parameters: `username`, `limit`

### `mcp__plugin_jadlis-research_twitter__get_twitter_deleted_tweets`

Retrieve deleted tweets. **Unique capability — not available via Exa or any other fallback.** If the proxy is unavailable, this data cannot be recovered. Note data gap in research output.

Key parameters: `username`, `limit`

### `mcp__plugin_jadlis-research_twitter__get_twitter_kol_followers`

Key Opinion Leaders following a given user. Identifies influential accounts that follow a target user — useful for community mapping and influence analysis.

Key parameters: `username`, `limit`

---

## Unique Capabilities (No Fallback Available)

- `get_twitter_deleted_tweets` — deleted tweet archive; not accessible via any other source
- `get_twitter_kol_followers` — KOL follower graph; not available via Exa category:tweet

When these tools fail and the proxy is unavailable, document the data gap in research output rather than attempting to substitute.

---

## Exa Fallback

When any twitter tool call fails (missing key, proxy error, rate limit):

1. Use `mcp__claude_ai_Exa__web_search_advanced_exa` (or `mcp__plugin_jadlis-research_exa__web_search_advanced_exa`)
2. Pass `category: "tweet"` as the ONLY filter parameter

**CRITICAL CONSTRAINT: `category: "tweet"` prohibits ALL other parameters.**

- No `includeDomains`, no `excludeDomains`, no `moderation`, no other filters
- Adding ANY additional parameter alongside `category: "tweet"` causes a **500 server crash** that is not recoverable within the same call
- Use `category: "tweet"` alone — nothing else

```
{ "query": "your search query", "category": "tweet" }
```

Limitations of Exa fallback: loses engagement filters, deleted tweet access, and KOL analysis. Note: time-based filters are also unavailable — not because Exa lacks them, but because `category: "tweet"` prohibits ALL additional parameters.

---

## Token Setup

Export `OPENTWITTER_API_KEY` in `~/.zshrc` before starting Claude Code:

```bash
export OPENTWITTER_API_KEY="your_token_from_6551.io"
```

Obtain a free token at `https://6551.io/mcp`.

See `references/twitter-parameters.md` for full parameter reference.
