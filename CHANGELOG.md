# Changelog — jadlis-research

Формат: [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/), версии — [SemVer](https://semver.org/lang/ru/).
История до 1.0.0 — плагин `jadlis-research` 1.0.0–1.3.0 в репо [jadlis-hub](https://github.com/beCyborg/jadlis-hub) (`plugins/jadlis-research/CHANGELOG.md` до split).

## [Unreleased]

## [2.3.0] — 2026-09-19

### Для человека

- Канал Telegram ищет через отдельный Premium-аккаунт (скрипт `tgsearch.py` из скилла
  `/telegram-search`), если на машине есть его сессия: глобальный поиск по всем публичным
  каналам, поиск чатов по названию, поиск внутри каналов и чатов за окно дат, комментарии в
  обсуждениях, похожие каналы. Раньше были только превью t.me и дорки через Brave — теперь это
  запасной режим, когда сессии нет.
- Платных глобальных поисков ресёрч берёт не больше трёх за прогон и оставляет два на день
  владельцу; Stars не тратит никогда.
- Утверждение, найденное в Telegram, первый верификатор теперь перепроверяет в самом Telegram
  (бесплатные команды), а не на Reddit/HN.
- `/jadlis-research:research-settings` показывает, в каком режиме работает Telegram.

### For agents

- `protocols/telegram-protocol.md`: Step 0 mode pick (`whoami` + `limits`), NATIVE mode (command
  table with costs, slot budget ≤ min(3, remains − 2), no `--pay-stars`, exit-code handling, layers,
  citations `?comment=`, snapshot `Extractor: tgsearch`), the old contour kept as "Free mode".
  Script path: `$TGSEARCH_PY`, default `~/.claude/skills/telegram-search/scripts/tgsearch.py`.
- `workflows/full-research-core.js`: `TG_CMD` + a Telegram branch in `sameFamilyCommunityTools`
  (free `csearch`/`comments`/`similar`/`chats` only, Brave `site:t.me` fallback); `tgsearch` in the
  snapshot Extractor enum.
- `research-sources.py`: `telegram_mode()` — channel detail reports native vs free mode (file checks,
  no network). `sources.json` telegram degrade/cost texts.
- `tools/smoke-core.mjs`: check for the Telegram same-family tool.
- Requires `tgsearch.py` with the session lock (parallel verifier calls queue instead of hitting
  `database is locked`).

## [2.2.0] — 2026-09-17

### Для человека

- Проверка утверждений теперь идёт по двум семьям источников отдельно: первый верификатор
  оспаривает утверждение там, где оно найдено (с Reddit → на Reddit, с HN → на HN, из X → через
  TwitterAPI.io, из веба → через Brave), второй берёт другую семью. У каждого утверждения ровно
  один голос от веба и один от сообществ — раньше оба голоса могли оказаться «вебом».
- Веб и сообщества разошлись → новый статус «расхождение семей» (`FAMILY-SPLIT`): его больше не
  добивает третий веб-голос Codex. В отчёте появляется подраздел «Веб и сообщества расходятся» с
  обеими версиями и строкой «Приоритет: веб | сообщества» по типу утверждения (факт → веб, опыт →
  сообщества). В выводы такое утверждение попадает только с пометкой о расхождении.
- В «Проверенных фактах» видно, какая семья подтвердила: «(2 голоса: веб + сообщества)» или
  «(1 голос — только сообщества)».

### For agents

- `workflows/full-research-core.js`: ledger schema v5. `voteFamilies()` assigns verifier #1 the
  claim's own macro-family (`community` for any community origin, else `web`) and verifier #2 the
  other one; `verifyPrompt` gets a SAME-FAMILY lens with platform tools (`sameFamilyCommunityTools`:
  Reddit / HN / `twitterapi.sh` / regional layers via Brave `site:`; Substack/YouTube/Telegram fall
  back to Reddit+HN) and a family lock (silence → UNCHECKED, never switch family).
- `VERIFY_SCHEMA` + required `searchedVia`; ledger claims carry `votes` as `family:verdict`,
  `familyVotes`, `leadFamily`, `leadVerdict`, `searchedVia[]`.
- `aggregate()`: CONFIRMED vs CHALLENGED/OUTDATED across families → `FAMILY-SPLIT` (credibility
  ≥ 3, lead family by `claimType`), no Codex; Codex escalation remains for a single exclusion
  against UNCHECKED. `ledgerSummary.familySplit`, frontmatter `claims_family_split`,
  `ANALYST_SCHEMA.familySplitClaims`, canonical heading `### Веб и сообщества расходятся`.
- `tools/smoke-core.mjs`: `run(args, hooks)` with a `verify` hook; new block covers vote order by
  origin, FAMILY-SPLIT for both lead families, Codex still called for a lone exclusion,
  `searchedVia`, prompt lens texts.
- Docs: SKILL.md Phase B/C (ledger v5, `claims_family_split`, canonical section),
  `docs/tier/README*.md` step 6 and the example, `codex-web-protocol.md` escalation rule.

## [2.1.0] — 2026-09-14

### Для человека

- Новая команда `/jadlis-research:research-settings`: одна таблица по всем источникам — провайдеры,
  14 каналов и слои с ключами, у каждого настройка, доступ и что теряется без него.
- Источник можно выключить насовсем: два состояния, `auto` (доступ проверяется перед прогоном) и
  `off` (не используется и не проверяется — ни вызова, ни секунды на пробу). Выключается и провайдер
  целиком (Grok, Codex), и отдельный канал.
- Настройки переживают обновление плагина — они лежат рядом с плагином, а не в его папке; пропадают
  только при удалении без `--keep-data`, после переустановки хватает одной команды.
- Grok выключен — канал `grokweb` больше не предлагается, а `twitter` идёт по ключевым словам через
  TwitterAPI.io с фолбэком на Brave `site:x.com`: семантического угла в выдаче нет, это ожидаемо.
- Обзор тира (`docs/tier/README.md`, `docs/tier/README.en.md`) переписан: списки вместо mermaid-схем,
  Codex назван обязательным, в таблице ключей появился `TWITTERAPI_IO_KEY`.

### For agents

- New script `skills/research-settings/scripts/research-sources.py` (stdlib, py3.9-compatible):
  `status`, `resolve`, `set`, `reset`, `catalogue`. Exit codes: 0 ok · 1 usage/unknown key ·
  2 data dir not writable · 3 catalogue unreadable · 4 settings file corrupt.
- `resolve --channels … --json` is consumed by the research skill and replaces the four inline gates
  (Grok probe, Codex quota probe, Yandex and YouTube key gates) with one Bash call.
- `workflows/full-research-core.js` takes three new args: `channelNotes`, `providersOff`,
  `sourceDropped`; the run result carries `sourceSettings`.
- Codex off → escalation is skipped with `escalationSkipped: 'provider-off'`.
- Channel-state vocabulary grows by two values: `disabled-by-settings` and `no-access`.
- The Grok probe grep is extended with `usage limit|SuperGrok|free Grok Build` — the old
  `402|balance exhausted|Payment Required|unauthenticated` pattern missed the current refusal text.
- Fail-closed for Grok: if the resolve script fails (no JSON, exit≠0, timeout), `grokweb` is dropped
  and `twitter` gets the constant GROK DISABLED note — never a fallback to the Grok-first path.

## [2.0.0] — 2026-09-10

### Для человека

- Плагин переименован: `research` → `jadlis-research`. Строка установки теперь
  `claude plugin install jadlis-research@jadlis`, маркетплейс добавляется командой
  `claude plugin marketplace add https://github.com/beCyborg/jadlis-hub`.
- Короткая команда `/research` не изменилась; полная форма стала `/jadlis-research:research`.
- Совместимости со старым именем нет: снеси `research@jadlis` и поставь `jadlis-research@jadlis` заново.
- Зависимость тоже переехала: нужен плагин `jadlis-search` (раньше `search`), ключи Brave и
  Firecrawl заводятся при его установке.
- В README (RU + EN) обновлены строки установки, обновления и переустановки; добавлен обзор тира
  `docs/tier/` (RU + EN) — он раньше жил в репо хаба.

### For agents

- `.claude-plugin/plugin.json`: `name` = `jadlis-research`, `version` = 2.0.0, dependency
  `{"name":"jadlis-search","version":"^2"}`.
- Namespaces: MCP tools `mcp__plugin_jadlis-search_*`, agents `jadlis-research:*`
  (`agentType` в `workflows/full-research-core.js`), skill command `/jadlis-search:keys`.
- Skill folders and `${CLAUDE_PLUGIN_ROOT}` paths unchanged; entry skill frontmatter `name: research`.
- CI caller: `beCyborg/jadlis-hub/.github/workflows/plugin-ci.yml@main`.
- Release tag prefix: `jadlis-research--vX.Y.Z`.

## [1.0.0] — 2026-09-07

### Для человека

- Первый релиз под именем `research`: выделен из `jadlis-research` 1.3.0 (репо на плагин, команда `/research`).

### For agents

- Split of `jadlis-research` 1.3.0 by `tools/split-research.py` (hub). Namespaces: MCP tools `mcp__plugin_search_*`, agents `research:*`, commands `/search`, `/search:keys`, `/research`, `/science-research`, `/verif`.
