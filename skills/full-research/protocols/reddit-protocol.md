# Reddit — search protocol for the agent

## MCP tools

Namespace: `mcp__plugin_jadlis-research_reddit__*`

All operations go through 3 tools:
- `mcp__plugin_jadlis-research_reddit__discover_operations` — list of operations
- `mcp__plugin_jadlis-research_reddit__get_operation_schema` — parameter schema
- `mcp__plugin_jadlis-research_reddit__execute_operation` — execution

**CRITICAL:** `parameters` in `execute_operation` is ALWAYS a native JSON object, NOT a string.

## THREE-LAYER Protocol

### Layer 1 — Discover (2 calls: lexical + semantic)

Search the platform in its own language: use the LANGUAGES / QUERIES block from the orchestrator prompt;
when `languages` contains anything beyond ru/en, Read `{PLUGIN_ROOT}/skills/full-research/references/language-layers.md`
first (native-term dictionary).

**Step 1 (first, always): `mcp__plugin_jadlis-research_reddit-alt__reddit_search_communities`** (`q`, `limit: 10`) —
a lexical search of the official listing. Finds the exact names that the primary's semantic
index is blind to (r/mcp as the first result — 3×3 measurement 2026-08-15; council verdict 2026-08-15:
reddit-alt = the first line of discovery, our own OAuth client/application is NOT needed while reddit-alt is alive).
~$0.002/call (attached key), without the primary's 402 layer.

**Step 2 (optional): primary `discover_subreddits`** — only if the topic is periphrastic
(a meaning-based query without exact names) AND step 1 returned little that is relevant. One call with a
`queries` array — 2-3 reformulations. The batch is equivalent in coverage to N single calls
(probe 2026-08-06), but costs 1 call instead of N. `limit` applies **per query**.
On a 402 from the primary — do NOT retry, work only through reddit-alt (402 = the paid tier of the
MCP vendor, not Reddit).

```json
execute_operation({
  "operation_id": "discover_subreddits",
  "parameters": {
    "queries": ["<QUERY>", "<synonym-1>", "<synonym-2>"],
    "limit": 15,
    "min_confidence": 0.4
  }
})
```

Remember every subreddit with confidence >= 0.4.

Do not repeat `discover_subreddits` "just to be safe" — the response is deterministic (a vector index,
not live results), a repeat spends a call and changes nothing.

A weak quality signal is `summary.confidence_stats` (`mean`/`max`). With a low `max` (< ~0.6) —
at most ONE reformulation of the query, no more. Do not use the fields `quality_indicators` (it is not in the payload)
and `tier_distribution` (degenerate: everything is `peripheral`).

### Layer 1b — Direct check of obvious names (+0-2 calls)

If the topic contains a short name or term (an abbreviation, a product name, `r/<term>`) — check
such a subreddit **directly** via `search_subreddit`, without relying on discovery: the semantic
index is blind to exact subreddit names.

Case: `r/mcp` (73K subscribers) is not returned at all for the query "MCP model context protocol" —
discovery returns Minecraft and McKinney (a substring match on "Mc"); removing `min_confidence` does not fix it.
A direct `search_subreddit` in `r/mcp` meanwhile works perfectly (probe 2026-08-06).

The sign that this step is needed: all `match_tier == "peripheral"` and the names are clearly from another domain.

### Layer 2 — Batch Fetch (5 calls)

1. `fetch_multiple` with all the subreddits (confidence >= 0.4, up to 7 of them):
```json
execute_operation({
  "operation_id": "fetch_multiple",
  "parameters": {
    "subreddit_names": ["sub1", "sub2", "sub3", "sub4", "sub5"]
  }
})
```

2. `search_subreddit` in the **top 4 subreddits** (one call for each):
```json
execute_operation({
  "operation_id": "search_subreddit",
  "parameters": {
    "subreddit_name": "<top_sub>",
    "query": "<QUERY>",
    "sort": "relevance",
    "time_filter": "all",
    "limit": 25
  }
})
```

`time_filter: "all"` + sort relevance catches canonical old threads and fresh
discussions at the same time (verified by an A/B benchmark 2026-06: 3:0 against `year`/top-2).
`"limit": 25` is mandatory: the default is 10, while positions 11-25 contain direct hits
(probe 2026-08-06). It costs 0 extra calls and gives ×2.5 the coverage.
Parameter names verified against the schema 2026-08-06: `subreddit_names` (NOT subreddits),
`time_filter` (NOT time), `subreddit_name` (the canonical one for `search_subreddit`) —
on a schema error, first `get_operation_schema`, do not guess.
`subreddit` is an undocumented working alias (normalized by the server), do not rely on it:
it may disappear on an upgrade.

### Layer 2b — Freshness pass (2 calls)

`search_subreddit` in the **top 2 subreddits** sorted by freshness:
```json
execute_operation({
  "operation_id": "search_subreddit",
  "parameters": {
    "subreddit_name": "<top_sub>",
    "query": "<QUERY>",
    "sort": "new",
    "time_filter": "month",
    "limit": 25
  }
})
```

Relevance sags in this mode — `sort: "new"` returns the freshest of whatever matched,
on any weak match (probe 2026-08-06). Take **only direct hits**,
and mark every freshness quote with the date of the post.

### Layer 3 — Deep Comments (5-7 calls)

`fetch_comments` for the **top 5-7 posts** (priority to posts with `num_comments >= 20`, high score):
```json
execute_operation({
  "operation_id": "fetch_comments",
  "parameters": {
    "url": "https://reddit.com/r/<sub>/comments/<id>/",
    "comment_limit": 50,
    "comment_sort": "top"
  }
})
```
Accepts `url` (preferred) or `submission_id`. The parameters `post_id`/`depth` do **not** exist —
the call fails with `unexpected keyword argument 'post_id'` (verified against the live MCP 2026-07-27).

### Layer 4 — Counterarguments (2-3 calls)

Once the key claims have been formed — search for refutations:

1. `search_subreddit` in the same subreddits with an inverted query:
```json
execute_operation({
  "operation_id": "search_subreddit",
  "parameters": {
    "subreddit_name": "<top_sub>",
    "query": "problems with {TOPIC}" / "why {TOPIC} is bad" / "{TOPIC} criticism",
    "sort": "relevance",
    "time_filter": "all",
    "limit": 25
  }
})
```

2. `fetch_comments` for posts with the opposite point of view (1-2 calls)

In the output file — a separate section:
```
## Counterarguments (found on Reddit)
- [{prefix}N] {counterargument} — {URL}
```

## Citation rules

- No more than **3 quotes from one thread** — otherwise a single thread outweighs the channel.
- **Every** quote carries the date of the post (recommendation of the 2026-06 benchmark).
  For quotes from Layer 2b the date is doubly mandatory: it is exactly what makes them valuable.

## Budget: 14-20 calls

## Backup Reddit MCP — `reddit-alt` (redditapis-mcp, rung 1.5)

A second MCP, an independent backend (api.redditapis.com, live data, full metrics).
Namespace: `mcp__plugin_jadlis-research_reddit-alt__*` — 32 flat tools (no execute_operation wrapper).
Paid: ~$0.002/read from the attached key (in the config env), i.e. the full protocol ≈ $0.05.
`reddit_deep_comment_search` is a "premium call" with an undocumented price, do not call it by default.

Mapping of the ladder's operations:

| Primary operation | reddit-alt | Differences |
|---|---|---|
| `discover_subreddits` | `reddit_search_communities` (`q`, `limit`) | lexical, NOT semantic → finds exact names (r/mcp — verified 2026-08-12), but worse on meaning-based periphrases |
| `search_subreddit` | `reddit_search` (`q`, `subreddit`, `sort`, `t`, `limit`, post-filters `min_score`/`min_comments`) | there is also a global search (without `subreddit`) — the primary cannot do that |
| `fetch_posts` | `reddit_subreddit_posts` (`sort`: hot/new/top/rising/controversial/best) | — |
| `fetch_multiple` | no batch over subs → one `reddit_subreddit_posts` per sub; batch by id — `reddit_by_id` (up to 100 fullnames) | |
| `fetch_comments` | `reddit_post_comments` (`permalink`, `limit`) | threaded tree + `after` cursor |
| feeds | monitoring only on the paid plan — not used | |

**Roles (updated by the council verdict 2026-08-15):** discovery — reddit-alt FIRST (Layer 1
step 1), the primary discover — as the second line for meaning-based periphrases. All other operations —
the primary as the first choice; switch to alt on (any of): primary 5xx/timeout/402;
a non-English query (the Polish case — verified 2026-08-12: primary 0, alt finds r/Polska);
live metrics of fresh posts are needed (Arctic Shift's score is frozen).

## Fallback ladder (no-auth backends)

The MCP stays **primary** (live data, semantics). The ladder is for when the MCP is silent,
for a recall gap (semantics is blind to exact names, the r/mcp case; it breaks on Polish),
or when history is needed. Both backends need no keys and no registration.
CLI wrapper with throttling: `python3 {PLUGIN_ROOT}/scripts/reddit-archive.py` (sub / search / comments).

1. **An exact subreddit name or blind-spot discovery** → **Arctic Shift** `posts/search` by `subreddit`:
   `https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=<sub>&limit=100`
   (+ `after`/`before` ISO dates, `author`, `query` — FTS within a single subreddit).
   Limit ~2000 rpm, archive 2005→now, **freshness lag ~a month** — anything fresher only via the MCP.
2. **A keyword search across ALL of Reddit** (neither the MCP nor Arctic Shift can do it) → **Reddit search RSS**
   with a browser User-Agent (2026-09-05 — instead of PullPush: that one returns 429 on the first request from any IP
   since 2026-08-26 and refuses agents explicitly):
   `https://www.reddit.com/search.rss?q=<query>&sort=new` (+ `&t=year`, `&restrict_sr=1` in
   `r/<sub>/search.rss`). Wrapper: `python3 {PLUGIN_ROOT}/scripts/reddit-archive.py search "<query>"`
   (Atom → JSON: title/url/subreddit/date/summary; posts only, there are no comments in the RSS — the tree
   comes via `comments`). A response without `<entry>` at 200 = the search is empty, not a block; 429/403 → go straight to Arctic
   Shift (`sub` with `query`) or the MCP.
   > discover hosted MCP and Arctic Shift metadata are NOT a source of truth for subreddit sizes
   > (r/mcp: discover returned 73 456 against ~119 953 real ones); do not read Arctic Shift metrics younger than ~36 h.
3. **Backfill beyond the 1000-item cap / deep history** → Arctic Shift; at bulk
   volumes — Watchful1's bulk dumps (github.com/Watchful1/PushshiftDumps, ~4 TB).

A thread's comment tree → Arctic Shift `comments/tree?link_id=<submission_id>&limit=25000`.

Limits as taken on 2026-08 (volunteer-run, may change) — re-verify on the first 429.

## Fallback (Brave, if the backends are unavailable too)

If the Reddit MCP and the backends fail — `mcp__plugin_jadlis-research_brave-search__brave_web_search`:
```json
{ "query": "site:reddit.com <QUERY>", "count": 10, "result_filter": ["web", "discussions"] }
```

Call the tool directly. ToolSearch ONLY on an InputValidationError.
