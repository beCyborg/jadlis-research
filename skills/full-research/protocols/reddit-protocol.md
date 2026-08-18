# Reddit — протокол поиска для агента

## MCP-инструменты

Namespace: `mcp__plugin_jadlis-research_reddit__*`

Все операции выполняются через 3 инструмента:
- `mcp__plugin_jadlis-research_reddit__discover_operations` — список операций
- `mcp__plugin_jadlis-research_reddit__get_operation_schema` — схема параметров
- `mcp__plugin_jadlis-research_reddit__execute_operation` — выполнение

**КРИТИЧНО:** `parameters` в `execute_operation` — ВСЕГДА native JSON object, НЕ строка.

## THREE-LAYER Protocol

### Layer 1 — Discover (2 вызова: лексический + семантический)

**Шаг 1 (первым, всегда): `mcp__plugin_jadlis-research_reddit-alt__reddit_search_communities`** (`q`, `limit: 10`) —
лексический поиск официального листинга. Находит точные имена, к которым слеп семантический
индекс primary (r/mcp первым результатом — замер 3×3 2026-08-15; вердикт совета 2026-08-15:
reddit-alt = первая линия discovery, свой OAuth-клиент/заявка НЕ нужны, пока reddit-alt жив).
~$0.002/вызов (прикреплённый ключ), без 402-слоя primary.

**Шаг 2 (опционально): primary `discover_subreddits`** — только если тема перифрастическая
(смысловой запрос без точных имён) И шаг 1 дал мало релевантного. Один вызов с массивом
`queries` — 2-3 переформулировки. Батч эквивалентен по покрытию N одиночным вызовам
(проба 2026-08-06), но стоит 1 вызов вместо N. `limit` действует **per query**.
При 402 от primary — НЕ ретраить, работать только через reddit-alt (402 = платный слой
вендора MCP, не Reddit).

```json
execute_operation({
  "operation_id": "discover_subreddits",
  "parameters": {
    "queries": ["<ЗАПРОС>", "<синоним-1>", "<синоним-2>"],
    "limit": 15,
    "min_confidence": 0.4
  }
})
```

Запомни все сабреддиты с confidence >= 0.4.

Не повторяй `discover_subreddits` «для надёжности» — ответ детерминирован (векторный индекс,
не живая выдача), повтор тратит вызов и ничего не меняет.

Слабый сигнал качества — `summary.confidence_stats` (`mean`/`max`). При низком `max` (< ~0.6) —
максимум ОДНА переформулировка запроса, не больше. Полями `quality_indicators` (в payload его нет)
и `tier_distribution` (вырожден: всё `peripheral`) не пользоваться.

### Layer 1b — Прямая проверка очевидных имён (+0-2 вызова)

Если тема содержит короткое имя или термин (аббревиатура, имя продукта, `r/<term>`) — проверь
такой сабреддит **напрямую** через `search_subreddit`, не полагаясь на discovery: семантический
индекс слеп к точным именам сабреддитов.

Кейс: `r/mcp` (73K подписчиков) по запросу «MCP model context protocol» не выдаётся вообще —
discovery возвращает Minecraft и McKinney (подстрочный матч «Mc»); снятие `min_confidence` не лечит.
Прямой `search_subreddit` в `r/mcp` при этом отрабатывает идеально (проба 2026-08-06).

Признак, что нужен этот шаг: все `match_tier == "peripheral"` и имена явно из другого домена.

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
    "subreddit_name": "<top_sub>",
    "query": "<ЗАПРОС>",
    "sort": "relevance",
    "time_filter": "all",
    "limit": 25
  }
})
```

`time_filter: "all"` + sort relevance ловит одновременно канонические старые треды и свежие
обсуждения (проверено A/B-бенчмарком 2026-06: 3:0 против `year`/топ-2).
`"limit": 25` обязателен: дефолт — 10, а позиции 11-25 содержат прямые попадания
(проба 2026-08-06). Стоит 0 дополнительных вызовов, даёт ×2,5 к охвату.
Имена параметров сверены со schema 2026-08-06: `subreddit_names` (НЕ subreddits),
`time_filter` (НЕ time), `subreddit_name` (канон для `search_subreddit`) —
при ошибке схемы сначала `get_operation_schema`, не гадай.
`subreddit` — недокументированный рабочий алиас (нормализуется сервером), не полагаться:
может исчезнуть при апгрейде.

### Layer 2b — Freshness-проход (2 вызова)

`search_subreddit` в **топ-2 сабреддитах** с сортировкой по свежести:
```json
execute_operation({
  "operation_id": "search_subreddit",
  "parameters": {
    "subreddit_name": "<top_sub>",
    "query": "<ЗАПРОС>",
    "sort": "new",
    "time_filter": "month",
    "limit": 25
  }
})
```

Релевантность в этом режиме проседает — `sort: "new"` отдаёт свежайшее из совпавших
по любому слабому совпадению (проба 2026-08-06). Брать **только прямые попадания**,
каждую freshness-цитату помечать датой поста.

### Layer 3 — Deep Comments (5-7 вызовов)

`fetch_comments` для **топ 5-7 постов** (приоритет постам с `num_comments >= 20`, высокий score):
```json
execute_operation({
  "operation_id": "fetch_comments",
  "parameters": {
    "url": "https://reddit.com/r/<sub>/comments/<id>/",
    "comment_limit": 50,
    "comment_sort": "top"
  }
})
```
Принимает `url` (предпочтительно) либо `submission_id`. Параметров `post_id`/`depth` **нет** —
вызов падает с `unexpected keyword argument 'post_id'` (сверено с живым MCP 2026-07-27).

### Layer 4 — Контраргументы (2-3 вызова)

После формирования ключевых тезисов — поиск опровержений:

1. `search_subreddit` в тех же субреддитах с инвертированным запросом:
```json
execute_operation({
  "operation_id": "search_subreddit",
  "parameters": {
    "subreddit_name": "<top_sub>",
    "query": "problems with {TOPIC}" / "why {TOPIC} is bad" / "{TOPIC} criticism",
    "sort": "relevance",
    "time_filter": "all",
    "limit": 25
  }
})
```

2. `fetch_comments` для постов с противоположной точкой зрения (1-2 вызова)

В выходном файле — отдельная секция:
```
## Контраргументы (найдены на Reddit)
- [{prefix}N] {контраргумент} — {URL}
```

## Правила цитирования

- Не более **3 цитат с одного треда** — иначе один тред перевешивает канал.
- У **каждой** цитаты — дата поста (рекомендация бенчмарка 2026-06).
  Для цитат из Layer 2b дата обязательна вдвойне: это и есть их ценность.

## Бюджет: 14-20 вызовов

## Резервный Reddit-MCP — `reddit-alt` (redditapis-mcp, ступень 1.5)

Второй MCP, независимый бэкенд (api.redditapis.com, live-данные, полные метрики).
Namespace: `mcp__plugin_jadlis-research_reddit-alt__*` — 32 плоских тула (без execute_operation-обёртки).
Платный: ~$0.002/read с прикреплённого ключа (в env конфига), т.е. полный протокол ≈ $0.05.
`reddit_deep_comment_search` — «premium call» с недокументированной ценой, по умолчанию не звать.

Маппинг операций планки:

| Операция primary | reddit-alt | Отличия |
|---|---|---|
| `discover_subreddits` | `reddit_search_communities` (`q`, `limit`) | лексический, НЕ semantic → находит точные имена (r/mcp — проверено 2026-08-12), но хуже по смысловым перифразам |
| `search_subreddit` | `reddit_search` (`q`, `subreddit`, `sort`, `t`, `limit`, пост-фильтры `min_score`/`min_comments`) | есть и глобальный поиск (без `subreddit`) — primary так не умеет |
| `fetch_posts` | `reddit_subreddit_posts` (`sort`: hot/new/top/rising/controversial/best) | — |
| `fetch_multiple` | нет батча по сабам → по одному `reddit_subreddit_posts`; батч по id — `reddit_by_id` (до 100 fullnames) | |
| `fetch_comments` | `reddit_post_comments` (`permalink`, `limit`) | threaded-дерево + `after`-курсор |
| feeds | мониторинг только на платном плане — не используем | |

**Роли (обновлено вердиктом совета 2026-08-15):** discovery — reddit-alt ПЕРВЫМ (Layer 1
шаг 1), primary discover — второй линией для смысловых перифраз. Остальные операции —
primary первым выбором; переключение на alt (любое из): primary 5xx/timeout/402;
не-английский запрос (кейс польского — проверено 2026-08-12: primary 0, alt находит r/Polska);
нужны live-метрики свежих постов (у Arctic Shift score заморожен).

## Fallback-лестница (no-auth бэкенды)

MCP остаётся **primary** (live-данные, семантика). Лестница — когда MCP молчит,
recall-гэп (семантика слепа к точным именам, кейс r/mcp; ломается на польском)
или нужна история. Оба бэкенда — без ключей и регистрации.
CLI-обёртка с троттлингом: `python3 {PLUGIN_ROOT}/scripts/reddit-archive.py` (sub / search / comments).

1. **Точное имя сабреддита или blind-spot discovery** → **Arctic Shift** `posts/search` по `subreddit`:
   `https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=<sub>&limit=100`
   (+ `after`/`before` ISO-даты, `author`, `query` — FTS внутри одного сабреддита).
   Лимит ~2000 rpm, архив 2005→сейчас, **лаг свежести ~месяц** — свежее только через MCP.
2. **Полнотекст/ключевик по ВСЕМУ Reddit** (не умеют ни MCP, ни Arctic Shift) → **PullPush** `q=`:
   `https://api.pullpush.io/reddit/search/submission/?q=<query>&size=100` (и `.../search/comment/`).
   Лимиты: soft **15 rpm** / hard **30 rpm** (~1000/час) → sleep ~4 с между вызовами, 1 воркер.
   Best-effort: волонтёрский, без SLA, гэпы в данных после 2023 — Arctic Shift первичнее, где хватает.
3. **Бэкфилл за пределами 1000-item cap / глубокая история** → Arctic Shift, при массовых
   объёмах — bulk-dumps Watchful1 (github.com/Watchful1/PushshiftDumps, ~4 ТБ).

Дерево комментов треда → Arctic Shift `comments/tree?link_id=<submission_id>&limit=25000`.

Лимиты сняты на 2026-08 (волонтёрские, могут меняться) — при первом 429 сверить заново.

## Фоллбэк (Brave, если и бэкенды недоступны)

При сбое Reddit MCP и бэкендов — `mcp__plugin_jadlis-research_brave-search__brave_web_search`:
```json
{ "query": "site:reddit.com <ЗАПРОС>", "count": 10, "result_filter": "web,discussions" }
```

Вызывай инструмент напрямую. ToolSearch ТОЛЬКО при InputValidationError.
