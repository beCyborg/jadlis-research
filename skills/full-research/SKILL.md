---
name: full-research
description: >
  Полное исследование темы: веб-поиск тремя движками (Brave + Codex web search +
  Grok web search) + community research (Reddit, Twitter/X, HackerNews, Substack,
  YouTube, Telegram) параллельно через workflow. Разведка + интервью → N параллельных
  исследователей → per-claim кросс-канальная верификация → синтез → Obsidian vault
  (Знания/Ресерчи/).
  TRIGGER when: user says "полный ресерч", "full research", "исследуй тему полностью",
  "deep research", "глубокий ресерч", "все источники", "research everywhere",
  "исследование по всем источникам", "в соцсетях", "что говорят люди",
  "мнения в сообществах", "обсуждения на форумах", "community research",
  "what do people think", or explicitly asks for combined web + community research,
  or asks about opinions/discussions/sentiment on a topic across social platforms.
  DO NOT TRIGGER when: only web search (use /jadlis-research:search),
  scientific literature (use /jadlis-research:search-paper),
  library docs (use Context7).
allowed-tools:
  - Read
  - Write
  - Glob
  - Bash
  - AskUserQuestion
  - Workflow
  - mcp__plugin_jadlis-research_brave-search__brave_web_search
argument-hint: "<query — тема исследования>"
model: claude-opus-5
effort: xhigh
---

# /jadlis-research:full-research — полное исследование темы (гибрид Skill + Workflow)

Тяжёлая часть (N канальных исследователей → per-claim верификация с live brave
counter-search → analyst-синтез) исполняется детерминированным workflow
**`full-research-core`**. Скилл делает интерактивный intake (Phase 1: каналы + разведка
+ интервью) и запись в vault (vault-контракт: dedup, wikilinks, запись в дневную заметку).

**Запрос пользователя:** `$ARGUMENTS`

## Архитектура

```
Phase A (INTAKE: каналы + recon + интервью) → Phase B (Workflow full-research-core)
  → Phase C (WRITE: vault-контракт)
```

## Phase A — INTAKE (главная сессия)

1. **Тема.** Если `$ARGUMENTS` пуст — попроси тему через AskUserQuestion и остановись.

2. **Выбор каналов — роутинг-дерево.** Явно названные пользователем источники
   ("в Reddit и HN", "only twitter") всегда перекрывают дерево;
   "соцсети"/"сообщества" → `["reddit","twitter","hackernews","substack"]`; "web" →
   `web,codexweb,grokweb` (codexweb — после квотного probe, см. ниже). Иначе — три
   бинарных вопроса по теме, сверху вниз, срабатывают КУМУЛЯТИВНО:

   1. **RU/СНГ-тема?** (кириллическая формулировка про российский рынок/сервисы/цены,
      «в России / Рунете / СНГ», vc.ru/Habr/Дзен/Telegram-контекст) →
      `yandex` ВКЛ **при наличии ключа `YC_SEARCH_API_KEY`** (см. гейт ниже; ключа нет —
      канал не включать, сказать пользователю, что RU-слой идёт только через Brave и
      Telegram); `telegram` ВКЛ (публичные t.me-превью + дорки, бесплатный контур;
      для кастдев-тем — обязателен); `twitter`, `substack`, `hackernews` — ВЫКЛ
      (EN-тишина RU-тем структурна — это смещение площадок, не отсутствие спроса;
      в резюме Phase C это НЕ считается провалом каналов). В recon добавь RU-вводные
      для агентов: якорные домены site:-запросов (vc.ru, habr.com, pikabu.ru, dtf.ru,
      t-j.ru, secrets.tbank.ru, incrussia.ru, rb.ru), site:t.me-дорки для Telegram-слоя;
      серые форумы ищутся через Яндекс (их треды в его индексе).
   2. **Техническая / AI-тема?** → `hackernews` ВКЛ (для RU-тем ветка 1 приоритетнее);
      `youtube` — предложи как opt-in (сильные кластеры: tech/AI-туториалы и обзоры,
      маркетинг/продажи; транскрипты бесплатны с домашнего IP).
      `codexweb` — во ВСЕХ темах (default-набор). **Квотный probe codexweb (всегда перед
      включением):** квота Codex-подписки — общий пул с верификатором
      `/jadlis-research:verif` (приоритет у verif). Probe: `codex exec -m gpt-5.6-sol
      -s read-only --skip-git-repo-check 'ok' < /dev/null` (≈6 с); usage-limit ошибка → канал
      ВЫКЛ, сообщи пользователю («codexweb пропущен: квота Codex зарезервирована/исчерпана»).
      Бинарника `codex` нет → канал ВЫКЛ без сообщения об ошибке.
   3. **Академическая тема?** → предложи `/jadlis-research:search-paper` (вместо или
      рядом с full-research).
   4. **Локальная/бытовая тема (места)?** («найди/выбери заведение, клинику, сервис,
      секцию в Варшаве/городе») → канал `web` получает place-слой (секция «Place-слой»
      в web-protocol.md: places-fetch.sh → Brave Place); каналы `youtube`
      (обзоры мест) и `telegram` (локальные чаты) — предложи как opt-in. Гейт
      places-fetch: ключ `GOOGLE_PLACES_API_KEY` (нет ключа → скрипт сам деградирует
      в Brave Place, это штатно). Регион по умолчанию — PL, переопределяется
      переменной `PLACES_REGION`.

   **Default-набор** (ни одна ветка не сработала или кластер смешанный/неопределённый):
   `["web","codexweb","grokweb","reddit","twitter","hackernews","substack"]` — codexweb
   входит по умолчанию (после квотного probe из ветки 2; probe провален → выкинуть из
   набора с сообщением).

   **Гейт `yandex`.** Канал требует ключа `YC_SEARCH_API_KEY` в `env` файла settings.json
   (ставит скилл `/jadlis-research:keys`; userConfig плагина сюда не годится —
   sensitive-значения не доезжают до Bash). Ключ не настроен → `yandex` не предлагать
   вообще. Если ключа нет, а канал всё-таки выбран: `yandex-search.sh` вернёт `exit 2`,
   канал деградирует (`sourceQuality=LOW`, пустые citations) и workflow это НЕ роняет.
   Платный: ≈0,1-0,15 ₽/тема. Вне RU-ветки — только по явной просьбе («с Яндексом»).
   Слой Рунета у Brave слаб (замер 01.2026: у Яндекса наивысшее доменное разнообразие
   выдачи, 164 домена из 1630 SERP не встретились ни у одного другого движка).

   **Гейт `youtube`.** С ключом `YOUTUBE_API_KEY` (userConfig плагина) канал использует
   MCP `mcp__plugin_jadlis-research_youtube__*` для поиска и метаданных. Без ключа —
   MCP-вызовы **пропускать**, канал работает через Brave `site:youtube.com` +
   транскрипты (`scripts/yt-transcript.py`), это штатная деградация.

3. **Разведка (recon).** Сделай 1-2 вызова `mcp__plugin_jadlis-research_brave-search__brave_web_search`
   (тариф Search: 50 req/s, параллель OK; `count: 5`): широкий обзор темы + опц. уточняющий аспект. Цель —
   сориентироваться (аспекты, под-темы, контроверсии), не собирать данные.
   **Substack handle extraction:** если "substack" в каналах — из результатов Brave спарси URL
   вида `<handle>.substack.com` → массив `SUBSTACK_HANDLES`.

4. **Интервью (ВСЕГДА, skip нет).** Через AskUserQuestion:
   - Обязательный первый вопрос: «Какое решение ты будешь принимать на основе этого
     ресёрча?» — варианты-гипотезы сформируй из разведки. Ответ → `DECISION_CONTEXT`
     (1-2 предложения: что человек будет делать/выбирать по итогам).
   - Ещё 1-3 вопроса по результатам разведки: какой аспект интересует; контекст/use case;
     временной горизонт/recency. Если запрос уже узкий — эти вопросы можно опустить,
     но вопрос о решении задаётся всегда.
   Сформируй `REFINED_QUERY` (1-3 предложения).

5. **Подготовка.** Вычисли: `SESSION_ID = ${CLAUDE_SESSION_ID}`; `QUERY_SLUG` (транслит латиницей,
   ≤40, lowercase, дефисы); `QUERY_RU` (краткая русская формулировка ≤25 симв);
   `DATE` = !`date +%Y-%m-%d` (значение уже подставлено при загрузке скилла, Bash не нужен);
   `VAULT_PATH = ${user_config.VAULT_PATH}` — **если значение пусто или осталось литералом
   `${user_config.VAULT_PATH}` (например, при локальной обкатке через `--plugin-dir`), возьми
   `~/Jadlis`**;
   `WORK_DIR = {VAULT_PATH}/.full-research/{SESSION_ID}_{QUERY_SLUG}` — **всегда АБСОЛЮТНЫЙ путь**
   (относительный резолвится от cwd на момент спавна агентов: `cd` главной сессии перед
   resume «терял» файлы при status ok; это касается и `resumeFromRunId`-вызовов —
   args передавать целиком с тем же абсолютным workDir);
   `VAULT_RESEARCH_DIR = {VAULT_PATH}/Знания/Ресерчи`; `PLUGIN_ROOT = ${CLAUDE_PLUGIN_ROOT}`.
   `mkdir -p "{WORK_DIR}" "{VAULT_RESEARCH_DIR}"`.
   Сообщи: «Запущен полный ресерч по {N} каналам: {SELECTED_CHANNELS}. Ожидаю результаты...»

## Phase B — INVOKE

```
Workflow({
  scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/full-research-core.js",
  args: {
    refinedQuery: REFINED_QUERY,
    decisionContext: DECISION_CONTEXT,  // из интервью: какое решение принимает пользователь
    channels: SELECTED_CHANNELS,        // ключи: web/codexweb/grokweb/reddit/twitter/hackernews/substack (+opt-in: yandex, youtube, telegram)
    substackHandles: SUBSTACK_HANDLES,  // может быть пуст
    aiModel: "claude-fable-5",          // модель analyst (синтез идёт через Fable-мост)
    date: DATE,
    workDir: WORK_DIR,
    pluginRoot: PLUGIN_ROOT,            // ${CLAUDE_PLUGIN_ROOT} в JS НЕ подставляется — передаём значением
    vaultPath: VAULT_PATH
  }
})
```

Модели внутри workflow: каналы, верификаторы и curator — Opus 5
(`jadlis-research:researcher-opus-xhigh` / `jadlis-research:orchestrator-fable-xhigh`);
analyst — **Fable 5 через мост** (headless `claude -p`, биллинг — та же подписка).
Отключение моста: `fableBridge: false` → analyst тоже на Opus 5 — тогда передай
`aiModel: "claude-opus-5"`, frontmatter отчёта не должен врать.

Workflow читает протоколы каналов сам, делает per-claim верификацию (CONFIRMED/CHALLENGED/
OUTDATED) и **фильтрует** непрошедшие claims (не просто дописывает критику), затем analyst
пишет draft-отчёт в `{WORK_DIR}/report.md`. Дождись `<task-notification>`, затем используй
объект: `{workDir, status, channelsAnswered, channelStatus, failedChannels, aiModelActual, reportPath, queryRu, relatedCandidates, claimLedger, synthMeta}`.
Прогресс — в `/workflows`.

## Phase C — WRITE (vault-контракт, главная сессия)

Контракт записи в vault — `${CLAUDE_PLUGIN_ROOT}/shared/obsidian-write-contract.md`.

1. **Частичный результат.** Если `status: "insufficient-sources"` (<2 каналов) — сообщи об
   ошибке, покажи что собралось в `{WORK_DIR}`. Иначе продолжай.

2. **Прочитай draft:** `{WORK_DIR}/report.md`.

2a. **Постпроверка draft (детерминированная).**
   - **Честный `ai_model`.** Сверь frontmatter `ai_model` с `aiModelActual` из объекта workflow
     (мост мог упасть в fallback на Opus — тогда frontmatter врёт). При расхождении поправь
     строку frontmatter на `ai_model: "{aiModelActual}"` перед записью в vault.
   - **Каноническая секция.** Если `synthMeta.ledgerSummary.confirmed > 0`, проверь
     `grep -c '^### Проверенные факты$' draft`. Нет секции → дорендери программно из
     `claimLedger` (claims с verdict=CONFIRMED: statement + бейдж credibility + первый URL
     evidence) и вставь подсекцией в конец «## 📚 Контекст и находки».

3. **Pre-write dedup (obsidian).** Через Bash (если Obsidian открыт; иначе шаги CLI пропусти):
   ```bash
   obsidian search query="{ключевые слова из QUERY_RU}" path="Знания/Ресерчи" limit=5 format=json 2>/dev/null || echo "CLI_UNAVAILABLE"
   obsidian search query="{ключевое слово}" limit=10 format=json 2>/dev/null || echo "CLI_UNAVAILABLE"
   ```
   Запомни найденные имена заметок. Если есть очень близкий дубликат — реши: supersede / связать.

4. **Коллизия имён.** `REPORT_PATH = {VAULT_RESEARCH_DIR}/{queryRu}.md`. Через Bash
   `test -e "{REPORT_PATH}" && echo EXISTS || echo FREE`. EXISTS → `{queryRu} ({DATE}).md`, снова
   test; EXISTS → суффикс ` v2`, ` v3`… до свободного.

5. **Wikilinks + запись.** В разделе `## Связанные заметки` draft-отчёта (он пуст — заглушка)
   проставь wikilinks `[[Название]]` **ТОЛЬКО** на заметки, реально найденные на шаге 3
   (НЕ создавай unresolved links; `relatedCandidates` из объекта — лишь подсказки для поиска).
   Если obsidian CLI недоступен — оставь раздел пустым/убери. Запиши финальный файл в `REPORT_PATH`
   (Write — скопируй draft с заполненным разделом).

6. **Post-write (daily note).** Если Obsidian открыт:
   ```bash
   NOTE_NAME=$(basename "{REPORT_PATH}" .md)
   obsidian append path="Периоды/День/$(date +%F).md" content="- [[${NOTE_NAME}]] — полное исследование, ожидает ревью" 2>/dev/null || true
   obsidian backlinks file="${NOTE_NAME}" counts 2>/dev/null || true
   ```

7. **Резюме пользователю:**
   - Вердикт под решение из интервью (`DECISION_CONTEXT`): что делать / чего не делать —
     2-4 предложения из главного вывода draft-отчёта.
   - **Статус каналов (обязательно).** Из `channelStatus`: если `failedChannels` непуст —
     явно перечисли, какие ВЫБРАННЫЕ каналы упали/деградировали (LOW или без citations)
     и что это значит для полноты (прогон без части выбранных каналов — не полноценный).
     Все каналы ok → одна строка «все N каналов отработали».
   - Что отсеяла верификация: из `claimLedger`/`synthMeta.droppedClaims` — какие claims
     CHALLENGED/OUTDATED и почему. Они **не вошли** в отчёт (фильтрация, не дописанная критика).
   - Gaps (`synthMeta.gaps`): что исследование не покрыло.
   - Модель синтеза: `aiModelActual` — та, что сработала (мост мог упасть на Opus).
   - Путь к отчёту: `REPORT_PATH` (vault, `Знания/Ресерчи`).
   - Путь к рабочей директории: `{WORK_DIR}/` (per-source файлы + draft — полный процесс).
   - Напоминание: во frontmatter отчёта стоит `verified: false` — это черновик AI. После
     ревью пользователь вручную ставит `verified: true`.

## Обработка ошибок

- Workflow вернул `insufficient-sources` — покажи что собралось, не пиши в vault.
- Channel-агенты имеют встроенные фоллбэки (Brave `site:` вместо MCP) внутри протоколов.
- Канал `yandex`: `exit 2` — нет `YC_SEARCH_API_KEY`; `exit 3` — ошибка API; `exit 4` — таймаут
  поллинга. Во всех трёх случаях канал возвращает `sourceQuality=LOW` без ретраев и без
  фоллбэка на Brave; workflow продолжается на остальных каналах.
- Каналы `hackernews` и `substack` работают через свои фетчеры (`scripts/hn-fetch.sh`,
  `scripts/substack-fetch.py`). MCP-фоллбэка в плагине нет: фетчер сломался → канал
  деградирует (`sourceQuality=LOW`), workflow продолжается.
- obsidian CLI недоступен (Obsidian закрыт) — vault-контракт деградирует: пиши файл в
  `REPORT_PATH` без dedup/wikilinks/записи в дневную заметку, предупреди пользователя.
