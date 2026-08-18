# Web (Codex/GPT-5.6 Sol) — протокол поиска для агента

## Инструмент: Codex CLI (через Bash)

Web-поиск через **Codex CLI** (`codex exec`) с включённым web search. Биллинг — подписка ChatGPT → marginal cost ≈ $0 (плюс оплаченный priority-тир, см. ниже). Модель, reasoning effort и тир запинены прямо в командах: `gpt-5.6-sol`, effort `high`, `service_tier="priority"` — канал не зависит от глобального дефолта `~/.codex/config.toml`. При смене поколения модели обновить пин здесь (все три команды) и подпись источника в `{PLUGIN_ROOT}/workflows/full-research-core.js` (`ALL_CHANNELS.codexweb.source`).

> [!note] «Быстрая модель» = `service_tier="priority"`, НЕ отдельная модель
> Имени `gpt-5.6-sol-fast` у API не существует (HTTP 400 «not supported when using Codex with a ChatGPT account» — проверено 2026-08-15). Настройка «Fast» в UI Codex = **`service_tier="priority"`** — официальное описание из каталога моделей: «1.5x speed, increased usage» (быстрее, но сжигает лимиты быстрее). Оплачена и запинена в командах ниже; A/B 2026-08-15 на боевом промпте: sol-high 177 с → 151 с (**−15%**), живых поисков одинаково (11). Если priority-лимиты кончатся — вернуть `"default"`.
> **Модель канала — ВСЕГДА `gpt-5.6-sol`** (решение пользователя 2026-08-15). Luna/Terra не использовать: замер luna-high дал −43% времени, но вдвое меньше живых поисков (5 vs 11) — глубина поиска и есть смысл канала.

Базовая команда (Bash, `timeout: 300000` мс на вызов):

```bash
codex exec -m gpt-5.6-sol -s read-only --skip-git-repo-check -c model_reasoning_effort="high" -c service_tier="priority" -c 'tools.web_search={mode="live"}' --json '<ПРОМПТ>' < /dev/null
```

> [!warning] `< /dev/null` ОБЯЗАТЕЛЕН во всех вызовах — без него канал висит до таймаута
> `codex exec` читает stdin (при переданном промпте пайп добавляется как `<stdin>`-блок), а
> Bash-тул stdin не закрывает → Codex ждёт EOF бесконечно. Симптом: **0 байт stdout, exit 143
> (SIGTERM по таймауту), в stderr `Reading additional input from stdin...`**. Это НЕ проблема
> авторизации и НЕ транзиент. A/B сверено 2026-08-06 на codex-cli 0.146.0: без редиректа —
> убит по таймауту, 0 байт; с `< /dev/null` — exit 0 за 6 с на тривиальном промпте, 156 с на
> боевом. Вероятная причина того, что codexweb — самый медленный канал телеметрии
> (медиана 1078 с ≈ зависания + ретраи).

- Флага `--search` НЕ существует (проверено на codex-cli 0.146.0, сверено 2026-08-06) — web search включается только через `-c`.
- **`tools.web_search={mode="live"}` — ОБЯЗАТЕЛЬНЫЙ пин (проверено на 0.147.0, 2026-08-15).** Голый `true` может отдавать КЭШ индекса OpenAI (режим cached: сниппеты из кэша, при недоступности сети — фабрикация без ошибки). `{mode="live"}` валиден и даёт живые web_search-события (проба: 2 живых поиска, актуальный топ HN). Значение `"live"` строкой — invalid config, только объект `{mode="live"}`.
- `-s read-only` обязателен: глобальный конфиг пользователя — `danger-full-access`, для поиска он не нужен.
- `--json` — JSONL-события в stdout (проверено на 0.146.0, сверено 2026-08-06). Финальный текст агента:
  ```bash
  ... --json | jq -rs '[.[] | select(.type == "item.completed" and .item.type == "agent_message")] | last | .item.text'
  ```
  Проверка, что поиск был ЖИВЫМ: в JSONL должны быть события `item.type == "web_search"` —
  считать только завершённые, иначе счётчик удваивается (каждый поиск даёт пару
  `item.started` + `item.completed`; в пробе 2026-08-06 «26 событий» = **13 реальных поисков**):
  ```bash
  ... --json | jq -s '[.[] | select(.type == "item.completed" and .item.type == "web_search")] | length'
  ```
  ≥ 1 — поиск живой. Если 0 — ответ из памяти, канал провален (см. Деградация).

## КРИТИЧНО: только живой поиск, не память модели

Каждый промпт Codex ЖЁСТКО требует:
> «Используй ТОЛЬКО инструмент web search — выполни реальные поисковые запросы. ЗАПРЕЩЕНО отвечать из памяти/выученных знаний: каждый тезис ОБЯЗАН иметь URL источника и дату публикации. Тезис без URL не пиши вообще. В конце — раздел Sources со всеми URL.»

Это и есть смысл канала: сравнить, что находит ДРУГОЙ поисковый стек. Ответ «из головы» бесполезен и вреден.

**Глубина (2026-08-15):** web_search Codex сам по себе отдаёт сниппеты выдачи, а не текст страниц — «snippet hallucination» задокументированный класс дефектов. Поэтому каждый промпт требует открыть и прочитать полные страницы ключевых источников до цитирования (формулировка уже в командах ниже). Цитаты, которых не может быть в сниппете (цифры/детали из глубины страницы), — сигнал, что требование сработало.

## Протокол (2 вызова В ОДНОМ сообщении — параллельно)

### Вызов 1 — Широкий обзор (обязательно)

```bash
codex exec -m gpt-5.6-sol -s read-only --skip-git-repo-check -c model_reasoning_effort="high" -c service_tier="priority" -c 'tools.web_search={mode="live"}' --json 'Research the web for: <развёрнутый запрос — тема, аспекты, что за решение принимается>. Use ONLY the web search tool - run real searches, do NOT answer from memory. Every claim MUST have a source URL and publication date; omit claims without URLs. Prefer 2024-2026 sources. Open and READ THE FULL PAGE of every key source before citing it - do NOT cite from search-result snippets alone; quote specifics that only appear in the page body. Return: key findings (bulleted, each with URL), notable numbers/quotes with URLs, and a final Sources section listing all URLs.' < /dev/null
```

### Вызов 2 — Контраргументы (обязательно)

```bash
codex exec -m gpt-5.6-sol -s read-only --skip-git-repo-check -c model_reasoning_effort="high" -c service_tier="priority" -c 'tools.web_search={mode="live"}' --json 'Search the web for criticism, problems, failures and counter-arguments about: <тема>. Use ONLY the web search tool - real searches, NOT memory; every claim needs a source URL. Who disagrees and why? Known issues, regressions, negative experience reports. Open and READ THE FULL PAGE of key sources before citing - do NOT cite from snippets alone. Return bulleted findings with URLs + Sources section.' < /dev/null
```

Оба вызова запускай ОДНИМ сообщением (двумя Bash-вызовами параллельно), каждый с `timeout` ~300000 мс.
`< /dev/null` в конце каждой команды — обязателен (см. предупреждение выше), иначе оба вызова
выгорят по таймауту вхолостую. Запас по времени узкий: с фиксом один high-effort вызов = 156 с.

## Бюджет: 2 вызова

## Обработка результата

1. Из ответов собери цитаты: URL + краткий контекст. Префиксы: [cx1], [cx2], ...
2. Каждой цитате — Admiralty reliability (A-F) по типу ИСТОЧНИКА (не Codex, а страницы, на которую ведёт URL).
3. URL без контекста или тезисы без URL — отбрасывай (нарушение контракта «не из памяти»).

## Деградация

При сбое — non-zero exit, таймаут, пустой stdout или ответ без единого URL:
- один retry упавшего вызова (возможно, транзиент);
- если оба вызова провалились — верни **пустые** citations, sourceQuality = LOW, пометка в findings: «Codex web-канал недоступен»;
- **НЕ роняй** workflow — остальные каналы должны завершиться.
- Если ответ пришёл, но моделью проигнорирован запрет «из памяти» (тезисы без URL) — используй только тезисы с URL; если таких нет, канал считается недоступным.

Диагностика:
- **Пустой stdout (0 байт) + `Reading additional input from stdin...` в stderr + exit 143/142** —
  это НЕ авторизация и НЕ rate-limit, а незакрытый stdin под Bash-тулом. Лечится `< /dev/null`
  в конце команды; retry без редиректа повиснет ровно так же и сожжёт второй таймаут.
- `codex login status` — истёкшая авторизация ChatGPT.
- Сообщения об отключённом web search в stderr — конфиг-ключ `tools.web_search` переименован
  (проверь `codex exec --help` и `~/.codex/config.toml`).
