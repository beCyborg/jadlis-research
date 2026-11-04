# Web — search protocol for the agent (Exa + Brave)

## Engine choice (audit 2026-11, read first)

**Exa `lite` is the default engine for every intent except news.** Blind test 2026-11 on 50 real
queries of the owner (5 engines, two judges of different families): mean rank Exa `auto` 2.14,
Exa `lite` 2.16, Brave 2.96. `lite` = `auto` in quality (p = 0.74), both beat Brave 32 : 12
(p = 0.004), `lite` is 43 % cheaper ($0.004 vs $0.007) — Russian queries included (Exa `lite` was
the best on RU, rank 1.92). **Brave is the engine for news and freshness** (best for both judges on
news queries) and the content layer `brave_llm_context`. Domain scoping goes through Exa
`--include-domains`, not `site:` (the 11 `site:` queries had no reliable winner, every score ≤ 4.3).

## Tools

| Tool | Purpose |
|---|---|
| `python3 {PLUGIN_ROOT}/scripts/websearch.py exa "<page description>" --tag research` (Bash) | **Default discovery** (type `lite` by default): an embedding index — the query is a description of the target page |
| `mcp__plugin_jadlis-search_brave-search__brave_llm_context` | Content layer: returns the EXTRACTED CONTENT of pages for a query (not just links); always with `maximum_number_of_tokens` |
| `mcp__plugin_jadlis-search_brave-search__brave_web_search` | **News / freshness** (`freshness="pw"`/`"pm"`) and keyword top-ups (+`extra_snippets`) |
| `bash {PLUGIN_ROOT}/scripts/jina-read.sh "<url>"` (Bash; r.jina.ai with `JINA_API_KEY` from the Keychain, 500 req/min) | **Default snapshot writer** for HTML: the full text of ONE page (extraction ladder — Layer 3) |
| `mcp__plugin_jadlis-search_firecrawl__firecrawl_scrape` | Anti-bot / JS pages — the LAST HTML rung (`proxy:"auto"`); for PDFs only as the last PDF rung (`parsers:["pdf"]`), never for x.com (the plugin hook denies it) |

**CRITICAL:** Before using any tool — load it via ToolSearch if it is unavailable.
**RATE LIMIT:** Brave (Search plan): 50 req/s — **parallel calls are OK** (several tool calls in one message). Exa `/search`: 10 QPS. Firecrawl scrape: 1 req/s. On 429 — `websearch.py` waits and retries twice by itself; for MCP calls wait 1 s, retry (max 2x).
**HTTP 402 = stop that engine, do not retry.** `websearch.py` answers `STOP … 402` without a network call for 15 minutes after a 402 (on 30.10.2026 a series made 888 calls in an hour after `USAGE_LIMIT_EXCEEDED`); a Brave MCP call that returns 402 means the same for Brave. Switch to the other engine for the rest of the run and note it in the channel file.

## CONTENT-FIRST Protocol

### Layer 1 — Discovery + content (2-4 calls, IN PARALLEL in one message)

**Mandatory pair (in one message):**
```bash
python3 {PLUGIN_ROOT}/scripts/websearch.py exa "<description of the target page: e.g. practitioner blog post explaining how X works in production>" --tag research -n 10 --out json
```
```
brave_llm_context(query="<expanded query on the topic>", count=30, maximum_number_of_urls=12, maximum_number_of_tokens=4096)
```

**News / freshness topic** (an event, a release, «за неделю / за месяц», prices that change) → add
Brave in the same message — it is the news engine:
```
brave_web_search(query="<topic keywords>", count=10, freshness="pw", extra_snippets=true)   # "pm" for a month
```

**Second pair — counterarguments / an alternative angle (in one message):**
```bash
python3 {PLUGIN_ROOT}/scripts/websearch.py exa "<page that criticises / compares / reports problems with the topic>" --tag research -n 10 --out json
```
```
brave_llm_context(query="<criticism, problems, comparisons on the topic>", count=30, maximum_number_of_urls=12, maximum_number_of_tokens=4096)
```

**Exa rules:**
- The query = **a description of the target page** as a natural phrase, without operators or quotes; 1-2 words give scatter. Keep `-n` ≤ 10-15 — better 2-3 queries from different angles.
- **Type:** keep the script default (`lite`). `auto` has the same quality for $0.007 instead of $0.004 and is slower; **never `--type keyword`** (legacy; on Russian queries it lost 14 : 0 to the semantic types in R3 — fewer results, less Cyrillic, older pages).
- **RU topic → Exa in Russian, a full sentence** (Exa `lite` was the best engine on RU queries, rank 1.92).
- **Domain scoping → `--include-domains a.com,b.org`** (and `--exclude-domains …`, `--start 2026-01-01 --end …` for dates), not `site:` in the query.
- **Exa does not index reddit.com** — 0 results, no error. Reddit threads are the reddit channel's job (or Brave `site:reddit.com`).
- **Key gate:** `exit 2` = no `EXA_API_KEY` anywhere (env, `~/.config/exa/key`, Keychain via `scripts/secret.sh`) → Brave takes over discovery: `brave_web_search(query="<topic keywords>", count=10, extra_snippets=true)` in place of every Exa call (keyword query, not a page description). Not a channel error.
- **Output shape (`--out json`):** an envelope, not a list — `{"_meta": {"engine", "mode", "http", "latency_ms", "cost_usd", "cost_src", "n_res", "err"}, "response": {"results": [{"url", "title", "publishedDate", "author", "highlights": [...]}, ...]}}`. Take the list from `.response.results` (`r[:8]` on the top level fails with `KeyError`); e.g. `... --out json | jq -r '.response.results[] | [.publishedDate[0:10], .url, .title] | @tsv'`. Highlights run up to ~8 KB per result. URLs only → `--out urls`.

> **Knobs of `brave_llm_context` — verified 2026-08-06, token cap added 2026-11.**
> - `count` — the width of the funnel (the number of results CONSIDERED, not returned). 20→30 yields
>   fundamentally new sources, including the primary sources the rest cite.
> - `maximum_number_of_urls` — **the only hard cap on sources**: ask for 8 — get exactly 8.
> - `maximum_number_of_tokens` — **always pass it: 4096 when you need sources** (the default call),
>   **8192 only when you need the page text itself** in the answer. It works as a rough guide
>   (8192→2048 ≈ −4× the volume). Without it one answer ran to ~36k characters, 16 times per run
>   (audit 2026-11: ≈2 300 Brave MCP calls in 38 runs). The 4096/8192 values are **not bench-tested
>   for quality** — if a 4096 answer misses the content you need, repeat that one query with 8192.
>
> **IGNORED (do not pass, this is noise in the call):** `maximum_number_of_snippets`,
> `maximum_number_of_snippets_per_url`, `maximum_number_of_tokens_per_url`,
> `context_threshold_mode` (the `strict` mode had no effect whatsoever — neither on volume nor on junk).
> `enable_source_metadata` adds a useful `site_name`, but drags along a long favicon URL for every
> source — a pure waste of tokens.
>
> **Duplicates eat the budget:** the same document regularly arrives under 2 URLs (PDF mirrors —
> `media.defense.gov` and `nsa.gov` for one report). In the probe this was 21–29 % of all snippets, up to a third
> of the budget. No parameter cures this — deduplicate by title/content on the agent side
> (see Layer 2).

> **`extra_snippets` on `brave_web_search` is enabled BY DEFAULT** — up to 4 fragments per
> result arrive even if you did not ask for them. An explicit `extra_snippets=false` cuts the payload ≈fourfold —
> use it for refining/top-up calls where only the URLs are needed.

QUERY PHRASING RULES:
- For Exa: a description of the page (see above).
- For `brave_web_search`: the query = keywords, NOT a description of the page
  - BAD: "comprehensive analysis of AI agent frameworks and their adoption in enterprise"
  - GOOD: "AI agent frameworks enterprise adoption comparison 2026"
- For `brave_llm_context`: an expanded query is acceptable (the tool extracts the relevant content itself)
- For fresh information: Brave with `freshness="pm"` (month) or `freshness="pw"` (week)
- Search the platform in its own language: use the LANGUAGES / QUERIES block from the orchestrator prompt; when `languages` contains anything beyond ru/en, Read `{PLUGIN_ROOT}/skills/research/references/language-layers.md` first (native-term dictionary).
- For Russian-language topics: the queries in Russian (details — the "RU topics" block below)

**RU topics (Brave part verified 2026-08-06).** Exa `lite` in Russian goes first (see above). For the Brave
calls the driver of how "Runet-heavy" the results are is **the language of the query, not geo**:
- `country="RU"` (+`search_lang="ru"`, `ui_lang="ru-RU"`) yielded only **2 new domains out of 16** with
  85 % URL overlap — cosmetics, not worth a separate call. **Not recommended.**
- What works: a query in Russian + `freshness="pm"` — **3 new domains out of 10** in the probe,
  including fresh industry rankings with prices. Freshness is a stronger lever for RU result diversity than geo.
- **Channel gap:** Russian business media (`rb.ru`, `cnews.ru`, `tadviser.ru`, `forbes.ru`, `rbc.ru`)
  are **never** returned by Brave **under any parameters** — the RU results are an SEO layer (vendor and
  integrator blogs + rankings). Exa `--include-domains rb.ru,tadviser.ru,…` reaches named domains; the
  deep Runet layer is the optional yandex channel (`yandex-protocol.md`).

- The Exa and Brave results go into one Layer 2 candidate pool marked with their source; URL duplicates
  are collapsed. Every candidate goes through the same selection and full-text fetch (Layer 3); no engine
  raises a reliability badge.
- Budget: 2 Exa calls ($0.004 each) + 2 `brave_llm_context` + 0-1 news `brave_web_search`.

### Layer 2 — Evaluation and selection (0 calls)

Analyze the Layer 1 results:
1. **Deduplicate BEFORE selecting citations**: one document arrives under different URLs (PDF mirrors, an agency
   site + an aggregator) — compare by title/content, not by URL. In the probe such duplicates took up
   as much as a third of the snippets; citing them twice = a false "confirmed by two sources".
2. Rank by relevance + domain authority
3. Content from llm_context is acceptable for MEDIUM/LOW citations — use it directly
4. **HIGH relevance — ONLY from the full text (the depth rule, 2026-08-15).** A web_search
   snippet and an llm_context fragment are 150–800 characters out of a page; a "HIGH" citation
   based on them is a citation based on the cover. For every source that will go into the report with
   relevance HIGH: fetch the FULL page via the Layer 3 extraction ladder and cite from
   the full text. The full text must be written as a snapshot to `{WORK_DIR}/snapshots/<prefix>N.md`
   (schema v4, header `URL:` / `Date:` / `Prefix: [<prefix>N]` / `Extractor: <what really extracted the text>` + `---`, then the full text) — **a HIGH citation without
   a snapshot is not allowed**: could not obtain the full text (paywall/challenge) → MEDIUM at most
   + the mark "[no-snapshot: blocked]"; a file shorter than ~1 000 characters does not close the gate.
5. Choose the URLs for the full-text fetch (all future HIGHs) — usually 3-5

### Layer 3 — Full-text fetch: the extraction ladder (2-5 URLs: all HIGH candidates + gaps)

The order of the rungs is fixed (bench 2026-11 on 60 real research pages, ground truth = a headless
Chromium render: this ladder took 56 of 57 pages with 0 false accepts — the one miss was a Reddit
thread no extractor read; the old defuddle-first ladder took 54 with 2 silently truncated bodies).
A rung has closed the page (the body passed the gate below) → do not go further. Write the real rung
into the snapshot header: `Extractor: <pdf-fetch|jina|firecrawl>`.
There is no `timeout` utility on macOS — set the time limit with the Bash tool's `timeout` parameter.

**Gate — a body is accepted only if ALL hold:**
1. ≥ 1 000 characters are left after removing `data:…;base64,…` blobs and `<Base64-Image-Removed>`;
2. base64 / `data:` URIs take < 30 % of the body;
3. the script matches the expected language (RU page: Cyrillic ≥ 50 % of letters; EN page: CJK < 5 %);
4. no block phrase in a short body («Just a moment», «Access denied», «captcha», «verify you are human»);
5. when a quote is known (a snapshot for a citation): the quote is in the body verbatim or ≥ 80 % of
   its 6-word shingles — **compare after stripping** Markdown link targets `](…)`, bare URLs, all
   punctuation and `_`, lowercased, whitespace collapsed (a link inside the phrase otherwise breaks
   the match and rejects a correct body).
The old «≥ ~1 000 chars» rule let through a base64 loader GIF, a zh-CN copy of a Google doc and a site footer.

1. **PDF URL** (`.pdf`/`/TXT/PDF/`/`?format=pdf`) — its own ladder, in this order:
   1. `out=$(bash {PLUGIN_ROOT}/scripts/pdf-fetch.sh "<url>")` → `Read "$out"` (0 cr). `exit 2` (PDF_UNREACHABLE/PDF_EMPTY — JS gate, 403 behind Akamai, scan, paywall) → next rung. A scientific article with a DOI → try its Unpaywall OA link with `pdf-fetch.sh` first.
   2. `bash {PLUGIN_ROOT}/scripts/jina-read.sh "<url>"` (same rules as rung 2 below; 5 of 6 PDFs in the bench).
   3. Last resort — `firecrawl_scrape` with `parsers:["pdf"]` AND `pdfOptions.maxPages ≤ 20` (the plugin hook lets nothing else through; a 17-page PDF cost 17 credits).
   Key numbers may sit only inside raster figures — `pdftotext` then returns the captions without the values; read the cached original `.pdf` with the `pages` parameter. Nothing worked → cite from the snippets with the mark "(reconstructed)".
2. **HTML — the default: r.jina.ai** (renders JS in a browser; 52 of 57 alone, 0 false accepts):
   ```bash
   eval "$(bash {PLUGIN_ROOT}/scripts/secret.sh --export JINA_API_KEY 2>/dev/null)"   # once per agent; no key is fine
   bash {PLUGIN_ROOT}/scripts/jina-read.sh "<url>"   # key from the Keychain; exit 3 = Jina or the target refused → rung 3
   ```
   Bash `timeout: 90000`. **Keyless = ~20 requests/minute per IP**, and the parallel channels share
   the IP: pause 3–4 s between your Jina calls (`sleep 3` before the next one), never fire them in
   parallel. With `JINA_API_KEY` the limit is lifted. **HTTP 429 → go to rung 3 for this URL, do not
   loop.** RU pages are slow on Jina (median 13 s in the bench) — that is not a failure. Body fails the
   gate / 403 / challenge text → rung 3.
3. **Anti-bot / JS — the last HTML rung:** `mcp__plugin_jadlis-search_firecrawl__firecrawl_scrape(url, formats=["markdown"], onlyMainContent=true, proxy="auto")`; on failure → retry once with `waitFor: 5000`. About 1 page in 20 needs it (Revolut, idealista-class anti-bot pages). **HTML only** — never for PDFs outside the PDF ladder (rung 1.3) and never for x.com/twitter.com (an AI retelling for 30 credits, the hook denies it; tweets — the twitter channel).
4. **Reddit URLs — not this ladder.** Every extractor is blocked on reddit.com (the bench miss). A Reddit thread that matters → the reddit channel tools: Reddit MCP `fetch_comments` or `python3 {PLUGIN_ROOT}/scripts/reddit-archive.py comments <id> --compact` (see `reddit-protocol.md`).
5. **Behind a login** → Playwright MCP only.

**Not in the ladder any more** (bench 2026-11): defuddle (added no page beyond Jina + Firecrawl on 57
pages and let 2 truncated bodies through as first rung), Exa `contents` (partial pages 3× in 57),
Tavily keyless (429 at volume and 3 truncated bodies), Crawl4AI (its venv is gone).

No rung produced a body → mark the URL `[SOURCE UNAVAILABLE]`, the citation — MEDIUM at most, "[no-snapshot: blocked]".

### Layer 4 — Supplementation (optional, 0-2 calls)

If gaps remain:
- **Another Exa angle** — a different description of the target page, or `--start <date>` for fresh pages.
- **Domain-filtered search:** `websearch.py exa "<page description>" --tag research --include-domains specific-site.com` (not `site:`; Brave alternative — `goggles="$discard\n$site=specific-site.com"`).
- **The second Brave page (the first set of results is exhausted):** `brave_web_search(query="<the same query>", count=10, offset=1)`
  — in the probe on 2026-08-06 it gave **10/10 new URLs, zero overlap**; cheaper and more reliable than
  rephrasing the query. The ceiling is `offset=9` (~100 results per query).
- Search for fresh data: `brave_web_search(query="...", freshness="pw")`
- **Ready-made Q&A — only for product / consumer / comparison topics:**
  `brave_web_search(query="...", result_filter=["web","faq"])` — returns question/answer pairs of
  150–650 characters with the source URL. On technical topics it gives exactly **0** — do not spend the call.
  Risk when citing: FAQ blocks are pulled out of the markup of 2-3 domains, this is not an aggregate over the
  results — do not present them as consensus.
- `result_filter=["infobox"]` is **useless** for research: it comes back empty (these are entity
  cards — a company/person/place, not an answer to a wordy question).

> **BUG in `result_filter` (reproduced 2026-08-06).** ANY single non-`web` type
> (`faq`, `infobox`, `discussions`, …) → the error `No web results found`, 0 results.
> The scope of the bug is wider than the known "discussions". The rule: **always combine with `"web"`** —
> `result_filter=["web","faq"]`, `["web","discussions"]`.

## Place layer — local/everyday topics ("find a place") (0-3 calls)

Triggers when the topic is about physical places (a venue, a clinic, a service,
a shop, sport — "where in Warsaw / city X…"). The verdict of the research "The search stack of
Claude Code — 2026-08":

1. **Primary — Google Places API (New) Text Search** via our own script:
   ```bash
   {PLUGIN_ROOT}/scripts/places-fetch.sh "<place query in Russian or Polish>" --lang ru --limit 8
   ```
   `regionCode=PL` is hardcoded; the field mask is fixed (Enterprise SKU, free tier
   1000/month — research volumes are free). exit 3 = `PLACES_KEY_MISSING` —
   the key has not been issued yet (a user gate) → step 2.
2. **Draft / fallback — Brave Place:** `mcp__plugin_jadlis-search_brave-search__brave_place_search`
   with **`country="PL"` MANDATORY** (without it the results drift to the US; measured
   precision: Brave 6.2 vs Google 8.2). Good for a rough map of options.
3. **Fallback — Serper** ($1/1000) — only if 1-2 are unavailable and the place
   is critical for the answer.

The results of the place layer are ordinary citations with reliability (a Google Maps card =
a review aggregator, usually C; the venue's own site = A/E depending on context). Opening hours
and prices must be CROSS-CHECKED against the venue's site — cards go stale.

## Budget: 6-12 calls (+0-3 place layer for local topics)

Reality (telemetry v5, 72 runs, Fan-out phase, 71 agents; before the 2026-11 engine switch): median
34 tool calls per agent — Brave 16 (p90 23), Exa 1, text extraction 11; median 9 snapshots per run
instead of "3-5". Median 389 s (p90 577 s). Audit 2026-11: `brave_llm_context` without a token cap
returned ~36k characters per call — the cap in Layer 1 is the main saving.

| Layer | Calls | Mandatory |
|-------|---------|-------------|
| 1. Content+discovery | 2-4 | Yes (in parallel) |
| 2. Evaluation | 0 | Yes (analysis) |
| 3. Full-text fetch | 2-5 | Yes for all HIGH citations |
| 4. Supplementation | 0-2 | No |

## Fallback

1. Exa fails (`exit 2` no key, `STOP … 402`, exit 3/4) → Brave `brave_web_search` (+`extra_snippets`) takes over discovery with keyword queries. On a failure of `brave_llm_context` → continue on Exa + `brave_web_search` and Layer 3. On a failure of `brave_web_search` → retry with a rephrased keyword query + `count=5`. Max 2 retries; a 402 is never retried.
2. The full text of a page — only via the Layer 3 ladder (PDF: pdf-fetch → r.jina.ai → Firecrawl
   `parsers:["pdf"]`; HTML: r.jina.ai → Firecrawl `proxy:"auto"`; Reddit → the Reddit tools);
   Playwright MCP — **only for logged-in sessions**.
3. If all channels fail → record `[WEB SOURCE UNAVAILABLE]` and finish with what you have.

### Google-layer slots (off by default)

1. **Serper fallback — ONLY if `SERPER_API_KEY` resolves** (`eval "$(bash "{PLUGIN_ROOT}/scripts/secret.sh" --export SERPER_API_KEY)"; test -n "${SERPER_API_KEY:-}"` — env, then the macOS Keychain), and ONLY when a query needs Google operators that Brave handles poorly — `site:` on a non-English platform, `filetype:`, an exact phrase in quotes. Then call `curl -s -X POST https://google.serper.dev/search -H "X-API-KEY: $SERPER_API_KEY" -H 'Content-Type: application/json' -d '{"q":"<query>","num":10,"gl":"<country>","hl":"<lang>"}'` and read `.organic[]` (title/link/snippet). No key → skip silently, Brave stays the engine.
2. **DataForSEO slot** — reserved for non-Google engines (Bing/Naver/Baidu SERP API). Not enabled, no deposit; do not call anything, this is a placeholder note: enabled in tranche 4 after the owner's trial.

Before using any tool — load it via ToolSearch if it is unavailable.
