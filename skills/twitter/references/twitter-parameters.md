# Twitter/X MCP — Parameter Reference

## Namespace

```
Tool namespace: mcp__plugin_jadlis-research_twitter__<tool>
MCP server ID: twitter
Package: 6551Team/opentwitter-mcp
Proxy: ai.6551.io (third-party, non-transparent)
```

---

## Environment Variable

```
OPENTWITTER_API_KEY:
  Obtain: https://6551.io/mcp (free token)
  Set: export OPENTWITTER_API_KEY="your_token" in ~/.zshrc
  Effect if missing: MCP server fails to start → fall back to Exa immediately
```

---

## Tool Parameter Signatures

### `mcp__plugin_jadlis-research_twitter__search_twitter`

Basic tweet search with time and engagement filters.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | Search query text |
| `start_time` | string | no | ISO 8601 start timestamp |
| `end_time` | string | no | ISO 8601 end timestamp |
| `min_likes` | integer | no | Minimum like count filter |
| `min_retweets` | integer | no | Minimum retweet count filter |
| `limit` | integer | no | Max results to return |

### `mcp__plugin_jadlis-research_twitter__search_twitter_advanced`

Advanced tweet search with hashtag and engagement threshold filters.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | Search query text |
| `hashtags` | array | no | List of hashtags to include |
| `min_likes` | integer | no | Minimum like count |
| `min_retweets` | integer | no | Minimum retweet count |
| `start_time` | string | no | ISO 8601 start timestamp |
| `end_time` | string | no | ISO 8601 end timestamp |
| `limit` | integer | no | Max results to return |

### `mcp__plugin_jadlis-research_twitter__get_twitter_user`

User profile by handle.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `username` | string | yes | Twitter handle (without @) |

Returns: bio, follower count, following count, tweet count, verified status, account creation date.

### `mcp__plugin_jadlis-research_twitter__get_twitter_user_by_id`

User profile by numeric Twitter user ID.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `user_id` | string | yes | Numeric Twitter user ID |

### `mcp__plugin_jadlis-research_twitter__get_twitter_user_tweets`

Recent tweets from a specific user.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `username` | string | yes | Twitter handle (without @) |
| `limit` | integer | no | Max tweets to return |
| `start_time` | string | no | ISO 8601 start timestamp |
| `end_time` | string | no | ISO 8601 end timestamp |

### `mcp__plugin_jadlis-research_twitter__get_twitter_follower_events`

Who started or stopped following a user — change tracking.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `username` | string | yes | Twitter handle (without @) |
| `limit` | integer | no | Max events to return |

### `mcp__plugin_jadlis-research_twitter__get_twitter_deleted_tweets`

Retrieve deleted tweets from a user's history. Unique capability — no fallback available.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `username` | string | yes | Twitter handle (without @) |
| `limit` | integer | no | Max tweets to return |

**Note:** If proxy unavailable, this data cannot be recovered. Document data gap in research output.

### `mcp__plugin_jadlis-research_twitter__get_twitter_kol_followers`

Key Opinion Leaders following a given user. Identifies influential accounts.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `username` | string | yes | Twitter handle (without @) |
| `limit` | integer | no | Max KOLs to return |

**Note:** If proxy unavailable, this data cannot be recovered — no fallback source provides KOL follower data. Document data gap in research output.

---

## Exa Fallback — Critical Constraint

```
Fallback: mcp__claude_ai_Exa__web_search_advanced_exa
         OR mcp__plugin_jadlis-research_exa__web_search_advanced_exa

Parameter: { "query": "...", "category": "tweet" }

CONSTRAINT: category: "tweet" prohibits ALL other parameters.
            Adding includeDomains, excludeDomains, or moderation causes
            a 500 server crash. Use category: "tweet" alone.
```

Use fallback when:
- `OPENTWITTER_API_KEY` is missing or expired
- Proxy returns error or is rate-limited
- MCP server fails to start

Fallback limitations: no engagement filters, no time filters, no deleted tweet access, no KOL analysis.

---

## Proxy Notes

```
Proxy host: ai.6551.io
Data sourcing: non-transparent (not official Twitter API)
Do not use for: sensitive, confidential, or legally sensitive research
Service continuity: not guaranteed
Package: 6551Team/opentwitter-mcp
```
