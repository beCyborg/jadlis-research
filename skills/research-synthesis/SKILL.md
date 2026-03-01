---
name: research-synthesis
description: "Синтез результатов исследования, триангуляция, генерация отчёта"
user-invocable: false
disable-model-invocation: true
---

# Research Synthesis

Агрегация findings из всех research workers, triangulation (триангуляция), confidence calibration и генерация русскоязычного отчёта. Pipeline-only skill — вызывается только оркестратором после завершения всех workers.

## 1. Input

Прочитать все scratchpad файлы из `${CLAUDE_PROJECT_DIR}/.scratchpads/${CLAUDE_SESSION_ID}/`:

| Файл | Источник | Назначение |
|------|----------|------------|
| `query-analysis.md` | query-understanding | Оригинальный запрос, classification, sub_questions |
| `routing-decision.md` | source-routing | Назначенные треки, verification_required |
| `academic-track.md` | academic-worker | Академические findings |
| `community-track.md` | community-worker | Community findings |
| `social-media-track.md` | social-media-worker | Social/review findings |
| `verification-report.md` | verification (optional) | Кросс-проверенные claims |

**Важно:** `CLAUDE_PROJECT_DIR` — директория проекта пользователя (не plugin root).

**Обработка отсутствующих файлов:** Если track файл отсутствует или пуст — пропустить трек и записать его как "не назначен" в секцию Методология. Отсутствие файла означает, что worker не был назначен (а не что он ещё работает). Синхронизация — ответственность оркестратора (sprint 07).

## 2. Aggregation

1. Прочитать `query-analysis.md` → извлечь `sub_questions` и оригинальный `query`
2. Прочитать `routing-decision.md` → извлечь `tracks` и `verification_required`
3. Для каждого трека со `status: available` прочитать соответствующий `*-track.md`
4. Собрать все findings в единый список
5. Deduplicate: объединить findings с семантически эквивалентными claims. Сохранить источник с наивысшим tier; добавить secondary sources
6. Отсортировать по source tier: Tier 1 → Tier 2 → Tier 3
7. Сгруппировать findings по sub_question из `query-analysis.md` (сопоставление по теме/ключевым словам)

Подробный алгоритм deduplication, conflict resolution и source weighting — в `references/aggregation-rules.md`.

## 3. Triangulation (триангуляция)

Для каждого ключевого claim в агрегированных findings:

- Подсчитать независимые источники (из разных треков = независимые; два finding с одного URL = один источник)
- Применить confidence calibration:
  - **High:** ≥3 источников Tier 1-2 согласны, нет противоречий
  - **Medium:** 2 источника согласны, ИЛИ 1 Tier 1 источник
  - **Low:** 1 источник, ИЛИ есть противоречащие данные

**Counterfactual check:** Для каждого claim с High confidence — проверить наличие противоречащих evidence. Если найдено → понизить до Medium и отметить противоречие в отчёте.

**Противоречащие claims:** Когда источники расходятся — представить обе позиции явно. Включить разногласие как finding: "Источники расходятся по X — [source A] утверждает ..., тогда как [source B] утверждает ..."

Не подавлять одну из сторон. Прозрачность противоречий — ключевой принцип отчёта.

## 4. Report Generation

**Язык:** Тело отчёта всегда на русском. Исключения: прямые цитаты из английских источников сохраняются на английском с русским пояснением; code snippets, URLs, proper nouns — в оригинальной форме.

Структура отчёта по шаблону из `references/report-template.md`:

1. **TLDR** (3-5 предложений): Прямой ответ на запрос. Без вводных "мы обнаружили", "исследование показало" — сразу суть.
2. **Главные выводы** (5-8 пунктов): Ключевые findings с inline confidence markers и citations. Каждый пункт — одна завершённая мысль.
3. **Детальный анализ**: По одной подсекции на каждый sub_question из `query-analysis.md`. Каждая включает: findings с evidence и citations, confidence level, противоречия (если есть). Каждая подсекция завершается оценкой покрытия: полный ответ / частичный / gap.
4. **Методология (Methodology)**: Какие треки использованы, какие пропущены, статус verification. Конкретно: "academic-track: 6 findings из 4 источников; community-track: не назначен".
5. **Gap Analysis**: Что не удалось найти. Какие sub_questions без ответа и почему.
6. **Источники**: Полная библиография, сгруппированная по tier: [T1], [T2], [T3].

## 5. Confidence Markers

Inline маркеры используются по всему тексту отчёта:

| Маркер | Значение |
|--------|----------|
| `[High]` | ≥3 независимых источника Tier 1-2, нет противоречий |
| `[Medium]` | 2 источника согласны, ИЛИ 1 Tier 1 источник |
| `[Low]` | 1 источник, или есть противоречия |
| `[Unverified]` | Для `simple` запросов без verification pass |

Маркер ставится сразу после claim, перед citation: "X приводит к Y `[High]` [Smith et al., 2023, Nature]."

## 6. Output

Записать отчёт в `${CLAUDE_PROJECT_DIR}/.scratchpads/${CLAUDE_SESSION_ID}/report.md`.

Использовать Write tool. НЕ использовать append mode — `report.md` записывается целиком за один раз. Это единственный scratchpad, который не является append-only.

Отчёт также является конечным результатом pipeline — оркестратор прочитает `report.md` и представит его пользователю.
