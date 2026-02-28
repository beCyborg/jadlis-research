# OpenAlex MCP — Parameter Reference

## MCP Server

**Package:** `oksure/openalex-research-mcp`
**Install:** `npx openalex-research-mcp`
**Coverage:** 240+ million scholarly works.

## MCP Namespace

```
Plugin namespace:  mcp__plugin_jadlis-research_openalex__<tool_name>
Alternative:       mcp__openalex__<tool_name>
```

> **Note:** To verify the active namespace, check the MCP server name at session start. The plugin namespace is the empirically observed format for plugin-registered servers.

## Rate Limits

100,000 req/day, 10 req/s. Set `OPENALEX_EMAIL` for polite pool reliability.

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENALEX_EMAIL` | Recommended | Polite pool access, improves reliability |
| `OPENALEX_API_KEY` | Optional | Premium (not currently offered publicly) |

## Tool Count Summary

| Category | Count | Tools |
|----------|-------|-------|
| Literature Search | 5 | `search_works`, `get_work`, `get_related_works`, `search_by_topic`, `autocomplete` |
| Citation Analysis | 5 | `get_citation_network`, `get_top_cited_works`, `find_seminal_papers`, `find_review_articles`, `batch_resolve_references` |
| Venue and Quality | 3 | `search_in_journal_list`, `check_venue_quality`, `get_source_info` |
| Author and Network | 4 | `search_authors_by_expertise`, `get_author_profile`, `get_author_collaborators`, `get_institution_works` |
| Trends and Analytics | 5 | `analyze_topic_trends`, `compare_research_areas`, `get_trending_topics`, `analyze_geographic_distribution`, `get_concept_hierarchy` |
| Open Access and Utilities | 4 | `find_open_access_version`, `get_work_abstract`, `resolve_doi`, `get_random_works` |
| Advanced and Meta | 5 | `search_concepts`, `get_concept`, `search_institutions`, `get_institution`, `get_works_by_concept` |
| **Total** | **31** | |

> **Note:** Verify tool names against the actual installed server at first run. Update this reference and `SKILL.md` `allowed-tools` if names differ.

---

## Filter String Syntax

OpenAlex filter strings use `key:value` pairs joined with commas (AND logic):

```
publication_year:2020-2024,type:article,open_access.is_oa:true
```

Common filter keys:

| Key | Values | Example |
|-----|--------|---------|
| `publication_year` | year or range | `2020-2024` or `2023` |
| `type` | work type | `article`, `book-chapter`, `proceedings-article`, `review`, `preprint` |
| `open_access.is_oa` | boolean | `true`, `false` |
| `language` | ISO code | `en`, `zh`, `de` |
| `concepts.id` | concept ID | `C41008148` |
| `institutions.country_code` | ISO 3166 | `US`, `GB`, `CN` |
| `cited_by_count` | integer or range | `>100` |

**Note:** Boolean operators (AND/OR/NOT) within `query` are claimed supported but unconfirmed. Filter strings use comma-AND only. Avoid complex query nesting until verified.

---

## Category 1: Literature Search

### `search_works`

Primary full-text search across 240M+ works.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | Search query. Boolean AND/OR/NOT claimed supported — verify in practice |
| `filter` | string | optional | OpenAlex filter string (e.g., `publication_year:2020-2024`) |
| `sort` | string | `cited_by_count:desc` | Options: `cited_by_count:desc`, `publication_date:desc`, `relevance_score:desc` |
| `per_page` | integer | 10 | Results per page (max 200) |
| `page` | integer | 1 | Page number |
| `select` | string | optional | Comma-separated fields to return |

Example:
```json
{ "query": "transformer attention mechanisms", "filter": "publication_year:2020-2024,type:article", "sort": "cited_by_count:desc", "per_page": 20 }
```

### `get_work`

Retrieve specific work by identifier.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `identifier` | string | required | OpenAlex ID (`W2741809807`), DOI, or URL |

### `get_related_works`

Find conceptually similar works.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `work_id` | string | required | OpenAlex work ID |
| `per_page` | integer | 10 | Number of related works |

### `search_by_topic`

Search by OpenAlex topic classification.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `topic` | string | required | Topic name or ID |
| `per_page` | integer | 10 | Results count |
| `sort` | string | `cited_by_count:desc` | Sort order |

### `autocomplete`

Entity autocomplete.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | Partial query string |
| `entity_type` | string | `works` | Options: `works`, `authors`, `institutions`, `concepts`, `topics`, `sources` |

---

## Category 2: Citation Analysis

### `get_citation_network`

Citation network around a work.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `work_id` | string | required | OpenAlex work ID |
| `direction` | string | `both` | `citing`, `cited`, `both` |
| `depth` | integer | 1 | Network traversal depth |
| `per_page` | integer | 20 | Results per level |

### `get_top_cited_works`

Most-cited works for a query.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | optional | Search query |
| `filter` | string | optional | OpenAlex filter string |
| `n` | integer | 10 | Number of top works |

### `find_seminal_papers`

Foundational papers with citation + age weighting.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | Research area or topic |
| `n` | integer | 10 | Number of seminal papers |
| `min_year` | integer | optional | Earliest publication year |
| `max_year` | integer | optional | Latest publication year |

### `find_review_articles`

Systematic reviews and meta-analyses.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | Research area |
| `n` | integer | 10 | Number of review articles |

### `batch_resolve_references`

Resolve list of references to Work objects.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `references` | list[string] | required | List of DOIs, titles, or OpenAlex IDs. Max ~50 |

---

## Category 3: Venue and Quality

### `search_in_journal_list`

Credibility-gated search restricted to high-quality venue presets. **Key differentiator vs. v0.8.1** — not available in the old plugin.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | Search query |
| `journal_list` | string | required | Preset list name (see table below) |
| `per_page` | integer | 10 | Results count |
| `sort` | string | `cited_by_count:desc` | Sort order |

**Journal preset names:**

| Preset | Description |
|--------|-------------|
| `utd24` | UT Dallas Top 24 business journals |
| `ft50` | Financial Times Top 50 management journals |
| `abs4star` | ABS 4* journals (Chartered ABS) |
| `abs4` | ABS 4 + 4* journals |
| `abs3` | ABS 3-star journals |
| `ms_misq_ops` | MIS Quarterly, Management Science, Operations Research |
| `top_ai_conferences` | NeurIPS, ICML, ICLR, AAAI, CVPR, ACL, EMNLP, peers |
| `top_cs_conferences` | Broad top-tier CS conferences |
| `nature_science` | Nature, Science and family journals |

### `check_venue_quality`

Quality metrics for a journal or conference.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `venue_name` | string | required | Journal or conference name |

Returns: impact factor, h-index, citation metrics, preset membership.

### `get_source_info`

Full venue metadata by OpenAlex source ID.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `identifier` | string | required | OpenAlex source ID (`S12345`) or name |

---

## Category 4: Author and Network

### `search_authors_by_expertise`

Authors who publish in a domain.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `expertise` | string | required | Research domain |
| `institution` | string | optional | Filter to institution |
| `per_page` | integer | 10 | Results count |

### `get_author_profile`

Full author profile.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `identifier` | string | required | OpenAlex author ID (`A12345`) or ORCID |

Returns: name, h-index, cited_by_count, top works, institution affiliations, concept areas.

### `get_author_collaborators`

Co-author network.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `author_id` | string | required | OpenAlex author ID |
| `per_page` | integer | 10 | Number of collaborators |

### `get_institution_works`

Works affiliated with an institution.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `institution` | string | required | Institution name or OpenAlex ID (`I12345`) |
| `query` | string | optional | Topic filter |
| `per_page` | integer | 10 | Results count |

**Institution group presets** (available in filter fields where supported):

| Preset | Coverage |
|--------|---------|
| `harvard_stanford_mit` | Harvard, Stanford, MIT |
| `ivy_league` | All 8 Ivy League universities |
| `top_us` | Top 20 US research universities |
| `top_uk` | Top 10 UK research universities |
| `top_global` | Top 50 global research universities |

> Verify institution group preset support per tool — availability varies.

---

## Category 5: Trends and Analytics

### `analyze_topic_trends`

Publication volume and citation trends over time.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | Research topic |
| `start_year` | integer | optional | Trend window start |
| `end_year` | integer | optional | Trend window end |
| `metric` | string | `publication_count` | Options: `publication_count`, `citation_count`, `open_access_rate` |

### `compare_research_areas`

Compare 2+ research areas on metrics.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `areas` | list[string] | required | Area query strings (min 2, max ~5) |
| `start_year` | integer | optional | Start year |
| `end_year` | integer | optional | End year |

### `get_trending_topics`

Currently trending research topics by publication velocity.

⚠️ **CAUTION:** This tool was blocked in v0.8.1 by `openalex-validation.sh` due to known failures. The hook is NOT ported to v0.1.0. Test before relying on it. **Fallback:** use `analyze_topic_trends` with a broad query.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `domain` | string | optional | Research domain to limit scope |
| `n` | integer | 10 | Number of trending topics |

### `analyze_geographic_distribution`

Research output by country/region.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | Research topic |
| `start_year` | integer | optional | Start year |
| `end_year` | integer | optional | End year |

### `get_concept_hierarchy`

OpenAlex concept tree for a topic.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `concept` | string | required | Concept name or ID (`C12345`) |
| `depth` | integer | 1 | Hierarchy depth |

---

## Category 6: Open Access and Utilities

### `find_open_access_version`

Find freely accessible version of a paper.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `work_id` | string | required | OpenAlex work ID or DOI |

Returns: OA status, URL to OA version, license, OA type (gold/green/bronze/hybrid).

### `get_work_abstract`

Get abstract for a specific work.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `work_id` | string | required | OpenAlex work ID or DOI |

### `resolve_doi`

Resolve DOI to OpenAlex Work object.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `doi` | string | required | DOI string (e.g., `10.1038/s41586-021-03549-5`) |

### `get_random_works`

Random works for sampling or testing.

> **⚠️ WARNING: Do NOT use in research pipelines.** Returns papers unrelated to any query. Only suitable for sampling/testing purposes.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `filter` | string | optional | OpenAlex filter to constrain sample |
| `n` | integer | 5 | Number of random works |

---

## Category 7: Advanced and Meta

### `search_concepts`

Search OpenAlex concept classification system.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | Concept search term |
| `per_page` | integer | 10 | Results count |

### `get_concept`

Full concept details by ID.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `concept_id` | string | required | OpenAlex concept ID (`C12345`) |

Returns: name, description, hierarchy level, related/parent/child concepts, works count.

### `search_institutions`

Search academic institutions.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | Institution name or location |
| `per_page` | integer | 10 | Results count |

### `get_institution`

Full institution details by OpenAlex ID or ROR ID.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `identifier` | string | required | OpenAlex institution ID (`I12345`) or ROR ID |

Returns: name, country, type, h-index, works_count, concept areas.

### `get_works_by_concept`

Works tagged with a specific concept.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `concept_id` | string | required | OpenAlex concept ID |
| `sort` | string | `cited_by_count:desc` | Sort order |
| `per_page` | integer | 10 | Results count |
| `filter` | string | optional | Additional filter |
