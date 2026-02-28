---
name: openalex
description: "OpenAlex academic search — 240M+ works, 31 tools covering literature search, citation analysis, trends, venue quality, institution groups, and open access. Use for broad coverage, bibliometrics, and interdisciplinary research. Use in parallel with Semantic Scholar."
user-invocable: false
allowed-tools: mcp__plugin_jadlis-research_openalex__search_works, mcp__plugin_jadlis-research_openalex__get_work, mcp__plugin_jadlis-research_openalex__get_related_works, mcp__plugin_jadlis-research_openalex__search_by_topic, mcp__plugin_jadlis-research_openalex__autocomplete, mcp__plugin_jadlis-research_openalex__get_citation_network, mcp__plugin_jadlis-research_openalex__get_top_cited_works, mcp__plugin_jadlis-research_openalex__find_seminal_papers, mcp__plugin_jadlis-research_openalex__find_review_articles, mcp__plugin_jadlis-research_openalex__batch_resolve_references, mcp__plugin_jadlis-research_openalex__search_in_journal_list, mcp__plugin_jadlis-research_openalex__check_venue_quality, mcp__plugin_jadlis-research_openalex__get_source_info, mcp__plugin_jadlis-research_openalex__search_authors_by_expertise, mcp__plugin_jadlis-research_openalex__get_author_profile, mcp__plugin_jadlis-research_openalex__get_author_collaborators, mcp__plugin_jadlis-research_openalex__get_institution_works, mcp__plugin_jadlis-research_openalex__analyze_topic_trends, mcp__plugin_jadlis-research_openalex__compare_research_areas, mcp__plugin_jadlis-research_openalex__get_trending_topics, mcp__plugin_jadlis-research_openalex__analyze_geographic_distribution, mcp__plugin_jadlis-research_openalex__get_concept_hierarchy, mcp__plugin_jadlis-research_openalex__find_open_access_version, mcp__plugin_jadlis-research_openalex__get_work_abstract, mcp__plugin_jadlis-research_openalex__resolve_doi, mcp__plugin_jadlis-research_openalex__get_random_works, mcp__plugin_jadlis-research_openalex__search_concepts, mcp__plugin_jadlis-research_openalex__get_concept, mcp__plugin_jadlis-research_openalex__search_institutions, mcp__plugin_jadlis-research_openalex__get_institution, mcp__plugin_jadlis-research_openalex__get_works_by_concept
---

## When to Use OpenAlex

Coverage-first and bibliometrics-first source. Use for:
- Interdisciplinary research requiring broad corpus coverage (240M+ works)
- Bibliometrics at scale (publication trends, citation networks)
- Institution/geography analysis
- Trends over time
- Finding seminal papers or review articles
- Venue-quality checks (journal presets: utd24, ft50, top_ai_conferences, etc.)

Use in parallel with Semantic Scholar for broad queries. OpenAlex excels at macro-level analysis; S2 excels at CS/AI depth with ML-based recommendations.

## Tool Decision Table

| Task | Tool |
|------|------|
| Find papers broadly | `search_works` |
| Search high-quality venues only | `search_in_journal_list` (with preset name) |
| Topic-based discovery | `search_by_topic` |
| Specific paper by DOI/ID | `get_work` |
| Related works | `get_related_works` |
| Citation graph | `get_citation_network` |
| Foundational papers | `find_seminal_papers` |
| Survey/review papers | `find_review_articles` |
| Most-cited works | `get_top_cited_works` |
| Batch DOI/PMID resolution | `batch_resolve_references` |
| Author expertise search | `search_authors_by_expertise` |
| Author profile | `get_author_profile` |
| Author collaborators | `get_author_collaborators` |
| Institution output | `get_institution_works` |
| Publication trends | `analyze_topic_trends` |
| Compare two fields | `compare_research_areas` |
| Emerging topics | `get_trending_topics` ⚠️ (see caution below) |
| Geographic research distribution | `analyze_geographic_distribution` |
| Field overview | `get_concept_hierarchy` |
| Venue quality tier | `check_venue_quality` |
| Find OA version | `find_open_access_version` |
| Resolve DOI to record | `resolve_doi` |
| Autocomplete query/entity | `autocomplete` |
| Source/journal metadata | `get_source_info` |
| Paper abstract only | `get_work_abstract` |
| Concept search | `search_concepts` |
| Concept details | `get_concept` |
| Concept taxonomy tree | `get_concept_hierarchy` |
| Works by concept | `get_works_by_concept` |
| Institution search | `search_institutions` |
| Institution details | `get_institution` |
| Random sample works ⚠️ | `get_random_works` |

## Venue Quality Presets (search_in_journal_list)

| Preset | Description |
|--------|-------------|
| `utd24` | UT Dallas 24 top business journals |
| `ft50` | Financial Times 50 management journals |
| `abs4star` | ABS 4* journals |
| `abs4` | ABS 4 and 4* journals |
| `abs3` | ABS 3-star journals |
| `ms_misq_ops` | MIS Quarterly, Management Science, Operations Research |
| `top_ai_conferences` | NeurIPS, ICML, ICLR, AAAI, CVPR, ACL, EMNLP, peers |
| `top_cs_conferences` | Top CS conferences |
| `nature_science` | Nature, Science family journals |

## Rate Limits

100,000 req/day, 10 req/s. Set `OPENALEX_EMAIL` for polite pool reliability. `OPENALEX_API_KEY` is in `.mcp.json` for future compatibility but OpenAlex does not currently offer general API keys.

## Known Quirks and Cautions

1. **Boolean query operators (UNVERIFIED):** AND/OR/NOT claimed to be supported in `search_works` — not confirmed in current MCP version. Avoid excessive operator nesting. Verify during initial implementation.

2. **`get_trending_topics` CAUTION:** In v0.8.1, this tool was blocked by `openalex-validation.sh` due to known failures. The hook is NOT ported to v0.1.0. Test this tool manually before relying on it. If it fails, use `analyze_topic_trends` with a broad query as fallback.

3. **`get_random_works` — do NOT use in research pipelines.** Returns random papers unrelated to the query. Only useful for sampling/testing purposes.

4. **Over-complex queries:** OpenAlex is sensitive to query over-complexity. Keep queries focused. If results are empty or wrong, simplify before adding operators.

## No Hooks in v0.1.0

The old `openalex-validation.sh` hook (which blocked broken tools, limited `per_page`, blocked `sort=relevance_score`) is NOT ported. Hook porting is deferred to v0.9.0+ with updated namespaces.

## Domain Fit

**Strong across all disciplines.** Unique strengths: social sciences, humanities, economics, medicine/biology, and interdisciplinary work. For CS/AI/ML, use alongside Semantic Scholar. Unique advantages: institution analysis, geography analysis, full OA tracking.

## Error Patterns

- Empty results: Simplify query or remove field constraints
- 429 Rate limit: Add delay, check `OPENALEX_EMAIL` is set
- Invalid work ID: Use OpenAlex format `W2741809809` or DOI format

## Cross-Reference

- **Semantic Scholar** (`jadlis-research:semantic-scholar`): use in parallel for broad CS/AI queries; S2 adds ML recommendations
- **Crossref** (`jadlis-research:crossref`): use for citation formatting after OpenAlex finds papers
- **Unpaywall** (`jadlis-research:unpaywall`): use after `find_open_access_version` when full text is needed
