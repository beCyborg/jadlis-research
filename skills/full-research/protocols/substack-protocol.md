# Substack — протокол поиска для агента

## MCP-инструменты

Namespace: `mcp__substack__*`

| Инструмент | Назначение |
|---|---|
| `get_posts` | Последние посты публикации (RSS, макс ~20) |
| `get_all_posts` | Полный архив с фильтрами по датам |
| `get_post_content` | Полный текст поста по URL |
| `analyze_post` | Сентимент, читаемость, ключевые слова |
| `get_author_profile` | Профиль автора |
| `crawl_publication` | Комплексный обход публикации |
| `search_notes` | Поиск по Substack Notes (substring match, НЕ семантический) |
| `get_notes` | Последние Notes автора |

**КЛЮЧЕВОЕ ОГРАНИЧЕНИЕ:** Нет кросс-публикационного поиска — нужен конкретный handle.

## AUTHOR-FIRST Protocol

### Layer 0 — Handle Discovery (обязательно, 2-3 вызова)

Substack MCP не умеет искать по всему Substack — нужны конкретные handles.

**Если SUBSTACK_HANDLES предоставлены оркестратором** — пропусти этот Layer, используй предоставленные handles.

**Иначе — двухэтапный discovery:**

**Шаг 1:** Keyword-based поиск по Substack через Goggles domain filter:
```json
mcp__brave-search__brave_web_search({
  "query": "<ключевые слова по теме ЗАПРОС>",
  "goggles": "$discard\n$site=substack.com",
  "count": 15,
  "extra_snippets": true
})
```
Парсить handles из URL. Оценить релевантность по сниппетам.

**Шаг 2 (опционально):** Найти рекомендации из внешних источников (можно параллельно с шагом 1):
```json
mcp__brave-search__brave_web_search({
  "query": "best substack newsletters about <ТЕМА> recommended",
  "count": 5
})
```
Извлечь упомянутые Substack handles из текста результатов.

Объединить handles из обоих шагов. Выбрать 3-4 самых релевантных.

Вызывай Brave напрямую. ToolSearch ТОЛЬКО при InputValidationError. Brave (тариф Search): 50 req/s — параллельные вызовы OK.

### Layer 1 — Author Reliability + Publication Overview (обязательно, для каждого handle)

1. **Профиль автора** (для оценки надёжности источника — трек-рекорд, тематика, аудитория):
```json
get_author_profile({ "handle": "<handle>" })
```
   **ИЗВЕСТНЫЙ БАГ MCP:** часто возвращает `null`. Тогда ОБЯЗАТЕЛЬНЫЙ fallback — оцени
   трек-рекорд по ленте: `get_posts({ "handle": "<handle>", "limit": 10 })` → каденция
   публикаций, тематическая последовательность, внешние рекомендации/упоминания.
   Результат оценки автора включи в секцию «Оценка источников»
   (проверено A/B-бенчмарком 2026-06: оценка автора повышает diversity и качество контраргументов).

2. **Обзор публикации:**
```json
crawl_publication({
  "handle": "<handle>",
  "post_limit": 10,
  "notes_limit": 15,
  "analyze": true
})
```
   **ХРУПКИЙ инструмент** (в бенчмарке падал стабильно): при ошибке НЕ ретраить —
   сразу переходи на связку `get_posts` + `get_notes` для того же handle.

Обрати внимание на Notes с высоким `children_count` — это дискуссионные заметки.

### Layer 2 — Archive Scan (по необходимости)

Если нужен конкретный период:
```json
get_all_posts({
  "handle": "<handle>",
  "after_date": "2025-01-01",
  "limit": 20
})
```

### Layer 3 — Deep Content (для топ 2-3 постов)

Для самых релевантных постов из Layer 1-2:
```json
get_post_content({ "url": "<полный URL поста>" })
```

При сбое `get_post_content` — Firecrawl по прямому URL поста:
```json
mcp__firecrawl__firecrawl_scrape({ "url": "<url>", "formats": ["markdown"], "onlyMainContent": true })
```
Если цитата восстановлена НЕ из полного текста (сниппет RSS / нота / пересказ) —
помечай её «(реконструировано)» в выходном файле.

Критерии выбора:
1. Заголовок/subtitle релевантны запросу
2. Свежесть публикации
3. Наличие ключевых слов из запроса

### Layer 4 — Cross-Publication (опционально)

Повтори Layer 1-3 для других авторов из Layer 0.

### Layer 5 — Контраргументы (2-4 вызова)

После формирования ключевых тезисов — поиск опровержений:

1. Для каждого handle: несколько УЗКИХ запросов через `search_notes` (substring match — один compound query не сработает):
   - `search_notes(handle, query="problems", limit=10)`
   - `search_notes(handle, query="criticism", limit=10)`
   - `search_notes(handle, query="alternative", limit=10)`
   (Выбрать 2-3 наиболее релевантных ключевых слова на языке запроса)

2. Дополнительно: `get_notes(handle, limit=20)` → просмотреть на наличие дискуссионных заметок (высокий `children_count`) с противоположным мнением

3. Если найдены релевантные посты с контраргументами:
   `get_post_content(url="<url>")` для 1-2 постов

В выходном файле — отдельная секция:
```
## Контраргументы (найдены на Substack)
- [{prefix}N] {контраргумент} — {URL}
```

## Бюджет: 8-16 вызовов

## Фоллбэк

При сбое Substack MCP — используй `mcp__brave-search__brave_web_search`:
```json
{ "query": "site:substack.com <ЗАПРОС>", "count": 15 }
```

Вызывай инструмент напрямую. ToolSearch ТОЛЬКО при InputValidationError.
