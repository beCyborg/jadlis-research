# Japan (Qiita / Hatena / Zenn / note) — search protocol for the agent (language layer `ja`)

Trigger-scoped layer (Plan 2, tranche 3): enabled by the routing tree of SKILL.md when the topic
lives on Japanese platforms or `languages` contains `ja`. Never part of the default set. Own
source family `ja` — its agreement with the web engines counts as independent triangulation.

## Tools

| Tool | Purpose |
|---|---|
| `python3 {PLUGIN_ROOT}/scripts/feed-fetch.py source <name> <arg>` | one shared fetcher: `qiita <query>` (API v2, 60 req/h per IP — one anchor query), `hatena <query>` (Bookmark search RSS, follows the 301, paginate with `--page N` only), `zenn <topic>` (topic feed), `note <user>` (per-author RSS) |
| `mcp__plugin_search_brave-search__brave_web_search` | discovery in Japanese: `site:qiita.com 個人開発 収益`, `site:note.com …`, `site:zenn.dev …` — Brave returns Japanese pages only for a Japanese query |
| Extraction ladder (web-protocol.md, Layer 3) | full text for HIGH citations: `defuddle parse <url> --md` first (Qiita/Zenn/note allow it), then `r.jina.ai`, then Exa `--full` |

**MANDATORY first step:** Read `{PLUGIN_ROOT}/skills/research/references/language-layers.md` —
the living term is `個人開発`; `インディーハッカー` is written by translators and schools. Take the `ja`
entry of the QUERIES block from the orchestrator prompt as the seed and expand with the platform's
own terms (`個人開発 収益`, `個人開発 売上 報告`, `月間売上`, `個人開発 失敗`).

## Protocol

### Layer 0 — Anchor query (2-4 calls, in parallel)

```bash
python3 {PLUGIN_ROOT}/scripts/feed-fetch.py source qiita "<ja query>" --limit 20 --filter "<topic regex>"
python3 {PLUGIN_ROOT}/scripts/feed-fetch.py source hatena "<ja query>" --limit 20
python3 {PLUGIN_ROOT}/scripts/feed-fetch.py source zenn "<topic slug, e.g. 個人開発 → kojinkaihatsu or the Zenn topic id>" --limit 20
```
Qiita: exactly ONE anchor query per run (60 req/h per IP is shared with everything else on this
machine). Hatena: page 2 only if page 1 gave ≥5 relevant entries (`--page 2`). Zenn topic feeds
carry excerpts only (~200-300 chars) — discovery, not evidence.

### Layer 1 — Brave in Japanese (2-3 calls)

```json
{ "query": "site:note.com <ja query>", "count": 10 }
{ "query": "<ja query> 2025 OR 2026", "count": 10, "freshness": "py" }
```
Parse `note.com/<user>` authors from the results → per-author feeds:
`feed-fetch.py source note <user> --limit 12`.

### Layer 2 — Full text for HIGH (2-5 URLs)

Qiita, Zenn and note allow extraction: `defuddle parse "<url>" --md` → snapshot
`{WORK_DIR}/snapshots/ja<N>.md` with the header `URL:` / `Date:` / `Prefix: [jaN]` /
`Extractor: defuddle` and a `---` line. Feed excerpts written via
`feed-fetch.py … --snapshot-dir {WORK_DIR}/snapshots --prefix ja` carry `Extractor: feed-fetch`
and are shorter than 1 000 chars → the gate keeps such citations at MEDIUM; use them for
discovery and for MEDIUM citations, not for HIGH.

### Layer 3 — Counterarguments (1-2 calls)

Brave: `<ja query> 失敗 OR 辞めた OR 稼げない` (failure / quit / cannot earn), Hatena: `hatena "<topic> 失敗"`.
Output section: `## Counterarguments (found on Japan layer)`.

## Citation rules

- Quotes stay in Japanese (original language); context in English.
- Admiralty: first-person revenue report with numbers and a product link — C (B for a known
  author with ≥6 months of reports); Qiita "まとめ" articles — D; sponsored notes — E.
- Not more than 3 citations from one author; mark translator/school posts as E.

## Budget: 8-12 calls

## Fallback

`feed-fetch.py` exit 2 (feed unreachable/empty) → Brave `site:<platform>` in Japanese; nothing on
any platform → `sourceQuality=LOW`, empty citations, the workflow continues.
