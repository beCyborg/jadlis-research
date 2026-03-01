---
name: query-understanding
description: "Классификация запроса, MECE декомпозиция, query expansion"
user-invocable: false
disable-model-invocation: true
---

# Query Understanding

Классификация исследовательского запроса, декомпозиция на под-вопросы и генерация альтернативных формулировок. Pipeline-only skill — вызывается только оркестратором.

## 1. Input

Пользовательский запрос поступает через `$ARGUMENTS`. Первое действие — классификация. Этот skill НЕ вызывает MCP tools — используются только Read и Write для работы со scratchpad файлами.

## 2. Classification

Классифицировать запрос по трём осям. Полные определения и примеры — в [references/taxonomy.md](references/taxonomy.md).

### Type (5 значений)

| Значение | Описание |
|----------|----------|
| `factual` | Поиск конкретного факта или ответа |
| `exploratory` | Обзор темы, широкое исследование |
| `comparative` | Сравнение двух или более сущностей |
| `opinion` | Поиск мнений, оценок, отзывов |
| `trend` | Временная динамика, прогнозы, развитие |

### Domain (6 значений)

| Значение | Описание |
|----------|----------|
| `tech` | Софт, железо, инженерия, AI |
| `science` | Академические исследования, медицина, биология, физика |
| `business` | Компании, рынки, финансы, стратегия |
| `health` | Медицинские советы, wellness, клинические темы |
| `social` | Культура, сообщества, события, люди |
| `general` | Кросс-доменный или неклассифицируемый |

### Complexity (4 уровня)

| Уровень | Описание |
|---------|----------|
| `simple` | Один чёткий вопрос, 1 домен, 1-2 источника |
| `moderate` | Составной вопрос, 2+ аспекта или домена |
| `complex` | Множество связанных под-вопросов, экспертиза в нескольких областях |
| `deep` | Глубокий анализ, временная динамика, множество перспектив |

Также определить `language` оригинального запроса (код: `ru`, `en`, `de` и т.д.).

## 3. MECE Decomposition

Декомпозировать запрос на 3-7 независимых под-вопросов по принципу MECE:

- **Mutually Exclusive:** под-вопросы не перекрываются по scope
- **Collectively Exhaustive:** вместе покрывают весь оригинальный запрос
- **DAG structure:** направленный ациклический граф, no recursion, FIFO порядок (фундаментальные вопросы первыми). Под-вопросы НЕ должны ссылаться на ожидаемые результаты других под-вопросов
- Каждый под-вопрос включает `search_terms` — 2-3 ключевые фразы для поисковых API

### Масштабирование по complexity

| Complexity | sub_questions |
|-----------|--------------|
| `simple` | 3 |
| `moderate` | 3-5 |
| `complex` | 5-6 |
| `deep` | 6-7 |

Под-вопросы нумеруются последовательно: `sq1`, `sq2`, ... `sqN`.

## 4. Query Expansion

Генерировать 3-5 альтернативных формулировок оригинального запроса:

1. **Синонимы и перефразирование** — тот же смысл, другие слова
2. **Обобщение** — более широкий scope (expansion)
3. **Специализация** — более узкий scope
4. **English translation** — обязателен для не-английских запросов (большинство академических и web источников на английском)
5. **Academic/technical formulation** — с использованием профессиональной терминологии

Все варианты сохраняются в массиве `expansions` выходного YAML.

## 5. Clarification Protocol

### High ambiguity (≥2 равновероятных интерпретации)

Генерировать 1-2 уточняющих вопроса в формате `AskUserQuestion`:

```yaml
clarification_questions:
  - question: "Уточните, что вас интересует:"
    options:
      - "Вариант A"
      - "Вариант B"
```

Одновременно генерировать `sub_questions` на основе наиболее вероятной интерпретации (partial decomposition). Оркестратор решит — спрашивать пользователя или работать с partial decomposition.

### Low/Medium ambiguity

Продолжить с best-effort decomposition, покрывающей все правдоподобные интерпретации. Уточняющие вопросы не нужны — установить `clarification_needed: false`.

## 6. Output Format

Записать результат как YAML в scratchpad файл `query-analysis.md`:

```
${CLAUDE_PROJECT_DIR}/.scratchpads/${CLAUDE_SESSION_ID}/query-analysis.md
```

**Важно:** `CLAUDE_PROJECT_DIR` — это директория проекта пользователя (не plugin root `CLAUDE_PLUGIN_ROOT`). Пользователь должен добавить `.scratchpads/` в свой проектный `.gitignore`.

Правила записи из shared-protocols: append-only, проверить размер через Read перед записью, YAML-заголовок обязателен.

### Output YAML Structure

```yaml
---
worker: query-understanding
timestamp: <ISO 8601>
query_summary: <краткое описание запроса для заголовка>
---

query: "<original query verbatim>"
type: <type>
domain: <domain>
secondary_domain: <secondary domain or null>
complexity: <complexity>
language: <detected_language_code>
sub_questions:
  - id: sq1
    question: "..."
    search_terms: ["...", "..."]
  - id: sq2
    question: "..."
    search_terms: ["...", "..."]
expansions:
  - "..."
  - "..."
clarification_needed: true|false
clarification_questions:
  - question: "..."
    options: ["...", "..."]
```

Соблюдать output budget из shared-protocols: не более 80 строк на scratchpad файл. Для complex/deep запросов с множеством sub_questions — сокращать search_terms до 2 фраз.
