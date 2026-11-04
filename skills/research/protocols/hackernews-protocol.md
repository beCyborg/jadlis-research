# HackerNews — search protocol for the agent

> **Pick HN for tech / startup / developer topics only.** Four LOW verdicts of the channel after
> 2026-10-12 were off-topic subjects (an LIA, crypto casinos, medical contacts) with a healthy canary —
> silence there is the platform, not a tool failure. Do not report it as a channel error.

## Tools

**Thread discovery — Exa first.** Blind bench 2026-11 (15 topics, two judges): Exa `lite` with
`--include-domains news.ycombinator.com` scored 7.53, the best for both judges; Algolia relevance search
came last (3.47) and Brave `site:news.ycombinator.com` beat it 15 : 0. Algolia (`hn-fetch.sh`) stays for
what only it does: comment trees, the by-date slice, the `--points` sweep and comment search.

```bash
python3 {PLUGIN_ROOT}/scripts/websearch.py exa "<description of the HN discussion you want>" --tag research --include-domains news.ycombinator.com -n 10 --out json
```
The query describes the thread («Hacker News discussion where engineers compare X and Y in production»),
not keywords. Story id = `id=` in the URL (`news.ycombinator.com/item?id=<id>`). `exit 2` (no
`EXA_API_KEY`) or `STOP … 402` → Brave `site:news.ycombinator.com <keywords>` in its place.

### `hn-fetch.sh` (in-house, Bash — there is no HN MCP in the plugin)

All calls go through Bash: `{PLUGIN_ROOT}/scripts/hn-fetch.sh <subcommand> ...`.
A wrapper over Algolia HN Search (search, the full comment tree in one call)
and the Firebase HN API (feeds). 0 credits, Algolia limit 10k req/hour — you will not hit it.
The cache is honest: the key is built from all options (in the former MCP server the key was
the query string alone — a repeat call with different tags silently returned someone else's
result; here this is fixed, so phrasings need not be varied between layers).

| Subcommand | What it does |
|---|---|
| `search <q> [--tags T] [--by-date] [--since D] [--until D] [--points N] [--limit N] [--page N] [--all-words]` | Algolia search; `--by-date` = sort by recency (the real search_by_date endpoint), otherwise by relevance. `--tags`: story / comment / ask_hn / show_hn / author_<user>; comma = AND, `(a,b)` = OR. **Word matching:** relevance search lets any query word match (`optionalWords`, set by the script — Algolia otherwise demands all words: «AI search visibility GEO» 63 hits vs 56k); `--by-date` demands all words and retries with `optionalWords` by itself when < 5 hits (stderr `NOTE: … retried`); `--all-words` forces all words everywhere |
| `thread <id> [--breadth B]` | The thread **in the site's ranking order** (Firebase `kids`): every top-level comment + up to B=3 replies each, `[id]` on every line → a markdown file; stdout = path (read it with Read). Bench 2026-11: the top-10 site comments are in the first 100 lines 10/10 vs 1-4/10 for the time-ordered tree. Algolia down → the script builds the same cut from the ClickHouse HN mirror (stderr `DEGRADED`); exit 4 = both down |
| `thread <id> --full [--max-comments N]` | The FULL tree in time order (default ≤ 200 nodes) → file, stdout = path. Only when you need a deep sub-thread the ranked cut skips |
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
`ALGOLIA_DOWN` (exit 3) → Algolia search is unavailable: discover threads with Exa (+ Brave
`site:news.ycombinator.com`), read them with `thread` (ClickHouse mirror), use the `front` feeds, and in
the channel report mark HONESTLY "HN Algolia search unavailable" (no by-date / comment search). `HN_INDEX_STALE` (exit 5) —
you can work, but fresh threads may not have reached the index yet (mark it in the file).

### Layer 1 — Search (3-4 calls)

Search the platform in its own language: use the LANGUAGES / QUERIES block from the orchestrator
prompt; when `languages` contains anything beyond ru/en, Read
`{PLUGIN_ROOT}/skills/research/references/language-layers.md` first (native-term dictionary).

0. **Thread discovery — Exa** (1-2 calls, the main source of on-topic threads; command above). A
   second Exa call from another angle (problems / comparison / experience) when the first is thin.
1. By stories — the base phrasing, fresh slice (Algolia):
```bash
{PLUGIN_ROOT}/scripts/hn-fetch.sh search "<TOPIC>" --tags story --by-date --since <ONE-YEAR-AGO> --limit 30
```
2. By comments (opinions) — evaluative vocabulary ("<TOPIC> experience problems", "<TOPIC> vs alternatives"):
```bash
{PLUGIN_ROOT}/scripts/hn-fetch.sh search "<TOPIC + aspect>" --tags comment --by-date --since <ONE-YEAR-AGO> --limit 20
```
   Comments arrive with their FULL text — quote directly from the results.
3. Canonical pass — by relevance, WITHOUT a date window, only when Exa returned no megathread older
   than a year (Algolia relevance is the weakest thread finder — keep it as a top-up):
```bash
{PLUGIN_ROOT}/scripts/hn-fetch.sh search "<TOPIC>" --tags story --points 10 --limit 20
```

### Layer 2 — Context (0-1 calls)

A topic about trends/community questions → `front ask --limit 30`; a product one
(demos, launches, tools) → `front show --limit 30`. The feeds are general, not
topical — filter by topic yourself. Look for "Who is hiring" megathreads as
`search "who is hiring" --tags story`, not through the feeds.

### Layer 3 — Deep comments (5-7 calls)

`thread` for the top 5-7 posts from the UNION of the Layer 1 searches (Exa + Algolia):
```bash
{PLUGIN_ROOT}/scripts/hn-fetch.sh thread <story_id>
```
stdout = path to a markdown file with the ranked cut — read it with Read (large threads in parts:
Read with limit/offset; the strongest comments are at the top). A deep sub-thread matters → `thread
<story_id> --full`. Criteria for picking posts: comments ≥ 20; high points; relevance; a balance of
fresh and canonical ones. Each comment line carries `[<id>]` — its permalink is
`https://news.ycombinator.com/item?id=<id>`.

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

## Evidence gates (A/B verdict 2026-09-06 — EN protocol adopted, ADOPT_B 2:1)

1. **Engagement sweep is mandatory.** Besides the freshness searches of Layer 1, run one Algolia story search sorted by points over the last 12-24 months (`hn-fetch.sh search "<TOPIC>" --tags story --points 100 --limit 20`) and include at least 2 threads with ≥100 points — the A/B lost threads at 432/517/622 points without it.
2. **Two sampling axes, ≥2 threads each:** (a) "meta" threads — ownership, governance, rewrites, institutional decisions; (b) operational threads — complaints and measurements (segfault/OOM/latency/benchmarks/migration reports). One axis alone skews the output into ideology or anecdotes.
3. **Uniqueness gate.** Coverage is counted by unique thread URLs; never present one thread as several references. Not more than 3 citations per thread (rule below).
4. **Per-quote provenance.** Every span carries author + date + permalink to the specific comment (`item?id=<comment_id>`), and the parent story's points/comments are always resolved.
5. **No title-only citations.** A citation without at least one verbatim fragment of a post/comment body carries no finding — mark it as a "signal" (max 2 per run) outside the numbered citation list. Counterarguments are "who + why + points + link"; a thread title is not a counterargument.
6. **Release sweep with a label.** The freshest release threads of the topic are read even at zero engagement and marked "vendor claims, not crowd-verified".

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

## Budget: 9-15 calls (Exa 1-2 at $0.004, the rest free)

Reality (telemetry v5, 72 runs, Fan-out phase, 61 agents): median 31 tool calls per agent, of them
14 searches instead of 5 by layers. Median 404 s (p90 512 s).

## Fallback

`hn-fetch.sh search` is unavailable (`exit 3` = Algolia down) → discovery stays on Exa (+ Brave
`site:news.ycombinator.com`), `thread` still works through the ClickHouse mirror. `hn-fetch.sh` broken
entirely (no `jq`, no network, `exit 4`) → Brave: `{ "query": "site:news.ycombinator.com <QUERY>", "count": 10 }`
(quotes from snippets must be marked "(reconstructed)"). **There is no MCP fallback in the plugin** — if Brave
too yields no material, the channel degrades: return `sourceQuality=LOW` with empty citations,
and the workflow will continue on the remaining channels.
