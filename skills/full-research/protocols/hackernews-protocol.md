# HackerNews — search protocol for the agent

## Tool: `hn-fetch.sh` (in-house, Bash — there is no HN MCP in the plugin)

All calls go through Bash: `{PLUGIN_ROOT}/scripts/hn-fetch.sh <subcommand> ...`.
A wrapper over Algolia HN Search (search, the full comment tree in one call)
and the Firebase HN API (feeds). 0 credits, Algolia limit 10k req/hour — you will not hit it.
The cache is honest: the key is built from all options (in the former MCP server the key was
the query string alone — a repeat call with different tags silently returned someone else's
result; here this is fixed, so phrasings need not be varied between layers).

| Subcommand | What it does |
|---|---|
| `search <q> [--tags T] [--by-date] [--since D] [--until D] [--points N] [--limit N] [--page N]` | Algolia search; `--by-date` = sort by recency (the real search_by_date endpoint), otherwise by relevance. `--tags`: story / comment / ask_hn / show_hn / author_<user>; comma = AND, `(a,b)` = OR |
| `thread <id> [--max-comments N]` | The FULL comment tree in one call → a markdown file; stdout = path to the file (read it with Read). Full texts, not snippets |
| `user <username>` | Profile + full texts of the last 20 submissions |
| `front [top\|new\|best\|ask\|show] [--limit N]` | Firebase feeds (work even when Algolia is dead) |
| `canary` | Freshness of the Algolia index (exit 5 = the index lags by more than 1h) |

Pagination: Algolia returns max 1000 hits per query and this is NOT worked around with `--page`
(page 11 is empty). The response header carries `nbHits`: if it is >1000 and you need completeness —
cut the period into windows with `--since/--until` (a created_at_i filter); if nbHits≥1000 inside
a window — split the window in half.

## DEEP-DIVE Protocol

### Layer 0 — Canary (1 call)

```bash
{PLUGIN_ROOT}/scripts/hn-fetch.sh canary
```
`ALGOLIA_DOWN` (exit 3) → search is unavailable: work only with the `front` feeds +
Brave `site:news.ycombinator.com`, and in the channel report mark HONESTLY "HN search
unavailable, feeds only" and lower sourceQuality. `HN_INDEX_STALE` (exit 5) —
you can work, but fresh threads may not have reached the index yet (mark it in the file).

### Layer 1 — Search (3 calls)

Search the platform in its own language: use the LANGUAGES / QUERIES block from the orchestrator
prompt; when `languages` contains anything beyond ru/en, Read
`{PLUGIN_ROOT}/skills/full-research/references/language-layers.md` first (native-term dictionary).

1. By stories — the base phrasing, fresh slice:
```bash
{PLUGIN_ROOT}/scripts/hn-fetch.sh search "<TOPIC>" --tags story --by-date --since <ONE-YEAR-AGO> --limit 30
```
2. By comments (opinions) — evaluative vocabulary ("<TOPIC> experience problems", "<TOPIC> vs alternatives"):
```bash
{PLUGIN_ROOT}/scripts/hn-fetch.sh search "<TOPIC + aspect>" --tags comment --by-date --since <ONE-YEAR-AGO> --limit 20
```
   Comments arrive with their FULL text — quote directly from the results.
3. Canonical pass — by relevance, WITHOUT a date window: catches source-of-record megathreads
   older than a year (verified by the A/B benchmark 2026-06):
```bash
{PLUGIN_ROOT}/scripts/hn-fetch.sh search "<TOPIC>" --tags story --limit 20
```
   Quality threshold when it is noisy: add `--points 10`.

### Layer 2 — Context (0-1 calls)

A topic about trends/community questions → `front ask --limit 30`; a product one
(demos, launches, tools) → `front show --limit 30`. The feeds are general, not
topical — filter by topic yourself. Look for "Who is hiring" megathreads as
`search "who is hiring" --tags story`, not through the feeds.

### Layer 3 — Deep comments (5-7 calls)

`thread` for the top 5-7 posts from the UNION of the Layer 1 searches:
```bash
{PLUGIN_ROOT}/scripts/hn-fetch.sh thread <story_id> --max-comments 100
```
stdout = path to a markdown file with the full tree — read it with Read (read large
threads in parts: Read with limit/offset). Criteria for picking posts:
comments ≥ 20; high points; relevance; a balance of fresh and canonical ones.

### Layer 4 — Counterarguments (2-3 calls)

1. `search "<inverted query: criticism/problems/alternatives>" --tags story --by-date --since <ONE-YEAR-AGO> --limit 15`
2. `thread` for the top 1-2 posts with counterarguments.

In the output file — a separate section:
```
## Counterarguments (found on HackerNews)
- [{prefix}N] {counterargument} — {URL}
```

### Layer 5 — Experts (optional)

Condition: the handle appeared ≥2 times in the Layer 3 comments AND its thesis made it into a claim.
```bash
{PLUGIN_ROOT}/scripts/hn-fetch.sh user <username>
```

## Citation rules

- Every quote carries the thread's engagement metadata: points and the number of comments.
- A thread older than a year → the note "canonical, {year}" + if the thesis is load-bearing,
  a quick freshness check in Layer 4.
- No more than 3 quotes from one thread — otherwise the sample collapses into a single source.
- SNAPSHOTS (schema v4): the markdown files produced by `thread` already are the full text —
  copy them into `{WORK_DIR}/snapshots/` as the source snapshot (this is cheaper than
  a repeat fetch and more trustworthy than snippets). **The name of the copy = the citation prefix**
  (`hn3.md`, not `thread-42.md`) — otherwise the orchestrator will not link the snapshot to the
  citation and the citation will drop to MEDIUM as `no-snapshot`. Before the body — a header: `URL:`,
  `Date:`, `Prefix: [hnN]`, `Extractor: hn-fetch`, then a `---` line.

## Budget: 8-14 calls

## Fallback

`hn-fetch.sh` is unavailable/broken (no `jq`, no network, `exit 3` = HN search unavailable) →
Brave: `{ "query": "site:news.ycombinator.com <QUERY>", "count": 10 }` (quotes from
snippets must be marked "(reconstructed)"). **There is no MCP fallback in the plugin** — if Brave
too yields no material, the channel degrades: return `sourceQuality=LOW` with empty citations,
and the workflow will continue on the remaining channels.
