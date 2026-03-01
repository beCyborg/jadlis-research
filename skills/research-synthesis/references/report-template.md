# Report Template

Шаблон отчёта для research-synthesis. Каждая секция содержит placeholder-инструкции.

```yaml
---
query: "<исходный запрос пользователя>"
date: "<ISO 8601 date>"
tracks_used: [academic, community]
tracks_skipped: [social-media]
verification_status: completed|skipped
complexity: simple|moderate|complex|deep
total_findings: <число после deduplication>
total_sources: <число уникальных source URLs>
---
```

## TLDR

3-5 предложений. Прямой ответ на запрос без вводных слов ("мы обнаружили", "исследование показало"). Начинать с сути. Включить ключевой вывод с confidence marker.

Пример: "LLM-приложения в клинической диагностике показывают точность 87-93% на стандартных бенчмарках `[High]`, однако FDA одобрение получили только 3 системы `[Medium]`."

## Главные выводы

5-8 пунктов. Каждый пункт — одна завершённая мысль с confidence marker и citation.

Формат:
- Claim `[confidence]` [Citation]
- Claim `[confidence]` [Citation]

Правила:
- Только claims с ≥1 Tier 1 или ≥2 Tier 2 источниками
- Сортировка по confidence: High → Medium → Low
- Если <5 claims проходят стандартный порог (≥1 Tier 1 или ≥2 Tier 2) — допустить claims с 1 Tier 2 источником, маркировать `[Low]`

## Детальный анализ

По одной подсекции на каждый sub_question из query-analysis.md.

### [Текст sub_question]

Findings:
- Finding с evidence, confidence marker и citation
- Противоречия (если есть): "Источники расходятся — ..."

Каждая подсекция должна:
1. Начинаться с краткого ответа на sub_question (1-2 предложения)
2. Далее — детальные findings с evidence
3. Заканчиваться оценкой покрытия: полный ответ / частичный / gap

## Методология (Methodology)

Перечислить:
- Использованные треки: название, количество findings, количество источников
- Пропущенные треки: причина (не назначен / worker недоступен / ошибка)
- Статус verification: completed / skipped (с причиной)
- Общее время исследования (если доступно из timestamp дельт)

Формат:
```
- academic-track: 6 findings из 4 источников (semantic-scholar, pubmed, arxiv)
- community-track: 4 findings из 3 источников (reddit, hacker-news)
- social-media-track: не назначен (routing decision: low relevance)
- verification: completed, 2 claims downgraded
```

## Gap Analysis

Что осталось без ответа:
- Какие sub_questions не покрыты (полностью или частично)
- Какие источники были недоступны (ошибки извлечения, rate limits, таймауты)
- Какие типы evidence отсутствуют (нет Tier 1 данных для claim X)
- Рекомендации для дополнительного исследования

## Источники

Полная библиография, сгруппированная по tier:

### Tier 1 (Peer-reviewed / Official)
- [T1] [Author et al., Year, Journal] — URL (если доступен)

### Tier 2 (Reputable)
- [T2] [Organization, Date, Title] — URL

### Tier 3 (Community / Social)
- [T3] [Platform: Author, Date] — URL
