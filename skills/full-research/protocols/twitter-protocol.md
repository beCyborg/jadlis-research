# Twitter/X — протокол поиска для агента

## Инструмент: headless Grok CLI (через Bash)

Поиск по X/Twitter идёт через **headless Grok CLI**, запускаемый из **Bash** (НЕ MCP, НЕ ToolSearch). CLI биллится по подписке (OIDC) → marginal cost ≈ $0.

Базовая команда:

```bash
~/.grok/bin/grok -p '<ПРОМПТ>' \
  -m grok-4.5 --effort high \
  --output-format json --yolo --no-auto-update \
  --disallowed-tools "run_terminal_cmd" --max-turns 8
```

Парсинг результата:
```bash
... | jq -r '.text'   # .text содержит ответ агента — по контракту промпта это JSON-строка
```

JSON-обёртка CLI: `{text, stopReason, sessionId, requestId, thought}`. Твой результат — внутри `.text`.

> [!note] Проверено на grok 0.2.93 (2026-07-10), модель grok-4.5
> - **`env -u XAI_API_KEY` НЕ нужен.** Session-токен OIDC по precedence выше `XAI_API_KEY` (тот — лишь fallback) → биллинг по подписке автоматически. Источник: `~/.grok/docs/user-guide/02-authentication.md` (Auth Precedence).
> - **`--disallowed-tools "run_terminal_cmd"` — это security-хайген, а НЕ обход бага.** Баг сборки агента из 0.2.22 исправлен; голый `grok -p` работает. Флаг оставлен, потому что поиску по X терминал не нужен. НЕ считать его обязательным «костылём».
> - **Модель пиним явно: `-m grok-4.5 --effort high`.** grok-4.5 (500K ctx) сменила упразднённую `grok-build`; effort'ы: `low|medium|high`, high — дефолт. Пин защищает от смены серверного дефолта. Проверка списка: `grok models`.

## Нативные x_* инструменты (модель вызывает их сама)

| Инструмент | Назначение |
|---|---|
| `x_keyword_search` | Поиск постов с операторами Twitter (основной). `query` (req), `limit`, `mode`=`Top`\|`Latest` |
| `x_semantic_search` | Смысловой поиск. `query`, `limit`, `from_date`, `to_date`, `usernames[]` |
| `x_user_search` | Поиск аккаунтов/людей (найти точный handle). `query`, `count` |
| `x_thread_fetch` | Конкретный пост + полный тред. `post_id` (req) |

Каждый промпт ЖЁСТКО требует: «используй ТОЛЬКО нативные x_* инструменты; верни ТОЛЬКО валидный JSON по схеме, без текста до/после».

## Язык запроса — операторы Twitter внутри `query`

Вся мощь — в строке `query` (у `x_keyword_search` нет отдельных параметров фильтров):

```
from:handle   to:user   @handle              ← по аккаунтам
filter:images   filter:videos   filter:links ← медиа
min_faves:50    min_retweets:10  min_replies:5 ← engagement
since:2026-06-01  until:2026-06-07  lang:ru    ← период / язык
"точная фраза"   OR   -минус                   ← логика
url:example.com                                ← по ссылке
```

`mode=Latest` — хронология (research/динамика); `mode=Top` — популярное.

## Протокол поиска (2 вызова В ОДНОМ сообщении — параллельно)

> **Латентность.** Каждый запуск CLI ≈ 8s cold-start + агентные turns (~30s+ на поиск).
> Исторически канал делал 3-5 ПОСЛЕДОВАТЕЛЬНЫХ вызовов и финишировал на 5-17 минут позже
> остальных каналов /full-research. Поэтому: РОВНО 2 вызова, ОБА в одном ассистентском
> сообщении (два Bash-вызова параллельно), у каждого Bash-параметр `timeout: 300000` (мс).

### Вызов 1 — Обзор + углубление (объединённый, `--max-turns 6`)

Один богатый промпт: broad-поиск И углубление (эксперты/период/альтернативный ракурс)
внутри ОДНОГО агентного запуска — Grok сам сделает несколько x_*-поисков за свои turns:

```bash
~/.grok/bin/grok -p 'Исследуй тему на X: <развёрнутый запрос с контекстом: что ищем, какие мнения/аспекты, какое решение принимается>. Сделай НЕСКОЛЬКО поисков: (1) x_keyword_search query="<ключевые слова + операторы, напр. min_faves:5 since:ГГГГ-ММ-ДД>" mode=Latest limit=8; (2) углубление — по ключевым хэндлам из первого поиска (x_user_search → x_keyword_search query="from:handle1 OR from:handle2 <тема>") ИЛИ x_semantic_search по смысловому ракурсу; (3) при необходимости период since:/until:. Верни ТОЛЬКО валидный JSON: {"posts":[{"url","author","date","text","likes"}]} — все найденные посты одним массивом, без дублей.' \
  -m grok-4.5 --effort high \
  --output-format json --yolo --no-auto-update --disallowed-tools "run_terminal_cmd" --max-turns 6
```

**ВАЖНО:** промпт развёрнутый, НЕ голые ключевые слова.
- ПЛОХО: `"AI agents"`
- ХОРОШО: `"Что разработчики и tech-инфлюенсеры говорят про AI-агентов в 2026: мнения, критика, запуски продуктов, заметные треды"`

### Вызов 2 — Контраргументы (`--max-turns 4`)

```bash
~/.grok/bin/grok -p 'Найди критику, проблемы и негативный опыт с {TOPIC} через x_keyword_search и x_semantic_search. Кто не согласен и почему. Верни ТОЛЬКО JSON {"posts":[{"url","author","date","text","likes"}]}' \
  -m grok-4.5 --effort high \
  --output-format json --yolo --no-auto-update --disallowed-tools "run_terminal_cmd" --max-turns 4
```

В выходном файле — отдельная секция:
```
## Контраргументы (найдены на Twitter/X)
- [{prefix}N] {контраргумент} — {URL}
```

## Бюджет: 2 вызова (жёстко)

Дополнительные CLI-вызовы НЕ делать — даже если результат кажется неполным: цена
третьего вызова — ещё ~40-60s хвоста на весь /full-research. Лучше меньше, но вовремя.

**Аннотация — компактно.** Каждой цитате: Admiralty A-F + ОДНА строка reliabilityWhy.
Развёрнутые досье на авторов, многострочные bias-разборы, мета-теги сверх формата —
НЕ писать: глубина аннотации twitter.md — второй источник латентности канала.

## Деградация (CLI-only, БЕЗ фоллбэка)

Один вызов упал (non-zero exit / таймаут / пустой `.text`), второй ок → работай с тем,
что вернулось, пометь недостающий ракурс в findings.

Оба вызова упали → ОДИН последовательный повтор объединённого вызова (параллельный
запуск мог упереться в rate-limit). Если и он упал:
- верни **пустые** findings + пометку «X-канал недоступен (CLI)»;
- citations/counterarguments пустые; sourceQuality = LOW;
- **НЕ переключайся** на MCP `x_search` или brave — канал работает ТОЛЬКО через CLI
  (MCP grok-mcp = xAI API, платные кредиты — запрещён by design);
- **НЕ роняй** workflow — остальные каналы /full-research должны завершиться.

Причины сбоя для диагностики: истёкший OIDC-токен (нужен `grok login`, виден как exit≠0) или rate-limit подписки. stderr-варнинги `Transport channel closed / AuthorizationRequired` при exit 0 — безвредны (внутренние MCP grok'а), результат валиден.
