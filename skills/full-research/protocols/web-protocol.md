# Web — search protocol for the agent (Brave Search)

## MCP tools

### Brave Search (content + search) + Firecrawl (targeted scraping)

| Tool | Purpose |
|---|---|
| `mcp__plugin_jadlis-research_brave-search__brave_llm_context` | **Default for research**: returns the EXTRACTED CONTENT of pages for a query (not just links) — covers most needs without scraping |
| `mcp__plugin_jadlis-research_brave-search__brave_web_search` | Keyword-based discovery of sources — when you need the LINKS THEMSELVES / coverage (+`extra_snippets`) |
| `defuddle parse <url> --md` (Bash, CLI 0.19.3) | **Default snapshot writer**: the full text of ONE page verbatim, 0 credits (extraction ladder — Layer 3) |
| `mcp__plugin_jadlis-research_firecrawl__firecrawl_scrape` | Anti-bot / JS pages — the LAST rung of the ladder; never for PDFs and x.com (the plugin hook denies it) |

**CRITICAL:** Before using any tool — load it via ToolSearch if it is unavailable.
**RATE LIMIT:** Brave (Search plan): 50 req/s — **parallel calls are OK** (several tool calls in one message). Firecrawl scrape: 1 req/s. On 429 — wait 1 s, retry (max 2x).

## CONTENT-FIRST Protocol

### Layer 1 — Content + discovery (2-4 calls, IN PARALLEL in one message)

**Mandatory pair (in one message):**
```
brave_llm_context(query="<expanded query on the topic>", count=30, maximum_number_of_urls=12)
brave_web_search(query="<topic keywords>", count=10, extra_snippets=true)
```

> **Knobs of `brave_llm_context` — verified 2026-08-06.** Of all the tuning parameters, only two
> actually work:
> - `count` — the width of the funnel (the number of results CONSIDERED, not returned). 20→30 yields
>   fundamentally new sources, including the primary sources the rest cite.
> - `maximum_number_of_urls` — **the only hard cap**: ask for 8 — get exactly 8.
>
> **IGNORED (do not pass, this is noise in the call):** `maximum_number_of_snippets`,
> `maximum_number_of_snippets_per_url`, `maximum_number_of_tokens_per_url`,
> `context_threshold_mode` (the `strict` mode had no effect whatsoever — neither on volume nor on junk).
> `enable_source_metadata` adds a useful `site_name`, but drags along a long favicon URL for every
> source — a pure waste of tokens. `maximum_number_of_tokens` works only as a rough guide
> (8192→2048 ≈ −4× the volume).
>
> **Duplicates eat the budget:** the same document regularly arrives under 2 URLs (PDF mirrors —
> `media.defense.gov` and `nsa.gov` for one report). In the probe this was 21–29 % of all snippets, up to a third
> of the budget. No parameter cures this — deduplicate by title/content on the agent side
> (see Layer 2).

> **`extra_snippets` on `brave_web_search` is enabled BY DEFAULT** — up to 4 fragments per
> result arrive even if you did not ask for them. An explicit `extra_snippets=false` cuts the payload ≈fourfold —
> use it for refining/top-up calls where only the URLs are needed.

**Second pair — counterarguments / an alternative angle (in one message):**
```
brave_llm_context(query="<criticism, problems, comparisons on the topic>", count=30, maximum_number_of_urls=12)
brave_web_search(query="<query from an alternative angle>", count=8)   # optional
```

QUERY PHRASING RULES:
- For `brave_web_search`: the query = keywords, NOT a description of the page
  - BAD: "comprehensive analysis of AI agent frameworks and their adoption in enterprise"
  - GOOD: "AI agent frameworks enterprise adoption comparison 2026"
- For `brave_llm_context`: an expanded query is acceptable (the tool extracts the relevant content itself)
- For fresh information: `freshness="pm"` (month) or `freshness="pw"` (week)
- Search the platform in its own language: use the LANGUAGES / QUERIES block from the orchestrator prompt; when `languages` contains anything beyond ru/en, Read `{PLUGIN_ROOT}/skills/full-research/references/language-layers.md` first (native-term dictionary).
- For Russian-language topics: the query in Russian (details — the "RU topics" block below)

**RU topics (verified 2026-08-06).** The driver of how "Runet-heavy" the results are is **the language of the query, not geo**:
- `country="RU"` (+`search_lang="ru"`, `ui_lang="ru-RU"`) yielded only **2 new domains out of 16** with
  85 % URL overlap — cosmetics, not worth a separate call. **Not recommended.**
- What works: a query in Russian + `freshness="pm"` — **3 new domains out of 10** in the probe,
  including fresh industry rankings with prices. Freshness is a stronger lever for RU result diversity than geo.
- **Channel gap:** Russian business media (`rb.ru`, `cnews.ru`, `tadviser.ru`, `forbes.ru`, `rbc.ru`)
  are **never** returned by Brave **under any parameters** — the RU results are an SEO layer (vendor and
  integrator blogs + rankings). This gap is closed by the optional yandex channel
  (`yandex-protocol.md`), not by tweaking Brave's parameters.

### Layer 1b — Semantic pass (Exa, 1 call, after the Brave layer)

Exa is an embedding index: it catches pages that keyword-Brave does not find (A/B 08–09.2026: overlap of the top-5 domains between the engines ≈0.23; a tie on quality, but different sets of sources). The query = **a description of the target page** as a natural phrase, without operators or quotes:

```bash
python3 {PLUGIN_ROOT}/scripts/websearch.py exa "<description of the target page: e.g. practitioner blog post explaining how X works in production>" --tag research -n 8 --out json
```

- **Key gate:** `exit 2` = no `EXA_API_KEY` → SKIP the layer silently (not a fallback, not a channel error).
- RU topic → add `--type keyword` (auto/fast drift toward English-language sources).
- The results go into the same Layer 2 candidate pool marked with the source `exa`; URL duplicates against the Brave results are collapsed. Exa-only candidates go through the same selection and full-text fetch (Layer 3), and their reliability badge is no higher than the rest.
- Budget: 1 call (2 for a narrow topic with different angles); $0.007/call.

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

The order of the rungs is fixed (stack audit 2026-09: verbatimness and price). A rung has closed
the page (body ≥ ~1 000 characters, not challenge markup) → do not go further. Write the real rung
into the snapshot header: `Extractor: <pdf-fetch|defuddle|jina|exa-full|tavily|firecrawl>`.
There is no `timeout` utility on macOS — set the time limit with the Bash tool's `timeout` parameter.

1. **PDF URL** (`.pdf`/`/TXT/PDF/`/`?format=pdf`) → ONLY `out=$(bash {PLUGIN_ROOT}/scripts/pdf-fetch.sh "<url>")` → `Read "$out"` (0 cr). `exit 2` (PDF_UNREACHABLE/PDF_EMPTY — JS gate, scan, paywall) → a scientific article by DOI → an Unpaywall OA link → `pdf-fetch.sh` again; as a last resort — `firecrawl_scrape` with `parsers:["pdf"]` AND `pdfOptions.maxPages ≤ 20` (the plugin hook lets nothing else through). Without escalation — cite from the snippets with the mark "(reconstructed)".
2. **HTML — the default:** `defuddle parse "<url>" --md` (Bash, `timeout: 60000`; on 403 — `-u "<browser User-Agent>"`) → stdout = clean markdown of the main content (it strips navigation itself; probe 2026-09-06: a Cloudflare doc → 1.1 KB of clean text versus 18 KB from Reader with menus). Empty / < 1 000 characters / challenge text → rung 3.
3. **CSR / JS render:** `curl -s --max-time 45 "https://r.jina.ai/<url>"` (Reader, keyless; probe 2026-09-06 — 200, 18 KB; the timeout is mandatory — it hangs on heavy pages). Empty → rung 4.
4. **URL-exact index:** `python3 {PLUGIN_ROOT}/scripts/websearch.py contents "<url>" --full` (Exa contents, ~$0.001/page; **always `--full`** — the default truncates to 8 000 characters, and a truncated piece does not close the gate).
5. **Tavily extract — only with the key `TAVILY_API_KEY`** in `env` of settings.json (there is NO keyless mode: without a key `POST /extract` → 401 "missing or invalid API key", checked 2026-09-06): `curl -s --max-time 30 -X POST https://api.tavily.com/extract -H "Authorization: Bearer $TAVILY_API_KEY" -H 'Content-Type: application/json' -d '{"urls":["<url>"]}'` → `.results[0].raw_content`. No key → the rung is skipped silently.
6. **Anti-bot — the last rung:** `mcp__plugin_jadlis-research_firecrawl__firecrawl_scrape(url, formats=["markdown"], onlyMainContent=true)`; on failure → retry with `waitFor: 5000`. **Never** for PDFs (rung 1) and x.com/twitter.com (an AI retelling for 30 credits, the hook denies it; tweets — the twitter channel). Behind a login — Playwright MCP only.

No rung produced a body → mark the URL `[SOURCE UNAVAILABLE]`, the citation — MEDIUM at most, "[no-snapshot: blocked]".

### Layer 4 — Supplementation (optional, 0-2 calls)

If gaps remain:
- **The second page (the first set of results is exhausted):** `brave_web_search(query="<the same query>", count=10, offset=1)`
  — in the probe on 2026-08-06 it gave **10/10 new URLs, zero overlap**; cheaper and more reliable than
  rephrasing the query. The ceiling is `offset=9` (~100 results per query).
- Domain-filtered search: `brave_web_search(query="...", goggles="$discard\n$site=specific-site.com")`
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
2. **Draft / fallback — Brave Place:** `mcp__plugin_jadlis-research_brave-search__brave_place_search`
   with **`country="PL"` MANDATORY** (without it the results drift to the US; measured
   precision: Brave 6.2 vs Google 8.2). Good for a rough map of options.
3. **Fallback — Serper** ($1/1000) — only if 1-2 are unavailable and the place
   is critical for the answer.

The results of the place layer are ordinary citations with reliability (a Google Maps card =
a review aggregator, usually C; the venue's own site = A/E depending on context). Opening hours
and prices must be CROSS-CHECKED against the venue's site — cards go stale.

## Budget: 5-10 calls (+1 Exa, +0-3 place layer for local topics)

| Layer | Calls | Mandatory |
|-------|---------|-------------|
| 1. Content+discovery | 2-4 | Yes (in parallel) |
| 2. Evaluation | 0 | Yes (analysis) |
| 3. Full-text fetch | 2-5 | Yes for all HIGH citations |
| 4. Supplementation | 0-2 | No |

## Fallback

1. On a failure of `brave_llm_context` → continue on `brave_web_search` (+`extra_snippets`) and Layer 3. On a failure of `brave_web_search` → retry with a rephrased keyword query + `count=5`. Max 2 retries.
2. The full text of a page — only via the Layer 3 ladder (defuddle → jina → Exa `--full` → Tavily
   when a key is present → Firecrawl last); Playwright MCP — **only for logged-in sessions**.
3. If all channels fail → record `[WEB SOURCE UNAVAILABLE]` and finish with what you have.

### Google-layer slots (off by default)

1. **Serper fallback — ONLY if the env var `SERPER_API_KEY` is set** (check with Bash `test -n "$SERPER_API_KEY"`), and ONLY when a query needs Google operators that Brave handles poorly — `site:` on a non-English platform, `filetype:`, an exact phrase in quotes. Then call `curl -s -X POST https://google.serper.dev/search -H "X-API-KEY: $SERPER_API_KEY" -H 'Content-Type: application/json' -d '{"q":"<query>","num":10,"gl":"<country>","hl":"<lang>"}'` and read `.organic[]` (title/link/snippet). No key → skip silently, Brave stays the engine.
2. **DataForSEO slot** — reserved for non-Google engines (Bing/Naver/Baidu SERP API). Not enabled, no deposit; do not call anything, this is a placeholder note: enabled in tranche 4 after the owner's trial.

Before using any tool — load it via ToolSearch if it is unavailable.
