# Twitter/X — search protocol for the agent

## Mode selection (read first)

- **Grok is off since 2026-09-14.** The channel runs on TwitterAPI.io REST (Mode B below), with Brave `site:x.com` as the second fallback. Never call `~/.grok/bin/grok`, never load `mcp__grok-mcp__*` or `mcp__twitterapi-mcp__*`.
- **Only if the CHANNEL NOTE says `GROK OK`** → Read `{PLUGIN_ROOT}/skills/research/protocols/twitter-grok-protocol.md` and run Mode A from there; this file's TwitterAPI.io layer then complements the Grok calls.
- A Grok failure at run time in Mode A → finish the run in Mode B here, without further Grok retries.

## Query language — Twitter operators inside `query`

All the power is in the `query` string (there are no separate filter parameters):

```
from:handle   to:user   @handle              ← by account
filter:images   filter:videos               ← media (filter:links does NOT work, see below)
min_faves:50    min_retweets:10  min_replies:5 ← engagement
since:<DATE − N months>  until:<YYYY-MM-DD>  lang:ru ← period / language (DATE from the orchestrator prompt)
"exact phrase"   OR   -minus   -filter:retweets ← logic
url:example.com                                ← by link
```

`Latest` — chronology (research/dynamics); `Top` — popular.

Search the platform in its own language: use the LANGUAGES / QUERIES block from the orchestrator prompt; when `languages` contains anything beyond ru/en, Read `{PLUGIN_ROOT}/skills/research/references/language-layers.md` first (native-term dictionary).

> Verified on the REST layer 2026-10-11: `lang:ru`, `min_faves:`, `-filter:retweets`, `since:` and
> `url:<domain>` work (`url:github.com` → 20 of 20 posts with links to the domain — a working
> technique for "posts with links to materials"). `filter:links` barely filters at all (verified
> 2026-08-06) — use `url:<domain>`.
> An invalid operator (e.g. a malformed `since:` date) returns an EMPTY page with rc=0 after ~38 s,
> with no error — build the date from DATE, never type it by hand.

Noise to drop: replies from the `@grok` bot are LLM output, not a community voice — do not cite them.
Media-only posts (`text` = just a `t.co` link) carry no quotable text — skip them.

## TwitterAPI.io layer (the main path; checked 2026-10-11)

TwitterAPI.io is a third-party pay-per-call Twitter/X data API (tweets $0.15 / 1K, profiles
$0.18 / 1K, minimum 15 credits = $0.00015 per call; a 20-tweet page ≈ $0.003; the 2026-10-11
probe spent ~200 credits per call). It has NO semantic search: the channel is keyword-only.
Wrapper: `{PLUGIN_ROOT}/scripts/twitterapi.sh` (REST via curl, key from `scripts/secret.sh`);
one call takes 1–2 s.

- **Key gate.** `bash {PLUGIN_ROOT}/scripts/twitterapi.sh balance` → JSON with credits = key ok;
  `exit 2` = no `TWITTERAPI_IO_KEY` anywhere (env, macOS Keychain) → go straight to the Brave
  fallback (Mode B step 5).
- **Why REST, not the vendor MCP** (`mcp.twitterapi.io`, checked 2026-09-06): its `get_trends`
  returns 30 empty `{}` objects, its `get_tweet_replies` rejects the `queryType=Top` its own
  catalog advertises (backend accepts `Relevance|Latest|Likes`), and its tweet objects are
  flattened (no `author{}`, `entities`, `card`). REST returns the full objects. Do not register
  the MCP for this channel.
- **Rate.** A paid balance has no QPS cap (6 parallel calls fine). A free-tier key is limited to
  **1 request / 5 s** (HTTP 429) — on a 429, space the calls with `sleep 5`.
- **Ad-hoc REST outside the wrapper.** Balance: `curl -H "x-api-key: $TWITTERAPI_IO_KEY" https://api.twitterapi.io/oapi/my/info`;
  trends: `GET /twitter/trends?woeid=1&count=10` (name/rank/query). A bare urllib request is blocked by
  Cloudflare (error 1010) — send a `User-Agent` header. Credit accounting: 1 credit = $0.00001, a 20-tweet
  page ≈ 300 credits = $0.003.
- Other wrapper commands: `twitterapi.sh user <userName>` (bio, followers, `createdAt`,
  `isBlueVerified` — for the Admiralty rating of a key author); `twitterapi.sh trends <woeid> 10`
  only when the question is "is it trending now".

### Mode B — keyword-only (the default: Grok off)

The `twitter` channel stays in the run when `TWITTERAPI_IO_KEY` resolves. Steps:

1. `twitterapi.sh search '<keywords + operators> since:<DATE − 6 months> lang:xx' Latest`
2. `twitterapi.sh search '<same or the semantic angle rephrased as keywords> since:<DATE − 12 months>' Top`
   — **`since:` is mandatory for Top too**: without it Top returns posts from 2023–2025.
3. `twitterapi.sh replies <id> Likes` on the top-engagement post from 1-2 (counterarguments).
   The first item may be the root post itself — skip it. Replies of one thread are dependent
   sources, not independent confirmation.
4. optional second page of 1 via `next_cursor` (`twitterapi.sh search '<q>' Latest <cursor>`)
   when the first page is on-topic and `has_next_page` is true.
5. **Second fallback — Brave.** Go here when `twitterapi.sh` exits ≠ 0, when a 429 persists after
   the `sleep 5` spacing above, OR when a search returns **0 tweets with rc=0**
   (`{"tweets":[],"has_next_page":false}` — an empty page is not a success, the wrapper raises no
   error). Use `mcp__plugin_jadlis-search_brave-search__brave_web_search` with
   `site:x.com <topic keywords>` — 2 queries, `count: 15`, `freshness: "py"` (without it about half
   of the results are older than a year). Snippets only: Brave returns no tweet text beyond the
   SERP snippet, so annotate those citations MEDIUM at most and never claim engagement numbers.
   Keep the same `x` prefix and the same URL scheme (`https://x.com/<user>/status/<id>`). Never
   Firecrawl on x.com — the plugin hook denies it.

One page = ~20 tweets. Native-language queries work (`lang:ru` verified). Write in findings that the
semantic angle is missing — keyword-only coverage is not a full channel, and the synthesis must not
mistake its silence for absence of a signal.

In the output file — a separate section:
```
## Counterarguments (found on Twitter/X)
- [{prefix}N] {counterargument} — {URL}
```

### Citations and the MEDIUM ceiling

Citations use the `x` prefix and the URL scheme `https://x.com/<user>/status/<id>`. The workflow
core caps EVERY x.com citation at MEDIUM (`llm-mediated` by host constant), even when the snapshot
is the raw REST JSON. So the channel's `sourceQuality` is MEDIUM at most by design — this is not a
failure, and the share of HIGH citations is not a metric for this channel.

The channel cannot read images or videos of posts: if the topic is **visual** (memes, interface
screenshots, demo videos), state this limitation in findings.

## Budget: ≤4 API calls (Mode B)

Reality (telemetry v5, 72 runs, Fan-out phase): median 16 tool calls per agent, which is ≈12–19
TwitterAPI.io calls — agents pack several calls into one Bash, and 61 of 65 agents went over 4
because the first broad queries returned off-topic noise. Median 314 s per agent (p90 482 s). REST
calls take 1–2 s each, so the time goes to reasoning, annotation and the file write.

**Annotation — keep it compact.** For every citation: Admiralty A-F + ONE reliabilityWhy line.
No expanded author dossiers, no multi-line bias analyses.
