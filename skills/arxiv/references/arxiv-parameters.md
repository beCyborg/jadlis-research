# arXiv MCP — Parameter Reference

## MCP Server

```
MCP namespace (plugin-registered):
  mcp__plugin_jadlis-research_arxiv__search_papers
  mcp__plugin_jadlis-research_arxiv__download_paper
  mcp__plugin_jadlis-research_arxiv__list_papers
  mcp__plugin_jadlis-research_arxiv__read_paper

Alternative (if plugin prefix absent):
  mcp__arxiv__<tool_name>

Server ID in .mcp.json: "arxiv"
Install: npx arxiv-mcp-server
Storage: ~/.arxiv-mcp-server/papers (configurable via ARXIV_STORAGE_PATH)
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ARXIV_STORAGE_PATH` | No | `~/.arxiv-mcp-server/papers` | Directory for downloaded PDFs. Persists across sessions. |

---

## Tools

### `search_papers`

Searches the arXiv API for papers matching a query.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | — | Search query. Natural language or keyword-based. |
| `max_results` | integer | No | 10 | Max results to return. Range: 1–100. |
| `categories` | list[string] | No | — | Filter to arXiv category codes (e.g., `["cs.AI", "cs.LG"]`). Multiple categories are OR-combined. |
| `date_from` | string | No | — | Filter papers submitted on or after this date. Format: `YYYY-MM-DD` (e.g., `"2024-01-01"`). |

Example:
```json
{
  "query": "chain of thought prompting large language models",
  "max_results": 10,
  "categories": ["cs.AI", "cs.CL"],
  "date_from": "2023-01-01"
}
```

Returns: list of paper objects — `id`, `title`, `authors`, `abstract`, `categories`, `published`, `updated`, `pdf_url`.

---

### `download_paper`

Downloads a paper by arXiv ID to local storage. Persists across sessions.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `paper_id` | string | Yes | — | Bare arXiv ID (e.g., `"2401.12345"`). **No `ARXIV:` prefix** — unlike Semantic Scholar. |

Example:
```json
{ "paper_id": "2201.11903" }
```

Returns: confirmation with local file path. Storage default: `~/.arxiv-mcp-server/papers/` (configurable via `ARXIV_STORAGE_PATH`).

---

### `list_papers`

Lists all papers currently in local storage.

Parameters: **none.**

Returns: list of stored paper objects with `paper_id`, `title`, and local file path. Empty list if no papers downloaded.

---

### `read_paper`

Reads content of a previously downloaded paper. **Must `download_paper` first.**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `paper_id` | string | Yes | — | arXiv paper ID. Must be already downloaded locally. |

Example:
```json
{ "paper_id": "2201.11903" }
```

Returns: full text extracted from PDF. Quality varies — mathematical notation and tables may not extract cleanly.

---

## Standard Workflow

```
search_papers(query, categories, date_from) → paper list with IDs
  → list_papers() to check cache (skip download_paper if already cached)
  → download_paper(paper_id) for top 2-3 candidates
    → read_paper(paper_id) for full content extraction
```

---

## Quirk Notes

- **No `ARXIV:` prefix**: Pass `"2201.11903"` not `"ARXIV:2201.11903"`. Contrast with Semantic Scholar where `ARXIV:` prefix is **required**.
- **Rate sensitivity**: No official rate limit published. Old v0.8.1 plugin had `arxiv-throttle.sh` (5s delay). NOT ported to v0.1.0. Test carefully with many rapid calls.
- **PDF extraction**: `read_paper` extracts text from PDF. Math, tables, figures may not extract cleanly. Focus on abstract/introduction/conclusion for papers with extensive equations.
- **Local persistence**: Papers persist in `ARXIV_STORAGE_PATH` across sessions. Use `list_papers` to check cache. No automatic cleanup.
- **Old-format IDs**: Pre-2007 arXiv IDs use format `cs/0601001`. Try if modern format fails.

---

## arXiv Category Codes

### Computer Science (cs.)

| Code | Description |
|------|-------------|
| `cs.AI` | Artificial Intelligence |
| `cs.AR` | Hardware Architecture |
| `cs.CC` | Computational Complexity |
| `cs.CL` | Computation and Language (NLP) |
| `cs.CR` | Cryptography and Security |
| `cs.CV` | Computer Vision and Pattern Recognition |
| `cs.CY` | Computers and Society |
| `cs.DB` | Databases |
| `cs.DC` | Distributed, Parallel, and Cluster Computing |
| `cs.DS` | Data Structures and Algorithms |
| `cs.GT` | Computer Science and Game Theory |
| `cs.HC` | Human-Computer Interaction |
| `cs.IR` | Information Retrieval |
| `cs.IT` | Information Theory |
| `cs.LG` | Machine Learning |
| `cs.LO` | Logic in Computer Science |
| `cs.MA` | Multiagent Systems |
| `cs.NE` | Neural and Evolutionary Computing |
| `cs.NI` | Networking and Internet Architecture |
| `cs.PL` | Programming Languages |
| `cs.RO` | Robotics |
| `cs.SE` | Software Engineering |
| `cs.SI` | Social and Information Networks |
| `cs.SY` | Systems and Control |

### Mathematics (math.)

| Code | Description |
|------|-------------|
| `math.CO` | Combinatorics |
| `math.IT` | Information Theory (cross-listed with cs.IT) |
| `math.LO` | Logic |
| `math.NA` | Numerical Analysis |
| `math.OC` | Optimization and Control |
| `math.PR` | Probability |
| `math.ST` | Statistics Theory |

### Statistics (stat.)

| Code | Description |
|------|-------------|
| `stat.AP` | Applications |
| `stat.CO` | Computation |
| `stat.ME` | Methodology |
| `stat.ML` | Machine Learning |
| `stat.TH` | Statistics Theory |

### Physics

| Code | Description |
|------|-------------|
| `physics.hep-ph` | High Energy Physics - Phenomenology |
| `physics.hep-th` | High Energy Physics - Theory |
| `physics.quant-ph` | Quantum Physics |
| `cond-mat.str-el` | Strongly Correlated Electrons |
| `astro-ph.CO` | Cosmology and Nongalactic Astrophysics |
| `gr-qc` | General Relativity and Quantum Cosmology |

### Electrical Engineering (eess.)

| Code | Description |
|------|-------------|
| `eess.AS` | Audio and Speech Processing |
| `eess.IV` | Image and Video Processing |
| `eess.SP` | Signal Processing |
| `eess.SY` | Systems and Control |

### Economics / Quantitative Finance / Biology

| Code | Description |
|------|-------------|
| `econ.EM` | Econometrics |
| `q-fin.CP` | Computational Finance |
| `q-bio.NC` | Neurons and Cognition |
