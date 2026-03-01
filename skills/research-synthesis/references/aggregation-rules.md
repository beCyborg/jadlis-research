# Aggregation Rules

Детерминированные правила для агрегации findings из workers.

## Deduplication Algorithm

Два findings считаются дубликатами если:
- Поле `Claim` семантически эквивалентно (тот же субъект, тот же предикат, то же направление утверждения)
- Различия только в формулировке, не в сути

**Стратегия merge:**
1. Оставить finding с более высоким Tier source как primary
2. При одинаковом Tier — оставить finding с более конкретным Evidence
3. Добавить secondary sources из дубликата в поле Evidence
4. Сохранить highest confidence из обоих findings

**НЕ являются дубликатами:**
- Findings с противоположными claims (это противоречия)
- Findings с одинаковой темой, но разными аспектами
- Findings из разных temporal periods (если время релевантно)

## Conflict Resolution

| Конфликт | Действие |
|----------|----------|
| Tier 1 vs Tier 3 | Primary: Tier 1. Отметить: "некоторые community источники указывают на..." |
| Tier 1 vs Tier 1 | Обе позиции. Отметить как "активная дискуссия в литературе" |
| Tier 2 vs Tier 2 | Обе позиции. Приоритет — более свежий источник |
| Tier 3 vs Tier 3 | Обе позиции кратко. Не включать в Главные выводы |
| Tier 2 vs Tier 3 | Primary: Tier 2. Tier 3 как дополнительная перспектива |

Принцип: никогда не подавлять противоречие. Прозрачность важнее однозначности.

## Source Weighting (Confidence Calculation)

| Tier | Вес |
|------|-----|
| Tier 1 | 1.0 (полный вес) |
| Tier 2 | 0.5 (2 Tier 2 = 1 единица к High confidence) |
| Tier 3 | Индикаторный (может поднять Low → Low+, но не достигает Medium) |

**Пороги confidence:**
- **High:** сумма весов ≥ 3.0, нет противоречий
- **Medium:** сумма весов ≥ 1.0, ИЛИ 1 Tier 1 источник
- **Low:** сумма весов < 1.0, ИЛИ есть противоречия

## Minimum Evidence Threshold

| Секция отчёта | Минимальный порог |
|---------------|-------------------|
| Главные выводы | ≥1 Tier 1 ИЛИ ≥2 Tier 2 |
| Детальный анализ | ≥1 Tier 2, маркируется `[Low]` |
| Gap Analysis | Tier 3-only claims как "community perspective" |

## Exclusion Rules

Полностью исключить finding если:
- Только Tier 3 И противоречит Tier 1 → не включать в main findings, отметить в Gap Analysis
- Zero evidence (claim без source URL или citation) → исключить полностью
- Полный дубликат finding с более высоким confidence → discard silently
