# Xpoz Instagram Tools — Parameter Reference

All tools below are accessed via the Xpoz MCP server with namespace `mcp__plugin_jadlis-research_xpoz__`.

## Rate Limits

Xpoz enforces per-account rate limits. If you receive HTTP 429 or "rate limit exceeded", back off for 30 seconds before retrying. Avoid bulk pagination (pageNumberEnd > pageNumber + 3) to stay within rate limits.

## Operation Pattern

All tools return an `operationId`. Call `checkOperationStatus` immediately to get results.

```
Tool call → { operationId: "abc-123" }
checkOperationStatus(operationId: "abc-123") → { status: "completed", data: [...] }
```

---

## User Information Tools

### getInstagramUserByUsername

Get detailed profile for a user by exact username.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `username` | string | Yes | Exact Instagram username (without @) |
| `fields` | string[] | No | Specific fields to return |
| `forceLatest` | boolean | No | Bypass cache for real-time data |

### getInstagramUserById

Get profile by Instagram user ID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | Instagram numeric user ID |
| `fields` | string[] | No | Specific fields to return |
| `forceLatest` | boolean | No | Bypass cache for real-time data |

### searchInstagramUsers

Fuzzy search for users by name or partial username.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search term (name, partial username) |
| `fields` | string[] | No | Specific fields to return |
| `pageNumber` | integer | No | Page number for pagination |

---

## Network & Connections Tools

### getInstagramFollowers

Get all followers of a user. Server-side pagination, 100 per page.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `username` | string | Yes | Target username |
| `fields` | string[] | No | Specific fields to return |
| `pageNumber` | integer | No | Page number (starts at 1) |
| `pageNumberEnd` | integer | No | Fetch pages from pageNumber to pageNumberEnd |
| `tableName` | string | No | Cached table name from first call |

### getInstagramFollowing

Get all accounts a user follows. Server-side pagination, 100 per page.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `username` | string | Yes | Target username |
| `fields` | string[] | No | Specific fields to return |
| `pageNumber` | integer | No | Page number (starts at 1) |
| `pageNumberEnd` | integer | No | Fetch pages from pageNumber to pageNumberEnd |
| `tableName` | string | No | Cached table name from first call |

---

## Post Tools

### getInstagramPostsByIds

Batch retrieve 1-100 posts by their IDs.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `postIds` | string[] | Yes | Array of post IDs (1-100) |
| `fields` | string[] | No | Specific fields to return |

### getInstagramPostsByUserId

Get all posts from a user by their numeric ID. 100 per page.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | Instagram numeric user ID |
| `fields` | string[] | No | Specific fields to return |
| `startDate` | string | No | Start date (YYYY-MM-DD) |
| `endDate` | string | No | End date (YYYY-MM-DD) |
| `pageNumber` | integer | No | Page number (starts at 1) |
| `pageNumberEnd` | integer | No | Bulk page fetch |
| `tableName` | string | No | Cached table name |

### getInstagramPostsByUsername

Get all posts from a user by username. 100 per page.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `username` | string | Yes | Exact Instagram username |
| `fields` | string[] | No | Specific fields to return |
| `startDate` | string | No | Start date (YYYY-MM-DD) |
| `endDate` | string | No | End date (YYYY-MM-DD) |
| `pageNumber` | integer | No | Page number (starts at 1) |
| `pageNumberEnd` | integer | No | Bulk page fetch |
| `tableName` | string | No | Cached table name |

### getInstagramPostsByKeywords

Search posts by keywords or hashtags. 100 per page.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `keywords` | string | Yes | Search query. Supports `"exact phrase"`, AND/OR/NOT |
| `fields` | string[] | No | Specific fields to return |
| `startDate` | string | No | Start date (YYYY-MM-DD) |
| `endDate` | string | No | End date (YYYY-MM-DD) |
| `pageNumber` | integer | No | Page number (starts at 1) |
| `pageNumberEnd` | integer | No | Bulk page fetch |
| `tableName` | string | No | Cached table name |

---

## Engagement Tools

### getInstagramCommentsByPostId

Get all comments on a post. 100 per page.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `postId` | string | Yes | Instagram post ID |
| `fields` | string[] | No | Specific fields to return |
| `pageNumber` | integer | No | Page number (starts at 1) |
| `pageNumberEnd` | integer | No | Bulk page fetch |
| `tableName` | string | No | Cached table name |

### getInstagramPostInteractingUsers

Get profiles of users who commented on or liked a post. 1000 per page.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `postId` | string | Yes | Instagram post ID |
| `fields` | string[] | No | Specific fields to return |
| `pageNumber` | integer | No | Page number (starts at 1) |
| `pageNumberEnd` | integer | No | Bulk page fetch |
| `tableName` | string | No | Cached table name |

---

## User Discovery Tools

### getInstagramUsersByKeywords

Find users who post about specific topics. Returns unique profiles with aggregate engagement metrics.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `keywords` | string | Yes | Topic/keyword search |
| `fields` | string[] | No | Include aggregate fields explicitly |
| `startDate` | string | No | Start date (YYYY-MM-DD) |
| `endDate` | string | No | End date (YYYY-MM-DD) |
| `pageNumber` | integer | No | Page number (starts at 1) |
| `pageNumberEnd` | integer | No | Bulk page fetch |
| `tableName` | string | No | Cached table name |

**Aggregate fields** (must be explicitly requested in `fields`):
- `aggRelevance` — Relevance score
- `relevantPostsCount` — Number of relevant posts
- `relevantPostsLikesSum` — Total likes across relevant posts
- `relevantPostsCommentsSum` — Total comments
- `relevantPostsResharesSum` — Total reshares
- `relevantPostsVideoPlaysSum` — Total video plays

---

## Utility Tools

### checkOperationStatus

Retrieve results of any operation. **Must be called immediately after every tool call.**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operationId` | string | Yes | Operation ID from any tool call |

### checkAccessKeyStatus

Check credit balance and usage limits. No parameters.

### cancelOperation

Cancel an in-progress operation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operationId` | string | Yes | Operation ID to cancel |

---

## Response Data Fields

### User Fields

| Category | Fields |
|----------|--------|
| Core | `id`, `username`, `fullName`, `biography`, `isPrivate`, `isVerified` |
| Engagement | `followerCount`, `followingCount`, `mediaCount` |
| Profile | `profilePicUrl`, `profilePicId`, `profileUrl`, `externalUrl`, `hasAnonymousProfilePicture` |
| Timestamps | `lastFetch`, `lastFetchDatetime`, `xLastUpdated` |

### Post Fields

| Category | Fields |
|----------|--------|
| Core | `id`, `postType`, `userId`, `username`, `fullName`, `caption`, `createdAt`, `createdAtTimestamp`, `createdAtDate` |
| Engagement | `likeCount`, `commentCount`, `reshareCount`, `videoPlayCount` |
| Media | `mediaType`, `codeUrl`, `imageUrl`, `videoUrl`, `audioOnlyUrl`, `profilePicUrl`, `videoSubtitlesUri`, `videoDuration` |

### Comment Fields

| Category | Fields |
|----------|--------|
| Core | `id`, `text`, `parentPostId`, `type`, `parentCommentId`, `repliedToCommentId`, `childCommentCount` |
| User | `userId`, `username`, `fullName` |
| Engagement | `likeCount` |
| Meta | `createdAt`, `createdAtTimestamp`, `createdAtDate`, `status`, `isSpam`, `hasTranslation` |

---

## Pagination

All paginated tools use **server-side pagination**:
- `pageNumber` — Which page to fetch (starts at 1)
- `pageNumberEnd` — Fetch consecutive pages from `pageNumber` to `pageNumberEnd`
- `tableName` — Reuse from first call's response for faster subsequent pages
- `dataDumpExportOperationId` — Included in paginated responses for CSV export of full dataset

Page sizes: 100 results/page for posts and comments, 1000 results/page for followers/following/interacting users.

---

## Credit Calculations

| Operation | Credits |
|-----------|---------|
| Any query | 5 base |
| Per result returned | +0.005 |

Examples:
- 1 keyword search, 20 results: `5 + (20 x 0.005)` = **5.1 credits**
- Profile lookup, 1 result: `5 + (1 x 0.005)` = **5.005 credits**
- Fetch 100 posts: `5 + (100 x 0.005)` = **5.5 credits**
- Fetch 1000 followers: `5 + (1000 x 0.005)` = **10 credits**

Free trial: 5,000 credits (one-time). Pro: $20/month, 30,000 credits.

---

## Known Quirks

- **forceLatest** consumes extra credits and is slower. Only use when data freshness is critical.
- **tableName** is returned on first paginated call. Reuse it for subsequent pages to avoid re-creating the cache table.
- **Aggregate fields** for `getInstagramUsersByKeywords` must be explicitly listed in `fields` parameter — they are not returned by default.
- **Private accounts** return basic profile info only. Posts, followers, following are empty.
- **Boolean search** in `keywords` supports AND, OR, NOT with parentheses for complex queries.
