# YouTube — протокол поиска для агента

Канал добавлен 2026-08-15 (вердикт совета + пакет доработок). Роутинг: tech/AI,
маркетинг/продажи, локальные темы (Варшава) — по дереву SKILL.md, НЕ default.

## Инструменты

| Инструмент | Назначение | Цена |
|---|---|---|
| `mcp__plugin_jadlis-research_brave-search__brave_web_search` c `site:youtube.com` | Discovery видео — ОСНОВНОЙ | бесплатно (тариф) |
| `mcp__plugin_jadlis-research_youtube__searchVideos` | Точный поиск по YouTube API | **100 units/вызов из квоты 10k/день — жёсткий кап ≤3 вызова/прогон** |
| `mcp__plugin_jadlis-research_youtube__getVideoDetails` | Метаданные: просмотры, дата, канал | 1 unit — дёшево |
| `{PLUGIN_ROOT}/scripts/yt-transcript.py` | ПОЛНЫЙ транскрипт видео | бесплатно (работает с домашнего IP; блокировки только у облачных ASN) |

## Протокол

### Layer 1 — Discovery (2-3 вызова Brave, параллельно)

```json
brave_web_search({ "query": "site:youtube.com <ТЕМА>", "count": 15, "extra_snippets": true })
brave_web_search({ "query": "site:youtube.com <ТЕМА + review/vs/опыт>", "count": 10 })
```
Из URL парси video_id (`watch?v=<id>`). Свежесть — `freshness="py"`.

### Layer 2 — Точный добор (0-3 вызова API, НЕ БОЛЬШЕ)

Только если Brave не дал релевантных видео (нишевая тема, свежак):
```json
mcp__plugin_jadlis-research_youtube__searchVideos({ "query": "<ТЕМА>", "maxResults": 10 })
```
**Гейт:** MCP youtube поднимается только при `YOUTUBE_API_KEY` (userConfig плагина).
Ключа нет → Layer 2 целиком ПРОПУСКАЕТСЯ, канал работает на Brave + транскриптах.
**Кап ≤3 вызова/прогон** (каждый = 100 units из дневной квоты 10k, общей для
всех потребителей MCP). Метаданные кандидатов — `getVideoDetails` (дёшево):
просмотры/дата/канал → отбор 3-5 видео на транскрипты.

### Layer 3 — Транскрипты (3-5 видео, Bash)

```bash
{PLUGIN_ROOT}/scripts/yt-transcript.py <video_id>
```
JSON в stdout: `status`, `text` (полный текст), `language`, **`is_generated`**,
`duration_minutes`. Manual-сабы (`is_generated: false`) приоритетнее auto.
Ошибка RequestBlocked/IpBlocked — на домашнем IP редкость; фоллбэк: hosted
Supadata ($5/300) — НЕ первая ступень, только при блоке.

### Layer 4 — Контраргументы (1-2 вызова)

Brave: `site:youtube.com <ТЕМА> criticism/problems/honest review` → 1-2
транскрипта несогласных.

## Правила цитирования (вердикт совета 2026-08-15)

- **Автосабы (`is_generated: true`) НЕ цитировать дословно** — WER ~23%:
  передавай смысл пересказом с пометкой «(автосабы, пересказ)». Дословные
  цитаты — только из manual-сабов.
- Факты из видео = обычные claims: без независимого подтверждения верификаторы
  дадут UNCHECKED/3 — это штатно.
- Каждой цитате — просмотры + дата видео + канал (метаданные вовлечённости).
- reliability: официальный канал вендора = A/E (аффилированность!); практик
  с трек-рекордом = B; ноунейм-обзорщик = C/D.
- Префиксы цитат: [yt1], [yt2], ... URL вида `https://youtube.com/watch?v=<id>`
  (+ `&t=<сек>` если цитата привязана к месту).
- СНАПШОТЫ (schema v2): текст транскрипта — в `{WORK_DIR}/snapshots/yt<N>.md`
  для HIGH-relevance источников.

## Бюджет: 6-12 вызовов (из них ≤3 — youtube API search)

## Фоллбэк

`yt-transcript.py` блокирован → Supadata / youtube-transcript.io (платно, по
подтверждению) → цитируй по описанию видео + сниппетам с пометкой
«(реконструировано, транскрипт недоступен)». MCP youtube целиком мёртв →
канал работает на Brave + транскриптах (searchVideos пропускается).
