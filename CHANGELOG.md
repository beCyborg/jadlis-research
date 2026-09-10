# Changelog — jadlis-research

Формат: [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/), версии — [SemVer](https://semver.org/lang/ru/).
История до 1.0.0 — плагин `jadlis-research` 1.0.0–1.3.0 в репо [jadlis-hub](https://github.com/beCyborg/jadlis-hub) (`plugins/jadlis-research/CHANGELOG.md` до split).

## [Unreleased]

## [2.0.0] — 2026-09-10

### Для человека

- Плагин переименован: `research` → `jadlis-research`. Строка установки теперь
  `claude plugin install jadlis-research@jadlis`, маркетплейс добавляется командой
  `claude plugin marketplace add https://github.com/beCyborg/jadlis-hub`.
- Короткая команда `/research` не изменилась; полная форма стала `/jadlis-research:research`.
- Совместимости со старым именем нет: снеси `research@jadlis` и поставь `jadlis-research@jadlis` заново.
- Зависимость тоже переехала: нужен плагин `jadlis-search` (раньше `search`), ключи Brave и
  Firecrawl заводятся при его установке.
- В README (RU + EN) обновлены строки установки, обновления и переустановки; добавлен обзор тира
  `docs/tier/` (RU + EN) — он раньше жил в репо хаба.

### For agents

- `.claude-plugin/plugin.json`: `name` = `jadlis-research`, `version` = 2.0.0, dependency
  `{"name":"jadlis-search","version":"^2"}`.
- Namespaces: MCP tools `mcp__plugin_jadlis-search_*`, agents `jadlis-research:*`
  (`agentType` в `workflows/full-research-core.js`), skill command `/jadlis-search:keys`.
- Skill folders and `${CLAUDE_PLUGIN_ROOT}` paths unchanged; entry skill frontmatter `name: research`.
- CI caller: `beCyborg/jadlis-hub/.github/workflows/plugin-ci.yml@main`.
- Release tag prefix: `jadlis-research--vX.Y.Z`.

## [1.0.0] — 2026-09-07

### Для человека

- Первый релиз под именем `research`: выделен из `jadlis-research` 1.3.0 (репо на плагин, команда `/research`).

### For agents

- Split of `jadlis-research` 1.3.0 by `tools/split-research.py` (hub). Namespaces: MCP tools `mcp__plugin_search_*`, agents `research:*`, commands `/search`, `/search:keys`, `/research`, `/science-research`, `/verif`.
