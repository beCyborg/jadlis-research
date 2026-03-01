---
name: instagram
description: "Instagram posts, profiles, hashtags, and engagement data via Xpoz MCP. Use for social media research, brand monitoring, content analysis, and audience insights."
version: "1.0.0"
user-invocable: false
allowed-tools: mcp__plugin_jadlis-research_xpoz__getInstagramUserByUsername, mcp__plugin_jadlis-research_xpoz__getInstagramUserById, mcp__plugin_jadlis-research_xpoz__searchInstagramUsers, mcp__plugin_jadlis-research_xpoz__getInstagramFollowers, mcp__plugin_jadlis-research_xpoz__getInstagramFollowing, mcp__plugin_jadlis-research_xpoz__getInstagramPostsByIds, mcp__plugin_jadlis-research_xpoz__getInstagramPostsByUserId, mcp__plugin_jadlis-research_xpoz__getInstagramPostsByUsername, mcp__plugin_jadlis-research_xpoz__getInstagramPostsByKeywords, mcp__plugin_jadlis-research_xpoz__getInstagramCommentsByPostId, mcp__plugin_jadlis-research_xpoz__getInstagramPostInteractingUsers, mcp__plugin_jadlis-research_xpoz__getInstagramUsersByKeywords, mcp__plugin_jadlis-research_xpoz__checkOperationStatus, mcp__plugin_jadlis-research_xpoz__checkAccessKeyStatus, mcp__plugin_jadlis-research_xpoz__cancelOperation, mcp__claude_ai_Exa__web_search_exa
---

# Instagram Research Protocols

## When to Use

This skill is appropriate for:
- Searching posts by keywords or hashtags
- Analyzing profiles (followers count, bio, verification status)
- Engagement metrics (likes, comments, shares, video plays)
- Brand monitoring and competitor analysis
- Content research and audience insights
- Finding users who post about specific topics (user discovery)

## Tool Selection

| Task | Primary Tool | Fallback |
|------|-------------|----------|
| Find user by exact username | `getInstagramUserByUsername` | Exa `site:instagram.com` |
| Find user by ID | `getInstagramUserById` | — |
| Search users by name (fuzzy) | `searchInstagramUsers` | Exa `site:instagram.com` |
| Get user's posts by username | `getInstagramPostsByUsername` | Exa `site:instagram.com/username` |
| Get user's posts by ID | `getInstagramPostsByUserId` | — |
| Search posts by keyword/hashtag | `getInstagramPostsByKeywords` | Exa `instagram.com [keyword]` |
| Get specific posts by ID | `getInstagramPostsByIds` | — |
| Get post comments | `getInstagramCommentsByPostId` | — |
| Get post interacting users | `getInstagramPostInteractingUsers` | — |
| Get followers/following | `getInstagramFollowers` / `getInstagramFollowing` | — |
| Find users by topic | `getInstagramUsersByKeywords` | — |

## Critical: Operation Status Pattern

All Xpoz tools return an **operation ID**, not direct results. You MUST call `checkOperationStatus` immediately after every tool call to retrieve the actual data.

```
1. Call any Instagram tool → returns { operationId: "..." }
2. Immediately call checkOperationStatus with that operationId
3. Results are ONLY available via checkOperationStatus
```

Do NOT wait for user prompt between steps 1 and 2. Do NOT try another tool before checking the operation status.

**Polling:** If `checkOperationStatus` returns `status: "pending"` or `status: "in_progress"`, wait 2-3 seconds and call it again. Retry up to 5 times. If the operation is still not completed after 5 polls, use `cancelOperation` to cancel it and report the timeout to the user. Do NOT poll indefinitely.

## Four-Step Protocol

### Step 1: Query Formulation

Determine the query type and formulate accordingly:

- **Profile lookup** — Use `getInstagramUserByUsername` with the exact username (without @).
- **Hashtag search** — Use `getInstagramPostsByKeywords` with `#hashtag` syntax.
- **Keyword search** — Use `getInstagramPostsByKeywords` with keywords. Supports exact phrase matching with double quotes and boolean operators (AND/OR/NOT).
- **User discovery** — Use `getInstagramUsersByKeywords` to find accounts posting about specific topics.

### Step 2: Search

Call the appropriate Xpoz Instagram tool. Then immediately call `checkOperationStatus` with the returned operation ID to get results.

Key parameters for search tools:
- `fields` — Select only needed fields to optimize response size
- `startDate` / `endDate` — Date filtering in YYYY-MM-DD format
- `pageNumber` — Pagination (100 results per page for posts, 1000 for followers)
- `tableName` — Reuse from first paginated response for faster subsequent pages. Omitting it on page 2+ causes redundant re-indexing.
- `forceLatest` — Avoid unless the user explicitly requests real-time data. Bypasses cache, consumes extra credits, and is slower. Default caching (~1 week freshness) is sufficient for most research.

### Step 3: Extraction

Structure the results:
- **Profile info**: username, fullName, biography, followerCount, followingCount, mediaCount, isVerified, isPrivate
- **Posts**: caption, likeCount, commentCount, reshareCount, videoPlayCount, createdAt, mediaType
- **Comments**: text, username, likeCount, createdAt
- **User discovery**: aggregate fields (aggRelevance, relevantPostsCount, relevantPostsLikesSum)

### Step 4: Credit Awareness

Track credit consumption. Xpoz pricing:
- **5 credits** per query
- **0.005 credits** per result returned
- Free trial: 5,000 credits (one-time, NOT recurring monthly)
- Pro plan: $20/month, 30,000 credits

Use `checkAccessKeyStatus` to verify remaining credits before large operations.

Example calculations:
- 1 search with 20 results = 5 + (20 x 0.005) = 5.1 credits
- 10 profile lookups = 10 x 5 = 50 credits + result credits
- Fetching 1000 followers = 5 + (1000 x 0.005) = 10 credits

## Limitations

- **Public data only** — Private accounts are inaccessible. If `isPrivate: true`, only basic profile info is returned; posts, followers, and following lists are unavailable.
- **Indexed data, not real-time** — Data freshness depends on Xpoz crawl frequency. Smart caching refreshes data older than ~1 week. Not suitable for breaking news or real-time monitoring.
- **No Stories content** — Only story highlights are accessible, not ephemeral Stories.
- **No saves data** — Xpoz does not provide save counts (`saveCount` is not in the response schema). Only likes, comments, reshares, and video plays are available as engagement metrics.
- **Free tier** — 5,000 credits one-time trial (not recurring monthly). Pro is $20/month for 30,000 credits.
- **Service reliability** — Xpoz is a startup; pricing, API, and availability may change or the service may shut down. No guaranteed fallback exists for Instagram-specific data.

## Legal Disclaimer

Instagram (Meta) Terms of Service prohibit automated data collection from the platform. Xpoz is a third-party service that operates its own index of publicly available data. Using Xpoz for Instagram research means relying on a third-party intermediary — legal responsibility for data usage and compliance with Meta's ToS, GDPR, and other applicable regulations rests with the end user. This tool is provided for research purposes only. Do not use collected data for harassment, stalking, or any purpose that violates applicable laws.

## OAuth Error Handling

When Xpoz returns HTTP 401 or 403:
- The OAuth token may have expired or been revoked.
- Surface this message to the user: "Xpoz authentication error. Re-authenticate via OAuth — token may have expired."
- Do NOT retry indefinitely. After the first authentication failure, stop and inform the user.
- The user must re-initiate the OAuth flow by restarting Claude Code or re-authenticating through the browser.

## Fallback Chain

When Xpoz fails, degrade in order:

1. **Xpoz error** — Try Exa with query `"instagram.com [username/hashtag]"`. Note: Instagram is not well-indexed by Exa; results will be limited to whatever external sites reference the Instagram content.
2. **Exa also fails** — Skip Instagram data entirely. Report to the user that Instagram is unavailable for this query.
3. **Manual fallback** (power users only): `jlbadano/ig-mcp` can be used for the owner's own Business account data if configured separately. This is not part of the standard pipeline.

## Reference

See `references/instagram-parameters.md` for complete parameter documentation of all Xpoz Instagram tools, response field details, and pagination patterns.
