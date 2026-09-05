# Telegram — search protocol for the agent

Channel added 2026-08-15. Routing: RU topics, custdev — per the SKILL.md tree, NOT default.
The setup is COMPLETELY free: no MTProto, no TGStat (not renewed — wiggly-hollerith
decision), no Deaddrop (paid). Only public web previews and search dorks.

## Tools

| Tool | Purpose |
|---|---|
| `mcp__plugin_jadlis-research_brave-search__brave_web_search` with `site:t.me` | Discovery of channels and posts — the main one |
| Yandex (`yandex-search.sh`, if the yandex channel is selected for the run) | RU dorks `site:t.me` — the Runet index goes deeper |
| `{PLUGIN_ROOT}/scripts/tg-preview.sh <handle>` | Reading a public channel: the last ~20 posts in FULL text, pagination `--before <msg_id>` |
| `{PLUGIN_ROOT}/skills/full-research/references/telegram-seed-handles.md` | 44 AI / vibe-coding channels (vc.ru/3060557) — seeds for AI topics |

## Protocol

### Layer 0 — Discovery (2-3 calls)

Search the platform in its own language: use the LANGUAGES / QUERIES block from the orchestrator prompt; when `languages` contains anything beyond ru/en, Read `{PLUGIN_ROOT}/skills/full-research/references/language-layers.md` first (native-term dictionary).

1. Dorks over posts and channels:
```json
brave_web_search({ "query": "site:t.me <ТЕМА по-русски>", "count": 15, "extra_snippets": true })
```
2. Channel roundups: `подборка telegram каналов <тема>` (vc.ru / habr — donors of handles).
3. AI topics → take the relevant ones straight from `{PLUGIN_ROOT}/skills/full-research/references/telegram-seed-handles.md`.

Parse handles out of the URLs: `t.me/<handle>` and `t.me/s/<handle>`; `t.me/+...` are
private invite links, they are NOT readable, discard them.

### Layer 1 — Liveness check + reading (3-6 Bash calls)

```bash
{PLUGIN_ROOT}/scripts/tg-preview.sh <handle>
```
~20 latest posts with full text + dates. exit 3 (`TG_NO_PREVIEW`) —
a channel without a web preview / private: this does NOT mean "there are no posts", discard the handle with a note.
A dead channel (posts older than ~6 months) is a weak source, same as in Substack.

### Layer 2 — Topic depth (2-4 calls)

For the 2-3 most relevant channels — paginate into the history:
```bash
{PLUGIN_ROOT}/scripts/tg-preview.sh <handle> --before <msg_id>
```
(msg_id is printed to stderr by the previous call). Pinpoint search for posts on the topic —
again Brave: `site:t.me/<handle> <ключевое слово>`.

### Layer 3 — Counterarguments (1-2 calls)

Brave: `site:t.me <ТЕМА> проблемы/не работает/развод/отзывы` — Telegram is rich in
negative experience, but also in paid-placement posts (see reliability below).

## Citation rules

- Prefixes: [tg1], [tg2], ... The citation URL is the direct permalink `https://t.me/<handle>/<msg_id>`.
- reliability: TG channels are structurally prone to E (ads / paid integrations are not labeled;
  the channel admin = an interested source). B — only for established expert
  channels with a track record; "roundup of services" posts are almost always E.
- Forwards: cite the ORIGINAL channel (in the preview a forward is marked), not the reposter —
  otherwise circular reporting.
- There are NO comments in the preview (t.me/s does not serve discussions) — do not build
  a "community opinion" out of a single channel.
- SNAPSHOTS (schema v4): the tg-preview output is already full text; for HIGH citations
  save it to `{WORK_DIR}/snapshots/tg<N>.md`. File name = citation prefix (`tgN.md`);
  header lines `URL:`, `Date:`, `Prefix: [tgN]`, `Extractor: tg-preview`, then a `---` line,
  then the full text. A file shorter than ~1 000 characters does not close the gate (MEDIUM);
  HIGH without a snapshot → MEDIUM + "[no-snapshot: blocked]".

## Budget: 8-14 calls

## Paid layer (NOT activated)

Telemetrio $25/mo (Stripe, a Polish card — the ruble blocker that stopped TGStat is not in the way) —
connect ONLY on the trigger from the council verdict: "≥30% of RU claims fail because of
missing TG sources across 5 runs in a row" (counted from the
--channels/ledger telemetry). Until the trigger — the free setup above. Do NOT renew TGStat.

## Fallback

tg-preview.sh failed (network / t.me markup changed) → cite from Brave snippets
with the note "(reconstructed)"; the channel's sourceQuality is then no higher than MEDIUM.
