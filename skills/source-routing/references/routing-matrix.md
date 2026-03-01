# Routing Matrix — 5 Types × 6 Domains

Полная матрица маршрутизации. Каждая ячейка содержит: primary track, secondary track(s), fallback primary (если primary `not-implemented`).

## Статусы

- **available** — worker готов к запуску
- **direct-only** — Social Media worker существует, но не запускается pipeline (sprint 07)
- **not-implemented** — Expert и Web workers ещё не созданы (sprint 07)

---

## factual

| Domain | Primary | Secondary | Fallback Primary | Notes |
|--------|---------|-----------|-----------------|-------|
| tech | Web (`not-implemented`) | Academic | Community | Community reddit/HN для tech facts |
| science | Academic | Web (`not-implemented`) | Academic (self) | PubMed, OpenAlex — основные |
| business | Web (`not-implemented`) | Community | Community | substack, twitter для бизнес-фактов |
| health | Academic | Web (`not-implemented`) | Academic (self) | PubMed primary, клинические данные |
| social | Community | Social Media (`direct-only`) | Community (self) | Reddit, HN для социальных фактов |
| general | Web (`not-implemented`) | Academic, Community | Community | Кросс-доменный — Community как fallback |

## exploratory

| Domain | Primary | Secondary | Fallback Primary | Notes |
|--------|---------|-----------|-----------------|-------|
| tech | Academic, Community | Web (`not-implemented`) | Academic | 2 трека для broad overview |
| science | Academic | Community, Web (`not-implemented`) | Academic (self) | Научные обзоры + community дискуссии |
| business | Community | Expert (`not-implemented`), Web (`not-implemented`) | Community (self) | substack, reddit для бизнес-обзоров |
| health | Academic | Community | Academic (self) | PubMed обзоры + patient communities |
| social | Community | Social Media (`direct-only`) | Community (self) | Reddit, HN, substack |
| general | Academic, Community | Web (`not-implemented`) | Academic | Широкий обзор — оба available трека |

## comparative

| Domain | Primary | Secondary | Fallback Primary | Notes |
|--------|---------|-----------|-----------------|-------|
| tech | Community | Academic | Community (self) | reddit/HN сравнения + academic benchmarks |
| science | Academic | Expert (`not-implemented`) | Academic (self) | Peer-reviewed сравнительные исследования |
| business | Expert (`not-implemented`) | Community, Web (`not-implemented`) | Community | Аналитика + community мнения |
| health | Academic | Expert (`not-implemented`) | Academic (self) | Клинические сравнения, meta-analyses |
| social | Community | Social Media (`direct-only`) | Community (self) | Общественные сравнения |
| general | Community | Academic | Community (self) | Кросс-доменное сравнение |

## opinion

| Domain | Primary | Secondary | Fallback Primary | Notes |
|--------|---------|-----------|-----------------|-------|
| tech | Community | Social Media (`direct-only`) | Community (self) | reddit, HN, substack — мнения разработчиков |
| science | Academic | Community | Academic (self) | Expert opinions в журналах + community |
| business | Community | Expert (`not-implemented`) | Community (self) | Аналитика, отзывы, reviews |
| health | Community | Academic | Community (self) | Patient reviews + clinical opinions |
| social | Community | Social Media (`direct-only`) | Community (self) | Общественное мнение, дискуссии |
| general | Community | Social Media (`direct-only`) | Community (self) | Общие отзывы и мнения |

## trend

| Domain | Primary | Secondary | Fallback Primary | Notes |
|--------|---------|-----------|-----------------|-------|
| tech | Community | Academic, Web (`not-implemented`) | Community (self) | HN, reddit для tech trends + arxiv papers |
| science | Academic | Web (`not-implemented`) | Academic (self) | Publication trends, citation analysis |
| business | Web (`not-implemented`) | Community, Expert (`not-implemented`) | Community | substack, twitter для бизнес-трендов |
| health | Academic | Community | Academic (self) | Clinical trial trends, PubMed analysis |
| social | Community | Social Media (`direct-only`) | Community (self) | Social trends, reddit discussions |
| general | Web (`not-implemented`) | Community | Community | Общие тренды — Community как fallback |

---

## Source Priority by Domain

Рекомендуемый порядок источников внутри треков для каждого домена:

### Academic Track

| Domain | Top Sources |
|--------|------------|
| tech | arxiv, semantic-scholar, openalex |
| science | pubmed, openalex, semantic-scholar |
| business | openalex, semantic-scholar, crossref |
| health | pubmed, openalex, unpaywall |
| social | openalex, semantic-scholar, crossref |
| general | semantic-scholar, openalex, arxiv |

### Community Track

| Domain | Top Sources |
|--------|------------|
| tech | hacker-news, reddit, github |
| science | reddit, substack, github |
| business | substack, twitter, reddit |
| health | reddit, substack, hacker-news |
| social | reddit, twitter, substack |
| general | reddit, hacker-news, substack |

### Social Media Track

| Domain | Top Sources |
|--------|------------|
| tech | instagram (tech accounts) |
| science | instagram (science communicators) |
| business | instagram (brand accounts) |
| health | google-maps (clinics, reviews) |
| social | google-maps, instagram |
| general | google-maps, instagram |

---

## Fallback Rules

1. Если primary track — `not-implemented` → использовать `fallback_primary` из ячейки
2. Если fallback тоже `not-implemented` → использовать Community (всегда `available`)
3. `direct-only` треки включаются в output YAML для информации, но НЕ считаются в `total_workers`
4. При `deep` complexity — включить все available треки независимо от matrix
