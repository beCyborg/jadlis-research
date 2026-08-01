# Reddit — протокол поиска для агента

## MCP-инструменты

Namespace: `mcp__plugin_jadlis-research_reddit__*`

Все операции выполняются через 3 инструмента:
- `mcp__plugin_jadlis-research_reddit__discover_operations` — список операций
- `mcp__plugin_jadlis-research_reddit__get_operation_schema` — схема параметров
- `mcp__plugin_jadlis-research_reddit__execute_operation` — выполнение

**КРИТИЧНО:** `parameters` в `execute_operation` — ВСЕГДА native JSON object, НЕ строка.

## THREE-LAYER Protocol

### Layer 1 — Discover (1 вызов)

```json
execute_operation({
  "operation_id": "discover_subreddits",
  "parameters": {
    "query": "<ЗАПРОС>",
    "limit": 15,
    "min_confidence": 0.4
  }
})
```

Запомни все сабреддиты с confidence >= 0.4.

### Layer 2 — Batch Fetch (5 вызовов)

1. `fetch_multiple` со всеми сабреддитами (confidence >= 0.4, до 7 штук):
```json
execute_operation({
  "operation_id": "fetch_multiple",
  "parameters": {
    "subreddit_names": ["sub1", "sub2", "sub3", "sub4", "sub5"]
  }
})
```

2. `search_subreddit` в **топ-4 сабреддитах** (по одному вызову на каждый):
```json
execute_operation({
  "operation_id": "search_subreddit",
  "parameters": {
    "subreddit": "<top_sub>",
    "query": "<ЗАПРОС>",
    "sort": "relevance",
    "time_filter": "all"
  }
})
```

`time_filter: "all"` + sort relevance ловит одновременно канонические старые треды и свежие
обсуждения (проверено A/B-бенчмарком 2026-06: 3:0 против `year`/топ-2).
Имена параметров сверены со schema: `subreddit_names` (НЕ subreddits), `time_filter` (НЕ time) —
при ошибке схемы сначала `get_operation_schema`, не гадай.

### Layer 3 — Deep Comments (5-7 вызовов)

`fetch_comments` для **топ 5-7 постов** (приоритет постам с `num_comments >= 20`, высокий score):
```json
execute_operation({
  "operation_id": "fetch_comments",
  "parameters": {
    "post_id": "<id>",
    "depth": 5
  }
})
```

### Layer 4 — Контраргументы (2-3 вызова)

После формирования ключевых тезисов — поиск опровержений:

1. `search_subreddit` в тех же субреддитах с инвертированным запросом:
```json
execute_operation({
  "operation_id": "search_subreddit",
  "parameters": {
    "subreddit": "<top_sub>",
    "query": "problems with {TOPIC}" / "why {TOPIC} is bad" / "{TOPIC} criticism",
    "sort": "relevance",
    "time_filter": "all"
  }
})
```

2. `fetch_comments` для постов с противоположной точкой зрения (1-2 вызова)

В выходном файле — отдельная секция:
```
## Контраргументы (найдены на Reddit)
- [{prefix}N] {контраргумент} — {URL}
```

## Бюджет: 12-18 вызовов

## Фоллбэк

При сбое Reddit MCP — используй `mcp__plugin_jadlis-research_brave-search__brave_web_search`:
```json
{ "query": "site:reddit.com <ЗАПРОС>", "count": 10, "result_filter": "web,discussions" }
```

Вызывай инструмент напрямую. ToolSearch ТОЛЬКО при InputValidationError.
