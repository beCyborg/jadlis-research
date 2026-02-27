# jadlis-research v0.1.0

Deep research plugin for Claude Code.
GitHub: https://github.com/beCyborg/jadlis-research

## Pipeline Architecture

```
User → /research → Query Understanding → Source Routing
                                              ↓
                    ┌─────────────┬───────────┼───────────┬──────────────┐
                    ↓             ↓           ↓           ↓              ↓
              Academic      Community     Expert    Native-Web    (parallel)
              Worker        Worker        Worker     Worker
                    ↓             ↓           ↓           ↓
                    └─────────────┴───────────┼───────────┴──────────────┘
                                              ↓
                                    Verification Worker
                                              ↓
                                      Research Synthesis
                                              ↓
                                      Markdown Report (RU)
```

### Stage Descriptions

- **Query Understanding**: MECE decomposition of the query, query expansion (3-5 reformulations per search dimension)
- **Source Routing**: Determines which research tracks to activate based on query characteristics
- **Academic Worker**: Searches Semantic Scholar, OpenAlex, PubMed, arXiv for scientific literature
- **Community Worker**: Searches Reddit and Hacker News for community insights and discussions
- **Expert Worker**: Uses Exa semantic search for expert-level content, blogs, and opinion pieces
- **Native-Web Worker**: Uses Firecrawl for web scraping when direct page content is needed
- **Verification Worker**: Cross-validates facts across sources, checks citations, ensures triangulation (minimum 2-3 independent sources per claim)
- **Research Synthesis**: Produces structured Markdown report: TLDR → main conclusions → detailed findings → sources with citations

## MCP Servers (Planned)

| Server | Purpose | Env Var | Split |
|--------|---------|---------|-------|
| exa | Semantic web search | `${EXA_API_KEY}` | 02 |
| firecrawl | Web scraping | `${FIRECRAWL_API_KEY}` | 02 |
| pubmed-search | Medical/biomedical literature | `${NCBI_API_KEY}` | 03 |
| semantic-scholar | Academic papers | — | 03 |
| arxiv | Preprints | — | 03 |
| openalex | Open academic data | — | 03 |
| reddit | Community discussions | — (HTTP) | 04 |

`.mcp.json` is gitignored. Copy `.mcp.json.example` to `.mcp.json` and configure servers.

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

## Known CC Limitations

| Limitation | Description | Impact |
|-----------|-------------|--------|
| Streaming errors | Race condition with 6+ parallel workers | Max 5-6 workers per session |
| Streaming stalls | Up to 149s TTFT during synthesis | Known regression, synthesis bottleneck |
| MCP stderr = [ERROR] | CC logs ALL stderr from MCP servers as [ERROR], even INFO | Visual noise in logs, not a real error |
| ToolSearch bypass | ToolSearch bypasses `disallowedTools` enforcement | Security-relevant gap, must monitor |
| SubagentStop empty query | Internal `prompt_suggestion` agent triggers SubagentStop with empty `agent_type` | Guard in stop hook required |
| enabledPlatforms TypeError | CC startup bug | No functional impact |
