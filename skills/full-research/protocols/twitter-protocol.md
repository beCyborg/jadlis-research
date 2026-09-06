# Twitter/X — search protocol for the agent

## Tool: headless Grok CLI (via Bash)

Search on X/Twitter runs through the **headless Grok CLI**, launched from **Bash** (NOT MCP, NOT ToolSearch). The CLI is billed against the subscription (OIDC) → marginal cost ≈ $0.

Base command:

```bash
~/.grok/bin/grok -p '<PROMPT>' \
  -m grok-4.6 --effort xhigh \
  --output-format json --yolo --no-auto-update \
  --disallowed-tools "run_terminal_cmd" --max-turns 8
```

The CLI's JSON wrapper: `{text, stopReason, sessionId, requestId, thought}`. Your result is inside `.text`.

> [!note] Verified on grok 0.2.93 (2026-07-10, grok-4.5); re-verified on grok 1.0.3 (2026-08-13, grok-4.6)
> - **`env -u XAI_API_KEY` is NOT needed.** The OIDC session token wins over `XAI_API_KEY` by precedence (that one is only a fallback) → billing goes to the subscription automatically. Source: `~/.grok/docs/user-guide/02-authentication.md` (Auth Precedence).
> - **`--disallowed-tools "run_terminal_cmd"` is security hygiene, NOT a bug workaround.** The agent-assembly bug from 0.2.22 is fixed; a bare `grok -p` works. The flag is kept because X search does not need a terminal. Do NOT treat it as a mandatory "crutch".
> - **Pin the model explicitly: `-m grok-4.6 --effort xhigh`.** grok-4.6 (500K ctx) is the server-side default since 2026-08, it replaced grok-4.5 (which is still available); efforts: `low|medium|high|xhigh`, high is the default. The pin protects against a change of the server-side default. effort=xhigh is fixed (directive 2026-08-15, the rollback is withdrawn). Check the list: `grok models`.

## Parsing the result — a tolerant scheme (NOT a blunt `jq -r '.text'`)

`.text` is **never clean JSON**: probe 2026-08-06 — 0/9 calls returned valid JSON
directly (a prose prefix in 8/9, 122–362 characters; a markdown fence ```` ```json ```` in 5/9; in one
call the structure was truncated, a closing `}` was missing). The prompt's demand "no text before/after"
is not honoured by the model — this is stable channel behaviour, not a one-off anomaly.

Parsing order:
1. Extract the JSON block: the contents of a ```` ```json…``` ```` fence, otherwise — from the **first `{` to the last `}`**.
2. Validate with `jq -e .`.
3. Did not parse → append the missing `}`/`]` and retry (in the audit a single missing
   bracket made a whole data block "slide" inside its neighbour — a naive `json.loads` fails silently).
4. Still invalid → **extract the posts by eye** from the `.text` text and continue.
   Malformed JSON is NOT a reason to declare the channel down and NOT a reason for a third call.

A ready one-liner (CLI stdout into `out.json` → `payload.json`):

```bash
jq -r '.text' out.json | python3 -c 'import sys,re; s=sys.stdin.read(); m=re.search(r"```(?:json)?\s*(.*?)```", s, re.S); s=m.group(1) if m else s; i,j=s.find("{"), s.rfind("}"); sys.stdout.write(s[i:j+1] if i>=0 and j>i else s)' > payload.json
jq -e . payload.json >/dev/null || echo "JSON invalid → append the missing brackets, otherwise read it by eye"
```

## Native x_* tools (the model calls them itself)

| Tool | Purpose |
|---|---|
| `x_keyword_search` | Post search with Twitter operators (primary). `query` (req), `limit` (default 3, **max 10**), `mode`=`Top`\|`Latest` |
| `x_semantic_search` | Semantic search. `query` (req), `limit` (default 3, **max 10**), `from_date`, `to_date`, `usernames[]`, `exclude_usernames[]` (default null), `min_score_threshold` (default **0.18**) |
| `x_user_search` | Account/people search (find the exact handle). `query`, `count` |
| `x_thread_fetch` | A post + the full thread. `post_id` (req). Rich content (146 substantive replies in the probe), but **~95 s** against a 60 s threshold → **SECOND REJECT (2026-08-06)** as a separate call. Allowed only as a line inside the Call 2 prompt |

Schema verified by introspection 2026-08-06 (grok 0.2.118).

> [!warning] Do not believe the model's self-report "parameter accepted"
> Grok **silently drops unknown parameters before execution** — there will be no error,
> and the model will report "accepted". The only check of support is the result, not the model's answer.
> `limit` is hard-capped at 10 (in the probe `limit=15` did not pass the schema): ask for exactly `limit=10`.
> Raise `min_score_threshold` cautiously — see the caveat in Call 1.

Every prompt STRICTLY demands: "use ONLY the native x_* tools; return ONLY valid JSON per the schema, with no text before/after" — but that does not affect the output, the parser must be tolerant (see above).

## Query language — Twitter operators inside `query`

All the power is in the `query` string (`x_keyword_search` has no separate filter parameters):

```
from:handle   to:user   @handle              ← by account
filter:images   filter:videos               ← media (filter:links does NOT work, see below)
min_faves:50    min_retweets:10  min_replies:5 ← engagement
since:2026-06-01  until:2026-06-07  lang:ru    ← period / language
"exact phrase"   OR   -minus                   ← logic
url:example.com                                ← by link
```

`mode=Latest` — chronology (research/dynamics); `mode=Top` — popular.

Search the platform in its own language: use the LANGUAGES / QUERIES block from the orchestrator prompt; when `languages` contains anything beyond ru/en, Read `{PLUGIN_ROOT}/skills/full-research/references/language-layers.md` first (native-term dictionary).

> Verified 2026-08-06:
> - **`url:<domain>` works cleanly** — `query="<topic> url:github.com"` returned 10/10 posts with
>   real links to the domain. A working technique for "posts with links to materials"
>   (repositories, reports, PDFs).
> - **`filter:links` barely filters at all** — the output with and without it differed by exactly
>   one author (10 posts against 10), and 3 posts in the "filtered" output had no
>   extractable links whatsoever. Do not use it; for materials take `url:<domain>`.

## Search protocol (2 calls IN ONE message — in parallel)

> **Latency.** One CLI call of "Call 1" = **≈101 s median** (100/129/100 s, verified
> 2026-08-06 on grok 0.2.118); two calls in parallel ≈ 130 s. The channel's median by
> telemetry is 486 s, i.e. **~350 s go NOT to the CLI but to annotation and assembling `twitter.md`
> on the agent's side**. The main source of the channel's latency is citation annotation, not Grok:
> that is what must be optimised (see "Annotation — keep it compact"), not the number of calls.
> The format is unchanged: EXACTLY 2 calls, BOTH in one assistant message (two Bash calls
> in parallel), each with the Bash parameter `timeout: 300000` (ms).

### Call 1 — Overview + deep dive (combined, `--max-turns 6`)

One rich prompt: broad search AND deep dive (experts/period/alternative angle)
inside ONE agent run — Grok will run several x_* searches itself across its turns:

```bash
~/.grok/bin/grok -p 'Research the topic on X: <expanded query with context: what we are looking for, which opinions/aspects, what decision is being made>. Run SEVERAL searches: (1) x_keyword_search query="<keywords + operators, e.g. min_faves:5 since:YYYY-MM-DD>" mode=Latest limit=10; (2) x_semantic_search on the semantic angle limit=10 exclude_usernames=["<corporate/marketing accounts on the topic>"] min_score_threshold=0.5 — this is an ADDITION to step (1), NOT a replacement; (3) x_keyword_search query="<topic> url:<domain-specific site, e.g. github.com>" limit=10 — posts with links to materials; (4) deep dive on the key handles from step (1): x_user_search → x_keyword_search query="from:handle1 OR from:handle2 <topic>"; add a period since:/until: if needed. Return ONLY valid JSON: {"posts":[{"url","author","date","text","likes"}]} — all posts found in a single array, without duplicates.' \
  -m grok-4.6 --effort xhigh \
  --output-format json --yolo --no-auto-update --disallowed-tools "run_terminal_cmd" --max-turns 6
```

**IMPORTANT:** the prompt is expanded, NOT bare keywords.
- BAD: `"AI agents"`
- GOOD: `"What developers and tech influencers say about AI agents in 2026: opinions, criticism, product launches, notable threads"`

**Enrichment of steps (2)–(3) verified 2026-08-06:** +21 % posts (median 54.5 against 45) at a
median of **118.5 s** against the 101 s baseline — the baseline+20 % threshold (121.2 s) is passed with
2.7 s to spare, the call budget does not change. Boundaries that must not be violated:
- do **not replace** the keyword step (1) with the semantic step: the 0.5 threshold cuts off not only marketing but also
  part of the top signal (in the probe the authors of the most-liked posts dropped out). Do not raise above 0.5
  (the schema default is 0.18); below that the filter loses its point.
- `exclude_usernames` — only corporate/marketing accounts on the topic. The `score` field in
  the response comes back `null` → you cannot filter posts by it after the fact.
- ask for exactly `limit` 10 — the schema ceiling, more will not be given.
- do NOT add `filter:links` to step (3) (it does not filter) — only `url:<domain>` works.

### Call 2 — Counterarguments (`--max-turns 4`)

```bash
~/.grok/bin/grok -p 'Find criticism, problems and negative experience with {TOPIC} via x_keyword_search and x_semantic_search. Who disagrees and why. If among the findings there is a high-engagement thread (many replies/likes) — call x_thread_fetch on it and include 2-3 contrasting replies, marking them as dependent sources (replies of one thread). Return ONLY JSON {"posts":[{"url","author","date","text","likes"}]}' \
  -m grok-4.6 --effort xhigh \
  --output-format json --yolo --no-auto-update --disallowed-tools "run_terminal_cmd" --max-turns 4
```

> **`x_thread_fetch` — only as a line inside this prompt, NOT as a separate CLI call.**
> When `TWITTERAPI_IO_KEY` resolves, do NOT ask Grok for the thread at all — take the replies
> deterministically through the TwitterAPI.io layer below (`twitterapi.sh replies <id>`, ~2 s,
> 34 replies with likes), and keep this prompt to search only.
> Probe 2026-08-06: the content is excellent (146 substantive replies, polar opinions — exactly the
> sentiment the channel does not otherwise obtain), but 95 s against a 60 s threshold ≈ the cost of a whole
> Call 1 → it is not budgeted as a separate call (the second REJECT in a row, now on
> latency alone). Replies of one thread are **dependent sources**, do not count them as independent
> confirmation.

In the output file — a separate section:
```
## Counterarguments (found on Twitter/X)
- [{prefix}N] {counterargument} — {URL}
```

## Budget: 2 Grok calls (hard) + ≤3 TwitterAPI.io calls (key-gated)

Do NOT make additional Grok CLI calls — even if the result seems incomplete: the price of the
third call is another ~40-60s of tail on the whole /full-research. Better less, but on time.
The TwitterAPI.io calls (section below) are cheap (~2 s, ~$0.003 each) and run AFTER the Grok
results are parsed, in parallel with each other.

**Annotation — keep it compact.** For every citation: Admiralty A-F + ONE reliabilityWhy line.
Expanded dossiers on authors, multi-line bias analyses, meta tags beyond the format —
do NOT write them: the annotation depth of twitter.md is the **MAIN** source of the channel's latency, not the CLI.
The numbers: the CLI gives ~101 s (median call), the channel median is 486 s, the ~350 s difference falls
entirely on annotation and file assembly. Seconds must be saved here.

## Lost in the migration off MCP (2026-06)

The CLI channel cannot do **image/video understanding of posts** — what MCP used to give. Pictures,
memes, product screenshots and videos arrive only as links/captions, their content is not read
by the channel.

Consequence: if the topic is **visual** (memes, interface screenshots, demo videos, infographics),
the channel goes blind on that dimension — state this limitation explicitly in findings, so that the synthesis does not
mistake the absence of a visual signal for its absence in reality.

## Degradation of the Grok CLI calls

One call failed (non-zero exit / timeout / empty `.text`), the other is fine → work with what
came back, mark the missing angle in findings.

Both calls failed → ONE sequential retry of the combined call (the parallel
launch may have hit a rate limit). If that one failed too:
- return **empty** findings + the note "X channel unavailable (CLI)";
- citations/counterarguments empty; sourceQuality = LOW;
- **do NOT switch** to MCP `x_search` or brave (MCP grok-mcp = xAI API, paid credits — forbidden
  by design); the ONLY permitted fallback is the keyword-only mode of the TwitterAPI.io layer
  below, and only when its key resolves;
- **do NOT crash** the workflow — the other /full-research channels must finish.

Failure causes for diagnostics: an expired OIDC token (needs `grok login`, visible as exit≠0) or a subscription rate limit. stderr warnings `Transport channel closed / AuthorizationRequired` at exit 0 are harmless (grok's internal MCP servers), the result is valid.

## TwitterAPI.io layer (on when the key resolves; checked 2026-09-06)

TwitterAPI.io is a third-party pay-per-call Twitter/X data API (tweets $0.15 / 1K, profiles
$0.18 / 1K, minimum 15 credits = $0.00015 per call; a 20-tweet page ≈ $0.003). It has NO
semantic search, so it never replaces Grok — it closes the three holes Grok cannot fill
deterministically (thread replies, author profile, trends) and keeps the channel alive when Grok
is down. Wrapper: `{PLUGIN_ROOT}/scripts/twitterapi.sh` (REST via curl, key from `scripts/secret.sh`).

- **Key gate.** `bash {PLUGIN_ROOT}/scripts/twitterapi.sh balance` → JSON with credits = key ok;
  `exit 2` = no `TWITTERAPI_IO_KEY` anywhere (env, macOS Keychain) → skip the whole layer
  silently, the channel behaves exactly as the sections above (no fallback).
- **Why REST, not the vendor MCP** (`mcp.twitterapi.io`, checked 2026-09-06): its `get_trends`
  returns 30 empty `{}` objects, its `get_tweet_replies` rejects the `queryType=Top` its own
  catalog advertises (backend accepts `Relevance|Latest|Likes`), and its tweet objects are
  flattened (no `author{}`, `entities`, `card`). REST returns the full objects. Do not register
  the MCP for this channel.
- **Rate.** A paid balance has no QPS cap (6 parallel calls fine). A free-tier key is limited to
  **1 request / 5 s** (HTTP 429) — on a 429, space the calls with `sleep 5`.

### Mode A — complement (Grok probe = `GROK_OK`, the default)

After BOTH Grok calls are parsed, at most three calls, all in ONE message (parallel Bash):

1. `twitterapi.sh replies <tweetId> Likes` — for the ONE highest-engagement post found by Grok
   (by replies/likes). Take 2-3 contrasting replies into «Counterarguments», marked as dependent
   sources (replies of one thread). Reply objects carry `likeCount`, `author.userName`,
   `author.followers`. The first item may be the root post itself — skip it.
2. `twitterapi.sh user <userName>` — for at most TWO key authors whose reliability decides a
   claim: `data.description`, `data.followers`, `data.createdAt`, `data.isBlueVerified` feed the
   Admiralty rating (one reliabilityWhy line, no dossiers).
3. `twitterapi.sh trends <woeid> 10` — ONLY when the topic is itself a trend/news event and the
   question is "is it trending now"; otherwise skip. `1`=Worldwide, `23424975`=UK, `23424977`=USA,
   `23424923`=Poland, `23424848`=India.

Citations from this layer use the same `x` prefix and URL scheme (`https://x.com/<user>/status/<id>`);
they are raw posts (not llm-mediated), so the per-citation snapshot gate treats them like any
x.com URL.

### Mode B — keyword-only fallback (Grok probe = `GROK_DOWN`)

The `twitter` channel stays in the run (SKILL.md keeps it when the key resolves). Budget ≤4 calls:

1. `twitterapi.sh search '<keywords + operators> since:YYYY-MM-DD lang:xx' Latest`
2. `twitterapi.sh search '<same or the semantic angle rephrased as keywords>' Top`
3. `twitterapi.sh replies <id> Likes` on the top-engagement post from 1-2 (counterarguments).
4. optional second page of 1 via `next_cursor` (`twitterapi.sh search '<q>' Latest <cursor>`)
   when the first page is on-topic and `has_next_page` is true.

Operators are the standard Twitter advanced-search set (`from:` `since:` `until:` `lang:`
`min_faves:` `-filter:retweets` `url:`); one page = ~20 tweets. Native-language queries work
(`lang:ru` verified). Mark `sourceQuality` no higher than MEDIUM and write in findings that the
semantic angle and Grok's expert deep-dive are missing — keyword-only coverage is not the same
channel, and the synthesis must not mistake its silence for absence of a signal.
