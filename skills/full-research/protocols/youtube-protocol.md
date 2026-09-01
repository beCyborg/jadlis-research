# YouTube — протокол поиска для агента

Канал добавлен 2026-08-15 (вердикт совета + пакет доработок). Роутинг: tech/AI,
маркетинг/продажи, локальные темы (Варшава) — по дереву SKILL.md, НЕ default.

## Инструменты

| Инструмент | Назначение | Цена |
|---|---|---|
| `mcp__brave-search__brave_web_search` c `site:youtube.com` | Discovery видео — ОСНОВНОЙ | бесплатно (тариф) |
| `mcp__youtube__searchVideos` | Точный поиск по YouTube API | **100 units/вызов из квоты 10k/день — жёсткий кап ≤3 вызова/прогон** |
| `mcp__youtube__getVideoDetails` | Метаданные: просмотры, дата, канал | 1 unit — дёшево |
| `{PLUGIN_ROOT}/scripts/yt-transcript.py` | ПОЛНЫЙ транскрипт видео (обёртка: transcript-api → yt-dlp) | бесплатно; работает и через VPN (сверено 2026-08-26) |

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
mcp__youtube__searchVideos({ "query": "<ТЕМА>", "maxResults": 10 })
```
**Гейт:** MCP youtube поднимается только при `YOUTUBE_API_KEY` (userConfig плагина).
Ключа нет → Layer 2 целиком ПРОПУСКАЕТСЯ, канал работает на Brave + транскриптах.

**Кап ≤3 вызова/прогон** (каждый = 100 units из дневной квоты 10k, общей для
всех потребителей MCP). Метаданные кандидатов — `getVideoDetails` (дёшево):
просмотры/дата/канал → отбор 3-5 видео на транскрипты.

### Layer 3 — Транскрипты (3-5 видео, Bash)

```bash
python3 {PLUGIN_ROOT}/scripts/yt-transcript.py <video_id>            # дефолт языков: en,ru,pl
python3 {PLUGIN_ROOT}/scripts/yt-transcript.py <video_id> --lang ru,en
```
JSON в stdout: `status`, `source` (`youtube-transcript-api` | `yt-dlp`), `text` (полный
текст), `language`, **`is_generated`** (честный: manual vs auto), `duration_minutes`,
`word_count`, + метаданные `title`/`channel`/`upload_date`/`view_count` (при yt-dlp).
Manual-сабы (`is_generated: false`) приоритетнее auto; auto берётся трек `*-orig`
(язык оригинала, не перевод). yt-dlp-путь ретраит 429 на timedtext-эндпоинте и
перебирает форматы json3→srv3→vtt. ЛИМИТ ОБЪЁМА: держи ≤10-12 транскриптов за проход —
больше подряд ловит `HTTP 429 Too Many Requests` на ВЕСЬ IP (и yt-dlp, и API), снимается
кулдауном несколько минут (боевой прогон 2026-08-26: 11/12 ок, дальше IP залимичен).
Внутри: сначала `get_transcript.py` плагина youtube-tldr (youtube-transcript-api);
при `IpBlocked` — yt-dlp с загрузкой ОДНОГО выбранного трека. Сверено 2026-08-26:
youtube-transcript-api даёт IpBlocked и через VPN, и с домашнего IP, а yt-dlp качает
субтитры в обоих случаях; встроенный yt-dlp-фоллбэк плагина не срабатывает
(`--sub-langs all` + timeout 30 с). Плагин НЕ править (autoUpdate сносит правки).
Окно массового IpBlocked (все видео подряд `blocked`) → `YT_TRANSCRIPT_FORCE_YTDLP=1` перед
командой — сразу yt-dlp, минус один холостой запрос на видео.
Оба пути упали (`error_type: blocked_or_network`) → фоллбэк: hosted Supadata
($5/300) — только по подтверждению.

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

`yt-transcript.py` вернул `blocked_or_network` (оба пути) → Supadata /
youtube-transcript.io (платно, по подтверждению) → цитируй по описанию видео + сниппетам с пометкой
«(реконструировано, транскрипт недоступен)». MCP youtube целиком мёртв →
канал работает на Brave + транскриптах (searchVideos пропускается).
