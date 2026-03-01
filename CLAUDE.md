# jadlis-research v0.1.0

Deep research plugin for Claude Code.
GitHub: https://github.com/beCyborg/jadlis-research

## Pipeline Architecture

```
User Query ($ARGUMENTS)
    ↓
[query-understanding skill]  →  query-analysis.md (scratchpad)
    ↓
[source-routing skill]       →  routing-decision.md (scratchpad)
    ↓
    ┌─────────────┬───────────┬────────────────┬──────────────┐
    ↓             ↓           ↓                ↓              ↓
Academic      Community   Social-Media      Expert         Web
Worker        Worker      Worker (direct)   Worker*        Worker*
    ↓             ↓           ↓                ↓              ↓
    └─────────────┴───────────┴────────────────┴──────────────┘
                                 ↓
                    Verification Worker (moderate+)
                                 ↓
                  [research-synthesis skill]   →  report.md (scratchpad)
                                 ↓
                       Markdown Report (RU)
```

*Expert Worker, Web Worker — sprint 07. Social-Media Worker — direct invocation only (pipeline integration sprint 07).

### Stage Descriptions

- **Query Understanding**: MECE decomposition of the query, query expansion (3-5 reformulations per search dimension)
- **Source Routing**: Determines which research tracks to activate based on query characteristics
- **Academic Worker**: Searches Semantic Scholar, OpenAlex, PubMed, arXiv for scientific literature
- **Community Worker**: Searches Reddit and Hacker News for community insights and discussions
- **Expert Worker**: Uses Exa semantic search for expert-level content, blogs, and opinion pieces
- **Native-Web Worker**: Uses Firecrawl for web scraping when direct page content is needed
- **Verification Worker**: Cross-validates facts across sources, checks citations, ensures triangulation (minimum 2-3 independent sources per claim)
- **Research Synthesis**: Produces structured Markdown report: TLDR → main conclusions → detailed findings → sources with citations

## Pipeline Skills

Four SKILL.md files implement the core pipeline logic. These are invoked by the orchestrator (sprint 07); they read/write scratchpad files but do NOT call MCP tools directly.

| Skill | Role | DMI | Scratchpad Output |
|-------|------|-----|-------------------|
| shared-protocols | Shared conventions loaded by all workers (finding format, source tiers, fallback chains, citation format, cache directive) | No DMI | — |
| query-understanding | Query classification (type/domain/complexity), MECE sub-question decomposition, query expansion (3-5 reformulations), clarification protocol | `true` | `query-analysis.md` |
| source-routing | Routing matrix (5 tracks × 6 domains), complexity rules, worker assignment, source prioritization within tracks | `true` | `routing-decision.md` |
| research-synthesis | Aggregation of worker findings, triangulation (2-3 sources per claim), confidence calibration, Russian-language report generation | `true` | `report.md` |

### Scratchpad Path Pattern

```
${CLAUDE_PROJECT_DIR}/.scratchpads/${CLAUDE_SESSION_ID}/<filename>.md
```

`CLAUDE_PROJECT_DIR` is the **user's project directory** (not the plugin root). Users should add `.scratchpads/` to their project `.gitignore`.

## Data Sources

### Academic Worker
- Semantic Scholar, OpenAlex, PubMed, arXiv

### Community Worker
- Reddit, Hacker News, GitHub, Substack, Twitter

### Social Media Worker (sprint 05)
Accessible directly (not yet integrated into source-routing pipeline — see sprint 06/07):
- **Google Maps** — place search, geocoding, directions, place details (MCP: google-maps)
- **Google Maps Reviews** — structured reviews via SerpAPI google_maps_reviews engine (MCP: serpapi)
- **Instagram** — posts, profiles, hashtags, engagement metrics (MCP: xpoz)
- **TikTok** (deferred) — trends, content, creators (MCP: xpoz) — Xpoz TikTok tools insufficient at time of implementation

### Expert / Web Workers
- Exa (semantic search, web fallback)
- Firecrawl (page content extraction)

## MCP Servers

| Server | Purpose | Env Var | Split |
|--------|---------|---------|-------|
| exa | Semantic web search | `${EXA_API_KEY}` | 02 |
| firecrawl | Web scraping | `${FIRECRAWL_API_KEY}` | 02 |
| pubmed-search | Medical/biomedical literature | `${NCBI_API_KEY}` | 03 |
| semantic-scholar | Academic papers | — | 03 |
| arxiv | Preprints | — | 03 |
| openalex | Open academic data | — | 03 |
| reddit | Community discussions | — (HTTP) | 04 |
| hn | Hacker News stories and comments | — | 04 |
| substack | Newsletter content | — | 04 |
| twitter | Twitter/X search and tweets | `${OPENTWITTER_API_KEY}` | 04 |
| google-maps | Place search, geocoding, directions, place details | `${GOOGLE_MAPS_API_KEY}` | 05 |
| serpapi | Google Maps reviews (google_maps_reviews engine) | `${SERPAPI_KEY}` | 05 |
| xpoz | Instagram + TikTok data (OAuth 2.1, streamable-http) | OAuth (no env var) | 05 |

`.mcp.json` is gitignored. Copy `.mcp.json.example` to `.mcp.json` and configure servers.

**serpapi local server:** Clone `serpapi/serpapi-mcp` into `vendors/serpapi-mcp/` and run `uv sync`. See setup guide (section 08). Do NOT use the hosted remote endpoint (API key in URL path = security risk).

## Conventions

### Path Escaping (critical — plugin root path contains spaces)

Always use escaped quotes around paths in hook commands:
```
"\"${CLAUDE_PLUGIN_ROOT}/scripts/x.sh\""
```
Without this, bash splits the path at spaces and fails.

### API Keys

- Only via `${ENV_VAR}` references in `.mcp.json`, never hardcoded
- Export keys in `~/.zshrc` — MCP servers fail to start if env vars are missing at CC launch
- Always run `git diff .mcp.json` before committing to prevent API key leaks

### MCP Tool Namespace

Format: `mcp__plugin_jadlis-research_{server}__{tool}`

Example: `mcp__plugin_jadlis-research_exa__web_search_exa`

Hyphens in plugin name are preserved in namespace (not replaced with underscores).

### Session Isolation

Use `${CLAUDE_SESSION_ID}` for scratchpad directories: `.scratchpads/${CLAUDE_SESSION_ID}/`

### Hook Exit Codes

- `exit 0` = allow (stdout parsed for JSON)
- `exit 2` = block action (stderr fed to Claude)
- Other non-zero = error (logged, but action allowed)

Use `exit 2` for deterministic blocking, NOT JSON `decision:block`.

### Workers

- All parallel workers: `model: opus`, `permissionMode: dontAsk`
- Haiku model is forbidden for workers (insufficient reasoning for research tasks)

## Skills DMI Strategy

**FIX-010 context:** Setting `disable-model-invocation: true` on a skill prevents agents from loading that skill via their `skills:` frontmatter list. This is undocumented CC behavior.

| Skill Role | Examples | `user-invocable` | `disable-model-invocation` |
|-----------|----------|-----------------|--------------------------|
| User-facing | `/research` entry point | default (omit) | `true` |
| Agent-loaded | scientific-research, exa-search, firecrawl-extraction, community-research, shared-protocols | `false` | **DO NOT SET** |
| Pipeline-only | query-understanding, source-routing, research-synthesis | `false` | `true` |

## Forbidden Tools (for workers)

All workers must include these in `disallowedTools`:

### Core forbidden (replaced by MCP equivalents)
- `WebSearch` — replaced by Exa
- `WebFetch` — replaced by Firecrawl
- `ToolSearch` — enforcement gap: bypasses `disallowedTools`

### claude.ai Exa tools (block native tools, use plugin MCP instead)
- `mcp__claude_ai_Exa__web_search_exa`
- `mcp__claude_ai_Exa__web_search_advanced_exa`
- `mcp__claude_ai_Exa__crawling_exa`
- `mcp__claude_ai_Exa__company_research_exa`
- `mcp__claude_ai_Exa__people_search_exa`
- `mcp__claude_ai_Exa__get_code_context_exa`
- `mcp__claude_ai_Exa__find_similar_exa`
- `mcp__claude_ai_Exa__answer_exa`

### claude.ai Firecrawl tools
- `mcp__claude_ai_Firecrawl__firecrawl_scrape`
- `mcp__claude_ai_Firecrawl__firecrawl_map`
- `mcp__claude_ai_Firecrawl__firecrawl_search`
- `mcp__claude_ai_Firecrawl__firecrawl_crawl`
- `mcp__claude_ai_Firecrawl__firecrawl_check_crawl_status`
- `mcp__claude_ai_Firecrawl__firecrawl_extract`

Note: `firecrawl_search` is forbidden even among plugin Firecrawl tools — use Exa for search.

## Env Vars

Export all keys in `~/.zshrc` — MCP servers fail to start if env vars are missing at CC launch.

| Var | Source | Split |
|-----|--------|-------|
| `EXA_API_KEY` | exa.ai | 02 |
| `FIRECRAWL_API_KEY` | firecrawl.dev | 02 |
| `NCBI_API_KEY` | ncbi.nlm.nih.gov | 03 |
| `GOOGLE_MAPS_API_KEY` | Google Cloud Console → APIs & Services → Credentials | 05 |
| `SERPAPI_KEY` | serpapi.com → Account → API Key | 05 |

**Xpoz:** No env var. Uses OAuth 2.1 (Google). Token is cached after first browser auth flow.

**Google Maps API Key restrictions:** When creating the key, set restrictions to "None" or "IP addresses". HTTP referrer restrictions block MCP server requests (CLI usage).

## Source Routing Notes

| Worker | Integrated into pipeline | Sprint |
|--------|--------------------------|--------|
| academic-worker | Yes | 03 |
| community-worker | Yes | 04 |
| social-media-worker | **No — direct invocation only** | 05 (integration: 07) |

`social-media-worker` can be invoked directly but is NOT yet launched by the pipeline. Source-routing includes it as `direct-only` status. Full pipeline integration is planned for sprint 07.

## Known CC Limitations

| Limitation | Description | Impact |
|-----------|-------------|--------|
| Streaming errors | Race condition with 6+ parallel workers | Max 5-6 workers per session |
| Streaming stalls | Up to 149s TTFT during synthesis | Known regression, synthesis bottleneck |
| MCP stderr = [ERROR] | CC logs ALL stderr from MCP servers as [ERROR], even INFO | Visual noise in logs, not a real error |
| ToolSearch bypass | ToolSearch bypasses `disallowedTools` enforcement | Security-relevant gap, must monitor |
| SubagentStop empty query | Internal `prompt_suggestion` agent triggers SubagentStop with empty `agent_type` | Guard in stop hook required |
| enabledPlatforms TypeError | CC startup bug | No functional impact |

## Hooks (sprint 06)

Two enforcement hooks added in sprint 06:

| Hook | Event | Script | Behavior |
|------|-------|--------|----------|
| MCP Error Recovery | `PostToolUseFailure` | `scripts/mcp-error-recovery.sh` | Counts failures per MCP server per session. After ≥3 failures, returns prompt instructing Claude to switch to fallback chain per shared-protocols. Non-blocking (exit 0). |
| Scratchpad Size Guard | `PostToolUse` (Write to `.scratchpads/`) | `scripts/scratchpad-size-guard.sh` | Warns when a scratchpad file exceeds 80 lines. Does NOT block — budget is advisory (exit 0). |

See `hooks/hooks.json` for the full hook definitions.
