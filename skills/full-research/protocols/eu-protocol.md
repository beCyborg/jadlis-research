# EU (DOU / Golem / heise / Xataka / Menéame / Wykop) — search protocol for the agent (language layer `eu`)

Trigger-scoped layer (Plan 2, tranche 3): enabled when the topic lives on Ukrainian / German /
Spanish / Polish platforms or `languages` contains `uk`, `de`, `es`, `pl`. Never part of the
default set. Own source family `eu`. Status per platform: DOU — adopt (label UA); Golem — adopt;
heise — feed only until the owner decides on robots; Xataka — filler; Menéame — API + RSS with a
silent 403; Wykop — after the owner registers at dev.wykop.pl (`WYKOP_API_KEY`).

## Tools

| Tool | Purpose |
|---|---|
| `python3 {PLUGIN_ROOT}/scripts/feed-fetch.py source dou\|golem\|heise\|xataka\|meneame` | one shared fetcher; heise/Golem/Xataka feeds are site-wide (filter with `--filter`), DOU is the forum feed, Menéame is the front page |
| `python3 {PLUGIN_ROOT}/scripts/feed-fetch.py source wykop <query>` | needs `WYKOP_API_KEY`; without it returns the Brave query (exit 3) |
| `python3 {PLUGIN_ROOT}/scripts/feed-fetch.py source stackexchange <site>::<query>` | cross layer: Stack Exchange API v2.3 keyless (300/day, honours `backoff`, ≤30 req/s) |
| `python3 {PLUGIN_ROOT}/scripts/feed-fetch.py source mastodon <instance>::<tag>` | cross layer: Mastodon public tag timelines (instead of Bluesky) |
| `mcp__plugin_jadlis-research_brave-search__brave_web_search` | discovery in the platform language: `site:dou.ua <uk query>`, `site:wykop.pl <pl query>`, `site:golem.de <de query>`, `site:xataka.com <es query>` |

**MANDATORY first step:** Read `{PLUGIN_ROOT}/skills/full-research/references/language-layers.md`
(dictionary for uk/de/es/pl + the ClaudeBot rule). Seed = the matching entries of the QUERIES block.

## ClaudeBot-block / Content-Signal rule (heise, Golem, Menéame, Disquiet)

Read the feed or API, quote the search-engine result, NEVER crawl the article body. Check
`robots.txt` on a typical content page, not the front page. A citation from such a site carries
`Extractor: feed-fetch` and relevance MEDIUM at most. DOU, Xataka and Wykop threads may be
extracted with defuddle.

## Protocol

### Layer 0 — Feeds with a topic filter (2-4 calls)

```bash
python3 {PLUGIN_ROOT}/scripts/feed-fetch.py source dou --limit 30 --filter "<uk topic regex>"
python3 {PLUGIN_ROOT}/scripts/feed-fetch.py source golem --limit 30 --filter "<de topic regex>"
python3 {PLUGIN_ROOT}/scripts/feed-fetch.py source meneame --limit 30 --filter "<es topic regex>"
```
Menéame answers 403 to some networks without a message → exit 2, skip silently.

### Layer 1 — Brave in the platform language (2-4 calls)

```json
{ "query": "site:dou.ua <uk query>", "count": 10 }
{ "query": "site:wykop.pl <pl query>", "count": 10 }
```

### Layer 2 — Full text for HIGH (2-4 URLs, allowed sites only)

DOU / Xataka / Wykop: `defuddle parse "<url>" --md` → `{WORK_DIR}/snapshots/eu<N>.md`, header
`URL:` / `Date:` / `Prefix: [euN]` / `Extractor: <defuddle|feed-fetch>` + `---`. heise / Golem /
Menéame: feed excerpt only, MEDIUM.

### Layer 3 — Cross layer (1-2 calls)

`stackexchange stackoverflow::<en query>` for technical claims; `mastodon mastodon.social::<tag>`
for practitioner chatter. Output section: `## Counterarguments (found on EU layer)`.

## Citation rules

- Quotes in the original language (uk/de/es/pl); context in English. Label DOU citations `UA`.
- Admiralty: DOU forum first person — C; Golem/heise editorial — B; Xataka — D (filler); Menéame
  comment — D; Wykop — C.

## Budget: 8-12 calls

## Fallback

Feed exit 2 → Brave `site:` in the platform language; nothing anywhere → `sourceQuality=LOW`.
