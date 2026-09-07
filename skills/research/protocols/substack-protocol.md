# Substack — search protocol for the agent

## Tool: `substack-fetch.py` (custom, Bash — there is no Substack MCP in the plugin)

All calls go through Bash: `{PLUGIN_ROOT}/scripts/substack-fetch.py <subcommand> ...`
(the shebang pulls requests via uv itself). Anonymous `/api/v1` with a browser UA +
discovery headers; works from a home IP (cloud IPs get 403 —
a known Substack limitation, does not apply to us). Cache: key from all argv.

| Subcommand | What it gives |
|---|---|
| `archive <pub> [--limit ≤12] [--search Q] [--offset N]` | archive feed: titles, dates, id, slug, 👍 reactions, 💬 counters, wordcount, audience. `--search` — search WITHIN the publication (works anonymously) |
| `post <pub> <slug>` | FULL post text → markdown file, stdout = path (Read) |
| `comments <pub> <post_id>` | FULL comment tree with texts → file, stdout = path. post_id is the numeric id from archive |
| `search-pub <query>` | global publication search (works anonymously via discovery headers; exit 3 = empty → Brave) |
| `notes <pub>` | best-effort; exit 3 = layer unavailable (NOT "there are no Notes") |

`<pub>` is the canonical handle (`astralcodexten`); custom domains redirect,
the adapter follows them. `audience: only_paid` in archive = the post is behind the paywall —
there will be no full text (`post` returns EMPTY_BODY, exit 3), quote from the
subtitle with the mark "(reconstructed)".

## AUTHOR-FIRST Protocol

### Layer 0 — Publication discovery (1-3 calls)

**If SUBSTACK_HANDLES are provided by the orchestrator** — skip this, use them.

**Otherwise — two paths in parallel:**

Search the platform in its own language: use the LANGUAGES / QUERIES block from the orchestrator prompt;
when `languages` contains anything beyond ru/en, Read `{PLUGIN_ROOT}/skills/research/references/language-layers.md`
first (native-term dictionary).

1. Main — Brave `site:` (reliable, gives posts right away too):
```json
mcp__plugin_search_brave-search__brave_web_search({
  "query": "site:substack.com <keywords of the QUERY>",
  "count": 15, "extra_snippets": true
})
```
Parse handles out of the URL (`<handle>.substack.com/p/...` and the root). Dedup by
domain is mandatory (15 results ≈ 12 unique handles).

2. Complementary — global publication search by topic:
```bash
{PLUGIN_ROOT}/scripts/substack-fetch.py search-pub "<topic in the platform language — Substack is mostly English: take the `en` entry of the QUERIES block when given, otherwise the query itself>"
```
exit 3 → the path is unavailable, work by Brave only (do not count this as a failure).

Merge the two, pick the **3-4 most relevant** handles.

### Layer 1 — Author assessment by the feed (3-4 calls)

```bash
{PLUGIN_ROOT}/scripts/substack-fetch.py archive <handle> --limit 12
```
In the feed look at: cadence (dates of neighbouring posts); topical
consistency; freshness (a feed with no posts for ~6 months = weak source);
engagement (👍/💬 — a signal that Substack MCP servers did not return).
The result goes into the "Source assessment" section. Here too pick candidates
for Layers 2-3: relevance of the title/subtitle + freshness + 💬.

### Layer 2 — Topical slice of the archive (1-3 calls)

The Layer 1 feed did not cover the topic → search within the publication:
```bash
{PLUGIN_ROOT}/scripts/substack-fetch.py archive <handle> --search "<topic, same rule>" --limit 12
```
Deeper into history: `--offset 12`, `--offset 24` (12 per call).

### Layer 3 — Full text (2-3 calls, top posts)

```bash
{PLUGIN_ROOT}/scripts/substack-fetch.py post <handle> <slug>
```
stdout = path to the markdown with the full text — read it via Read. slug comes from
`canonical_url`/`slug` of the archive. Quote from the full text, NOT from the subtitle.
SNAPSHOTS (schema v4): this file already is the full text — copy it into
`{WORK_DIR}/snapshots/` for HIGH-relevance quotes. File name = citation prefix
(`<prefix>N.md`); header lines `URL:`, `Date:`, `Prefix: [<prefix>N]`,
`Extractor: substack-fetch`, then a `---` line, then the full text. A file shorter
than ~1 000 characters does not close the gate (MEDIUM); HIGH without a snapshot →
MEDIUM + "[no-snapshot: blocked]".

### Layer 3.5 — Reader comments (1-2 calls; NEW — depth)

For a post with a high 💬 (disputes, practitioners' experience — often more valuable than the post itself):
```bash
{PLUGIN_ROOT}/scripts/substack-fetch.py comments <handle> <post_id>
```
The full tree with texts (60+ KB on a live thread — read it via Read in parts).
Comments are a source of counter-arguments and C-reliability quotes from personal experience.

### Layer 4 — Cross-Publication (optional)

Repeat Layers 1-3 for other handles from Layer 0. Each additional
handle = +3-4 calls over budget — only if the synthesis is not enough.

### Layer 5 — Counter-arguments (2-3 calls)

1. Brave search for criticism: `site:substack.com <TOPIC> criticism` (variants:
   problems / overrated / alternative / why <TOPIC> is wrong), count 15,
   extra_snippets. Dedup handles as in Layer 0.
2. `notes <handle>` — best-effort (exit 3 = unavailable, not "no criticism").
3. For 1-2 posts with a real counter-argument — `post`, for disputes — `comments`.

A separate section in the output file:
```
## Counter-arguments (found on Substack)
- [{prefix}N] {counter-argument} — {URL}
```

## Budget: 9-15 calls

| Layer | Calls |
|---|---|
| Layer 0 — discovery | 0 (handles from the orchestrator) or 2-3 |
| Layer 1 — author assessment | 3-4 `archive` |
| Layer 2 — topical slice | 1-3 `archive --search` |
| Layer 3 — full text | 2-3 `post` |
| Layer 3.5 — comments | 1-2 `comments` |
| Layer 5 — counter-arguments | 2-3 |

## Fallback

`substack-fetch.py` is broken (network, 403, no `uv`) → Brave
`site:substack.com <QUERY>` (mark quotes from snippets as "(reconstructed)").
**There is no MCP fallback in the plugin** — if Brave gives no material either, the channel degrades:
return `sourceQuality=LOW` with empty citations, the workflow continues on the other channels.

Call the tools directly. ToolSearch ONLY on InputValidationError.

## API notes (reverse-engineered, verified by probes 2026-08-15)

- `/api/v1/search/explore/web` — NOT search: query is ignored, this is the Explore feed.
- Global `publication/search`, `post/search` WITHOUT discovery headers
  (`Origin: https://substack.com`, `Referer: https://substack.com/discover`)
  return a silent EMPTY result instead of 401 — the adapter sends the headers itself.
- `post/{id}/comments` — the full tree anonymously (probe: 62 KB of texts).
- Map of 129 endpoints: `github.com/AnthonyDavidAdams/substack-api-reference`.
- Notes: `/api/v1/reader/feed/profile/{user_id}` is readable, but a numeric
  user_id is required; `comment/feed` — always 403. The adapter tries both known paths.
