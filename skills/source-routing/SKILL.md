---
name: source-routing
description: "Маршрутизация запроса по источникам и workers"
user-invocable: false
disable-model-invocation: true
---

# Source Routing

Маршрутизация исследовательского запроса по трекам и workers на основе classification из query-analysis.md. Pipeline-only skill — вызывается только оркестратором.

## 1. Input

Прочитать `query-analysis.md` из scratchpad:

```
${CLAUDE_PROJECT_DIR}/.scratchpads/${CLAUDE_SESSION_ID}/query-analysis.md
```

**Важно:** `CLAUDE_PROJECT_DIR` — директория проекта пользователя (не plugin root).

Извлечь поля: `type`, `domain`, `secondary_domain`, `complexity`, `sub_questions`.

## 2. Routing Algorithm

1. Прочитать `query-analysis.md` через Read tool
2. Извлечь `type`, `domain`, `complexity` из YAML
3. Найти ячейку в routing matrix (`references/routing-matrix.md`) по (type × domain)
4. Применить complexity rules для определения количества треков и необходимости verification
5. Записать результат в `routing-decision.md` (append-only per shared-protocols)

Если `secondary_domain` не null — проверить matrix и для secondary domain, объединить треки. Дедупликация: если трек уже в списке от primary domain — оставить с более высоким priority. Новые треки от secondary domain получают priority после primary.

## 3. Track Definitions

| Track | Worker | Status | Описание |
|-------|--------|--------|----------|
| Academic | `academic-worker` | `available` | Научные публикации, базы данных |
| Community | `community-worker` | `available` | Форумы, блоги, обсуждения |
| Social Media | `social-media-worker` | `direct-only` | Не запускается pipeline до sprint 07 |
| Expert | `expert-worker` | `not-implemented` | Worker не существует (sprint 07) |
| Web | `native-web-worker` | `not-implemented` | Worker не существует (sprint 07) |

Для `not-implemented` треков routing matrix указывает `fallback_primary` — какой available трек заменяет primary. В output YAML отражать fallback (не недоступный primary) как `priority: 1`.

Для `direct-only` треков — включать в output YAML со статусом, но НЕ считать в `total_workers`.

## 4. Complexity Rules

| Complexity | Треков | Verification |
|-----------|--------|-------------|
| `simple` | 1 primary (top priority из matrix) | Не требуется |
| `moderate` | 2 трека + verification | Обязателен |
| `complex` | 2-3 трека + verification | Обязателен |
| `deep` | Все applicable треки + verification | Обязателен |

Verification обязателен для `moderate` и выше. При verification оркестратор дополнительно проверяет consistency findings между треками.

## 5. Source Prioritization

Внутри каждого трека источники упорядочены по приоритету:

| Track | Sources (в порядке приоритета) |
|-------|-------------------------------|
| Academic | semantic-scholar > openalex > pubmed > arxiv > crossref > unpaywall |
| Community | reddit > hacker-news > substack > github > twitter |
| Social Media | google-maps > instagram |
| Expert | TBD (sprint 07) |
| Web | TBD (sprint 07) |

В output YAML указывать только top 2-3 источника для данного domain (не все источники трека). Выбор зависит от domain:
- `science`/`health` → pubmed, openalex выше arxiv
- `tech` → arxiv, semantic-scholar выше pubmed
- `business` → substack, twitter выше reddit

Полная matrix источников по доменам — в `references/routing-matrix.md`.

## 6. Output Format

Записать YAML в scratchpad `routing-decision.md`:

```
${CLAUDE_PROJECT_DIR}/.scratchpads/${CLAUDE_SESSION_ID}/routing-decision.md
```

### YAML Structure

```yaml
---
worker: source-routing
timestamp: <ISO 8601>
query_summary: <краткое описание>
---

query: "<original query from query-analysis.md>"
estimated_complexity: <complexity>
tracks:
  - name: academic
    worker: academic-worker
    priority: 1
    status: available
    sources: [semantic-scholar, openalex, pubmed]
  - name: community
    worker: community-worker
    priority: 2
    status: available
    sources: [reddit, hacker-news]
  - name: social-media
    worker: social-media-worker
    priority: 3
    status: direct-only
    sources: [google-maps, instagram]
verification_required: true
total_workers: 2
parallel_launch: true
```

Правила:
- `total_workers` считает ТОЛЬКО `available` треки (не `direct-only` и не `not-implemented`)
- `parallel_launch: true` всегда — оркестратор запускает все available workers одновременно
- YAML header per shared-protocols: worker name, timestamp, query summary
- НЕ вызывать MCP tools — только Read и Write
- Append-only запись: перед Write вызвать Read с `offset: 1` на routing-decision.md — если файл существует, дописать через Write с offset. Если файл не существует (ошибка Read), создать новый
