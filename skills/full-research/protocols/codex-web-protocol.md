# Web (Codex/GPT-6 Astra) — протокол поиска для агента

## Инструмент: Codex CLI (через Bash)

Web-поиск через **Codex CLI** (`codex exec`) с включённым web search. Биллинг — подписка ChatGPT → marginal cost ≈ $0. Модель, reasoning effort и тир запинены прямо в командах: `gpt-6-astra`, effort `high`, `service_tier="default"` — канал не зависит от глобального дефолта `~/.codex/config.toml`. При смене поколения модели обновить пин здесь (все команды ниже, включая эскалацию), константу `CODEX_MODEL` и подпись источника в `{PLUGIN_ROOT}/workflows/full-research-core.js`, probe в `SKILL.md` и строку канала в `README.md`.

> [!note] `service_tier="priority"` («Fast» в UI Codex) — НЕ использовать
> Имени `gpt-5.6-sol-fast` у API не существует (HTTP 400 «not supported when using Codex with a ChatGPT account» — проверено 2026-08-15). Настройка «Fast» в UI Codex = `service_tier="priority"`: официально «1.5x speed, increased usage», по оценке пользователя ≈2,5× расхода квоты при −15 % времени (A/B 2026-08-15: sol-high 177 с → 151 с, живых поисков одинаково — 11). Решение 2026-09-05: приоритет — квота под доказательность, не скорость → во всех командах явный `service_tier="default"` (глобальный `~/.codex/config.toml` тоже на `default`, чтобы вызов без флага не унаследовал priority).
> **Модель канала — `gpt-6-astra` с 2026-09-05** (решение пользователя; часть B Плана 1 «astra vs sol» как гейт снята — сравнение живых поисков идёт постфактум по первой эскалации транша 1 Плана 2). Effort `high` явно: дефолт Astra — `medium`, а глубина поиска и есть смысл канала. Luna/Terra не использовать: замер luna-high дал −43% времени, но вдвое меньше живых поисков (5 vs 11). **Откат** — `gpt-5.6-sol` (в каталоге CLI жив, priority 6): если первая эскалация даёт < 5 живых `web_search` при ориентире Sol 11 (замер 2026-08-15) — вернуть литералы здесь и `CODEX_MODEL` в ядре одним коммитом.

Базовая команда (Bash, `timeout: 300000` мс на вызов):

```bash
codex exec -m gpt-6-astra -s read-only --skip-git-repo-check -c model_reasoning_effort="high" -c service_tier="default" -c 'tools.web_search={mode="live"}' --json '<ПРОМПТ>' < /dev/null
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
codex exec -m gpt-6-astra -s read-only --skip-git-repo-check -c model_reasoning_effort="high" -c service_tier="default" -c 'tools.web_search={mode="live"}' --json 'Research the web for: <развёрнутый запрос — тема, аспекты, что за решение принимается>. Use ONLY the web search tool - run real searches, do NOT answer from memory. Every claim MUST have a source URL and publication date; omit claims without URLs. Prefer 2024-2026 sources. Open and READ THE FULL PAGE of every key source before citing it - do NOT cite from search-result snippets alone; quote specifics that only appear in the page body. Return: key findings (bulleted, each with URL), notable numbers/quotes with URLs, and a final Sources section listing all URLs.' < /dev/null
```

### Вызов 2 — Контраргументы (обязательно)

```bash
codex exec -m gpt-6-astra -s read-only --skip-git-repo-check -c model_reasoning_effort="high" -c service_tier="default" -c 'tools.web_search={mode="live"}' --json 'Search the web for criticism, problems, failures and counter-arguments about: <тема>. Use ONLY the web search tool - real searches, NOT memory; every claim needs a source URL. Who disagrees and why? Known issues, regressions, negative experience reports. Open and READ THE FULL PAGE of key sources before citing - do NOT cite from snippets alone. Return bulleted findings with URLs + Sources section.' < /dev/null
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

## Эскалация верификации (третий голос, schema v3)

Помимо канала, Codex используется workflow `full-research-core` как **третий, разнородный голос** при расхождении двух верификаторов (`CONFIRMED` vs `CHALLENGED/OUTDATED`, либо `CHALLENGED/OUTDATED` vs `UNCHECKED`). Согласные голоса в Codex не ходят: `CONFIRMED×2` → подтверждено, согласное исключение → отсеяно, `UNCHECKED×2` → не проверено. Кап — 8 эскалаций на прогон (`args.escalationCap`), сверх капа — исключение по одному голосу + флаг `escalationSkipped: 'cap'`.

Вызов (делает лёгкий субагент-мост, промпт `escalationPrompt` в core.js):

```bash
codex exec -m gpt-6-astra -s read-only --skip-git-repo-check -c model_reasoning_effort="high" -c service_tier="default" -c 'tools.web_search={mode="live"}' --json -o "<workDir>/_codex-esc-<claimId>-last.md" "$(cat "<workDir>/_codex-esc-<claimId>-prompt.md")" < /dev/null > "<workDir>/_codex-esc-<claimId>.jsonl"
```

- **Гейт живого поиска:** в JSONL должно быть ≥1 события `web_search` (`grep -c '"web_search'`); 0 → голос не считается (`escalationSkipped: 'no-live-search'`) — Codex отвечал по памяти.
- Codex подтверждает исключение → claim `CHALLENGED`/`OUTDATED` (отсеян). Не подтверждает → `DISPUTED` (агрегат JS, не enum верификатора): credibility ≥4, в отчёте секция `### Спорные факты`, в выводы не входит.
- Деградации в один enum `escalationSkipped`: `no-binary` · `quota` · `timeout` · `invalid-output` · `no-live-search` · `budget` · `cap` → исключение по одному голосу как в schema v2 + флаг в ledger/телеметрии. Ретраев нет: квота Codex — общий пул с `/jadlis-research:verif`, приоритет у verif.
- Правила для Codex в промпте: отсутствие подтверждения ≠ опровержение (это UNCHECKED); расхождение чисел только по форме записи/округлению ±2% — не опровержение; исключение подтверждать ТОЛЬКО по источнику, который прямо противоречит или отменяет claim.

