# Korea (tistory / Velog / Disquiet) — search protocol for the agent (language layer `ko`)

Trigger-scoped layer (Plan 2, tranche 3): enabled when the topic lives on Korean platforms or
`languages` contains `ko`. Never part of the default set. Own source family `ko`.
Naver (Client ID needs 휴대폰 인증 by the owner) is not connected until registration.

## Tools

| Tool | Purpose |
|---|---|
| `python3 {PLUGIN_ROOT}/scripts/feed-fetch.py source velog <user>` | Velog per-user RSS (`v2.velog.io/rss/@user`), full post bodies |
| `python3 {PLUGIN_ROOT}/scripts/feed-fetch.py source tistory <blog>` | tistory blog RSS (`<blog>.tistory.com/rss`), full or excerpt depending on the blog setting |
| `python3 {PLUGIN_ROOT}/scripts/feed-fetch.py source disquiet <query>` | Disquiet is a SEARCH TARGET only (no feed, ClaudeBot rule): the script returns the Brave query (exit 3) |
| `mcp__plugin_jadlis-search_brave-search__brave_web_search` | discovery in Korean: `site:tistory.com 1인 개발자 수익`, `site:velog.io …`, `site:disquiet.io …` |
| Extraction ladder (web-protocol.md, Layer 3) | tistory/velog pages: `defuddle parse "<url>" --md`; Disquiet: quote the search excerpt only |

**MANDATORY first step:** Read `{PLUGIN_ROOT}/skills/research/references/language-layers.md` —
the term is `1인 개발자`; `인디해커` is a calque. First person lives in tistory blogs under the
income-disclosure tag (`수익 공개`, `월 매출`); Brunch mostly translates English cases (E).
Seed = the `ko` entry of the QUERIES block.

## Protocol

### Layer 0 — Brave discovery in Korean (2-3 calls, parallel)

```json
{ "query": "site:tistory.com <ko query>", "count": 10 }
{ "query": "site:velog.io <ko query>", "count": 10 }
{ "query": "site:disquiet.io <ko query>", "count": 10 }
```
Parse `<blog>.tistory.com` and `velog.io/@<user>` from the results.

### Layer 1 — Author feeds (2-4 calls)

```bash
python3 {PLUGIN_ROOT}/scripts/feed-fetch.py source tistory <blog> --limit 12 --filter "<topic regex in Korean>"
python3 {PLUGIN_ROOT}/scripts/feed-fetch.py source velog <user> --limit 12 --filter "<topic regex>"
```
Judge the author by the feed: cadence, ≥6 months of posts, first person with numbers.

### Layer 2 — Full text for HIGH (2-4 URLs)

`defuddle parse "<url>" --md` → `{WORK_DIR}/snapshots/ko<N>.md`, header `URL:` / `Date:` /
`Prefix: [koN]` / `Extractor: <defuddle|feed-fetch>` + `---`. Velog feed bodies are complete and
may be written as snapshots directly (`--snapshot-dir … --prefix ko`). Disquiet: excerpt only →
MEDIUM at most.

### Layer 3 — Counterarguments (1-2 calls)

Brave: `<ko query> 실패 OR 포기 OR 수익 없음` (failure / gave up / no revenue).
Output section: `## Counterarguments (found on Korea layer)`.

## Citation rules

- Quotes stay in Korean; context in English; amounts in 원 as written.
- Admiralty: tistory/velog first-person revenue post — C (B with a track record); Disquiet
  product page — E; Brunch translations — E.

## Budget: 8-12 calls

## Fallback

Feed exit 2 → Brave `site:` in Korean; nothing anywhere → `sourceQuality=LOW`.
