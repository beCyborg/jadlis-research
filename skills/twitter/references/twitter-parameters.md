# X/Twitter MCP — Parameter Reference (Grok-MCP)

## Namespace

```
Tool namespace: mcp__plugin_jadlis-research_twitter__x_search
MCP server ID: twitter
Package: merterbak/Grok-MCP (vendored in vendors/grok-mcp/)
API: Official xAI API (Grok)
```

---

## Environment Variable

```
XAI_API_KEY:
  Obtain: console.x.ai (paid)
  Set: export XAI_API_KEY="your_key" in ~/.zshrc
  Effect if missing: MCP server fails to start -> fall back to Exa immediately
```

---

## Tool Parameter Signature

### `mcp__plugin_jadlis-research_twitter__x_search`

Agentic X/Twitter search. Grok processes the query, searches X, and returns narrative synthesis with optional inline citations.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `prompt` | string | yes | — | Search query or question about X content |
| `model` | string | no | `grok-3` | Grok model to use |
| `allowed_x_handles` | array[string] | no | [] | Up to 10 handles to restrict search (without @) |
| `excluded_x_handles` | array[string] | no | [] | Handles to exclude from results (without @) |
| `from_date` | string | no | — | Start date, format **DD-MM-YYYY** |
| `to_date` | string | no | — | End date, format **DD-MM-YYYY** |
| `include_image_understanding` | boolean | no | false | Analyze images in posts |
| `include_video_understanding` | boolean | no | false | Analyze videos in posts |
| `include_inline_citations` | boolean | no | false | Include source citations in response |
| `max_turns` | integer | no | 5 | Max agentic turns for search |

**Date format warning:** Dates must be **DD-MM-YYYY** (e.g., `"15-03-2025"`). ISO 8601 format will NOT work.

**Research recommendation:** Always set `include_inline_citations: true` for research tasks.

---

## Lost Tools (opentwitter-mcp -> Grok-MCP)

The following opentwitter-mcp tools have no equivalent in Grok-MCP:

| Old Tool | Status | Workaround |
|---|---|---|
| `search_twitter` | Replaced | Use `x_search` with prompt |
| `search_twitter_advanced` | Replaced | Use `x_search` with handle/date filters |
| `get_twitter_user` | Lost | No direct replacement; profile info may appear contextually in `x_search` |
| `get_twitter_user_by_id` | Lost | No replacement |
| `get_twitter_user_tweets` | Partial | Use `x_search` + `allowed_x_handles: ["username"]` |
| `get_twitter_follower_events` | Lost | No replacement |
| `get_twitter_deleted_tweets` | Lost | **No replacement anywhere** — unique capability |
| `get_twitter_kol_followers` | Lost | **No replacement anywhere** — unique capability |

---

## Exa Fallback — Critical Constraint

```
Fallback: mcp__plugin_jadlis-research_exa__web_search_advanced_exa

Parameter: { "query": "...", "category": "tweet" }

CONSTRAINT: category: "tweet" prohibits ALL other parameters.
            Adding includeDomains, excludeDomains, or moderation causes
            a 500 server crash. Use category: "tweet" alone.
```

Use fallback when:
- `XAI_API_KEY` is missing or expired
- xAI API returns error or is rate-limited
- MCP server fails to start

Fallback limitations: no agentic synthesis, no handle filtering, no date ranges, no image/video understanding, no inline citations.

---

## Blocked Grok Tools

Grok-MCP exposes 17 additional tools beyond `x_search` that are **blocked** in `community-worker.md` via `disallowedTools`:

- `web_search`, `list_models`, `chat`, `chat_with_vision`, `generate_image`, `generate_video`
- `grok_agent`, `code_executor`, `stateful_chat`, `retrieve_stateful_response`, `delete_stateful_response`
- `upload_file`, `list_files`, `get_file`, `get_file_content`, `delete_file`, `chat_with_files`

These are general Grok capabilities not relevant to X/Twitter research.
