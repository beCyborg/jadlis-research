<p align="center">
  <h1 align="center">jadlis-research</h1>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v0.9.0-blue" alt="version">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license">
  <img src="https://img.shields.io/badge/Claude_Code-plugin-purple" alt="Claude Code plugin">
</p>

<p align="center">
  <a href="#english">English</a> | <a href="#russian">Русский</a>
</p>

---

<a id="english"></a>

## English

Deep multi-source parallel research pipeline for Claude Code. 14+ data sources, 6 specialized workers.

### Pipeline

```
User → /jadlis-research:research → Query Understanding → Source Routing
                                                              ↓
                    ┌──────────┬──────────┬──────────┬──────────┬──────────┐
                    ↓          ↓          ↓          ↓          ↓          ↓
              Academic   Community   Expert   Native-Web   Social      Maps
              Worker     Worker      Worker   Worker       Worker     Worker
                    ↓          ↓          ↓          ↓          ↓          ↓
                    └──────────┴──────────┴──────────┼──────────┴──────────┘
                                                     ↓
                                           Verification Worker
                                                     ↓
                                             Research Synthesis
                                                     ↓
                                            Markdown Report (RU)
```

### Features

- Parallel execution across 6 specialized worker agents
- 14+ data sources: academic, web, community, social media
- Automatic source routing based on query type
- Interactive setup wizard (`/jadlis-research:setup`)
- Per-source API key management via `~/.jadlis-research/env`
- MCP health checks on startup and during setup
- Fallback chain: Firecrawl → Exa content → skip
- Bilingual output (RU by default, configurable)

### Architecture

The research pipeline uses a multi-agent architecture built on Claude Code's plugin system:

**Skills** (user-facing entry points):
- `/jadlis-research:research` — main research orchestrator (context-forked)
- `/jadlis-research:setup` — interactive setup wizard

**Agents** (autonomous workers):
- `academic-worker` — queries Semantic Scholar, PubMed, arXiv, OpenAlex, CrossRef
- `community-worker` — searches Reddit, Hacker News, Substack
- `expert-worker` — targeted Exa searches for expert content
- `native-web-worker` — Firecrawl extraction of JavaScript-rendered pages
- `social-worker` — Twitter/X and Instagram via Xpoz OAuth
- `maps-worker` — Google Maps location and business data

**Internal skills** (pipeline stages):
- `query-understanding` — classifies query type, extracts entities, determines language
- `source-routing` — builds a worker assignment plan based on query analysis
- `research-synthesis` — merges all worker outputs into a structured report

**MCP Servers:**
- Exa (npx) — web search and content extraction
- Firecrawl (npx) — JavaScript page rendering
- Semantic Scholar (uvx) — academic paper database
- PubMed (npx) — biomedical literature
- arXiv (npx) — preprint repository
- OpenAlex (npx) — open academic graph
- Reddit (Claude.ai native) — community discussions

**Hooks** (event-driven automation):
- Session startup: env sourcing, first-run detection, Firecrawl credit check
- Subagent management: stop signal handling for pipeline workers
- Error recovery: MCP error patterns, read errors, Exa fallback to WebSearch

### Requirements

- **Claude Code** — latest version with plugin support
- **Node.js** >= 18 — required for npx-based MCP servers (Exa, Firecrawl, PubMed, arXiv, OpenAlex)
- **Python** >= 3.10 + **uv** — required for uvx-based MCP server (Semantic Scholar)
- **macOS or Linux** — tested on macOS (Darwin), should work on Linux
- **zsh** — env file sourcing assumes `~/.zshrc` (bash users: add source line to `~/.bashrc`)

### Quick Start

```bash
# Step 1: Add the marketplace
/plugin marketplace add beCyborg/jadlis-research

# Step 2: Install the plugin
/plugin install jadlis-research@jadlis-research

# Step 3: Restart Claude Code session, then configure API keys
/jadlis-research:setup
```

After `/plugin install`, restart Claude Code for the plugin to load.

### Data Sources

| Source | Tier | What it provides | Env Var |
|--------|------|------------------|---------|
| Exa | Core | Web search + content extraction | `EXA_API_KEY` |
| Firecrawl | Core | JavaScript-rendered page extraction | `FIRECRAWL_API_KEY` |
| Semantic Scholar | Recommended | Academic papers, citations, graphs | `SEMANTIC_SCHOLAR_API_KEY` |
| PubMed | Recommended | Biomedical & life sciences literature | `PUBMED_API_KEY` |
| OpenAlex | Recommended | Open academic graph, works, authors | `OPENALEX_API_KEY` |
| Twitter/X | Optional | Social media, trending topics | `TWITTER_BEARER_TOKEN` |
| Google Maps | Optional | Location, business, reviews data | `GOOGLE_MAPS_API_KEY` |
| CrossRef | Optional | DOI resolution, citation metadata | `CROSSREF_MAILTO` |
| Paper Download | Optional | Full paper PDFs (institutional) | `DOWNLOAD_BASE_URL` |
| arXiv | Free | Preprints: physics, CS, math, biology | — |
| Hacker News | Free | Tech community discussions | — |
| Substack | Free | Newsletter content extraction | — |
| Reddit | Free | Community discussions, opinions | — |
| Xpoz (Instagram) | OAuth | Social media visuals | OAuth flow |

### API Keys

| Variable | Service | Registration URL | Free Tier |
|----------|---------|-----------------|-----------|
| `EXA_API_KEY` | Exa | https://dashboard.exa.ai/ | 1,000 searches/month |
| `FIRECRAWL_API_KEY` | Firecrawl | https://www.firecrawl.dev/ | 500 credits/month |
| `SEMANTIC_SCHOLAR_API_KEY` | Semantic Scholar | https://www.semanticscholar.org/product/api | Free, higher limits with key |
| `PUBMED_API_KEY` | PubMed/NCBI | https://www.ncbi.nlm.nih.gov/account/ | 10 req/s (100/s with key) |
| `OPENALEX_API_KEY` | OpenAlex | https://openalex.org/ | Free, polite pool with email |
| `TWITTER_BEARER_TOKEN` | Twitter/X | https://developer.twitter.com/ | Free Basic tier |
| `GOOGLE_MAPS_API_KEY` | Google Maps | https://console.cloud.google.com/ | $200/month free credit |
| `CROSSREF_MAILTO` | CrossRef | https://www.crossref.org/ | Free, just provide email |

### Usage Examples

**Scientific literature:**
```
/jadlis-research:research "CRISPR off-target effects in human cells 2024"
```
Routes to Academic worker (Semantic Scholar + PubMed + arXiv), returns papers with citations.

**Market research:**
```
/jadlis-research:research "electric vehicle battery market trends"
```
Routes to Web + Community workers, combines Exa results with Reddit/HN discussions.

**Technical deep-dive:**
```
/jadlis-research:research "Rust async runtime internals"
```
Routes to Expert + Native-Web workers, combines GitHub, HN, Substack sources.

**Local/business:**
```
/jadlis-research:research "coffee shops in Tokyo Shibuya 2024 reviews"
```
Routes to Maps + Social workers for location-based results.

### Configuration

#### Interactive setup (recommended)

```
/jadlis-research:setup
```

The wizard walks you through 8 phases:
1. **Detect** — check which keys are already configured
2. **Core keys** — Exa, Firecrawl (required for full pipeline)
3. **Recommended** — Semantic Scholar, PubMed, OpenAlex
4. **Optional** — Twitter, Google Maps, CrossRef, Paper Download
5. **Free sources** — info about arXiv, HN, Substack, Reddit
6. **Health check** — validate each MCP server connection
7. **Finalize** — write env file, set permissions, add shell source line
8. **Summary** — status table of all services

#### Manual setup

```bash
# Create the env directory
mkdir -p ~/.jadlis-research
chmod 700 ~/.jadlis-research

# Create env file with your keys
cat > ~/.jadlis-research/env << 'EOF'
# >>> jadlis-research managed env >>>
export EXA_API_KEY='your-exa-key-here'
export FIRECRAWL_API_KEY='your-firecrawl-key-here'
# <<< jadlis-research managed env <<<
EOF
chmod 600 ~/.jadlis-research/env

# Add to shell (run once):
echo 'source ~/.jadlis-research/env' >> ~/.zshrc
```

### Troubleshooting

| Issue | Likely Cause | Fix |
|-------|-------------|-----|
| `MCP server not found` | Server failed to start | Check `EXA_API_KEY` is set; restart CC session |
| Keys not loaded | `~/.jadlis-research/env` not sourced | Run `/jadlis-research:setup` or `source ~/.zshrc` |
| `Rate limit exceeded` | Free tier exhausted | Upgrade plan or wait for monthly reset |
| Firecrawl FAIL | Credits exhausted | Check dashboard at firecrawl.dev |
| First-run message not shown | CC SessionStart timing | Run `/jadlis-research:setup` manually |
| `[ERROR] MCP stderr` | Normal CC behavior | CC logs all MCP stderr as `[ERROR]`, not a real error |
| SerpAPI not available | Not included | SerpAPI is not available as npm/PyPI package |

### FAQ

**Q: Which keys are absolutely required?**
A: Only `EXA_API_KEY` and `FIRECRAWL_API_KEY` (Core tier). The pipeline works without other keys but with reduced source coverage.

**Q: Can I use the plugin without any API keys?**
A: Partially. Free sources (arXiv, HN, Substack, Reddit) work without keys, but the research pipeline requires at least Exa for web search.

**Q: How do I update API keys after initial setup?**
A: Run `/jadlis-research:setup` again — it detects existing keys and only prompts for missing ones. Or edit `~/.jadlis-research/env` manually.

**Q: Why does the plugin need its own env file instead of .env?**
A: The env file at `~/.jadlis-research/env` persists across projects and Claude Code sessions. It uses a managed block pattern to safely coexist with manual edits.

**Q: How are API keys secured?**
A: Keys are stored in `~/.jadlis-research/env` with `chmod 600` (owner-only read/write). The directory has `chmod 700`. Keys are never echoed in full — only length is confirmed.

**Q: What happens if a data source goes down during research?**
A: Each worker has its own error handling. Failed sources are skipped and noted in the final report. The synthesis stage works with whatever data is available.

**Q: Can I add custom data sources?**
A: Not directly in the current version. Custom MCP servers can be added to `.mcp.json` but require corresponding worker skill updates.

**Q: How do I check which sources are working?**
A: Run `/jadlis-research:setup` — Phase 6 runs health checks on all configured services.

### Contributing

- Fork from https://github.com/beCyborg/jadlis-research
- Issues in Russian (English accepted)
- Commits: `feat:`, `fix:`, `docs:` prefixes, Russian description
- PR target: `main` branch
- Test: run `/jadlis-research:setup` and `/jadlis-research:research` after changes

### Acknowledgments

Built with [Claude Code](https://claude.ai/claude-code) plugin system.
Uses MCP (Model Context Protocol) for external service integration.

### License

MIT License. Copyright (c) 2026 beCyborg.
See [LICENSE](LICENSE) file.

---

<a id="russian"></a>

## Русский

Многоисточниковый параллельный пайплайн исследований для Claude Code. 14+ источников данных, 6 специализированных воркеров.

### Пайплайн

```
Пользователь → /jadlis-research:research → Анализ запроса → Маршрутизация
                                                                  ↓
                    ┌──────────┬──────────┬──────────┬──────────┬──────────┐
                    ↓          ↓          ↓          ↓          ↓          ↓
              Академический Сообщества  Эксперт   Web-        Соц.     Карты
              воркер       воркер      воркер    воркер      сети     воркер
                    ↓          ↓          ↓          ↓          ↓          ↓
                    └──────────┴──────────┴──────────┼──────────┴──────────┘
                                                     ↓
                                            Воркер верификации
                                                     ↓
                                              Синтез результатов
                                                     ↓
                                             Отчёт в Markdown (RU)
```

### Возможности

- Параллельное выполнение через 6 специализированных воркеров
- 14+ источников: академические базы, веб, сообщества, социальные сети
- Автоматическая маршрутизация по типу запроса
- Интерактивный мастер настройки (`/jadlis-research:setup`)
- Управление API-ключами через `~/.jadlis-research/env`
- Проверка MCP-серверов при запуске и настройке
- Цепочка fallback: Firecrawl → Exa content → skip
- Вывод на русском языке по умолчанию

### Архитектура

Пайплайн использует мультиагентную архитектуру на базе плагинной системы Claude Code:

**Skills** (точки входа):
- `/jadlis-research:research` — основной оркестратор исследований (context fork)
- `/jadlis-research:setup` — интерактивный мастер настройки

**Агенты** (автономные воркеры):
- `academic-worker` — Semantic Scholar, PubMed, arXiv, OpenAlex, CrossRef
- `community-worker` — Reddit, Hacker News, Substack
- `expert-worker` — целевые поиски Exa для экспертного контента
- `native-web-worker` — Firecrawl-извлечение JS-рендеренных страниц
- `social-worker` — Twitter/X и Instagram через Xpoz OAuth
- `maps-worker` — Google Maps, локации и бизнес-данные

**Внутренние skills** (этапы пайплайна):
- `query-understanding` — классификация запроса, извлечение сущностей
- `source-routing` — план распределения по воркерам
- `research-synthesis` — объединение результатов в структурированный отчёт

**MCP-серверы:**
- Exa (npx) — веб-поиск и извлечение контента
- Firecrawl (npx) — рендеринг JS-страниц
- Semantic Scholar (uvx) — база академических статей
- PubMed (npx) — биомедицинская литература
- arXiv (npx) — репозиторий препринтов
- OpenAlex (npx) — открытый академический граф
- Reddit (Claude.ai native) — обсуждения сообществ

**Hooks** (событийная автоматизация):
- Старт сессии: sourcing env, первый запуск, проверка кредитов Firecrawl
- Управление агентами: обработка сигналов остановки воркеров
- Восстановление ошибок: MCP-ошибки, ошибки чтения, Exa fallback на WebSearch

### Требования

- **Claude Code** — последняя версия с поддержкой плагинов
- **Node.js** >= 18 — для npx MCP-серверов (Exa, Firecrawl, PubMed, arXiv, OpenAlex)
- **Python** >= 3.10 + **uv** — для uvx MCP-сервера (Semantic Scholar)
- **macOS или Linux** — протестировано на macOS (Darwin), должно работать на Linux
- **zsh** — sourcing env-файла через `~/.zshrc` (для bash: добавьте source-строку в `~/.bashrc`)

### Быстрый старт

```bash
# Шаг 1: Добавить маркетплейс
/plugin marketplace add beCyborg/jadlis-research

# Шаг 2: Установить плагин
/plugin install jadlis-research@jadlis-research

# Шаг 3: Перезапустить Claude Code, затем настроить API-ключи
/jadlis-research:setup
```

После `/plugin install` необходимо перезапустить Claude Code для загрузки плагина.

### Источники данных

| Источник | Уровень | Что предоставляет | Переменная |
|----------|---------|-------------------|------------|
| Exa | Core | Веб-поиск + извлечение контента | `EXA_API_KEY` |
| Firecrawl | Core | Извлечение JS-рендеренных страниц | `FIRECRAWL_API_KEY` |
| Semantic Scholar | Рекомендуемые | Академические статьи, цитирования | `SEMANTIC_SCHOLAR_API_KEY` |
| PubMed | Рекомендуемые | Биомедицинская литература | `PUBMED_API_KEY` |
| OpenAlex | Рекомендуемые | Открытый академический граф | `OPENALEX_API_KEY` |
| Twitter/X | Опциональные | Социальные сети, тренды | `TWITTER_BEARER_TOKEN` |
| Google Maps | Опциональные | Локации, бизнесы, отзывы | `GOOGLE_MAPS_API_KEY` |
| CrossRef | Опциональные | DOI, метаданные цитирований | `CROSSREF_MAILTO` |
| Paper Download | Опциональные | Полные PDF статей (институциональный доступ) | `DOWNLOAD_BASE_URL` |
| arXiv | Бесплатно | Препринты: физика, CS, математика | — |
| Hacker News | Бесплатно | Технические дискуссии | — |
| Substack | Бесплатно | Контент рассылок | — |
| Reddit | Бесплатно | Обсуждения сообществ | — |
| Xpoz (Instagram) | OAuth | Визуальный контент соц. сетей | OAuth-поток |

### API-ключи

| Переменная | Сервис | URL регистрации | Бесплатный уровень |
|------------|--------|-----------------|-------------------|
| `EXA_API_KEY` | Exa | https://dashboard.exa.ai/ | 1 000 запросов/месяц |
| `FIRECRAWL_API_KEY` | Firecrawl | https://www.firecrawl.dev/ | 500 кредитов/месяц |
| `SEMANTIC_SCHOLAR_API_KEY` | Semantic Scholar | https://www.semanticscholar.org/product/api | Бесплатно, лимиты с ключом |
| `PUBMED_API_KEY` | PubMed/NCBI | https://www.ncbi.nlm.nih.gov/account/ | 10 зап/с (100/с с ключом) |
| `OPENALEX_API_KEY` | OpenAlex | https://openalex.org/ | Бесплатно, polite pool |
| `TWITTER_BEARER_TOKEN` | Twitter/X | https://developer.twitter.com/ | Бесплатный Basic тариф |
| `GOOGLE_MAPS_API_KEY` | Google Maps | https://console.cloud.google.com/ | $200/месяц бесплатно |
| `CROSSREF_MAILTO` | CrossRef | https://www.crossref.org/ | Бесплатно, укажите email |

### Примеры использования

**Научная литература:**
```
/jadlis-research:research "Офф-таргетные эффекты CRISPR в клетках человека 2024"
```
Маршрутизируется к академическому воркеру (Semantic Scholar + PubMed + arXiv).

**Рыночные исследования:**
```
/jadlis-research:research "Тренды рынка аккумуляторов для электромобилей"
```
Маршрутизируется к Web + Community воркерам, Exa + Reddit/HN.

**Технический deep-dive:**
```
/jadlis-research:research "Внутреннее устройство async runtime в Rust"
```
Expert + Native-Web воркеры: GitHub, HN, Substack.

**Локальный/бизнес:**
```
/jadlis-research:research "Кофейни в Токио Сибуя 2024 отзывы"
```
Maps + Social воркеры для локационных результатов.

### Настройка

#### Интерактивная настройка (рекомендуется)

```
/jadlis-research:setup
```

Мастер проведёт вас через 8 фаз:
1. **Обнаружение** — проверка уже настроенных ключей
2. **Core-ключи** — Exa, Firecrawl (обязательные для пайплайна)
3. **Рекомендуемые** — Semantic Scholar, PubMed, OpenAlex
4. **Опциональные** — Twitter, Google Maps, CrossRef, Paper Download
5. **Бесплатные источники** — arXiv, HN, Substack, Reddit
6. **Health check** — проверка подключения к каждому MCP-серверу
7. **Финализация** — запись env-файла, права доступа, source-строка
8. **Итоги** — таблица статуса всех сервисов

#### Ручная настройка

```bash
# Создать директорию
mkdir -p ~/.jadlis-research
chmod 700 ~/.jadlis-research

# Создать файл с ключами
cat > ~/.jadlis-research/env << 'EOF'
# >>> jadlis-research managed env >>>
export EXA_API_KEY='ваш-ключ-exa'
export FIRECRAWL_API_KEY='ваш-ключ-firecrawl'
# <<< jadlis-research managed env <<<
EOF
chmod 600 ~/.jadlis-research/env

# Добавить в shell (выполнить один раз):
echo 'source ~/.jadlis-research/env' >> ~/.zshrc
```

### Решение проблем

| Проблема | Вероятная причина | Решение |
|----------|-------------------|---------|
| `MCP server not found` | Сервер не запустился | Проверьте `EXA_API_KEY`; перезапустите CC |
| Ключи не загружаются | `~/.jadlis-research/env` не sourced | `/jadlis-research:setup` или `source ~/.zshrc` |
| `Rate limit exceeded` | Исчерпан бесплатный лимит | Обновите план или дождитесь сброса |
| Firecrawl FAIL | Кредиты исчерпаны | Проверьте dashboard на firecrawl.dev |
| Нет сообщения о первом запуске | Тайминг CC SessionStart | Запустите `/jadlis-research:setup` вручную |
| `[ERROR] MCP stderr` | Нормальное поведение CC | CC логирует все MCP stderr как `[ERROR]` |
| SerpAPI недоступен | Не включён | SerpAPI недоступен как npm/PyPI пакет |

### Часто задаваемые вопросы

**В: Какие ключи обязательны?**
О: Только `EXA_API_KEY` и `FIRECRAWL_API_KEY` (Core). Пайплайн работает и без остальных, но с меньшим охватом источников.

**В: Можно ли использовать плагин совсем без ключей?**
О: Частично. Бесплатные источники (arXiv, HN, Substack, Reddit) работают без ключей, но для веб-поиска нужен хотя бы Exa.

**В: Как обновить ключи после первой настройки?**
О: Запустите `/jadlis-research:setup` повторно — он определит существующие ключи и спросит только о недостающих. Или отредактируйте `~/.jadlis-research/env` вручную.

**В: Зачем отдельный env-файл, а не .env?**
О: Файл `~/.jadlis-research/env` сохраняется между проектами и сессиями Claude Code. Managed block паттерн позволяет безопасно сосуществовать с ручными правками.

**В: Как защищены API-ключи?**
О: Ключи хранятся в `~/.jadlis-research/env` с `chmod 600` (чтение/запись только владельцу). Директория — `chmod 700`. Полные ключи никогда не выводятся — подтверждается только длина.

**В: Что будет, если источник данных недоступен во время исследования?**
О: Каждый воркер обрабатывает ошибки самостоятельно. Недоступные источники пропускаются и отмечаются в отчёте. Синтез работает с доступными данными.

**В: Как проверить, какие источники работают?**
О: Запустите `/jadlis-research:setup` — фаза 6 проверяет все настроенные сервисы.

### Участие в проекте

- Форк: https://github.com/beCyborg/jadlis-research
- Issues на русском (английский принимается)
- Коммиты: `feat:`, `fix:`, `docs:` + описание на русском
- PR в ветку `main`
- Тестирование: `/jadlis-research:setup` и `/jadlis-research:research` после изменений

### Благодарности

Создано с помощью [Claude Code](https://claude.ai/claude-code) plugin system.
Использует MCP (Model Context Protocol) для интеграции с внешними сервисами.

### Лицензия

MIT License. Copyright (c) 2026 beCyborg.
См. файл [LICENSE](LICENSE).
