# GitHub MCP — Parameter Reference

## Namespace

```
Tool namespace: mcp__github__<tool>
Source: claude.ai built-in MCP (no .mcp.json entry required)
Auth: handled by built-in MCP; authenticated = 5000 req/h, unauthenticated = 60 req/h
```

---

## Tool Parameter Signatures

### `mcp__github__search_repositories`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | Search query with qualifiers (language:, stars:, topic:, in:readme) |
| `page` | integer | no | Page number (default: 1) |
| `per_page` | integer | no | Results per page (default: 30, max: 100) |

### `mcp__github__search_code`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | Code search query (supports language:, repo:, path:, extension:) |
| `page` | integer | no | Page number |
| `per_page` | integer | no | Results per page |

### `mcp__github__search_issues`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | Issue search query (supports is:open, label:, repo:) |
| `page` | integer | no | Page number |
| `per_page` | integer | no | Results per page |

### `mcp__github__search_pull_requests`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | PR search query (supports is:merged, base:, head:) |
| `page` | integer | no | Page number |
| `per_page` | integer | no | Results per page |

### `mcp__github__search_users`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | User search query (supports followers:>, repos:>, location:) |
| `page` | integer | no | Page number |
| `per_page` | integer | no | Results per page |

### `mcp__github__get_file_contents`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `owner` | string | yes | Repository owner (user or org) |
| `repo` | string | yes | Repository name |
| `path` | string | yes | File path within the repository |
| `ref` | string | no | Branch name, tag, or commit SHA |

### `mcp__github__list_commits`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `owner` | string | yes | Repository owner |
| `repo` | string | yes | Repository name |
| `sha` | string | no | Branch, tag, or SHA to start listing from |
| `since` | string | no | ISO 8601 timestamp — only commits after this date |
| `until` | string | no | ISO 8601 timestamp — only commits before this date |
| `per_page` | integer | no | Results per page |
| `page` | integer | no | Page number |

### `mcp__github__get_commit`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `owner` | string | yes | Repository owner |
| `repo` | string | yes | Repository name |
| `sha` | string | yes | Commit SHA |

### `mcp__github__issue_read`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `owner` | string | yes | Repository owner |
| `repo` | string | yes | Repository name |
| `issue_number` | integer | yes | Issue number |

### `mcp__github__pull_request_read`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `owner` | string | yes | Repository owner |
| `repo` | string | yes | Repository name |
| `pull_number` | integer | yes | Pull request number |

### `mcp__github__list_issues`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `owner` | string | yes | Repository owner |
| `repo` | string | yes | Repository name |
| `state` | string | no | `open`, `closed`, or `all` |
| `labels` | string | no | Comma-separated label names |
| `per_page` | integer | no | Results per page |
| `page` | integer | no | Page number |

### `mcp__github__list_pull_requests`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `owner` | string | yes | Repository owner |
| `repo` | string | yes | Repository name |
| `state` | string | no | `open`, `closed`, or `all` |
| `base` | string | no | Filter by base branch name |
| `head` | string | no | Filter by head branch name |
| `per_page` | integer | no | Results per page |
| `page` | integer | no | Page number |

---

## Search Qualifiers Reference

### Repository Search

| Qualifier | Example | Effect |
|---|---|---|
| `language:` | `language:rust` | Filter by programming language |
| `stars:>` | `stars:>500` | Minimum star count |
| `stars:100..500` | `stars:100..500` | Star count range |
| `forks:>` | `forks:>50` | Minimum fork count |
| `topic:` | `topic:llm` | Filter by repository topic tag |
| `in:readme` | `ai agent in:readme` | Search within README text |
| `in:description` | `parser in:description` | Search in repo description |
| `in:name` | `framework in:name` | Search in repository name |
| `user:` | `user:octocat` | Filter by owner username |
| `org:` | `org:microsoft` | Filter by organization |
| `pushed:>` | `pushed:>2024-01-01` | Repositories pushed after date |
| `created:>` | `created:>2023-06-01` | Repositories created after date |
| `archived:false` | `archived:false` | Exclude archived repositories |

### Code Search

| Qualifier | Example | Effect |
|---|---|---|
| `language:` | `language:go` | Filter by language |
| `repo:` | `repo:owner/name` | Scope to specific repository |
| `path:` | `path:src/utils` | Scope to directory path |
| `extension:` | `extension:py` | Filter by file extension |
| `user:` | `user:octocat` | Filter by user's repositories |
| `org:` | `org:github` | Filter by organization |

### Issue and PR Search

| Qualifier | Example | Effect |
|---|---|---|
| `is:open` | `is:open label:bug` | Open issues/PRs |
| `is:closed` | `is:closed` | Closed issues/PRs |
| `is:merged` | `is:merged` | Merged pull requests |
| `label:` | `label:good-first-issue` | Filter by label |
| `repo:` | `repo:owner/name` | Scope to specific repository |
| `author:` | `author:octocat` | Filter by author |
| `assignee:` | `assignee:octocat` | Filter by assignee |
| `milestone:` | `milestone:v2.0` | Filter by milestone |
| `created:>` | `created:>2024-01-01` | Created after date |
| `updated:>` | `updated:>2024-06-01` | Updated after date |
| `comments:>` | `comments:>10` | Minimum comment count |
| `type:pr` | `type:pr` | Only pull requests |
| `type:issue` | `type:issue` | Only issues |

---

## Fallback Pattern

```
Primary:  mcp__github__ tools
Fallback: mcp__claude_ai_Exa__web_search_exa
       or mcp__plugin_jadlis-research_exa__web_search_exa
          with: includeDomains: ["github.com"]

Note: GitHub is NOT an Exa category. Use includeDomains, not category.
      Exa fallback returns unstructured results — no star counts, no issue metadata.
```

Use fallback when:
- GitHub MCP tools are unavailable or rate-limited
- Search returns empty results unexpectedly
- Need full-text web search rather than structured GitHub API queries
