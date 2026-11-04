# Web (Yandex, Runet) — search protocol for the agent

## Tool: yandex-search.sh (via Bash, NOT MCP)

Search over the Yandex index via Yandex Search API v2. The channel is **paid** (async ≈0,025 ₽/request,
YC grant) and **opt-in**: the orchestrator turns it on only for RU-market topics. The point of the channel is
the Runet layer that Brave does not index deeply (measurement 01.2026: Yandex has the highest
domain diversity of results — 164 domains out of 1630 SERP were not met by any other
engine; typical ones: dzen.ru, secrets.tbank.ru, sberbusiness.live, incrussia.ru). The earlier
figure "64,7% unique domains versus Brave" has no public source and has been withdrawn.

Base command:

```bash
Y={PLUGIN_ROOT}/scripts/yandex-search.sh
bash "$Y" "<query with operators>" --out json     # now via Bright Data: ~1 min per query — run queries in parallel (see the warning below)
bash "$Y" "<query>" --out urls                    # URLs only (cheap in tokens)
```

Output: `--out text|json|urls`; stdout is clean for pipes, diagnostics (`[cost]`/`[poll]`) go to stderr.
Exit: 0 ok (including found=0) · 2 no key (ENV `YC_SEARCH_API_KEY`) · 3 API error · 4 polling timeout.

> [!warning] Backend: Bright Data while the Yandex API is unpaid (owner decision 2026-11-04)
> - The owner's Yandex Cloud billing account is a Russian-resident one (RUB, Russian cards only) and has
>   never accepted a payment; the owner chose the Bright Data SERP alternative. `yandex-search.sh` handles
>   it: after one 401/402/403 from the API it marks the API down for 6 h and sends every query to
>   `scripts/yandex-bd.py` (raw yandex.ru HTML parsed into the same `--out text|json|urls`; `found=n/a`;
>   stderr `[fallback] …` — expected, not an error). Bright Data: 5 000 requests/month free.
> - **Each query takes ~1 min (median 55 s, up to ~85 s).** Run the protocol's 4–6 queries IN PARALLEL in
>   one Bash call (Bash `timeout: 300000`), e.g.
>   `for q in "q1" "q2" "q3"; do (bash "$Y" "$q" --out json > "$WD/y_$(echo "$q" | md5 | cut -c1-6).json" 2>>"$WD/y.err") & done; wait`
>   — then read the files. Never call one query per turn (6 queries sequentially = 6+ min of idle turns).
> - Dates are rarely visible (≈3 of 90 results); freshness still comes from the web channel. `site:`,
>   quotes and other operators work; the region comes from `lr` (default 225).
> - If the Yandex API comes back (owner pays/fixes the role), delete `~/.cache/jadlis-search/yandex-api-down`;
>   then async runs only 00:00–06:00 MSK, sync otherwise (1 rps), and 403 with a folder means suspended
>   billing or a missing role `search-api.webSearch.user` — never «key invalid».

**FORBIDDEN in this channel:** `--sync` (×16 the price), gen-search (`/v2/gen/search`, 5 ₽/req),
`--sort time` (sorts the whole index by time, relevance collapses into noise — verified
2026-08-06), the regional parameter `-r` for non-geo topics (0 new domains, only a reshuffle).

## Protocol (4-6 async calls ≈ 0,10-0,15 ₽)

Reality (telemetry v5, 72 runs, Fan-out phase, 13 agents): median 32 tool calls per agent. The live
runs of 2026-09-19 made 7-13 Yandex queries (median 10); since 2026-09-21 the API answers 403/504 and
the channel makes 5-8 calls, all failed. Median 475 s (p90 652 s).

### Layer 1 — Broad RU query (1-2 calls)

```bash
bash "$Y" "<topic in Russian, keywords>" --out json
```

The query is in Russian, ≤400 chars and ≤40 words. A second call only if the first gave weak
relevance (one rephrasing, no more).
Search the platform in its own language: use the LANGUAGES / QUERIES block from the orchestrator prompt;
when `languages` contains anything beyond ru/en, Read `{PLUGIN_ROOT}/skills/research/references/language-layers.md`
first (native-term dictionary).

### Layer 2 — Anchor platforms (2-3 calls)

The channel's strongest scenario (18-19 out of 20 URLs are absent from Brave):

```bash
bash "$Y" "site:vc.ru <topic>" --out json
bash "$Y" "host:habr.com <topic>" --out json
```

The third call depends on the topic: `site:dzen.ru` (blogs), `site:secrets.tbank.ru` / `site:sberbusiness.live`
(business media of banks), `site:incrussia.ru`. `site:` = host + subdomains, `host:` = exact host,
**`domain:` is a TLD zone, NOT a host** (do not use it for platforms).

### Layer 3 — Freshness (0-1 call)

Only via the date operator (a hard filter, ranking stays relevance-based):

```bash
bash "$Y" "<topic> date:>20260601" --out json
```

### Layer 4 — Counter-arguments (1 call)

```bash
bash "$Y" "<topic> (проблемы | критика | не работает | провал)" --out json
```

On the anchor platforms the counter-argument layer is strong (of the kind "71% adopted it — 11% actually work") —
if Layer 2 already gave counter-arguments, this call can be skipped.

## Pitfalls (verified 2026-08-06)

1. **The main failure mode is SILENT QUERY EXPANSION, not an empty result set.** Yandex silently
   strips the quotes from long exact phrases (`<reask rule=Unquote>`) and throws out rare
   tokens, always returning 20 "plausible" URLs — even for a meaningless query.
   Defence: (a) keep exact phrases short (1-3 words); (b) with a quoted term,
   check that it actually occurs in the title/passages of the results — otherwise discard the results;
   (c) when in doubt, re-run the query with `--raw` and check the `<reask>` block;
   (d) `found` is NOT an indicator that the topic exists — it grows even on garbage.
2. `<error code="15">` / found=0 is the regular "nothing found", NOT a failure: do not retry.
3. Results are unstable between calls (~15-18% URL drift) — do not compare repeated runs.
4. A negative keyword does not cut a different token ("-бу" will not remove "б/у").

## Citation rules

- **Return only single-line values in the schema.** Raw Yandex passages contain
  literal line breaks and control characters; inserted as-is into schema fields
  (context, findings) they break the StructuredOutput JSON output — the channel fails AFTER
  successful research (case 2026-08-06). Glue passages into one line with spaces,
  context ≤300 characters, no tabs and no line breaks.
- Citation prefixes: [y1], [y2], ... Admiralty — by the type of source behind the URL (of the pages, not of Yandex).
- Take the nature of the unique layer into account: dzen.ru and corporate blogs are more often C-E (content marketing),
  business media (incrussia.ru, secrets.tbank.ru) — B-C. Do not pass SEO listicles off as expertise.
- Snippets from `--out json` are enough for most citations; the full page text — only when necessary,
  via the page-text ladder (`bash {PLUGIN_ROOT}/scripts/jina-read.sh "<url>"` → `firecrawl_scrape` with `proxy:"auto"`), NOT via Yandex.

## Degradation (NO fallback to Brave)

Exit 2 (no key) / 3 (API error) / 4 (timeout) or systematic errors → **no retries**:
return sourceQuality="LOW", empty citations, mark in findings "Yandex channel unavailable (exit N)";
for a 403 that names a folder write "billing suspended or role missing (HTTP 403)"; a Bright Data
failure after its own retry (exit 3/5) → "Yandex via Bright Data unavailable (exit N)".
**Do NOT fall back to Brave** — the open web already covers the web channel; duplicating its results
under the [y] prefix is harmful (it breaks the family logic of verification). Do NOT crash the workflow.
