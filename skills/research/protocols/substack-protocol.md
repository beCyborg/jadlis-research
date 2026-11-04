# Substack — search protocol for the agent

## Discovery order (blind bench 2026-11, 15 topics, two judges)

1. **Exa `lite` with `--include-domains substack.com`** — 7.93 points, a good list in 14 of 15 topics.
2. **Brave `site:substack.com`** — second, and it brings the most unique good finds (17).
3. Native Substack search (`search-pub`, `post/search`, `top/search`) — **last in all 15 topics (3.00).
   Do not use it for discovery.**

Agents went post-first through Brave 677 times out of 682 under the old AUTHOR-FIRST protocol; this
protocol follows what works — posts first, the author's archive only for depth.

## Tools

| Tool | What it gives |
|---|---|
| `python3 {PLUGIN_ROOT}/scripts/websearch.py exa "<post description>" --tag research --include-domains substack.com -n 10 --out json` | Post discovery — first (type `lite` by default, $0.004) |
| `mcp__plugin_jadlis-search_brave-search__brave_web_search` with `site:substack.com` | Post discovery — second |
| `{PLUGIN_ROOT}/scripts/substack-fetch.py post <pub> <slug>` | FULL post text → markdown file, stdout = path (Read) |
| `{PLUGIN_ROOT}/scripts/substack-fetch.py comments <pub> <post_id>` | FULL comment tree with texts → file, stdout = path. post_id is the numeric id from `archive` or the post file header |
| `{PLUGIN_ROOT}/scripts/substack-fetch.py archive <pub> [--limit ≤12] [--search Q] [--offset N]` | archive feed of one publication: titles, dates, id, slug, 👍 reactions, 💬 counters, wordcount, audience. `--search` — search WITHIN the publication (works anonymously) |
| `{PLUGIN_ROOT}/scripts/substack-fetch.py notes <pub>` | best-effort; exit 3 = layer unavailable (NOT "there are no Notes") |
| `{PLUGIN_ROOT}/scripts/substack-fetch.py search-pub <query>` | native publication search — not for discovery (see above) |

`substack-fetch.py` (custom, Bash — there is no Substack MCP in the plugin; the shebang pulls requests
via uv itself): anonymous `/api/v1` with a browser UA + discovery headers; works from a home IP (cloud
IPs get 403 — a known Substack limitation, does not apply to us). Cache: key from all argv.

**`<pub>`** = the handle (`astralcodexten` from `astralcodexten.substack.com`) **or the publication's own
domain** (`www.annsmarty.com`, with or without `https://`) — the script accepts both.
**Custom-domain publications are invisible to the `substack.com` filter** of Exa and Brave: when a
publication you need lives on its own domain (a handle from the orchestrator, a link inside a found
post), search it with Exa `--include-domains <its domain>` or read it with `archive <domain> --search`.

**Paywall.** `post` prints `PAYWALL_PREVIEW` to stderr and puts `> PAYWALL_PREVIEW` into the file header
when the post is `audience: only_paid`: the body is the free preview only. **Never quote it as the full
post** and never state what the post concludes — a quote from the preview is allowed only if it is in
the preview, marked "(paywall preview)", relevance MEDIUM at most. `EMPTY_BODY` (exit 3) = nothing free
at all — quote the subtitle with the mark "(reconstructed)".

## POST-FIRST Protocol

**If SUBSTACK_HANDLES are provided by the orchestrator** — run Layers 0-1 as usual AND
`archive <handle> --search "<topic>" --limit 12` for each given handle; merge the results.

Search the platform in its own language: use the LANGUAGES / QUERIES block from the orchestrator prompt;
when `languages` contains anything beyond ru/en, Read `{PLUGIN_ROOT}/skills/research/references/language-layers.md`
first (native-term dictionary). Substack is mostly English: take the `en` entry of the QUERIES block when given.

### Layer 0 — Exa (1-2 calls)

```bash
python3 {PLUGIN_ROOT}/scripts/websearch.py exa "<description of the post you want: e.g. essay by a practitioner on how X changed Y>" --tag research --include-domains substack.com -n 10 --out json
```
A second call from another angle when the first is thin. `exit 2` (no `EXA_API_KEY`) or `STOP … 402`
→ skip to Layer 1 (it becomes the only discovery layer).

### Layer 1 — Brave (1-2 calls, in the same message as Layer 0)

```json
mcp__plugin_jadlis-search_brave-search__brave_web_search({
  "query": "site:substack.com <keywords of the QUERY>",
  "count": 15, "extra_snippets": true
})
```

**Merge Layers 0-1:** dedupe by post URL (`<handle>.substack.com/p/<slug>`; the same post may also
appear under `substack.com/@<author>/p-<id>` or `substack.com/home/post/p-<id>` — collapse by slug/id;
`post <pub> <id>` takes the numeric id as well as the slug).
**Keep ≤ 3 posts per publication** — one prolific author must not become the whole channel. Pick the
5-7 most relevant posts for Layer 2.

### Layer 2 — Full text (3-5 calls, top posts)

```bash
{PLUGIN_ROOT}/scripts/substack-fetch.py post <pub> <slug>
```
stdout = path to the markdown with the full text — read it via Read. Quote from the full text, NOT
from the subtitle or the search snippet. Paywall rules — above.
SNAPSHOTS (schema v4): this file already is the full text — copy it into
`{WORK_DIR}/snapshots/` for HIGH-relevance quotes. File name = citation prefix
(`<prefix>N.md`); header lines `URL:`, `Date:`, `Prefix: [<prefix>N]`,
`Extractor: substack-fetch`, then a `---` line, then the full text. A file shorter
than ~1 000 characters does not close the gate (MEDIUM); HIGH without a snapshot →
MEDIUM + "[no-snapshot: blocked]"; a `PAYWALL_PREVIEW` body never backs a HIGH quote.

### Layer 3 — Reader comments (1-2 calls; depth)

For a post with a high 💬 (disputes, practitioners' experience — often more valuable than the post itself):
```bash
{PLUGIN_ROOT}/scripts/substack-fetch.py comments <pub> <post_id>
```
The full tree with texts (60+ KB on a live thread — read it via Read in parts).
Comments are a source of counter-arguments and C-reliability quotes from personal experience.

### Layer 4 — Author context (optional, 1-2 calls)

When one publication carries a load-bearing claim: `archive <pub> --limit 12` — cadence (dates of
neighbouring posts), topical consistency, freshness (no posts for ~6 months = weak source), engagement
(👍/💬). The result goes into the "Source assessment" section. Deeper into its archive on the topic:
`archive <pub> --search "<topic>" --limit 12` (`--offset 12`, `--offset 24` for more).

### Layer 5 — Counter-arguments (2-3 calls)

1. Exa `--include-domains substack.com` with a page description of the criticism + Brave
   `site:substack.com <TOPIC> criticism` (variants: problems / overrated / alternative / why <TOPIC> is
   wrong), count 15, extra_snippets. Same dedupe and ≤ 3 per publication.
2. `notes <pub>` — best-effort (exit 3 = unavailable, not "no criticism").
3. For 1-2 posts with a real counter-argument — `post`, for disputes — `comments`.

A separate section in the output file:
```
## Counter-arguments (found on Substack)
- [{prefix}N] {counter-argument} — {URL}
```

## Budget: 9-14 calls

Reality (telemetry v5, 72 runs, Fan-out phase, 59 agents; under the old AUTHOR-FIRST protocol): median
38 tool calls per agent — Brave 12 instead of 2-3, `post` 5 instead of 2-3, `archive` 1 instead of 4-7
(agents worked post-first, not author-first). Median 340 s (p90 502 s).

| Layer | Calls |
|---|---|
| Layer 0 — Exa | 1-2 |
| Layer 1 — Brave | 1-2 |
| Layer 2 — full text | 3-5 `post` |
| Layer 3 — comments | 1-2 `comments` |
| Layer 4 — author context | 0-2 `archive` |
| Layer 5 — counter-arguments | 2-3 |

## Fallback

`substack-fetch.py` is broken (network, 403, SSLError, no `uv`) → cite from the Exa highlights / Brave
snippets with the mark "(reconstructed)" (MEDIUM at most). **There is no MCP fallback in the plugin** —
if Exa and Brave give no material either, the channel degrades: return `sourceQuality=LOW` with empty
citations, the workflow continues on the other channels.

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
