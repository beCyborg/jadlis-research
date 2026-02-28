---
name: github
description: Research GitHub repositories, issues, pull requests, code, and commit history. Read-only research use only. No write operations.
user-invocable: false
allowed-tools:
  - mcp__github__search_repositories
  - mcp__github__search_code
  - mcp__github__search_issues
  - mcp__github__search_pull_requests
  - mcp__github__search_users
  - mcp__github__get_file_contents
  - mcp__github__list_commits
  - mcp__github__get_commit
  - mcp__github__issue_read
  - mcp__github__pull_request_read
  - mcp__github__list_issues
  - mcp__github__list_pull_requests
  - mcp__claude_ai_Exa__web_search_exa
  - mcp__plugin_jadlis-research_exa__web_search_exa
---

# GitHub Research Skill

This is a **research-only** skill. It provides read-only access to public GitHub data for discovering projects, reading discussions, analyzing code patterns, and tracking community activity. This is not a development tool — no repository modifications, no issue creation, no pull request actions.

## Tools

### `mcp__github__search_repositories`

Find projects by topic, language, or stars. Primary discovery tool.

Use GitHub search qualifiers:
- `language:python` — filter by programming language
- `stars:>100` — minimum star count
- `topic:machine-learning` — filter by repository topic tag
- `in:readme keyword` — search within README text
- `in:description parser` — search in repo description

### `mcp__github__search_code`

Find implementation patterns across public repositories. Useful for "how do others solve X" queries.

Qualifiers: `language:go`, `repo:owner/name`, `path:filename`, `extension:py`

### `mcp__github__search_issues`

Find bug reports, feature requests, and user feedback. Essential for understanding real-world pain points.

Use: `is:open`, `is:closed`, `label:bug`, `label:enhancement`, `repo:owner/name`

### `mcp__github__search_pull_requests`

Track how communities handle changes and contributions.

Use: `is:merged`, `base:main`, `head:feature-branch`, `repo:owner/name`

### `mcp__github__search_users`

Find domain experts by their GitHub activity and repository ownership.

Qualifiers: `followers:>100`, `repos:>10`, `location:berlin`

### `mcp__github__get_file_contents`

Read README, documentation, configuration files, or source files from a known repository.

Required parameters: `owner`, `repo`, `path`. Optional: `ref` (branch or SHA).

### `mcp__github__list_commits`

Track the activity timeline of a project. Shows how active development is.

Parameters: `owner`, `repo`, optional `sha`, `since`, `until`, `per_page`, `page`

### `mcp__github__get_commit`

Understand a specific change: what was modified and why (from commit message).

Parameters: `owner`, `repo`, `sha`

### `mcp__github__issue_read`

Full issue thread including all comments. Use for deep understanding of a specific problem discussion.

Parameters: `owner`, `repo`, `issue_number`

### `mcp__github__pull_request_read`

Full PR discussion thread. Useful for understanding design decisions and community review patterns.

Parameters: `owner`, `repo`, `pull_number`

### `mcp__github__list_issues`

List all issues in a known repository filtered by state or label. Use when you already know the repository and want a full list — not keyword discovery.

**Use `list_issues` when:** you have `owner/repo` and want issues by state (`open`/`closed`/`all`) or label, without a search query.
**Use `search_issues` when:** you are searching across multiple repositories or need keyword matching.

Parameters: `owner`, `repo`, `state`, `labels`, `per_page`, `page`

### `mcp__github__list_pull_requests`

List all pull requests in a known repository filtered by state or branch. Use when you want the full PR history of a specific repo.

**Use `list_pull_requests` when:** you have `owner/repo` and want PRs by state or branch filter.
**Use `search_pull_requests` when:** you are searching across repositories or need keyword/qualifier matching.

Parameters: `owner`, `repo`, `state`, `base`, `head`, `per_page`, `page`

---

## Search Qualifiers Reference

| Qualifier | Example | Effect |
|---|---|---|
| `language:` | `language:rust` | Filter by programming language |
| `stars:>` | `stars:>500` | Minimum star count |
| `topic:` | `topic:llm` | Filter by repository topic tag |
| `in:readme` | `ai agent in:readme` | Search within README text |
| `in:description` | `parser in:description` | Search in repo description |
| `is:open` / `is:closed` | `is:open label:bug` | Issue/PR status |
| `label:` | `label:good-first-issue` | Filter by label |
| `repo:` | `repo:owner/name` | Scope to specific repository |
| `user:` | `user:octocat` | Filter by author/owner |

---

## Fallback

When GitHub MCP tools are unavailable or return empty results, fall back to Exa with domain filtering:

```
mcp__claude_ai_Exa__web_search_exa (or mcp__plugin_jadlis-research_exa__web_search_exa)
with includeDomains: ["github.com"]
```

Note: GitHub is not an Exa category (unlike `tweet`), so domain filtering with `includeDomains` is the correct approach. Exa fallback returns unstructured results — no star counts, no issue metadata.

---

## Rate Limits

The built-in claude.ai MCP handles GitHub authentication automatically.

- Authenticated: 5000 req/h
- Unauthenticated: 60 req/h

See `references/github-parameters.md` for full parameter reference.
