# Changelog — jadlis-research

Формат: [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/), версии — [SemVer](https://semver.org/lang/ru/).
История до 1.0.0 — плагин `jadlis-research` 1.0.0–1.3.0 в репо [jadlis-hub](https://github.com/beCyborg/jadlis-hub) (`plugins/jadlis-research/CHANGELOG.md` до split).

## [Unreleased]

## [2.10.3] — 2026-11-04 — текст страниц через Jina с ключом / page text via Jina with a key

### Для человека

- Каналы снимают текст страниц скриптом `jina-read.sh`: он берёт ключ Jina из Связки ключей (500 запросов в минуту), поэтому параллельные каналы не упираются в лимит и реже уходят в платный Firecrawl.

### For agents

- Changed: `protocols/web-protocol.md` (tool table, PDF rung 2, HTML rung 2) and `protocols/yandex-protocol.md` call `bash {PLUGIN_ROOT}/scripts/jina-read.sh "<url>"` instead of a bare `curl https://r.jina.ai/…`; exit 3 → next rung.
- Changed: `scripts/` re-vendored from `jadlis-search--v2.4.0` (adds `jina-read.sh`); `sources.json` lists `JINA_API_KEY`.
- Changed: `plugin.json` version 2.10.2 → 2.10.3.

## [2.10.2] — 2026-11-04 — канал Яндекса переживает пустую выдачу Bright Data / Yandex channel survives an empty Bright Data page

### Для человека

- Скрипты обновлены из jadlis-search 2.3.2: запрос к Яндексу через Bright Data сам повторяется, если пришла пустая страница.

### For agents

- Changed: `scripts/` re-vendored from `jadlis-search--v2.3.2` (`yandex-bd.py` retries pages without `serp-item`).
- Changed: `plugin.json` version 2.10.1 → 2.10.2.

## [2.10.1] — 2026-11-04 — канал Яндекса через Bright Data / Yandex channel via Bright Data

### Для человека

- Канал yandex снова работает: пока Yandex Cloud не оплачен, запросы идут через Bright Data (решение владельца 04.11). Раньше проверка доступа видела 403 от Yandex API и выключала канал.
- Запрос через Bright Data занимает около минуты, поэтому протокол канала теперь запускает 4–6 запросов параллельно одной командой.

### For agents

- Changed: `research-sources.py` Yandex probe runs the API only (`YANDEX_BACKEND=yandex`, no Bright Data call) and reports `ok` with «канал через Bright Data» when the API fails or has no key but `BRIGHTDATA_API_KEY` is present; `sources.json` lists `BRIGHTDATA_API_KEY`, `BRIGHTDATA_ZONE`.
- Changed: `protocols/yandex-protocol.md` — Bright Data backend note (the API-down mark, ~1 min per query, parallel queries in one Bash call with `timeout: 300000`, rare dates), page text via the r.jina.ai → Firecrawl ladder, Bright Data failure wording.
- Changed: `scripts/` re-vendored from `jadlis-search--v2.3.1` (6 h API-down mark in `yandex-search.sh`).
- Tests: probe uses `YANDEX_BACKEND=yandex`; 403 + Bright Data key → ok; no API key + Bright Data key → ok.
- Changed: `plugin.json` version 2.10.0 → 2.10.1.

## [2.10.0] — 2026-11-04 — каналы по итогам аудита инструментов / channels per the 2026-11 tools audit

### Для человека

- Канал web ищет через Exa типа `lite` по умолчанию, Brave — для новостей; текст страницы снимается лестницей pdf-fetch → r.jina.ai → Firecrawl с гейтом и проверкой цитаты. Основание — слепой тест на 50 реальных запросах и 60 реальных страницах за три месяца.
- Reddit: треды ищутся сначала через Brave `site:reddit.com`, потом глобальным `reddit_search` (89 % релевантных против 45 % у поиска по сабреддитам). Деревья reddit-alt и RSS убраны; записаны даты закрытия API Reddit (RSS — 13.11.2026, весь публичный доступ — март 2027) и запасной путь через Arctic Shift.
- Hacker News и Substack: треды и посты ищутся через Exa с фильтром домена — родной поиск площадок оказался последним. Substack больше не начинает с авторов.
- X: два бэкенда — TwitterAPI.io и TwittrAPI; переход на TwittrAPI сам случится, когда кончится баланс TwitterAPI.io.
- YouTube выбирается только для практических тем. Видео — отдельная семья источников, только если автор показывает свой тест; пересказ чужого источника второй семьёй не считается. За три месяца YouTube дал новое знание в 1 из 84 ключевых утверждений.
- Telegram: новый поиск каналов и чатов — посев, проверка внутри канала, расширение через похожие каналы, упоминания и группы комментариев. Каталоги вроде TGStat убраны.
- Codex: убран флаг, который ничего не делал; живой поиск держит `config.toml`.
- Яндекс: проверка доступа идёт синхронным вызовом; 403 с папкой означает приостановленный биллинг или нет роли. Скрипт сам уходит в Bright Data, если API недоступен.
- Репозиторий теперь живёт на GitHub: https://github.com/becyb-org/jadlis-research. GitLab остаётся копией и CI. Лицензия — Apache-2.0.

### For agents

- Changed: `skills/research/protocols/` — `web-protocol.md` (Exa lite default, Brave news, `maximum_number_of_tokens` for `brave_llm_context`, ladder + gate), `reddit-protocol.md` (Layer 0 Brave `site:reddit.com` → `reddit_search`; dialog `fetch_comments` until March 2027, then `reddit-archive.py comments --compact`; no reddit-alt trees, no RSS), `hackernews-protocol.md` (Exa lite `--include-domains`; Algolia for trees/by-date/points), `substack-protocol.md` (Exa lite → Brave → `substack-fetch.py`; `PAYWALL_PREVIEW`), `twitter-protocol.md` (two backends, both JSON shapes, `backend=` marker), `youtube-protocol.md`, `telegram-protocol.md` (seed → verify → expand), `codex-web-protocol.md` (no `-c tools.web_search`), `yandex-protocol.md`.
- Changed: `skills/research/SKILL.md` channel tree — YouTube only for practical topics; `workflows/full-research-core.js` curator: a video is its own family only with the author's own test; verifier `REDDIT_CMD` → Brave `site:reddit.com` + `reddit_search`; Substack handles add to post discovery; the Codex flag removed from the escalation.
- Changed: `skills/research-settings/scripts/research-sources.py` — Yandex probe uses sync `/v2/web/search`; X probe parses both backends of `twitterapi.sh balance`; the twitter channel stays with either `TWITTERAPI_IO_KEY` or `TWITTRAPI_API_KEY`; `sources.json` lists `TWITTRAPI_API_KEY`.
- Changed: `scripts/` and `shared/` re-vendored from `jadlis-search--v2.3.0`.
- Tests: `tests/test_research_sources_probes.py` (+ balance cases), `tests/test_protocol_text_v290.py`, `tools/test-core-v290.mjs` (curator YouTube rule, verifier Reddit route).
- Changed: `plugin.json` version 2.9.1 → 2.10.0, `license` Apache-2.0 (+ `LICENSE`), `homepage`/`repository` → GitHub becyb-org.

## [2.9.1] — 2026-10-19 — дневной лимит поиска выключается / daily search cap can be turned off

### Для человека

- Дневной лимит расходов на поиск ($2) в ресёрче теперь выключается переменной `JADLIS_SEARCH_DAILY_CAP_USD=0`, как в jadlis-search 2.2.4. Без переменной всё как раньше.

### For agents

- Added: `scripts/websearch.py` reads `JADLIS_SEARCH_DAILY_CAP_USD` (`0`/`off` → no daily soft cap; a number → that cap in USD; unset → $2 as before), same change as jadlis-search 2.2.4.
- Changed: `.claude-plugin/plugin.json` version 2.9.0 → 2.9.1.
- Fixed: `tools/sync-shared.sh` no longer replaces `scripts/` wholesale — it copies jadlis-search's scripts over ours and lists the research-only ones it kept (`codex-home.sh`, `tg-channels.py`); the old version deleted them.

## [2.9.0] — 2026-10-12 — куратор «сколько нужно», ledger на диске, проход по цитатам, Codex GPT-6.1 Sol, протоколы по аудиту / curator takes what the decision needs, ledger on disk, citation pass, Codex GPT-6.1 Sol, protocols per the audit

Основание: замеры плана «drifting-starlight» (сводка «Замеры jadlis-research — итоги 2026-10», аудит «Аудит канальных протоколов — 2026-10», ресёрчи «Формат отчёта для решения» и «Остановка поиска по насыщению»).

### Для человека

- Куратор берёт столько тезисов, сколько нужно для решения. Сначала он делит кандидатов на «критично» и «фон». Потом берёт все критичные и добирает фон, только если тезис новый и его можно проверить. До числа он больше не добивает.
- Потолок поднят с 16 до 32 тезисов. Это защита цены, а не цель: прогон стоит столько, сколько тезисов реально нашлось.
- «Несущий» тезис теперь означает одно: на нём держится вывод отчёта. Ожидаем 3–8 таких на прогон. Если их больше 8, лог предупреждает.
- Лог и итог прогона показывают, сколько было кандидатов, сколько критичных взято и сколько отрезал потолок. Так видно, режет ли потолок важное.
- Ядро пишет в папку прогона `_curated.json` (после куратора). `_ledger.json` (после проверки) пишет скилл: скрипт `write-ledger.py` берёт его из файла результата прогона. Модель не может дословно переписать JSON на 100+ КБ — в смоук-прогоне 12.10 такая запись сорвалась. Оба файла можно разбирать без телеметрии.
- Новый флаг `reuseStages: true` пропускает готовые стадии при повторе в той же папке. Если есть `_ledger.json` — сразу пишется отчёт: аналитик сам читает файл, через модель ledger не копируется. Если есть `_curated.json` — куратор не запускается. Если есть все файлы каналов — каналы не ищут заново. Без флага всё работает как раньше.
- Третий голос проверки идёт через Codex GPT-6.1 Sol в режиме priority (Fast) — решение 12.10. Прежняя модель возвращается через `codexModel: 'gpt-6-astra'`.
- Проверщики на Reddit ищут сабреддиты через reddit-alt и берут 25 постов вместо 10. Несуществующие операции в подсказке названы явно.
- Если запрошен язык без своего слоя (ja/zh/ko, а для uk/pl/de/es — eu), ядро пишет об этом в лог. Слой оно не добавляет — решает скилл.
- Перед записью в хранилище скрипт сверяет цитаты отчёта со снимками источников. Модель в этом шаге не участвует.
- Скрипт сверяет каждую цитату из трёх и больше слов («…» или "…") строкой со снимком ссылки рядом. Так же он сверяет числа: проценты, годы и значения из двух и больше цифр.
- В «Методологии и проверке» появится строка «Проверка цитат: N ссылок, M цитат сверено, K не найдено в снимке, L ссылок без снимка». Под ней будут до 10 ненайденных цитат.
- Если цитату в выводе (выше «📚 Контекст и находки») скрипт не нашёл в снимке, он добавит в конец строки «(⚠ цитата не найдена в снимке)». Сам текст и ссылки скрипт не меняет и не удаляет. Причина: в ресёрче автоисправление заменяло верные ссылки неверными.
- Русская цитата из иностранного снимка — это перевод. Строкой её не проверить, поэтому скрипт считает её отдельно и не помечает как ненайденную. Если у источника нет снимка, цитата тоже не считается ненайденной.
- Скрипт сам проверяет себя на реальном снимке прогона: одна заведомо верная и одна заведомо ложная строка. Если проверка не прошла, черновик остаётся как был.
- Прогон на трёх черновиках этапа 9 (A-r1): 280–305 ссылок, из них 115–160 без снимка. Сверить строкой удалось только 0–4 цитаты на отчёт: большинство цитат — переводы или ссылаются на источник без снимка. Чисел сверено 39–82, не найдено 4–7 на отчёт. Я выборочно проверил ненайденные: это настоящие расхождения, ложных срабатываний нет.
- Канал Codex и третий голос проверки переведены на GPT-6.1 Sol. Все вызовы, включая эскалацию, идут на приоритетном тарифе (решение владельца 12.10).
- Промпт Codex больше не просит «источники 2024–2026». Теперь он просит источники за последние 24 месяца от даты прогона.
- Протокол Codex знает сбой «code-mode host» (exit 0, поиска нет): агент делает один повтор и не тратит время на диагностику. Таймаут вызова — 600 с, цифры времени взяты из аудита.
- Протокол twitter описывает рабочий путь: TwitterAPI.io и Brave `site:x.com`. Режим Grok вынесен в отдельный файл и читается, только если Grok снова включат.
- В twitter пустая выдача (0 твитов при rc=0) теперь включает фолбэк на Brave. Запрос Top тоже идёт с `since:`.
- Telegram: убрана фраза «Stars пополнены». Правило теперь такое: платим только бесплатными слотами, пока владелец не пополнит баланс. Добавлена шпаргалка формата вывода `tgsearch` вместо `--help`. Мёртвые фолбэки TGStat и web.telegram.org удалены.
- Web: Exa для русских тем идёт с `--type auto`. Для продуктов, компаний и людей Exa запускается первым. PDF идёт по лестнице без Firecrawl в начале. Описан формат JSON у `websearch.py exa`.
- YouTube: имена инструментов исправлены на полные.
- В каждом канальном протоколе рядом с бюджетом вызовов стоит реальная медиана из телеметрии. Новых лимитов нет.
- Слой `eu` ищет только на сайтах платформ (`site:`), а не в открытом вебе. Пример топика Zenn исправлен.
- Проверка Codex теперь делает настоящий веб-поиск через ту же изолированную папку Codex, что и канал. Если поиск не сработал или Codex пишет «timed out negotiating with the code-mode host», канал codexweb выпадает до старта ресерча. Раньше проверка отвечала «ок», а канал потом умирал.
- Яндекс проверяется одним дешёвым запросом (≈0,03 ₽, ошибки доступа бесплатны). Если ключ без прав (403) или API не принимает запрос (501), канал yandex выпадает с понятной причиной. Результат хранится 2 часа.
- Telegram по умолчанию ищет только в бесплатных слотах и не тратит Stars. Платить Stars можно разрешить командой `set option telegram-stars paid`. Баланс Stars скрипт не показывает: в tgsearch.py нет такой команды.
- В таблице источников Codex теперь называется «Codex CLI (gpt-6.1-sol)».
- YouTube: транскрипт берётся на языке видео, а не дубляж (jadlis-search 2.2.3: `scripts/yt-transcript.py`). Из 2.2.3 взяты также `websearch.py` (дата Brave, Exa `auto` для русских запросов) и `secret.sh`.

### For agents

- Changed: `CLAIM_HARD_CAP` 16 → 32 (cost guard). Curator prompt rewritten: candidates → importance `critical|background` → take all critical, add background only while new and checkable, never pad; `loadBearing` only when a report conclusion rests on the claim (expected 3–8). evidencePrefixes/atomicity rules unchanged.
- Changed: `CURATOR_SCHEMA` — per-claim `importance` (required), top-level `candidates`, `criticalTaken`, `droppedByCap` (required). Ordering by `selectClaims`: loadBearing → critical → background → strength → curator order. Missing `importance` falls back to loadBearing → critical.
- Added: `curation` = `{candidates, returned, taken, criticalTaken, backgroundTaken, loadBearing, droppedByCap, criticalDroppedByCap, curatorReported}` in `synthMeta.curation` and `ledgerSummary.curation`; logged, with warnings for critical claims cut by the cap and for >8 load-bearing. `ledgerSummary.claimsDroppedByCap` kept. Ledger claims carry `importance`; the analyst ledger JSON includes it. `ledgerSchemaVersion` stays 5.
- Added: `${workDir}/_curated.json` (raw curator answer + `curation` + `files`, `queryTitle`) written by a light `persist:curated` agent (effort low) in the background; outcome in `result.stageFiles`; a failed write never fails the run. `${workDir}/_ledger.json` (claimLedger without rawVotes, ledgerSummary, curation, escalationStats, snapshotGate, channelStatus, failedChannels, answeredFamilies, timing, completeness, evidenceHealth, urlhealthSummary, files, queryTitle) is NOT written by the core: the `persist:ledger` agent failed on a 100+ KB payload in the live smoke run (12.10), so `skills/research/scripts/write-ledger.py <workflow-output-file> <workDir>` (stdlib, exit 0/1, atomic write, `indent=1` for chunked Read, re-read check) writes it in SKILL.md Phase C step 0. The result now carries `queryTitle` and `date` for it.
- Added: `args.reuseStages === true` → `reuse:probe` agent runs ONE python3 heredoc (paths and query title as ASCII-escaped JSON) and returns only file sizes, `_curated.json` when ≤ 40 KB (`curatedBytes`), and a ledger verdict `{exists, bytes, queryTitleMatch, claimCount, lengthMatchesTotal, ledgerSummary, completeness, files: [{path, bytes}], error}` — never the claims → pure `reuseDecision`: valid ledger (same queryTitle, claimCount === ledgerSummary.total, its channel files non-empty) skips channels+curator+verification, and the analyst prompt replaces the inline LEDGER JSON with «Read the CROSS-VERIFICATION LEDGER from <workDir>/_ledger.json (field claimLedger) completely before writing» (rest identical); that result returns `claimLedger: []` + `ledgerFromDisk`, Phase C loads the ledger from the file; `_curated.json` > 40 KB is not reused; valid `_curated.json` skips channels+curator (channel results restored by `reuse:<key>` agents from the markdown files); all selected channel files non-empty skips channels only. `result.reusedStages = {channels, curator, verification, notes}` only with the flag.
- Changed: synthesis moved into `finish(x)` (shared by the normal and the reused-ledger path); return shape unchanged plus `languageLayerGaps`, `synthMeta.curation`, optional `stageFiles`/`reusedStages`.
- Changed: `CODEX_MODEL` default `gpt-6.1-sol`, `CODEX_LABEL` `Codex/GPT-6.1 Sol`, escalation `service_tier="priority"`; `args.codexModel` still overrides. Comment records the 12.10 decision and the mini A/B (Sol 28–49% slower than Astra, same sources).
- Fixed: verifier `REDDIT_CMD` — reddit-alt `reddit_search_communities` for discovery, `search_subreddit` with `limit:25`, `fetch_comments` by `url`; names get_post_details/search_all as non-existent; no retries on `banned` (audit R1 R-reddit.md).
- Added: `missingLanguageLayers` — a log note (and `result.languageLayerGaps`) when `languages` has a non-ru/en language whose layer (ja/zh/ko; eu for uk/pl/de/es) is not selected. Family logic untouched.
- Added: `tools/test-core-v290.mjs` (72 checks: pure helpers sliced between `BEGIN/END PURE HELPERS`, mocked runs for curation, stage files, reuse round trip over a real temp workDir — the probe heredoc runs for real, write-ledger.py writes the ledger — Codex defaults, Reddit route, language notes).
- Not in this branch: `skills/research/SKILL.md` does not yet document `reuseStages`, `stageFiles`, `reusedStages`, `languageLayerGaps`, `synthMeta.curation`; `protocols/codex-web-protocol.md` still carries the codexweb channel's own model literals.
- Added: `skills/research/scripts/citation-check.py <draft.md> <workDir> [--json] [--apply]` — deterministic citation pass (stdlib, Python 3.9-compatible, exit 0 always). Badge `[prefix·Badge](URL)` → `snapshots/<prefix>.md`, fallbacks `<prefix>-*.md` / `_*.md` / header `Prefix:` or `URL:`. Quotes ≥3 words are checked against the snapshots of the badge cluster that follows them (back-to-back badges = one cluster); normalisation NFKC + quote/dash forms + ё→е + whitespace + casefold, then a punctuation-free fallback; `…`, `...`, `[…]` split a quote into fragments. Statuses: matched / matched-other-prefix / not-found / translated (Cyrillic quote, non-Cyrillic snapshot) / no-snapshot (any cluster badge lacks a snapshot). Numbers: %, currency, ≥2 digits; `900 000`=`900,000`, dates dd.mm.yyyy → year, dd.mm skipped, list numbering and inline code ignored; the `## Источники` section is not quote-checked. Built-in positive/negative control on a real snapshot (`self_check`); `--apply` is skipped on FAIL.
- Added: `skills/research/SKILL.md` Phase C step 2c «Citation pass» — runs the script with `--apply` (summary line + up to 10 not-found quotes into the «Методология и проверка» callout, before «Полный процесс»; «(⚠ цитата не найдена в снимке)» appended to conclusion lines; idempotent). Explicit rule: never rewrite, replace or delete citations.
- Added: `tests/test_citation_check.py` — fixture draft + snapshots: exact, ellipsis, case, ru→ru, cluster, glob fallback, translated, no-snapshot, fabricated quote, numbers, `--apply` idempotency, exit 0 on a missing file.
- Changed: `codex-web-protocol.md` — model `gpt-6.1-sol` in every command (calls 1–2, escalation, Responses-API replacement); `service_tier="priority"` for the escalation too; decision notes compressed to the 2026-10-12 decision + one-line history; «Prefer 2024-2026 sources» → «Prefer sources from the last 24 months (today is <DATE…>)»; Bash `timeout` 300000 → 600000 ms; «156 s» / «median 1078 s ≈ hangs» replaced with audit numbers (call median 525 s, p90 808 s; agent 1244 s); probe location → `research-sources.py`; CLI version notes → 0.162.1.
- Added: `codex-web-protocol.md` Diagnostics — `timed out negotiating with the code-mode host` (exit 0, 0 `web_search` events) → one retry, then Degradation.
- Changed: `SKILL.md` — description `web (Brave, Exa, Codex)` (Grok dropped); escalation line → GPT-6.1 Sol, rollback `codexModel: "gpt-6-astra"`.
- Changed: `twitter-protocol.md` — rewritten around Mode B (TwitterAPI.io REST → Brave `site:x.com`); 3-line mode note; `since:` mandatory for Top; empty page (rc=0, 0 tweets) triggers the Brave fallback (`freshness: "py"`); honest MEDIUM ceiling (core demotes every x.com URL); «486 s» → v5 median 314 s. Section names `TwitterAPI.io layer` / `Mode B — keyword-only` kept for GROK_OFF_NOTE.
- Added: `protocols/twitter-grok-protocol.md` — Grok CLI Mode A + Mode A complement, read only on `GROK OK`.
- Changed: `telegram-protocol.md` — free daily slots only; Stars only when the owner topped up and the prompt says so; first `BALANCE_TOO_LOW` stops paid calls. Added output-shape cheat sheet (posts/csearch/comments/read JSON, similar/chats, limits/whoami, TSV columns, jq one-liner), `--in`-via-variable warning, `read --limit=5` and `t.me/c/` notes. Removed TGStat and web.telegram.org fallback lines.
- Changed: `web-protocol.md` — Exa RU rule `--type auto` (never `keyword`); Exa first for product/company/people and RU research; documented `{_meta, response.results[]}` envelope; PDF ladder pdf-fetch → r.jina.ai → `websearch.py contents --full` → Firecrawl `parsers:["pdf"]`.
- Fixed: `youtube-protocol.md` tool names → `mcp__plugin_jadlis-search_brave-search__*`, `mcp__plugin_jadlis-search_youtube__*`.
- Changed: budgets in web, codexweb, reddit, twitter, hackernews, substack, telegram, youtube, yandex, eu (+ ja/zh/ko: no telemetry, 0 of 72 runs) now state the v5 medians from `channel-telemetry-v5.md`; caps unchanged.
- Changed: `language-layers.md` — grokweb → twitter in the mandatory-read list; `ja-protocol.md` Zenn example `個人開発` (romanised slug → 404); `eu-protocol.md` Layer 1 searches platform sites only (`site:`), open web belongs to `web`.
- Added: `tests/test_protocol_text_v290.py` — text invariants for the fixes above.
- Not changed (out of scope, needs the core/settings branch): `full-research-core.js:73-78,585` (`CODEX_MODEL = 'gpt-6-astra'`, escalation `service_tier="default"`), `research-sources.py:419-420` (probe literal `gpt-6-astra`, `default`). Until they change, the escalation and the probe still run Astra on `default`.
- Changed: `research-sources.py` `probe_codex` — runs via `scripts/codex-home.sh` (CODEX_HOME), `gpt-6.1-sol`, effort low, `service_tier="priority"`, `tools.web_search={mode="live"}`, `--json`, stdin=DEVNULL; counts completed `web_search` items (fallback: lines with `"web_search`); 0 events or stderr/error-event `timed out negotiating with the code-mode host` → access `fail`; partial output is still parsed on timeout; quota regex applies only to stderr and error events. Cache key `codex-quota` (2 h) and the 90 s global deadline unchanged; CODEX_TIMEOUT 60 → 80 s (capped by the deadline).
- Added: access state `fail` («поиск не работает»), part of BAD_ACCESS → provider unusable, channel dropped.
- Added: probe `yandex-access` (TTL 2 h) — `yandex-search.sh "тест" --no-wait --num 1 --no-log`, only when the key exists (no-key result is not cached). 403/PermissionDenied → `fail` with detail «403 PermissionDenied: у сервисного аккаунта нет роли search-api.webSearch.user»; 401 and 501 «unknown service» → `fail`; 504/timeout → `unknown` (channel kept + warning). `resolve` drops yandex as `no-access`; `status` shows the cached verdict and runs the probe only with `--probe`.
- Added: settings `options.telegram-stars` = `free` (default) | `paid`, via `set option telegram-stars free|paid`; with `free` `resolve` adds `notes.telegram` «STARS: FREE SLOTS ONLY …» (no `--pay-stars`, stop global post search when free slots run out). `status` prints a «Telegram Stars:» line. No Stars-balance read: tgsearch.py has no balance command.
- Changed: `sources.json` — Codex label «Codex CLI (gpt-6.1-sol)», `probe_ids` + `yandex-access`, yandex `probe`/`degrade`/`cost`, telegram `cost`, codex `cost` (probe ≈10 s).
- Changed: research-settings `SKILL.md` — TTL list, `set option`, Codex/Yandex probe semantics, Telegram note.
- Added: `tests/test_research_sources_probes.py` (16 tests, mocked subprocess: Codex/Yandex parsing, command/env/stdin, resolve drop + cache, option).
- Finding 2026-10-12: Yandex async endpoint now answers HTTP 501 `unknown service yandex.cloud.priv.searchapi.v2.WebSearchAsyncService` (was 403 on 11.10) — channel still dead; protocol/yandex-search.sh not touched (out of scope).
- Changed: `scripts/yt-transcript.py`, `scripts/websearch.py`, `scripts/secret.sh` copied from jadlis-search 2.2.3 (`SHARED_FROM.txt` notes the partial sync). Not used: `tools/sync-shared.sh` — it replaces `scripts/` wholesale and would delete the research-only `codex-home.sh` and `tg-channels.py` (follow-up).
- Changed: `skills/research/SKILL.md` Phase B documents `reuseStages`, `stageFiles`, `reusedStages`, `synthMeta.curation` (incl. `criticalDroppedByCap`) and `languageLayerGaps`.
- Changed: version 2.8.0 → 2.9.0.

## [2.8.0] — 2026-10-12 — интейк с брифом и подвопросами / intake brief with sub-questions

### Для человека

- Каналы получают не пересказ вопроса в 1–3 предложения, а бриф: твой вопрос дословно, список условий (C1…), 2–5 независимых подвопросов (S1…) с привязкой к условиям и 1–3 рабочие гипотезы с тем, что их опровергнет. Раньше условия вопроса терялись при пересказе.
- На шаге запуска ты видишь подвопросы и условия и можешь их поправить.
- Уточняющие вопросы интервью приходят одной пачкой.
- Основание — ресёрч «Интейк с подвопросами» (2026-10-11). Выигрыш измерен в литературе только для частей интейка (+6…8 пунктов полноты из 100); на своём пайплайне сравнение не проводилось — владелец решил внедрить без замера.

### For agents

- Changed: `skills/research/SKILL.md` step 4 — one AskUserQuestion batch; `REFINED_QUERY` is now a brief (ВОПРОС (дословно) / УСЛОВИЯ / ПОДВОПРОСЫ / ГИПОТЕЗЫ / ВОЗВРАТ, English labels for an English query, ≤1800 chars); step 7 gate shows the sub-questions and conditions.
- Changed: `workflows/full-research-core.js` — channel file headers use `QUERY_TITLE` (first line of the brief without its label, quotes replaced) instead of the whole multi-line `QUERY`; every prompt still receives the full brief.
- Changed: version 2.7.9 → 2.8.0.

## [2.7.9] — 2026-10-08 — репозиторий переехал на GitLab / repository moved to GitLab

### Для человека

- Плагин теперь живёт на GitLab: https://gitlab.com/beCyborg/jadlis-research. Аккаунт GitHub beCyborg заблокирован, поэтому старые ссылки открывают 404.
- Каталог ставится новой командой: `claude plugin marketplace add https://gitlab.com/beCyborg/jadlis-hub.git`. Если ты уже ставил его со старой ссылки GitHub, удали каталог командой `claude plugin marketplace remove jadlis` и поставь всё заново по README. Плагины этого каталога при удалении тоже снимутся, ключи для `jadlis-search` придётся ввести ещё раз.
- Работа плагина не изменилась.

### For agents

- Changed: every `github.com/beCyborg/*` link in README pairs, `docs/tier/` README pair (images now load from the hub's GitLab raw URL) and `tools/sync-shared.sh` now points to `gitlab.com/beCyborg/*`; `marketplace add` uses the full `https://…/jadlis-hub.git` URL (non-GitHub hosts have no `owner/repo` shorthand).
- Changed: `.claude-plugin/plugin.json` `homepage`/`repository` → GitLab; version 2.7.8 → 2.7.9.
- Changed: CI moved from `.github/workflows/ci.yml` (reusable workflow in `beCyborg/jadlis-hub`) to `.gitlab-ci.yml` including `/ci/plugin-ci.yml` from `beCyborg/jadlis-hub` on GitLab — same checks: `claude plugin validate --strict`, gitleaks full history, README parity, privacy grep.

## [2.7.8] — 2026-10-07 — Повтор на Opus 4.8 после обрыва защитным фильтром / safety-classifier retry

### Для человека

- Если защитный фильтр модели обрывает агента посреди работы, ресёрч теперь это видит. Он повторяет ту же задачу один раз на Opus 4.8. Раньше оборванный канал выглядел как слабый, и сводка писала «Brave не дописал отчёт».
- Повтор работает для всех ролей: каналы, куратор, проверяющие, Codex-эскалация и аналитик.
- Сводка называет обрыв прямо: «web: обрыв защитным фильтром → повтор на Opus 4.8, восстановлен». Если повтор не помог, канал получает статус «оборван фильтром», а не «деградировал».
- Повторов не больше 6 за прогон, поэтому тема с частыми обрывами не удваивает цену.
- Проверяющий, которого фильтр оборвал дважды, считается потерянным голосом, а не «не удалось проверить».

### For agents

- Added: `agents/researcher-opus48.md` (`model: claude-opus-4-8`, effort high) and `agents/synth-opus48.md` (`tools: Read, Write, Glob`, `model: claude-opus-4-8`, effort high) — workflow-only fallback targets. Own plugin agents, not the user-level `opus-48-fallback`, which recipients do not have.
- Added: required `interrupted` (`none` | `safety-classifier` | `other`) in `CHANNEL_SCHEMA`, `CURATOR_SCHEMA`, `VERIFY_SCHEMA`, `ESCALATION_SCHEMA`, `ANALYST_SCHEMA`, plus one `INTERRUPT_NOTE` line in each prompt. Why: a schema agent hands in StructuredOutput before the SubagentStop hook appends `REFUSAL_NO_FALLBACK` (incident `wf_0685606d-100`: 18:15:17 vs 18:15:26), so the hook marker never reaches `agent()`.
- Added: `classifierStopped(r, role)` → `schema` | `text` (regex over the role's own narrative fields only — findings, fileWritten, evidence, reasoning, mainConclusion, gaps; never citations) | `null` (analyst returned nothing) | none; `withClassifierRetry(role, label, prompt, opts, fallbackOpts)` → one re-run with a retry note (overwrite partial files, write long files in parts, compare documented behaviour with links, no bypass code) on the Opus 4.8 agent; cap `args.classifierRetryCap` (default 6), over the cap → `skipped: "cap"`.
- Changed: channels, curator, verifiers, escalation and analyst go through the wrapper. Curator: a classifier stop replaces the same-model `curator-retry`. Verifier still stopped → vote dropped (`votesLost`). Escalation still stopped → `escalationSkipped: "classifier-blocked"`. Analyst: null or stop → `synth-opus48` with `ai_model: "claude-opus-4-8"`; still nothing → the old last-resort retry on the other `synth-*` role (now up to 3 analyst calls).
- Added to the result: `classifierStops[]` `{role, label, detectedBy, retried, recovered, model, skipped?, error?}` (also in `insufficient-sources`, `curation-failed`, `synthesis-failed`); `channelStatus[].fallbackModel`, `channelStatus[].failReason: "classifier-blocked"`; `ledgerSummary.classifierRetries`, `ledgerSummary.classifierBlocked`; `aiModelActual` may be `claude-opus-4-8`.
- Added: test hook `args.simulateClassifierStop: ["<label>"]` — the first attempt of those labels fakes a stop; the retry never gets the hook.
- Docs: `skills/research/SKILL.md` — result shape, `classifierRetryCap` / `simulateClassifierStop`, Phase C 2a frontmatter `classifier_retries` / `classifier_blocked`, step 7 stop line + `refusal-audit.py` second check, Error handling; `references/gotchas.md` — new entry.
- Tests: `node tools/smoke-core.mjs` — analyst-chain checks updated (null → synth-opus48 → other synth-*), 22 new 2.7.8 checks (zero mode, simulated web stop recovered on researcher-opus48, a throwing retry does not end the run, regex fallback + no false positive on citation text, blocked channel, cap, lost verifier vote, curator, escalation, early return, agent pins).
- Gotcha: a session started before the plugin update does not know the two new agent types — the retry `agent()` fails (journal `failed`, empty agentId, seen in the live smoke). The wrapper catches it, records `error` and the run goes on; restart Claude Code after updating to 2.7.8.
- Migration: none for callers. A caller passing `workerOpts` keeps it for first attempts; retries always use the plugin's Opus 4.8 agents.

## [2.7.7] — 2026-10-02 — Счётчик волны проверки / verification wave counter

### Для человека

- Если часть проверяющих агентов упала, ресёрч больше не делает вид, что всё проверено. В сводке появилось «проверяющих вернулось X из Y». Если хоть один голос потерян, сводка прямо говорит, сколько и у скольких утверждений нет ни одного голоса.
- Если куратор дважды не выделил ни одного утверждения, ресёрч останавливается до синтеза. Раньше он писал отчёт по пустой проверке, и выводы выглядели проверенными. Материалы каналов остаются в рабочей папке, в vault ничего не пишется.

### For agents

- Added: pure `waveStats(voted, claimsCount, verifiers)` in `workflows/full-research-core.js` → `{votesLaunched, votesReturned, votesLost, unverified}`; the four fields join `synthMeta.ledgerSummary`. `agent()` resolves to null for a killed verifier and `votes.filter(Boolean)` used to drop it silently.
- Added: `completeness: "partial" | "complete"` in the `ok` and `synthesis-failed` result objects (`partial` when `votesLost > 0`); the wave is logged after the verifier fan-out.
- Changed: curator returns no claims (null, bad shape or an empty array) on the first call and on the retry → `status: "curation-failed"`, return before urlhealth/verify/synthesis (same shape as `insufficient-sources`). Before: synthesis over an empty ledger.
- Docs: `skills/research/SKILL.md` — result shape, Phase C step 1 and Error handling treat `curation-failed` like `synthesis-failed`; the «Проверка» line gets «проверяющих вернулось R из T» plus a partial-wave sentence.
- Tests: `node tools/smoke-core.mjs` → ALL OK (6 new checks: full wave 10/10, three lost votes → partial 7/10 with one unverified claim and a log line, curator null twice / empty twice → curation-failed with no verify or analyst calls, curator null once then ok → ok).
- Migration: none for callers; Phase C must know the new status (shipped in the same release).

## [2.7.6] — 2026-10-02 — Ядро не стартует на сломанных аргументах / args guard

### Для человека

- Если ресёрч запущен с испорченными аргументами — кавычки-ёлочки „“ или лишняя `"` внутри формулировки, повторный запуск без аргументов, пропущенное поле, — он больше не уходит молча на тестовую тему. Раньше такой запуск отрабатывал весь конвейер по «Compare local AI coding assistants» и стоил 2–2,6 млн токенов.
- Теперь ядро останавливается сразу, ни одного агента не запускает и пишет, что именно сломано: какие поля пустые или где ошибка в JSON, с началом того, что пришло.
- Папка прогона должна быть полным путём: относительный путь раскидывал файлы по текущей папке сессии.

### For agents

- Added: args guard block in `workflows/full-research-core.js` right after the args normalisation, before any `agent()` call. Unparsable string `args` → `throw` (script name, `JSON.parse` message, 300-char raw preview, hint about curly quotes „“ / unescaped `\"` and that resume does not inherit args) instead of `{}`. Non-object args → throw. Unless `dryRun: true`: `refinedQuery`, `channels`, `date`, `workDir`, `pluginRoot` must be present and non-empty (missing → throw listing the keys + typed 300-char preview of what arrived + hint about `resumeFromRunId` and `dryRun:true`), and `workDir` must start with `/`. The dry-run defaults are reachable only with `dryRun: true`.
- Required keys = what `skills/research/SKILL.md` Phase B always passes and what has a silent fallback (`channels` missing used to fall back to the default channel set). `decisionContext`, `languages`, `queries`, `substackHandles`, `vaultPath` stay optional (legitimately empty or unused by the core).
- Caller audit: the only caller is `skills/research/SKILL.md` (absolute `{VAULT_PATH}/.full-research/<id>_<slug>`); no personal workflow or skill under `~/.claude` calls the core.
- Docs: `skills/research/SKILL.md` Phase B — guard paragraph; `skills/research/references/gotchas.md` — new entry.
- Tests: `node tools/smoke-core.mjs` → ALL OK (6 new guard checks: no args, curly-quote string, relative workDir, missing + empty key in a JSON string, full args as a JSON string pass, `dryRun:true` alone passes); `pytest tests/` → 5 passed.
- Migration: none for the skill. A hand-made or test call without the required keys must add them or pass `dryRun: true`.

## [2.7.5] — 2026-09-30 — Fast для поиска Codex / Fast tier for the Codex channel

### Для человека

- Два поисковых вызова Codex в ресёрче идут в режиме Fast: в замере они стали в среднем в 1,7 раза быстрее, на длинных темах — до 2,1 раза, при том же числе поисков и открытых страниц. Канал Codex заканчивает последним, так что весь ресёрч короче на несколько минут.
- Цена — расход лимита Codex примерно в 2,5 раза выше на эти два вызова. Третий голос при спорных утверждениях (до 8 вызовов, лимит общий с `/verif`) остался в обычном режиме.

### For agents

- Changed: `skills/research/protocols/codex-web-protocol.md` — the base command, Call 1 and Call 2 use `service_tier="priority"`; the escalation command and `workflows/full-research-core.js` keep `service_tier="default"`. The "do NOT use priority" note is replaced by the 2026-09-30 decision with the A/B numbers (693→334 s, 1042→618 s, 319→277 s; searches/opened pages unchanged); the 2026-08-15 history is kept.
- Tests: `node tools/smoke-core.mjs` → ALL OK.
- Migration: none. Rollback — `priority` → `default` in the three channel commands.

## [2.7.4] — 2026-09-30 — Ловушка смоука с `--tools ""` / smoke gotcha for `--tools ""`

### Для человека

- В список ловушек скилла добавлена одна: быстрая проверка скилла через `claude -p` без инструментов возвращает пустой ответ. Это не поломка плагина — нужен флаг `--tools Bash`.

### For agents

- Added: `skills/research/references/gotchas.md` — «Resolve-smoke of this skill needs `--tools Bash`» (bang substitution `` !`date` `` + `--tools ""` → `result: ""`, 0 tokens). Moved here from the owner's always-loaded `bash-gotchas.md` rule to cut startup context.
- Migration: none.

## [2.7.3] — 2026-09-30 — Отдельный дом Codex для поиска / isolated Codex home

### Для человека

- Поиск через Codex больше не подхватывает твой глобальный конфиг Codex: чужой системный промпт, общий `AGENTS.md`, memories, плагины. Раньше из-за правила «отвечай по-русски» Codex отвечал на английские запросы по-русски и переводил цитаты, а проверка цитат потом не находила их на страницах источников.
- Модель остаётся GPT-6 Astra high: в слепом сравнении с новым GPT-6.1 Sol качество одинаковое, а Sol на high вдвое медленнее.

### For agents

- Added: `scripts/codex-home.sh` — creates/refreshes an isolated `CODEX_HOME` (`~/.claude/research-homes/codex`; override `JADLIS_RESEARCH_CODEX_HOME`, source login `CODEX_HOME_SOURCE`) with `auth.json` symlinked from `~/.codex`, a seeded `models_cache.json`, a generated `config.toml` (read-only, default tier, live search, memories off) and a search-worker `AGENTS.md`; prints the path.
- Changed: every `codex exec` in `skills/research/protocols/codex-web-protocol.md` and the escalation bridge in `workflows/full-research-core.js` run as `CODEX_HOME="$(bash {PLUGIN_ROOT}/scripts/codex-home.sh)" codex exec …`. `--ignore-user-config` was rejected: it still loads the global `AGENTS.md`.
- Docs: protocol note with the 2026-09-30 blind A/B (Astra high 7.7, Sol 6.1 high 7.7 at 2× time, Sol 6.1 medium 7.0). Live-search gate (`grep -c '"web_search'`) re-checked on codex-cli 0.159.0 in both search modes — unchanged.
- Tests: `node tools/smoke-core.mjs` → ALL OK.
- Migration: none; the home is created on first call.

## [2.7.2] — 2026-09-30 — Без свойства verified / verified property dropped

### Для человека

- В свойствах отчёта больше нет `verified: false`. Флаг никто не переключал и ничто его не читало, а черновик ИИ и так отмечен свойством `ai_drafted: true`.
- Строка «От тебя:» в итоге ресёрча работает как раньше: она появляется только при спорных утверждениях и расхождениях веба и сообществ.

### For agents

- Removed: the `verified` frontmatter property from the analyst report template in `workflows/full-research-core.js` (and `verified:false` from the Synthesize phase detail), `skills/research/examples/sample-report.md`, `docs/tier/README*.md` (example frontmatter, pipeline step 8, limits list).
- Changed: `skills/research/SKILL.md` Phase C step 7 — the «Reminder: … `verified: false` … user sets `verified: true` by hand» bullet is gone; the «От тебя:» trigger sentence no longer mentions the field (trigger unchanged: `ledgerSummary.disputed > 0` or `ledgerSummary.familySplit > 0`).
- Tests: `node tools/smoke-core.mjs` → ALL OK.
- Migration: none; existing vault notes keep their `verified` property, nothing reads it.

## [2.7.1] — 2026-09-29 — Без Fable / Fable dropped

### Для человека

- Ресёрч больше не обращается к Fable 5.1. Запасной аналитик и аналитик по флагу `fableBridge: true` теперь тоже Opus 5.5, только на уровне усилий high вместо xhigh. Если первый аналитик вернул пустой ответ, повтор идёт на Opus 5.5 с другим уровнем усилий.
- Зачем: по ресёрчу «Opus 5.5 на моих задачах» Opus 5.5 на high по индексу Artificial Analysis держится вровень с Fable 5.1 на max, а задача обходится примерно вчетверо дешевле.
- В свойствах отчёта `ai_model` теперь всегда `claude-opus-5-5`.

### For agents

- Changed: `agents/synth-fable.md` — `model: claude-fable-5-1` → `claude-opus-5-5` (effort `high` unchanged), description marks the name as historical. `agents/synth-opus.md` and `agents/orchestrator-opus.md` descriptions follow.
- Changed: `workflows/full-research-core.js` — `SYNTH_FABLE.model` → `'claude-opus-5-5'`, `name` → `'Opus 5.5 high (synth-fable)'`; comments and the Synthesize phase detail describe the retry as the other synth-* role (xhigh ↔ high), not the other family. `fableBridge`, `FABLE_SYNTH`, the agent name and the `analyst→fable` / `analyst→fable-retry` labels are kept (one vocabulary across the workflows).
- Changed: `skills/research/SKILL.md` (models paragraph, Phase C «Synthesis model»), `docs/tier/README*.md` example `ai_model` → `claude-opus-5-5`.
- Tests: `tools/smoke-core.mjs` — expected model ids `claude-fable-5-1` → `claude-opus-5-5`, retry log strings updated; `node tools/smoke-core.mjs` → ALL OK.
- Migration: none; `fableBridge: true` still works and now selects synth-fable on Opus 5.5 high.

## [2.7.0] — 2026-09-24 — Ресёрч без режима планирования / Intake without plan mode

### Для человека

- `/jadlis-research:research` больше не переключает сессию в режим планирования. Опрос идёт в обычном режиме, а запуск подтверждается одним вопросом: в нём формулировка темы, каналы и языки. «Запустить» стартует прогон, «Поправить формулировку» и «Поправить каналы» возвращают к правке, после неё вопрос звучит снова.
- Зачем: режим планирования добавили ради опроса на Fable под `opusplan`, а `opusplan` отменили 06.09. Остались одни сбои. Одобрение плана с очисткой контекста выбрасывало текст навыка (19 прогонов из 28), бриф вклеивался в план другой задачи, а после одобрения сессия уходила из bypass в auto, и Workflow отказывался стартовать.
- Бриф прогона лежит в рабочей папке, в файле `_brief.md`, вместе с чек-листом фаз. После сжатия контекста ресёрч продолжает по нему и не запускает прогон второй раз.
- Если вы сами уже в режиме планирования, бриф уходит секцией в ваш план. Первая строка секции говорит, где взять инструкции, поэтому бриф переживает очистку контекста при одобрении.
- Бриф из одобренного плана, путь к `_brief.md` или просьба «без вопросов» запускают прогон сразу, без опроса и подтверждения.

### For agents

- Changed: `skills/research/SKILL.md` — `EnterPlanMode` removed from `allowed-tools` (`ExitPlanMode` stays for the plan-mode branch). Phase A step 0 = four branches: normal (no plan mode, never call `EnterPlanMode`); brief already approved (a `## full-research brief` section, a `_brief.md` path or an explicit «без вопросов» → skip interview and gate, step 2a only without `SELECTED_CHANNELS`, launch sequence); session already in plan mode (brief appended to the current plan file, first line `EXEC: read ${CLAUDE_SKILL_DIR}/SKILL.md …`, gate = one `ExitPlanMode`); headless (no gate).
- Changed: step 7 «Brief → launch gate» — one AskUserQuestion (header «Запуск»; `REFINED_QUERY`, channels and languages in the question text; options «Запустить (рекомендую)» / «Поправить формулировку» / «Поправить каналы», adding a channel re-runs the step 2a resolve). Workflow only after «Запустить», with exactly the values the gate showed (a smoke run switched `LANGUAGES` ru → en after the answer; now any later change re-asks the gate). Launch sequence: `mkdir -p` → `{WORK_DIR}/_brief.md` → launch line → Workflow.
- Changed: the brief gains `VAULT_PATH` and `PLUGIN_ROOT` (every Workflow arg is now in it) and, in `_brief.md`, a `## Checklist` (Phase B with runId, Phase C with `REPORT_PATH`, summary); Phase B, Phase C step 5 and step 7 tick it. New rule for compaction/resume: re-read `_brief.md`; a runId in the Phase B line means wait or `resumeFromRunId`, never a second launch.
- Removed: the `opusplan` paragraph (dropped 2026-09-06) and «plan mode allows it» in the recon step.
- Docs: `docs/tier/README.md`, `docs/tier/README.en.md` — the launch gate is one confirmation question, not a plan approval; `references/gotchas.md` says «brief» instead of «plan».
- Migration: none for callers. Briefs already sitting in plan files launch through the «brief already approved» branch.

## [2.6.1] — 2026-09-23 — Строка «От тебя:» / Closing «От тебя:» line

### Для человека

- Если в отчёт попали спорные факты или утверждения, по которым веб и сообщества расходятся, итоговое резюме в чате заканчивается отдельной строкой «От тебя:» — что именно проверить или решить самому. Когда таких утверждений нет, строки нет.

### For agents

- Changed: `skills/research/SKILL.md` Phase C step 7 — new last bullet: a closing `**От тебя:**` line when `ledgerSummary.disputed > 0` or `ledgerSummary.familySplit > 0`, naming what to check (DISPUTED) or decide (FAMILY-SPLIT), max 3 items; frontmatter `verified: false` alone is not a trigger. Workflow, agents and report template unchanged.

## [2.6.0] — 2026-09-22 — Аналитик на Opus 5.5 / Opus 5.5 analyst by default

### Для человека

- Итоговый отчёт ресёрча теперь по умолчанию пишет Opus 5.5 на уровне усилий xhigh, а не Fable 5.1. Причины: в тестах Artificial Analysis (GDPval) Opus 5.5 на xhigh набирает 1820 против 1617 у Fable 5.1 на high, реже отвечает наугад (0,66 против 0,69), дешевле за задачу и не расходует отдельный недельный лимит Fable.
- Как Opus 5.5 держит факты в очень длинном контексте (400–600 тыс. токенов канальных файлов), пока не измерено. Если нужен прежний аналитик, передайте в workflow `fableBridge: true` — отчёт напишет Fable 5.1.
- Если аналитик вернул пустой ответ (отказ, лимит), ресёрч один раз повторяет синтез на модели другого семейства: Opus → Fable, Fable → Opus. Раньше повтор был только в одну сторону, с Fable на Opus. В свойстве отчёта `ai_model` записана модель, которая на самом деле его написала.
- Проверка ссылок и цитат (urlhealth) идёт на низком уровне усилий: это механическая работа, глубокие рассуждения ей не нужны.
- `/jadlis-research:research-settings` больше не задаёт свой уровень усилий и работает на уровне сессии: смена уровня посреди сессии сбрасывала кэш промпта.

### For agents

- Changed: `workflows/full-research-core.js` — `FABLE_SYNTH = A.fableBridge === true` (was `!== false`); analyst defaults to `jadlis-research:synth-opus`, `fableBridge: true` → `jadlis-research:synth-fable`. New `SYNTH_OPUS`/`SYNTH_FABLE`/`SYNTH_FIRST`/`SYNTH_RETRY` descriptors; `AI_MODEL_RETRY` = the other family's model; retry gate `if (!report)` on both branches, labels `analyst→fable-retry` (Opus first) / `analyst→opus-retry` (Fable first); `synthFellBack = !!report` after the retry; `aiModelActual = synthFellBack ? AI_MODEL_RETRY : AI_MODEL`. Phase `Synthesize` detail, header comment and log lines updated.
- Changed: urlhealth `agent()` call gets `effort: 'low'` inside `w({...})` (explicit `agent()` effort overrides the `researcher-opus` frontmatter `high`). Channel researchers, verifiers, escalation and curator unchanged (`high` via frontmatter).
- Changed: `agents/synth-opus.md` `effort: high` → `xhigh`, description = default synthesiser; `agents/synth-fable.md` description = opt-in / retry; `agents/orchestrator-opus.md` = claim curator only (it was never the analyst since the synth-* split). `synth-opus.md`, `synth-fable.md`, `researcher-opus.md` must stay byte-identical with `jadlis-science-research`.
- Removed: `effort: medium` from `skills/research-settings/SKILL.md` frontmatter — the skill inherits the session effort (a mismatched skill effort recomputes the prompt cache).
- Docs: `skills/research/SKILL.md` Phase B models paragraph, Phase C `ai_model` post-check, final summary line and `synthesis-failed` error text describe the new default and the symmetric retry.
- Tests: `tools/smoke-core.mjs` — `hooks.analystNull` stubs a null analyst; new cases: default (no `fableBridge`), `fableBridge: true`, null → retry on the other family for both, both null → `synthesis-failed` after exactly 2 calls, string `"true"` is not an opt-in, urlhealth `effort: 'low'`.
- Migration: callers that relied on the implicit Fable analyst must pass `fableBridge: true`; callers passing `fableBridge: false` keep the same (Opus) behaviour, now with a Fable retry on null.

## [2.5.3] — 2026-09-22 — Переход на Opus 5.5 / Switch to Opus 5.5

### Для человека

- Каналы, проверка утверждений, куратор и запасной аналитик ресёрча теперь работают на Opus 5.5 вместо Opus 5; главным аналитиком по-прежнему остаётся Fable 5.1.
- В свойствах отчёта `ai_model` пишется `claude-opus-5-5`, если отчёт дописывал Opus.
- Плагин требует Claude Code ≥ 2.1.280: более старые версии не знают новую модель.

### For agents

- Changed: model `claude-opus-5` → `claude-opus-5-5` (Opus 5.5, 1M context native, no `[1m]` suffix) in `agents/researcher-opus.md`, `agents/orchestrator-opus.md`, `agents/synth-opus.md` (frontmatter `model:` + description), `skills/research/SKILL.md` and `skills/research-settings/SKILL.md` (frontmatter `model:`), `workflows/full-research-core.js` (`AI_MODEL`, `AI_MODEL_RETRY`, `aiModelActual`, the `workerOpts` fallback comment `{ model: 'opus' }` → `{ model: 'claude-opus-5-5' }`); prose naming the current model "Opus 5" → "Opus 5.5" in the same files. `effort:` values unchanged. `agents/researcher-opus.md` and `agents/synth-opus.md` stay byte-identical with `jadlis-science-research`.
- Migration: requires Claude Code ≥ 2.1.280 — older versions may reject the unknown model ID `claude-opus-5-5` in agent/skill frontmatter. `skills/research/examples/sample-report.md` keeps `claude-opus-5` as a historical sample.

## [2.5.2] — 2026-09-21

### Для человека

- Отчёт ресёрча сразу получает короткий английский адрес для Obsidian Publish: в свойствах появляется `permalink`, и ссылка на опубликованную заметку больше не состоит из длинной закодированной кириллицы.

### For agents

- Changed: `skills/research/SKILL.md` Phase C — new step 2b adds `permalink: <slug>` (2–4 English words, ASCII, unique in the vault) to the draft frontmatter before the vault write.

## [2.5.1] — 2026-09-19

### Для человека

- Ресёрч снова сам сохраняет отчёт. Claude Code с версии 2.1.276 запрещает субагентам писать файлы с именем
  `report*.md`, и аналитик терял черновик. Теперь черновик называется `draft.md`, ручное восстановление из транскрипта не нужно.

### For agents

- Analyst draft `${WORK_DIR}/report.md` → `${WORK_DIR}/draft.md` (CC 2.1.276+ blocks subagent Write to
  `^(REPORT|SUMMARY|FINDINGS|ANALYSIS).*\.md$`, errorCode 5); `reportPath` contract unchanged.
- `tests/test_workdir_names.py` guards every `${WORK_DIR}/…` name in `workflows/*.js`; gotcha added.

## [2.5.0] — 2026-09-19

### Для человека

- Ресёрч запоминает Telegram-каналы, которые дали цитаты: копилка `~/.claude/jadlis/telegram-search/channels.jsonl`
  (только хэндлы, теги темы и счётчики цитат, без текстов). Следующий прогон по похожей теме начинает с них и
  не тратит Stars на повторный поиск тех же каналов. Копилка заполнена из 11 прошлых прогонов.
- Правило платных фраз: 2-4 слова на языке постов, предметный термин или формулировка боли; без жаргона и
  однословных англ. терминов; если первая фраза принесла мусор — следующая уже, а не шире.

### For agents

- New `scripts/tg-channels.py` (stdlib, py3.9): `list --tags`, `add --handle … --cited N --run`,
  `import-workdir`; append-only JSONL via one `O_APPEND` write, handle validation `^[A-Za-z0-9_]{4,32}$`,
  `$TG_CHANNELS_FILE` override.
- `protocols/telegram-protocol.md`: native Layer 0 order = registry `list` → `similar` → `chats -q` (chats only)
  → paid `posts -q` with the phrase rule; free mode also starts from the registry; new «Registry write-back»
  step (`add` per cited peer, `registry: +N` line in the channel file).
- `references/telegram-seed-handles.md` points to the dynamic registry.
- `tools/smoke-core.mjs` checks the registry and phrase rule in the protocol; `tests/test_tg_channels.py`.

## [2.4.0] — 2026-09-19

### Для человека

- Когда бесплатные глобальные поиски в Telegram на сегодня кончились, ресёрч платит Stars — по
  разрешению владельца. Не больше 3 фраз за прогон и не дороже 20 Stars за фразу (сейчас 10), то
  есть максимум 60 Stars за прогон. Резерв «2 бесплатных поиска владельцу» снят.
- Верификаторы по-прежнему ищут в Telegram только бесплатными командами.

### For agents

- `protocols/telegram-protocol.md`: slot budget — ≤3 paid phrases per run, free slots first, then
  `--pay-stars=20` (price ceiling), standing permission 2026-09-19; payment failure → free commands;
  channel file records slot vs Stars phrases and Stars spent.
- `sources.json`: telegram cost text.

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
