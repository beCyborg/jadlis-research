# Web (Codex/GPT-5.6 Sol) — протокол поиска для агента

## Инструмент: Codex CLI (через Bash)

Web-поиск через **Codex CLI** (`codex exec`) с включённым web search. Биллинг — подписка ChatGPT → marginal cost ≈ $0. Модель и reasoning effort запинены прямо в командах: `gpt-5.6-sol`, effort `high` — канал не зависит от глобального дефолта `~/.codex/config.toml`. При смене поколения модели обновить пин здесь (все три команды) и подпись источника в `{PLUGIN_ROOT}/workflows/full-research-core.js:66`.

Базовая команда (Bash, `timeout: 300000` мс на вызов):

```bash
codex exec -m gpt-5.6-sol -s read-only --skip-git-repo-check -c model_reasoning_effort="high" -c tools.web_search=true --json '<ПРОМПТ>'
```

- Флага `--search` НЕ существует (проверено на codex-cli 0.142.5) — web search включается только `-c tools.web_search=true`.
- `-s read-only` обязателен: глобальный конфиг пользователя — `danger-full-access`, для поиска он не нужен.
- `--json` — JSONL-события в stdout (проверено на 0.142.5). Финальный текст агента:
  ```bash
  ... --json | jq -rs '[.[] | select(.type == "item.completed" and .item.type == "agent_message")] | last | .item.text'
  ```
  Проверка, что поиск был ЖИВЫМ: в JSONL должны быть события `item.type == "web_search"` —
  `jq -s '[.[] | select(.item.type? == "web_search")] | length'` ≥ 1. Если 0 — ответ из памяти, канал провален (см. Деградация).

## КРИТИЧНО: только живой поиск, не память модели

Каждый промпт Codex ЖЁСТКО требует:
> «Используй ТОЛЬКО инструмент web search — выполни реальные поисковые запросы. ЗАПРЕЩЕНО отвечать из памяти/выученных знаний: каждый тезис ОБЯЗАН иметь URL источника и дату публикации. Тезис без URL не пиши вообще. В конце — раздел Sources со всеми URL.»

Это и есть смысл канала: сравнить, что находит ДРУГОЙ поисковый стек. Ответ «из головы» бесполезен и вреден.

## Протокол (2 вызова В ОДНОМ сообщении — параллельно)

### Вызов 1 — Широкий обзор (обязательно)

```bash
codex exec -m gpt-5.6-sol -s read-only --skip-git-repo-check -c model_reasoning_effort="high" -c tools.web_search=true --json 'Research the web for: <развёрнутый запрос — тема, аспекты, что за решение принимается>. Use ONLY the web search tool - run real searches, do NOT answer from memory. Every claim MUST have a source URL and publication date; omit claims without URLs. Prefer 2024-2026 sources. Return: key findings (bulleted, each with URL), notable numbers/quotes with URLs, and a final Sources section listing all URLs.'
```

### Вызов 2 — Контраргументы (обязательно)

```bash
codex exec -m gpt-5.6-sol -s read-only --skip-git-repo-check -c model_reasoning_effort="high" -c tools.web_search=true --json 'Search the web for criticism, problems, failures and counter-arguments about: <тема>. Use ONLY the web search tool - real searches, NOT memory; every claim needs a source URL. Who disagrees and why? Known issues, regressions, negative experience reports. Return bulleted findings with URLs + Sources section.'
```

Оба вызова запускай ОДНИМ сообщением (двумя Bash-вызовами параллельно), каждый с `timeout` ~300000 мс.

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

Диагностика: `codex login status` (истёкшая авторизация ChatGPT), сообщения об отключённом web search в stderr (тогда конфиг-ключ `tools.web_search` переименован — проверь `codex exec --help` и `~/.codex/config.toml`).
