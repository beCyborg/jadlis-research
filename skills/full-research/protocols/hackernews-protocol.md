# HackerNews — протокол поиска для агента

## MCP-инструменты

Namespace: `mcp__hn__*`

| Инструмент | Назначение |
|---|---|
| `browse_stories` | Просмотр постов по категории (top/new/best/ask/show/job) |
| `search_hn` | Полнотекстовый поиск по всему HN (Algolia) |
| `get_story_details` | Пост с полным деревом комментариев |
| `user_analysis` | Профиль и активность пользователя |

## DEEP-DIVE Protocol

### Layer 1 — Поиск (3 вызова)

1. **По stories:**
```json
search_hn({
  "query": "<ЗАПРОС>",
  "tags": "story",
  "dateRange": "pastYear",
  "sortBy": "relevance",
  "limit": 30
})
```

2. **По комментариям** (для мнений):
```json
search_hn({
  "query": "<ЗАПРОС>",
  "tags": "comment",
  "dateRange": "pastYear",
  "sortBy": "relevance",
  "limit": 20
})
```

3. **Канонический проход** — БЕЗ dateRange, ловит мегатреды старше года
(проверено A/B-бенчмарком 2026-06: даёт треды-первоисточники без роста стоимости):
```json
search_hn({
  "query": "<ЗАПРОС>",
  "tags": "story",
  "sortBy": "relevance",
  "limit": 20
})
```

### Layer 2 — Контекст (0-1 вызов)

Если тема связана с Ask HN или текущими трендами:
```json
browse_stories({ "type": "ask", "limit": 30 })
```

### Layer 3 — Глубокие комментарии (5-7 вызовов)

`get_story_details` для **топ 5-7 постов** из ОБЪЕДИНЕНИЯ всех трёх поисков Layer 1:

Критерии выбора:
1. `num_comments` >= 20
2. Высокий `score`/`points`
3. Максимальная релевантность запросу
4. Баланс: и свежие треды, и канонические (из прохода без dateRange)

```json
get_story_details({
  "id": "<story_id>",
  "maxComments": 30,
  "commentDepth": 5
})
```

### Layer 4 — Контраргументы (2-3 вызова)

После формирования ключевых тезисов — поиск опровержений:

1. `search_hn` с инвертированным запросом:
```json
search_hn({
  "query": "<инвертированный запрос: criticism/problems/alternatives>",
  "tags": "story",
  "dateRange": "pastYear",
  "sortBy": "relevance",
  "limit": 15
})
```

2. `get_story_details` для топ 1-2 постов с контраргументами:
```json
get_story_details({
  "id": "<story_id>",
  "maxComments": 15,
  "commentDepth": 5
})
```

В выходном файле — отдельная секция:
```
## Контраргументы (найдены на HackerNews)
- [{prefix}N] {контраргумент} — {URL}
```

### Layer 5 — Эксперты (опционально)

Если в комментариях замечены эксперты:
```json
user_analysis({ "username": "<expert>", "submissionLimit": 15 })
```

## Правила цитирования (guardrails канонического прохода)

- У каждой цитаты указывай метаданные вовлечённости треда: score и число комментариев.
- Тред старше года → явная пометка «канонический, {год}» + проверь, не устарел ли тезис
  (если тезис load-bearing — быстрая сверка в Layer 4).
- Не более 3 цитат с одного треда — иначе выборка схлопывается в один источник.

## Бюджет: 8-14 вызовов

## Фоллбэк

При сбое HN MCP — используй `mcp__brave-search__brave_web_search`:
```json
{ "query": "site:news.ycombinator.com <ЗАПРОС>", "count": 10 }
```

Вызывай инструмент напрямую. ToolSearch ТОЛЬКО при InputValidationError.
