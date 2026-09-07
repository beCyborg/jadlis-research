[Русский](README.md) · English

# research — Claude Code plugin

Command: `/research`.

## Было → стало

To be written (README contract 2026-09, phase 3).

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
