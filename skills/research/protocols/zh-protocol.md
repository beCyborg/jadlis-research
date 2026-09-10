# China (V2EX / Juejin / Zhihu) — search protocol for the agent (language layer `zh`)

Trigger-scoped layer (Plan 2, tranche 3): enabled when the topic lives on Chinese platforms or
`languages` contains `zh`. Never part of the default set. Own source family `zh`.
Not connected on purpose: XHS (Xiaohongshu), Weibo, Bilibili, any Apify workaround.

## Tools

| Tool | Purpose |
|---|---|
| `python3 {PLUGIN_ROOT}/scripts/feed-fetch.py source v2ex <node>` | V2EX node Atom feeds (`create` = 分享创造, `programmer`, `ideas`, `career`); rules of the node require a write-up with numbers, not a bare link — good first-person material |
| `python3 {PLUGIN_ROOT}/scripts/feed-fetch.py source juejin <query>` | Juejin has no public feed: the script returns the Brave query to run (exit 3). Trial with a manual cap: ≤3 Brave calls per run |
| `mcp__plugin_jadlis-search_brave-search__brave_web_search` | Zhihu ONLY through Brave in Chinese (`site:zhihu.com 独立开发者 收入`) — no direct crawl; Juejin the same |
| Extraction ladder (web-protocol.md, Layer 3) | V2EX threads: `defuddle parse "<url>" --md`; Zhihu/Juejin bodies are JS-gated → `r.jina.ai`, then Exa `--full`; Firecrawl last |

**MANDATORY first step:** Read `{PLUGIN_ROOT}/skills/research/references/language-layers.md` —
the term is `独立开发者`; `月入3万` and `副业赚钱` lead to content farms. Seed = the `zh` entry of
the QUERIES block; expand with `独立开发 收入`, `独立开发者 月收入`, `出海 独立开发`.

## Protocol

### Layer 0 — V2EX node feeds (2-3 calls)

```bash
python3 {PLUGIN_ROOT}/scripts/feed-fetch.py source v2ex create --limit 20 --filter "<topic regex in Chinese>"
python3 {PLUGIN_ROOT}/scripts/feed-fetch.py source v2ex programmer --limit 20 --filter "<topic regex>"
```
Feeds carry the opening post in full (300-3 000 chars) — a filtered feed entry can be a snapshot
(`--snapshot-dir {WORK_DIR}/snapshots --prefix zh`), but prefer the thread page through defuddle
for HIGH (replies matter).

### Layer 1 — Brave in Chinese (2-4 calls)

```json
{ "query": "site:zhihu.com <zh query>", "count": 10 }
{ "query": "site:juejin.cn <zh query>", "count": 10 }
{ "query": "<zh query> 2025 OR 2026", "count": 10, "freshness": "py" }
```
Juejin cap: ≤3 calls per run; Zhihu answers are cited from the search-engine excerpt unless the
ladder returns a body ≥1 000 chars.

### Layer 2 — Full text for HIGH (2-4 URLs)

Ladder order as in web-protocol.md Layer 3. Snapshot `{WORK_DIR}/snapshots/zh<N>.md`, header
`URL:` / `Date:` / `Prefix: [zhN]` / `Extractor: <defuddle|jina|exa-full|feed-fetch>` + `---`.
A body shorter than 1 000 chars keeps the citation at MEDIUM.

### Layer 3 — Counterarguments (1-2 calls)

Brave: `<zh query> 失败 OR 放弃 OR 亏损` (failure / gave up / loss); V2EX `create` feed filtered by
`失败|放弃|教训`. Output section: `## Counterarguments (found on China layer)`.

## Citation rules

- Quotes stay in Chinese; context in English. Numbers in the source's units (元/万).
- Admiralty: V2EX first-person write-up with numbers — C; Zhihu answer by a named practitioner — C,
  anonymous — D; Juejin column with affiliate links — E.
- Not more than 3 citations from one thread.

## Budget: 8-12 calls (Juejin ≤3)

## Fallback

V2EX feed exit 2 → Brave `site:v2ex.com` in Chinese; nothing anywhere → `sourceQuality=LOW`.
