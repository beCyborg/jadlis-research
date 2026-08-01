# Web — протокол поиска для агента (Brave Search)

## MCP-инструменты

### Brave Search (контент + поиск) + Firecrawl (точечный скрапинг)

| Инструмент | Назначение |
|---|---|
| `mcp__brave-search__brave_llm_context` | **Дефолт для research**: возвращает ИЗВЛЕЧЁННЫЙ КОНТЕНТ страниц по запросу (не только ссылки) — закрывает большинство потребностей без скрапинга |
| `mcp__brave-search__brave_web_search` | Keyword-based discovery источников — когда нужны САМИ ссылки/охват (+`extra_snippets`) |
| `mcp__firecrawl__firecrawl_scrape` | Полный контент ОДНОЙ конкретной страницы — только когда llm_context не хватило |

**КРИТИЧНО:** Перед использованием любого инструмента — загрузи его через ToolSearch если недоступен.
**RATE LIMIT:** Brave (тариф Search): 50 req/s — **параллельные вызовы OK** (несколько tool calls в одном сообщении). Firecrawl scrape: 1 req/s. При 429 — подождать 1 сек, retry (max 2x).

## CONTENT-FIRST Protocol

### Layer 1 — Контент + discovery (2-4 вызова, ПАРАЛЛЕЛЬНО в одном сообщении)

**Обязательная пара (одним сообщением):**
```
brave_llm_context(query="<развёрнутый запрос по теме>")
brave_web_search(query="<ключевые слова по теме>", count=10, extra_snippets=true)
```

**Вторая пара — контраргументы/альтернативный ракурс (одним сообщением):**
```
brave_llm_context(query="<критика, проблемы, сравнения по теме>")
brave_web_search(query="<запрос с альтернативного угла>", count=8)   # опционально
```

ПРАВИЛА ФОРМУЛИРОВКИ ЗАПРОСОВ:
- Для `brave_web_search`: запрос = ключевые слова, НЕ описание страницы
  - ПЛОХО: "comprehensive analysis of AI agent frameworks and their adoption in enterprise"
  - ХОРОШО: "AI agent frameworks enterprise adoption comparison 2026"
- Для `brave_llm_context`: развёрнутый запрос допустим (инструмент сам извлекает релевантный контент)
- Для свежей информации: `freshness="pm"` (месяц) или `freshness="pw"` (неделя)
- Для русскоязычных тем: запрос на русском языке

### Layer 2 — Оценка и отбор (0 вызовов)

Проанализируй результаты Layer 1:
1. Ранжируй по релевантности + авторитетности домена
2. Контент из llm_context ДОСТАТОЧЕН для большинства цитат — используй его напрямую
3. Кандидаты на Layer 3: только страницы, где нужны детали, а llm_context их не дал (обрезано/не покрыто)
4. Выбери ТОП 0-3 URL для точечного скрапинга

### Layer 3 — Точечный скрапинг (0-3 вызова, только при необходимости)

> **PDF-предчек (до любого `firecrawl_scrape`).** PDF-URL (`.pdf`/`/TXT/PDF/`/`?format=pdf`) НЕ через Firecrawl — он биллит 1 кредит/страницу, fan-out субагентов множит расход. Делай: `out=$(bash {PLUGIN_ROOT}/scripts/pdf-fetch.sh "<url>")` → `Read "$out"` (0 кр). `exit 2` → эскалация по раздел «PDF-предчек» выше.

Для отобранных URL:
```
mcp__firecrawl__firecrawl_scrape(url="<url1>", formats=["markdown"], onlyMainContent=true)
```

Детект провала: ошибка или пустой/минимальный контент → retry с `waitFor: 5000`.
Если retry не помог → пометь URL как `[ИСТОЧНИК НЕДОСТУПЕН]` + defuddle fallback (см. Фоллбэк).

### Layer 4 — Дополнение (опционально, 0-2 вызова)

Если остались пробелы:
- Domain-filtered поиск: `brave_web_search(query="...", goggles="$discard\n$site=specific-site.com")`
- Поиск свежих данных: `brave_web_search(query="...", freshness="pw")`

## Бюджет: 3-6 вызовов (было 6-12 при search-then-scrape)

| Layer | Вызовов | Обязательно |
|-------|---------|-------------|
| 1. Контент+discovery | 2-4 | Да (параллельно) |
| 2. Оценка | 0 | Да (анализ) |
| 3. Скрапинг | 0-3 | Только при пробелах |
| 4. Дополнение | 0-2 | Нет |

## Фоллбэк

1. При сбое `brave_llm_context` → продолжай на `brave_web_search` (+`extra_snippets`) и Layer 3. При сбое `brave_web_search` → retry с перефразированным keyword query + `count=5`. Max 2 retry.
2. При ошибке `firecrawl_scrape`:
   a. Retry с `waitFor: 5000` (ловит JS-rendered страницы).
   b. defuddle CLI: `defuddle parse <url> --md`.
   c. Playwright MCP — **только для залогиненных сессий**.
3. Если все каналы дают провал → зафиксировать `[WEB ИСТОЧНИК НЕДОСТУПЕН]` и завершить с тем, что есть.

Перед использованием любого инструмента — загрузи его через ToolSearch если недоступен.
