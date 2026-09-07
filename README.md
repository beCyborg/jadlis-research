Русский · [English](README.en.md)

# Решение, которому можно доверять: 14 каналов, ключевые утверждения перепроверены

Плагин `research` для Claude Code. Команда — `/research`.

## Было → стало

Раздел заполняется по контракту README 2026-09 (фаза 3 плана «GitHub beCyborg как витрина Jadlis»).

## Как это работает

Четырнадцать каналов (web×3, reddit, twitter, hackernews, substack, yandex, youtube, telegram, языковые слои ja/zh/ko/eu) через workflow, ключевые утверждения проверяются перекрёстно, непроверенные помечены. Требует плагин search (ключи Brave и Firecrawl).

## Установка и первый запуск

```bash
claude plugin marketplace add https://github.com/beCyborg/jadlis-start.git
claude plugin install search@jadlis --config BRAVE_API_KEY=… --config FIRECRAWL_API_KEY=…
claude plugin install research@jadlis
```

## Границы, стоимость, обновление

```bash
claude plugin marketplace update jadlis
claude plugin update research@jadlis
claude plugin list
```

Переустановка: `claude plugin uninstall research@jadlis --keep-data && claude plugin install research@jadlis`.
