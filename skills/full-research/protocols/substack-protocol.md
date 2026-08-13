# Substack — протокол поиска для агента

## MCP-инструменты

Namespace: `mcp__plugin_jadlis-research_substack__*`

**Рабочие (проверены пробами 2026-08-06):**

| Инструмент | Назначение |
|---|---|
| `get_posts` | Последние посты публикации (RSS, ~20 макс) — основа оценки автора |
| `get_all_posts` | Архив с фильтром `after_date` (ISO-дата), сортировка по убыванию — freshness-слой |
| `get_post_content` | Полный текст поста по URL |

**Не вызывать (сломаны, сверено 2026-08-06):**

| Инструмент | Причина |
|---|---|
| `crawl_publication` | Падает при ЛЮБОМ `analyze`: `'CrawlResult' object has no attribute 'handle'` (`mcp_server.py:429` читает поле, которого нет в `models.py:118-126`); тратит ~2.3 с и сетевые запросы впустую. Замена — `get_all_posts` |
| `get_notes` | Слой Notes мёртв: `/api/v1/notes` отдаёт 301/404, `client.py:87-91` глотает и возвращает `[]`. 5/5 вызовов → 0 |
| `search_notes` | Тот же мёртвый источник + substring-фильтр поверх пустого списка (`client.py:96-107`). 0 результатов даже на одиночном слове |
| `get_author_profile` | 3/3 профиля полностью null; непусты только `handle` и сконструированный `publication.url` — он выводится из handle локально, без сетевого вызова |
| `analyze_post` | Пробами не проверялся, в пайплайне не нужен: сентимент/ключевые слова агент извлекает из текста `get_post_content` сам |

**КЛЮЧЕВОЕ ОГРАНИЧЕНИЕ:** Нет кросс-публикационного поиска — нужен конкретный handle.
Handles приходят только снаружи, через Layer 0 (Brave).

## AUTHOR-FIRST Protocol

### Layer 0 — Handle Discovery (0-3 вызова)

**Если SUBSTACK_HANDLES предоставлены оркестратором** — пропусти этот Layer, используй предоставленные handles.

**Иначе — двухэтапный discovery:**

**Шаг 1:** Поиск по Substack через оператор `site:` в query:
```json
mcp__plugin_jadlis-research_brave-search__brave_web_search({
  "query": "site:substack.com <ключевые слова по теме ЗАПРОС>",
  "count": 15,
  "extra_snippets": true
})
```
Парсить handles из URL. Валидны обе формы: `<handle>.substack.com/p/...` и корень `<handle>.substack.com/`.
Оценить релевантность по сниппетам.

**Дедуп handles по домену обязателен:** 15 результатов ≈ 12 уникальных handles —
домены повторяются (в пробе `pjordan` ×3, `aimaker` ×2).

**Шаг 2 (опционально, можно параллельно с шагом 1):** рекомендации из внешних источников:
```json
mcp__plugin_jadlis-research_brave-search__brave_web_search({
  "query": "best substack newsletters about <ТЕМА> recommended",
  "count": 5
})
```
Извлечь упомянутые Substack handles из текста результатов.

Объединить handles из обоих шагов, дедуп по домену, выбрать **3-4 самых релевантных**.

**Goggles — фоллбэк, не дефолт.** Вариант `"goggles": "$discard\n$site=substack.com"` даёт
ровно тот же выход (A/B 2026-08-06: 12 уникальных handles против 12, оба варианта
детерминированы на двух прогонах), но требует лишнего параметра. Держать его для случая,
когда нужен фильтр по нескольким доменам сразу, или если `site:` в query неожиданно пуст.

Вызывай Brave напрямую. ToolSearch ТОЛЬКО при InputValidationError. Brave (тариф Search): 50 req/s — параллельные вызовы OK.

### Layer 1 — Author Reliability по ленте (3-4 вызова, по одному на handle)

```json
get_posts({ "handle": "<handle>", "limit": 10 })
```

Оценивай автора **только по ленте** — `get_author_profile` не вызывать (3/3 null, см. таблицу выше).
По ответу `get_posts` смотри:
1. **Каденция** — регулярность публикаций (даты соседних постов).
2. **Тематическая последовательность** — тема запроса это профиль автора или случайный заход.
3. **Свежесть** — дата верхнего поста; лента без постов за последние ~6 месяцев = слабый источник.
4. Внешние упоминания/рекомендации из сниппетов Layer 0.

Результат оценки автора включи в секцию «Оценка источников»
(требование A/B-бенчмарка 2026-06: оценка автора повышает diversity и качество контраргументов;
механика сменилась с профиля на ленту, само требование — нет).

Здесь же отбирай кандидатов в Layer 2-3: релевантные заголовки/subtitle + свежесть.

### Layer 2 — Freshness / Archive (2-3 вызова)

Для handles, у которых лента Layer 1 не покрывает нужное окно:
```json
get_all_posts({
  "handle": "<handle>",
  "after_date": "<сегодня минус 90 дней, YYYY-MM-DD>",
  "limit": 20
})
```

Дефолтное окно — **последние 90 дней**; для исторического среза подставь свою ISO-дату.
Фильтр `after_date` отрабатывает точно (проба S5 2026-08-06: ни одного поста раньше порога,
сортировка по убыванию даты, `published` — полный ISO-таймстамп с TZ).
Поле `author` в ответе всегда null — игнорировать.

Пропускай слой для handle, у которого все 10 постов из `get_posts` уже внутри окна.

### Layer 3 — Deep Content (2-3 вызова, топ-посты)

Для самых релевантных постов из Layer 1-2:
```json
get_post_content({ "url": "<полный URL поста>" })
```

При сбое `get_post_content` — Firecrawl по прямому URL поста:
```json
mcp__plugin_jadlis-research_firecrawl__firecrawl_scrape({ "url": "<url>", "formats": ["markdown"], "onlyMainContent": true })
```
Если цитата восстановлена НЕ из полного текста (сниппет RSS / пересказ) —
помечай её «(реконструировано)» в выходном файле.

Критерии выбора:
1. Заголовок/subtitle релевантны запросу
2. Свежесть публикации
3. Наличие ключевых слов из запроса

### Layer 4 — Cross-Publication (опционально)

Повтори Layer 1-3 для других авторов из Layer 0. Разворачивать только если синтеза не хватает:
каждый дополнительный handle стоит +3-4 вызова сверх бюджета.

### Layer 5 — Контраргументы (2-3 вызова)

Substack Notes для этого **недоступны** (слой мёртв, см. таблицу) — контраргументы ищутся через Brave.

1. Поиск критики по Substack (1-2 вызова, ключевые слова на языке запроса):
```json
mcp__plugin_jadlis-research_brave-search__brave_web_search({
  "query": "site:substack.com <ТЕМА> criticism",
  "count": 15,
  "extra_snippets": true
})
```
Варианты ключевого слова: `criticism` / `problems` / `overrated` / `alternative` /
`why <ТЕМА> is wrong`. Дедуп handles по домену — тот же, что в Layer 0.

2. Для 1-2 найденных постов с реальным контраргументом:
```json
get_post_content({ "url": "<url>" })
```

В выходном файле — отдельная секция:
```
## Контраргументы (найдены на Substack)
- [{prefix}N] {контраргумент} — {URL}
```

## Бюджет: 8-14 вызовов

| Слой | Вызовы |
|---|---|
| Layer 0 — discovery | 0 (handles от оркестратора) или 2-3 brave |
| Layer 1 — оценка автора | 3-4 `get_posts` |
| Layer 2 — freshness | 2-3 `get_all_posts` |
| Layer 3 — deep content | 2-3 `get_post_content` |
| Layer 5 — контраргументы | 2-3 (brave + `get_post_content`) |

Нижняя граница — когда handles пришли от оркестратора и часть лент уже покрывает окно 90 дней.
Верхняя — со своим discovery и 4 handles. Layer 4 в бюджет не входит.

## Фоллбэк

При сбое Substack MCP целиком — используй `mcp__plugin_jadlis-research_brave-search__brave_web_search`:
```json
{ "query": "site:substack.com <ЗАПРОС>", "count": 15, "extra_snippets": true }
```
Цитаты из сниппетов помечать «(реконструировано)».

Вызывай инструмент напрямую. ToolSearch ТОЛЬКО при InputValidationError.

## Вердикт по альтернативному server.py (проба 2026-08-06)

**Не мигрировать канал на альтернативную реализацию `substack_mcp/src/substack_mcp/server.py`**
(FastAPI-вариант того же пакета; в плагине подключён stdio-сервер из `vendor/substack-mcp`).
Секция стоит здесь, чтобы идею «там же 13 tools и кросс-поиск» не открывали заново.

1. **«Кросс-поиск» = hardcode-мапа на 3 издания.** `resolve_publication_hint` (строки 23-38) и
   `auto_discover_publications` (строки 51-86) возвращают подмножества одного триплета
   `stratechery / platformer / importai`; тот же триплет захардкожен ещё дважды — строки 602 и 774.
2. **2 из 3 изданий — мёртвые зеркала.** `stratechery.substack.com` = один тестовый пост «asdf»
   от 2020-06-04; `platformer.substack.com` = «Why Platformer is leaving Substack», 2024-01-12
   (издание ушло с Substack в январе 2024). Отсюда 0 результатов даже на профильной теме.
3. **Tool `search` падает:** `'coroutine' object is not subscriptable` — срез корутины до `await`,
   строка 600 (`await auto_discover_publications(query)[:3]`), воспроизведено вживую.
4. **13 tools не существует:** живой прогон на `127.0.0.1:8899`
   (`uvicorn substack_mcp.server:app`, это FastAPI, а не stdio-MCP) отдал по `tools/list`
   **7 tools**. Статический разбор подтверждён живым прогоном.

Кросс-публикационный охват строить только так: Layer 0 (Brave → handles) + пер-handle вызовы
подключённого MCP.
