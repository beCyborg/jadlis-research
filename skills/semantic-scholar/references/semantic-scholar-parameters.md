# Semantic Scholar MCP — Parameter Reference

## MCP Namespace

```
Plugin namespace:  mcp__plugin_jadlis-research_semantic-scholar__<tool>
Alternative:       mcp__semantic-scholar__<tool>
```

> **Note:** To verify the active namespace, check the MCP server name at session start (look at the tool list prefix). The plugin namespace (`mcp__plugin_jadlis-research_semantic-scholar__`) is the empirically observed format for plugin-registered servers.

---

## Key Quirks and Common Mistakes

1. **Uppercase ID prefixes** — `DOI:`, `ARXIV:`, `MAG:`, `ACL:`, `PMID:` must be uppercase. Wrong case causes silent not-found errors.
2. **Year is a string** — `search_papers` `year` parameter is `"2020-2024"`, not an integer. Integer values cause errors or are silently ignored.
3. **Rate limits** — Without API key: 5,000 req/5 min from a shared pool. With `SEMANTIC_SCHOLAR_API_KEY`: 1 req/s dedicated. Built-in circuit breaker and exponential backoff.
4. **`get_author_top_papers` pagination** — Fetches all pages internally before sorting. With large author profiles and no API key, use `top_n <= 20`.
5. **`consolidate_authors` is irreversible** — Permanent public database change affecting all users globally. Always confirm with user first.
6. **`get_recommendations` pool** — Default is `"recent"` (last 2 years). Use `"all-cs"` only for CS-domain queries — it returns off-domain results for biology, medicine, or social science topics.
7. **Paper tracking** — Papers are tracked automatically when fetched via `get_paper_details`. There is no explicit `track_paper` call. Use `list_tracked_papers` to review what has been tracked, then `export_bibtex` to export.

---

## Citation vs Reference Direction

- **`get_paper_citations`** — papers that cite the target (forward, impact, influence). Use to find follow-up work and measure impact.
- **`get_paper_references`** — papers cited by the target (backward, foundational). Use to find prior work the target builds on.

---

## Tools

### `search_papers`

Primary paper search tool.

| Parameter | Type | Default | Required | Description |
|-----------|------|---------|----------|-------------|
| `query` | string | — | Yes | Free-text search query |
| `year` | string | — | No | Range `"2020-2024"` or single `"2023"`. Must be string, NOT integer. |
| `fields_of_study` | list[string] | — | No | e.g. `["Computer Science", "Medicine"]` |
| `limit` | integer | 10 | No | Max results (max 100) |
| `offset` | integer | 0 | No | Pagination offset |

Example:
```json
{
  "tool": "search_papers",
  "parameters": {
    "query": "transformer attention mechanisms",
    "year": "2020-2024",
    "fields_of_study": ["Computer Science"],
    "limit": 10
  }
}
```

Returns: list of Paper objects — `paperId`, `title`, `year`, `authors`, `citationCount`, `tldr`, `externalIds`, `openAccessPdf`.

---

### `get_paper_details`

Full metadata for a single paper.

| Parameter | Type | Default | Required | Description |
|-----------|------|---------|----------|-------------|
| `paper_id` | string | — | Yes | S2 paper ID, or `DOI:10.xxx/...`, `ARXIV:2106.15928` (uppercase prefix required) |

**KEY QUIRK:** Prefixes must be uppercase — `DOI:` not `doi:`, `ARXIV:` not `arxiv:`. Wrong case returns not-found errors.

Example:
```json
{ "tool": "get_paper_details", "parameters": { "paper_id": "ARXIV:2106.15928" } }
```

Returns: full paper object including abstract, tldr, venue, open access PDF URL, embedding fields.

---

### `get_paper_citations`

Papers that cite the target paper (forward citations — follow-up work and impact).

| Parameter | Type | Default | Required | Description |
|-----------|------|---------|----------|-------------|
| `paper_id` | string | — | Yes | Same ID format as `get_paper_details` |
| `limit` | integer | 100 | No | Max 1000 |
| `offset` | integer | 0 | No | Pagination |

Returns: list of citing papers with context snippets.

---

### `get_paper_references`

Papers cited by the target paper (backward references — foundational prior work).

| Parameter | Type | Default | Required | Description |
|-----------|------|---------|----------|-------------|
| `paper_id` | string | — | Yes | Same ID format as `get_paper_details` |
| `limit` | integer | 100 | No | Max 1000 |
| `offset` | integer | 0 | No | Pagination |

Returns: list of referenced papers.

---

### `search_authors`

| Parameter | Type | Default | Required | Description |
|-----------|------|---------|----------|-------------|
| `query` | string | — | Yes | Author name |
| `limit` | integer | 10 | No | Max results |

Returns: list of author objects — `authorId`, `name`, `affiliations`, `paperCount`, `citationCount`, `hIndex`.

---

### `get_author_details`

| Parameter | Type | Default | Required | Description |
|-----------|------|---------|----------|-------------|
| `author_id` | string | — | Yes | Semantic Scholar author ID |

Returns: full author profile — affiliations, h-index, paper count, citation count.

---

### `get_author_top_papers`

| Parameter | Type | Default | Required | Description |
|-----------|------|---------|----------|-------------|
| `author_id` | string | — | Yes | Semantic Scholar author ID |
| `top_n` | integer | 10 | No | Number of top papers to return |

**IMPORTANT:** Fetches ALL pages internally, then sorts client-side. Without API key, use `top_n <= 20` to avoid exhausting the shared rate limit pool.

Returns: list of papers sorted by citation count descending.

---

### `find_duplicate_authors`

| Parameter | Type | Default | Required | Description |
|-----------|------|---------|----------|-------------|
| `author_name` | string | — | Yes | Name to check for duplicates |

Returns: list of potential duplicate author profiles with disambiguation signals (affiliation, papers).

---

### `consolidate_authors`

**⚠️ WARNING: PERMANENT OPERATION.** Irreversible merge in Semantic Scholar's public database, affecting all users globally. Never call without explicit user confirmation.

| Parameter | Type | Default | Required | Description |
|-----------|------|---------|----------|-------------|
| `primary_author_id` | string | — | Yes | Canonical author ID to keep |
| `duplicate_author_ids` | list[string] | — | Yes | IDs to merge into primary |

Example:
```json
{
  "tool": "consolidate_authors",
  "parameters": {
    "primary_author_id": "1741101",
    "duplicate_author_ids": ["2109481231", "2159090651"]
  }
}
```

Returns: confirmation of merge.

---

### `get_recommendations`

Single-seed paper recommendations using ML model.

| Parameter | Type | Default | Required | Description |
|-----------|------|---------|----------|-------------|
| `paper_id` | string | — | Yes | Seed paper ID |
| `from_pool` | string | `"recent"` | No | `"recent"` (last 2 years) or `"all-cs"` (broader CS pool — CS domain only) |
| `limit` | integer | 10 | No | Max results |

Returns: list of recommended papers.

---

### `get_related_papers`

Multi-seed paper recommendations (positive + optional negative examples).

| Parameter | Type | Default | Required | Description |
|-----------|------|---------|----------|-------------|
| `positive_paper_ids` | list[string] | — | Yes | Seed papers representing desired topic |
| `negative_paper_ids` | list[string] | — | No | Papers representing topics to avoid |
| `limit` | integer | 10 | No | Max results |

Example:
```json
{
  "tool": "get_related_papers",
  "parameters": {
    "positive_paper_ids": ["204e3073870fae3d05bcbc2f6a8e263d9b72e776"],
    "negative_paper_ids": ["arXiv:1706.03762"],
    "limit": 10
  }
}
```

Returns: list of recommended papers.

---

### `list_tracked_papers`

No parameters. Returns list of papers tracked in current session (tracked automatically via `get_paper_details` calls). Use before `export_bibtex` to review what will be exported.

---

### `clear_tracked_papers`

No parameters. Clears tracked papers list for current session.

---

### `export_bibtex`

Export tracked papers as BibTeX.

| Parameter | Type | Default | Required | Description |
|-----------|------|---------|----------|-------------|
| `cite_key_format` | string | `"author_year"` | No | `"author_year"` (smith2023), `"author_year_title"` (smith2023attention), `"paper_id"` (S2 ID) |

Example:
```json
{ "tool": "export_bibtex", "parameters": { "cite_key_format": "author_year_title" } }
```

Returns: BibTeX string of all tracked papers.
