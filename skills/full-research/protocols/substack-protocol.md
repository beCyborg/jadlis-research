# Substack — протокол поиска для агента

## Инструмент: `substack-fetch.py` (свой, Bash — MCP для Substack в плагине нет)

Все вызовы через Bash: `{PLUGIN_ROOT}/scripts/substack-fetch.py <подкоманда> ...`
(шебанг сам тянет requests через uv). Анонимный `/api/v1` с браузерным UA +
discovery-заголовками; работает с домашнего IP (облачные IP получают 403 —
известное ограничение Substack, к нам не относится). Кэш: ключ из всех argv.

| Подкоманда | Что даёт |
|---|---|
| `archive <pub> [--limit ≤12] [--search Q] [--offset N]` | лента архива: заголовки, даты, id, slug, 👍реакции, 💬счётчики, wordcount, audience. `--search` — поиск ПО изданию (работает анонимно) |
| `post <pub> <slug>` | ПОЛНЫЙ текст поста → markdown-файл, stdout = путь (Read) |
| `comments <pub> <post_id>` | ПОЛНОЕ дерево комментариев с текстами → файл, stdout = путь. post_id — числовой id из archive |
| `search-pub <query>` | глобальный поиск изданий (работает анонимно через discovery-заголовки; exit 3 = пусто → Brave) |
| `notes <pub>` | best-effort; exit 3 = слой недоступен (НЕ «Notes нет») |

`<pub>` — канонический handle (`astralcodexten`); кастомные домены редиректят,
адаптер follow'ит. `audience: only_paid` в archive = пост за пейволлом —
полного текста не будет (`post` вернёт EMPTY_BODY, exit 3), цитируй по
subtitle с пометкой «(реконструировано)».

## AUTHOR-FIRST Protocol

### Layer 0 — Discovery изданий (1-3 вызова)

**Если SUBSTACK_HANDLES предоставлены оркестратором** — пропусти, используй их.

**Иначе — два пути параллельно:**

1. Основной — Brave `site:` (надёжный, даёт и посты сразу):
```json
mcp__plugin_jadlis-research_brave-search__brave_web_search({
  "query": "site:substack.com <ключевые слова ЗАПРОСА>",
  "count": 15, "extra_snippets": true
})
```
Парсить handles из URL (`<handle>.substack.com/p/...` и корень). Дедуп по
домену обязателен (15 результатов ≈ 12 уникальных handles).

2. Дополняющий — глобальный поиск изданий по теме:
```bash
{PLUGIN_ROOT}/scripts/substack-fetch.py search-pub "<тема EN>"
```
exit 3 → путь недоступен, работай только по Brave (не считать провалом).

Объединить, выбрать **3-4 самых релевантных** handle.

### Layer 1 — Оценка автора по ленте (3-4 вызова)

```bash
{PLUGIN_ROOT}/scripts/substack-fetch.py archive <handle> --limit 12
```
По ленте смотри: каденция (даты соседних постов); тематическая
последовательность; свежесть (лента без постов ~6 мес = слабый источник);
вовлечённость (👍/💬 — сигнал, которого MCP-серверы Substack не отдавали).
Результат — в секцию «Оценка источников». Здесь же отбирай кандидатов
в Layer 2-3: релевантность заголовка/subtitle + свежесть + 💬.

### Layer 2 — Тематический срез архива (1-3 вызова)

Лента Layer 1 не покрыла тему → поиск по изданию:
```bash
{PLUGIN_ROOT}/scripts/substack-fetch.py archive <handle> --search "<тема EN>" --limit 12
```
Глубже в историю: `--offset 12`, `--offset 24` (по 12 за вызов).

### Layer 3 — Полный текст (2-3 вызова, топ-посты)

```bash
{PLUGIN_ROOT}/scripts/substack-fetch.py post <handle> <slug>
```
stdout = путь к markdown с полным текстом — читай через Read. slug — из
`canonical_url`/`slug` архива. Цитируй из полного текста, НЕ из subtitle.
СНАПШОТЫ (schema v2): этот файл и есть полный текст — копируй в
`{WORK_DIR}/snapshots/` для HIGH-relevance цитат.

### Layer 3.5 — Комментарии читателей (1-2 вызова; НОВОЕ — глубина)

Для поста с высоким 💬 (споры, опыт практиков — часто ценнее самого поста):
```bash
{PLUGIN_ROOT}/scripts/substack-fetch.py comments <handle> <post_id>
```
Полное дерево с текстами (60+ КБ на живом треде — читай Read'ом частями).
Комментарии — источник контраргументов и C-reliability цитат из личного опыта.

### Layer 4 — Cross-Publication (опционально)

Повтори Layer 1-3 для других handles из Layer 0. Каждый дополнительный
handle = +3-4 вызова сверх бюджета — только если синтеза не хватает.

### Layer 5 — Контраргументы (2-3 вызова)

1. Brave-поиск критики: `site:substack.com <ТЕМА> criticism` (варианты:
   problems / overrated / alternative / why <ТЕМА> is wrong), count 15,
   extra_snippets. Дедуп handles как в Layer 0.
2. `notes <handle>` — best-effort (exit 3 = недоступно, не «нет критики»).
3. Для 1-2 постов с реальным контраргументом — `post`, для споров — `comments`.

В выходном файле — отдельная секция:
```
## Контраргументы (найдены на Substack)
- [{prefix}N] {контраргумент} — {URL}
```

## Бюджет: 9-15 вызовов

| Слой | Вызовы |
|---|---|
| Layer 0 — discovery | 0 (handles от оркестратора) или 2-3 |
| Layer 1 — оценка автора | 3-4 `archive` |
| Layer 2 — тематический срез | 1-3 `archive --search` |
| Layer 3 — полный текст | 2-3 `post` |
| Layer 3.5 — комментарии | 1-2 `comments` |
| Layer 5 — контраргументы | 2-3 |

## Фоллбэк

`substack-fetch.py` сломан (сеть, 403, нет `uv`) → Brave
`site:substack.com <ЗАПРОС>` (цитаты из сниппетов помечать «(реконструировано)»).
**MCP-фоллбэка в плагине нет** — если и Brave не даёт материала, канал деградирует:
верни `sourceQuality=LOW` с пустыми citations, workflow продолжится на остальных каналах.

Вызывай инструменты напрямую. ToolSearch ТОЛЬКО при InputValidationError.

## Заметки по API (реверс, сверено пробами 2026-08-15)

- `/api/v1/search/explore/web` — НЕ поиск: query игнорируется, это Explore-фид.
- Глобальные `publication/search`, `post/search` БЕЗ discovery-заголовков
  (`Origin: https://substack.com`, `Referer: https://substack.com/discover`)
  отдают тихий ПУСТОЙ результат вместо 401 — адаптер шлёт заголовки сам.
- `post/{id}/comments` — полное дерево анонимно (проба: 62 КБ текстов).
- Карта 129 эндпоинтов: `github.com/AnthonyDavidAdams/substack-api-reference`.
- Notes: `/api/v1/reader/feed/profile/{user_id}` читается, но нужен числовой
  user_id; `comment/feed` — 403 всегда. Адаптер пробует оба известных пути.
