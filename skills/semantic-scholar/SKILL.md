---
name: semantic-scholar
description: "Primary academic search source. 14 tools for CS/AI/ML/NLP literature: paper search, citation graph, author disambiguation, ML-based recommendations, BibTeX export. Use as first source alongside OpenAlex for broad queries."
user-invocable: false
allowed-tools: mcp__plugin_jadlis-research_semantic-scholar__search_papers, mcp__plugin_jadlis-research_semantic-scholar__get_paper_details, mcp__plugin_jadlis-research_semantic-scholar__get_paper_citations, mcp__plugin_jadlis-research_semantic-scholar__get_paper_references, mcp__plugin_jadlis-research_semantic-scholar__search_authors, mcp__plugin_jadlis-research_semantic-scholar__get_author_details, mcp__plugin_jadlis-research_semantic-scholar__get_author_top_papers, mcp__plugin_jadlis-research_semantic-scholar__find_duplicate_authors, mcp__plugin_jadlis-research_semantic-scholar__consolidate_authors, mcp__plugin_jadlis-research_semantic-scholar__get_recommendations, mcp__plugin_jadlis-research_semantic-scholar__get_related_papers, mcp__plugin_jadlis-research_semantic-scholar__list_tracked_papers, mcp__plugin_jadlis-research_semantic-scholar__clear_tracked_papers, mcp__plugin_jadlis-research_semantic-scholar__export_bibtex
---

## When to Use This Source

Excels at CS, AI, NLP, machine learning, and interdisciplinary research with citation graph needs. Use as first source alongside OpenAlex for broad queries.

Particularly strong for:
- CS/AI/ML/NLP literature
- Citation graph traversal (forward and backward)
- Author disambiguation
- ML-based paper recommendations (single or multi-seed)
- Batch operations (up to 1000 papers per call)
- BibTeX export for session-tracked papers

## Tool Decision Table

| Task | Tool |
|------|------|
| Find papers by keyword | `search_papers` |
| Paper details + TL;DR | `get_paper_details` |
| Who cites this paper | `get_paper_citations` |
| What this paper cites | `get_paper_references` |
| Find similar (single seed) | `get_recommendations` |
| Find similar (multi-seed) | `get_related_papers` |
| Find author | `search_authors` |
| Author profile + papers | `get_author_details` |
| Author's top papers | `get_author_top_papers` |
| Deduplicate author entries | `find_duplicate_authors` → `consolidate_authors` |
| Export bibliography | `export_bibtex` |
| List session-tracked papers | `list_tracked_papers` |
| Clear session tracking | `clear_tracked_papers` |

## Key Parameters

- **`search_papers` — `year` parameter:** Range string `"2020-2024"` or single year `"2023"`. Not integers.
- **`get_paper_citations` / `get_paper_references` — `limit`:** Maximum 1000 per call.
- **`get_recommendations` — `from_pool`:** `"recent"` (last 2 years) or `"all-cs"` (broader CS pool).
- **`get_related_papers`:** Requires `positive_paper_ids` (list). `negative_paper_ids` optional.
- **`get_author_top_papers` — `top_n`:** Fetches ALL pages internally, sorts client-side. Cap at `top_n ≤ 20` without API key.
- **`export_bibtex` — `cite_key_format`:** `"author_year"`, `"author_year_title"`, `"paper_id"`.

## Paper ID Prefix Quirk (Critical)

Requires **uppercase** prefixes for non-native IDs:
- DOIs: `DOI:10.1145/3442188.3445922` (not `doi:`)
- arXiv: `ARXIV:2106.15928` (not `arxiv:` — also differs from arXiv MCP which uses bare IDs without prefix)
- PubMed: `PMID:34567890`
- ACL: `ACL:2021.acl-long.1`

Native S2 paper IDs are plain hex strings — no prefix needed.

## Rate Limits

Without API key: 5,000 req/5 min shared pool. With `SEMANTIC_SCHOLAR_API_KEY`: 1 req/s dedicated. Server has circuit breaker + LRU cache + exponential backoff built in.

## consolidate_authors WARNING

**⚠️ PERMANENT OPERATION.** `consolidate_authors` performs irreversible merges in Semantic Scholar's public database, affecting all users globally. Only call with explicit user confirmation. Never call speculatively or in automated pipelines.

## Domain Fit

**Strong:** CS, AI, ML, NLP, Information Retrieval, Software Engineering, Computational Biology.
**Moderate:** Biomedical (PubMed is better), Physics preprints (arXiv is better).
**Weak:** Social sciences, humanities, law, economics (use OpenAlex).

## Error Patterns

- `404 Not Found` for paper ID: Check prefix format — must be uppercase. Try DOI or arXiv ID directly.
- Rate limit errors: Check if `SEMANTIC_SCHOLAR_API_KEY` is set. Exponential backoff is built in.
- Empty `get_author_top_papers` results: Reduce `top_n` to 20 or less.

## Cross-Reference

- **OpenAlex** (`jadlis-research:openalex`): use in parallel for broad queries
- **arXiv** (`jadlis-research:arxiv`): use for full paper content after finding papers here
- **Crossref** (`jadlis-research:crossref`): format found DOIs as citations
- **Unpaywall** (`jadlis-research:unpaywall`): download full text for non-arXiv papers
