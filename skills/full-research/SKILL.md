---
name: full-research
description: >
  Полное исследование темы: веб-поиск тремя движками (Brave + Codex web search +
  Grok web search) + community research (Reddit, Twitter/X, HackerNews, Substack)
  параллельно через workflow. Разведка + интервью → N параллельных исследователей →
  per-claim кросс-канальная верификация → синтез → Obsidian vault (Знания/Ресерчи/).
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

2. **Выбор каналов.** Если в запросе указаны источники ("в Reddit и HN", "в соцсетях",
   "only twitter") — определи `SELECTED_CHANNELS` из текста. Маппинг: "соцсети"/"сообщества"/
   "community" → `["reddit","twitter","hackernews","substack"]`; конкретные платформы → только их;
   **"web" в любом наборе разворачивается в три движка** `web,codexweb,grokweb` (Brave + Codex
   web search + Grok web search — три независимых поисковых стека над открытым вебом, их
   находки сравниваются при синтезе).
   Иначе — AskUserQuestion:
   - «Все каналы (Recommended)» → `["web","codexweb","grokweb","reddit","twitter","hackernews","substack"]`
   - «Только соцсети» → `["reddit","twitter","hackernews","substack"]`
   - «Web + соцсети без Substack» → `["web","codexweb","grokweb","reddit","twitter","hackernews"]`

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
   `WORK_DIR = .full-research/{SESSION_ID}_{QUERY_SLUG}`; `VAULT_PATH = ${user_config.VAULT_PATH}`;
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
    channels: SELECTED_CHANNELS,        // ключи: web/codexweb/grokweb/reddit/twitter/hackernews/substack
    substackHandles: SUBSTACK_HANDLES,  // может быть пуст
    bridgeModel: "claude-fable-5",      // модель Fable-моста; недоступна → авто-падение на claude-opus-5
    date: DATE,
    workDir: WORK_DIR,
    pluginRoot: PLUGIN_ROOT,            // ${CLAUDE_PLUGIN_ROOT} в JS НЕ подставляется — передаём значением
    vaultPath: VAULT_PATH
  }
})
```

Модели внутри workflow: каналы, верификаторы и curator — Opus 5
(`jadlis-research:researcher-opus-xhigh` / `jadlis-research:orchestrator-fable-xhigh`);
analyst — **мост через headless `claude -p`** (биллинг — та же подписка).

Мост пробует `bridgeModel` **один раз**; если модель недоступна — падает на
`claude-opus-5` и продолжает. `frontmatter` отчёта обязан отражать модель, которая
сработала на самом деле (workflow возвращает её в `synthMeta.analystModel`) — не ту,
которую заказывали. Отключить мост совсем: `fableBridge: false` → analyst идёт
обычным субагентом на Opus 5.

Workflow читает протоколы каналов сам, делает per-claim верификацию (CONFIRMED/CHALLENGED/
OUTDATED) и **фильтрует** непрошедшие claims (не просто дописывает критику), затем analyst
пишет draft-отчёт в `{WORK_DIR}/report.md`. Дождись `<task-notification>`, затем используй
объект: `{workDir, status, channelsAnswered, reportPath, queryRu, relatedCandidates, claimLedger, synthMeta}`.
Прогресс — в `/workflows`.

## Phase C — WRITE (vault-контракт, главная сессия)

1. **Частичный результат.** Если `status: "insufficient-sources"` (<2 каналов) — сообщи об
   ошибке, покажи что собралось в `{WORK_DIR}`. Иначе продолжай.

2. **Прочитай draft:** `{WORK_DIR}/report.md`.

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
   - Что отсеяла верификация: из `claimLedger`/`synthMeta.droppedClaims` — какие claims
     CHALLENGED/OUTDATED и почему. Они **не вошли** в отчёт (фильтрация, не дописанная критика).
   - Gaps (`synthMeta.gaps`): что исследование не покрыло.
   - Модель синтеза: `synthMeta.analystModel` — та, что сработала (мост мог упасть на Opus).
   - Путь к отчёту: `REPORT_PATH` (vault, `Знания/Ресерчи`).
   - Путь к рабочей директории: `{WORK_DIR}/` (per-source файлы + draft — полный процесс).
   - Напоминание: во frontmatter отчёта стоит `verified: false` — это черновик AI. После
     ревью пользователь вручную ставит `verified: true`.

## Обработка ошибок

- Workflow вернул `insufficient-sources` — покажи что собралось, не пиши в vault.
- Channel-агенты имеют встроенные фоллбэки (Brave `site:` вместо MCP) внутри протоколов.
- obsidian CLI недоступен (Obsidian закрыт) — vault-контракт деградирует: пиши файл в
  `REPORT_PATH` без dedup/wikilinks/записи в дневную заметку, предупреди пользователя.
