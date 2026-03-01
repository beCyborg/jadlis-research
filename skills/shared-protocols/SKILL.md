---
name: shared-protocols
description: "Общие протоколы для research workers: формат findings, scratchpad, fallback chains, source tiers, citation format"
user-invocable: false
---

# Shared Protocols

Общие конвенции для всех research workers. Каждый worker ОБЯЗАН следовать этим протоколам.

## 1. Output Budget

Жёсткие лимиты для всех scratchpad записей:

| Параметр | Лимит |
|----------|-------|
| Максимум строк на scratchpad файл | 80 |
| Максимум findings на worker | 8 |
| Строк на finding | 5 |
| Строк на summary секцию | 10 |
| Строк на gaps секцию | 5 |

Превышение лимитов приведёт к обрезке контекста при synthesis.

## 2. Finding Format

Каждый finding ОБЯЗАН использовать эту структуру:

```
## Finding N
- **Claim:** <одно утверждение>
- **Evidence:** <конкретные данные/цитата>
- **Source:** <полная ссылка по citation format>
- **Confidence:** High|Medium|Low
- **Tier:** 1|2|3
```

Подробные примеры — в [references/finding-format.md](references/finding-format.md).

Правила:
- Один claim на finding — не объединять несколько утверждений
- Evidence содержит конкретные данные, цифры или цитаты (не пересказ)
- Confidence оценивается по качеству источника и полноте evidence
- Tier определяется по типу источника (см. раздел 3)

Workers должны самостоятельно формировать findings в этом формате без дополнительных обращений к references. Формат из 5 полей (Claim, Evidence, Source, Confidence, Tier) является единственным допустимым — любые отклонения будут отклонены при synthesis.

## 3. Source Tiers

| Tier | Описание | Примеры |
|------|----------|---------|
| **Tier 1** | Рецензируемые источники, официальная документация, госданные | Peer-reviewed journals, PubMed, OpenAlex, official docs, government data |
| **Tier 2** | Надёжные медиа, отраслевые отчёты, верифицированные аккаунты | Reputable news, industry reports, established blogs, verified accounts |
| **Tier 3** | Неверифицированный контент | Social media posts, forum comments, community reviews |

При конфликте Tier 1 источник перевешивает Tier 3. При конфликте внутри одного tier — указать оба и отметить разногласие.

## 4. Scratchpad Protocol

Путь к scratchpad файлам:

```
${CLAUDE_PROJECT_DIR}/.scratchpads/${CLAUDE_SESSION_ID}/<filename>.md
```

Scratchpads хранятся в проектной директории пользователя (не в plugin root). Пользователь должен добавить `.scratchpads/` в свой `.gitignore`.

### Naming Convention

| Worker | Файл |
|--------|------|
| query-understanding | `query-analysis.md` |
| source-routing | `routing-decision.md` |
| academic-worker | `academic-track.md` |
| community-worker | `community-track.md` |
| social-media-worker | `social-media-track.md` |
| research-synthesis | `report.md` |
| verification | `verification-report.md` |

### Правила записи

- **Append-only** — никогда не перезаписывать существующий scratchpad файл
- Перед записью проверить текущий размер через Read с `offset` для подсчёта строк
- Каждый scratchpad начинается с YAML-заголовка:

```yaml
---
worker: <worker-name>
timestamp: <ISO 8601>
query: <оригинальный запрос>
---
```

## 5. Fallback Chains

Стратегии восстановления при ошибках. Детерминированный enforcement — в hooks (section-05).

| Тип ошибки | Действие |
|------------|----------|
| Connection timeout | Retry 1 раз → skip source, log в scratchpad |
| Rate limit (HTTP 429) | Wait 2s + retry 1 раз → skip source |
| Auth error (HTTP 401/403) | Skip немедленно, log в scratchpad |
| Empty result | Query expansion → Exa fallback → mark "no data" |

При каждом skip — записать причину в scratchpad. Это позволяет synthesis оценить полноту покрытия источников и отметить gaps в итоговом отчёте.

### Firecrawl fallback chain

Выполнять по порядку, остановиться при первом успехе:

1. `firecrawl_scrape` (стандартный вызов)
2. `firecrawl_scrape` с `waitFor: 5000` (ожидание JS-рендера)
3. `firecrawl_scrape` с stealth mode (обход anti-scrape защит)
4. Exa `crawling_exa` (альтернативный crawler)
5. Skip и записать в scratchpad причину

Stealth mode критичен для сайтов с Cloudflare/Akamai защитой. Пропуск этого шага приводит к потере ~15% источников.

## 6. Citation Format

| Тип | Формат |
|-----|--------|
| Academic | `[Author et al., Year, Journal/Source]` |
| Official | `[Organization, Date, Title]` |
| Community | `[Platform: Author, Date, URL]` |
| Social Media | `[Platform: @handle, Date]` |

Каждый finding ОБЯЗАН содержать citation в поле Source. Без citation finding считается невалидным. При использовании нескольких источников для одного finding — перечислить все через `; ` (точка с запятой).

## 7. Cache Directive

Управление cache поведением MCP tools. Устанавливать `storeInCache: true` для:
- Academic searches (arxiv, PubMed, OpenAlex)
- Web content extraction (Firecrawl scrapes)
- Place details (Google Maps)

**НЕ кэшировать:**
- Live reviews и ratings
- Social feeds
- Real-time metrics

Кэширование снижает нагрузку на MCP серверы и ускоряет повторные запросы в рамках сессии. Workers должны явно указывать `storeInCache` при каждом MCP вызове — по умолчанию кэширование отключено.
