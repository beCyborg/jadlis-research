# jadlis-research v0.2.0

Deep research plugin for Claude Code.
GitHub: https://github.com/beCyborg/jadlis-research

## Pipeline Architecture

```
User Query ($ARGUMENTS)
    ↓
[pre-research (Exa)]         →  inline context (not saved)
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

- **Pre-research (Stage 1)** (`pre-research`): 1-2 quick Exa searches (`web_search_exa`) for surface-level context about the query topic. Executed before query-understanding to give the skill richer context for decomposition. Results are NOT saved to scratchpad — passed inline to query-understanding. Queries are simple and broad (topic + 2-3 keywords, `numResults: 5` max).
- **Query Understanding**: MECE decomposition of the query, query expansion (3-5 reformulations per search dimension)
- **Source Routing**: Determines which research tracks to activate based on query characteristics
- **Academic Worker**: Searches Semantic Scholar, OpenAlex, PubMed, arXiv for scientific literature
- **Community Worker**: Searches Reddit and Hacker News for community insights and discussions
- **Expert Worker**: Searches expert blogs, technical reports, whitepapers, and deep-dive content. Tools: Exa `web_search_exa` (with or without `category: "research paper"`), Firecrawl `firecrawl_scrape` for content extraction. Spawned when source-routing assigns the expert track. Scratchpad output: `expert-track.md`. NOT for Reddit, HN, Twitter, newsletters (community-worker territory). Strategy: depth over breadth — fewer sources, more extraction; recognizes expert authors, avoids SEO content. `memory: user` — learns across sessions.
- **Native-Web Worker**: General web search for documentation, news, official sources, mainstream content; cross-validates findings from other workers. Tools: Exa `web_search_exa` (no category filters — broadest search), Firecrawl for key source extraction. Spawned **ALWAYS** — runs on every research query regardless of routing decision. Scratchpad output: `native-web-track.md`. NOT for Reddit/Twitter/academic databases. Strategy: breadth over depth; always includes a search for contradicting viewpoints; prioritizes Tier 1 sources (official docs, government, established media). `memory: user` — learns across sessions.
- **Verification Worker**: Quality gate — reads all track scratchpads, cross-verifies findings, identifies contradictions, unverified claims, and coverage gaps. Tools: Exa and Firecrawl for targeted verification only (not bulk search). Spawned when `verification_required: true` in `routing-decision.md`. Stateless: NO `memory:` — findings are session-specific. `maxTurns: 30`. Output format (strict): Verified Claims, Contradictions, Unverified Claims, Gaps, Overall Assessment (passed/partial/failed). Scratchpad output: `verification-report.md`.
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

### Scratchpad File Mapping

| Worker / Skill | Filename | Written by |
|----------------|----------|------------|
| query-understanding skill | `query-analysis.md` | Pipeline skill |
| source-routing skill | `routing-decision.md` | Pipeline skill |
| academic-worker | `academic-track.md` | Agent |
| community-worker | `community-track.md` | Agent |
| expert-worker | `expert-track.md` | Agent |
| native-web-worker | `native-web-track.md` | Agent |
| social-media-worker | `social-media-track.md` | Agent |
| verification-worker | `verification-report.md` | Agent |
| research-synthesis skill | `report.md` | Pipeline skill |

All paths are relative to: `${CLAUDE_PROJECT_DIR}/.scratchpads/${CLAUDE_SESSION_ID}/`

The orchestrator (Stage 7.5) copies `report.md` to the user-facing location:
`{CWD}/research/{topic-summary}-{DD-MM-YYYY}.md`

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

### Retry Policy (Worker Failures)

When a worker Task fails (MCP error, timeout, other):

1. Retry immediately up to **3 times** — no sleep delay (delays waste orchestrator turns)
2. After 3 failures, present AskUserQuestion:
   - "Continue with partial results" -> proceed to synthesis noting the gap
   - "Retry failed worker" -> one more attempt before continuing with partial results
3. Retry state is tracked per worker to prevent infinite loops
4. If ALL workers fail -> surface error, do NOT proceed to synthesis (never report with zero findings)

### Abort Escape Hatch

To abandon a research run mid-pipeline without completing synthesis:

1. Create the file: `${CLAUDE_PROJECT_DIR}/.scratchpads/${CLAUDE_SESSION_ID}/.abort`
2. The `stop-pipeline-check.sh` hook detects this file and allows Claude to stop cleanly
3. Without this file, the Stop hook will block stopping if track files exist but report.md is missing

The orchestrator (`skills/deep-research/SKILL.md`) creates `.abort` automatically when the user selects "Cancel" via AskUserQuestion during the pipeline.

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

| Worker | Track | Integrated into pipeline | Sprint |
|--------|-------|--------------------------|--------|
| academic-worker | academic | Yes | 03 |
| community-worker | community | Yes | 04 |
| social-media-worker | local | **Sprint 07 (partial)** — spawned by orchestrator override; source-routing not yet updated | 05 (integration: 07) |
| expert-worker | expert | **Sprint 07** — spawned by orchestrator override; source-routing not yet updated | 07 |
| native-web-worker | native-web | **Sprint 07** — always spawned regardless of routing | 07 |
| verification-worker | — | **Sprint 07** — spawned when `verification_required: true` in routing-decision.md | 07 |

Note: source-routing skill currently marks expert, native-web, and local tracks as "not-implemented". The sprint 07 orchestrator (`skills/deep-research/SKILL.md`) compensates by injecting overrides at Stage 5.5 — spawning these workers regardless of routing status and passing all scratchpad files explicitly to synthesis.

## Known CC Limitations

| Limitation | Description | Impact |
|-----------|-------------|--------|
| Streaming errors | Race condition with 6+ parallel workers | Max 5-6 workers per session |
| Streaming stalls | Up to 149s TTFT during synthesis | Known regression, synthesis bottleneck |
| MCP stderr = [ERROR] | CC logs ALL stderr from MCP servers as [ERROR], even INFO | Visual noise in logs, not a real error |
| ToolSearch bypass | ToolSearch bypasses `disallowedTools` enforcement | Security-relevant gap, must monitor |
| SubagentStop empty query | Internal `prompt_suggestion` agent triggers SubagentStop with empty `agent_type` | Guard in stop hook required |
| enabledPlatforms TypeError | CC startup bug | No functional impact |

## Hooks (sprint 07)

All hooks are defined in `hooks/hooks.json`. Sprint 07 replaces the minimal sprint 06 hooks with a complete set.

| # | Event | Matcher | Script | Purpose |
|---|-------|---------|--------|---------|
| 1 | SessionStart | `startup` | `session-init.sh` | API key checks, Reddit health probe, scratchpad cleanup (7d), Firecrawl credit cross-session check |
| 2 | SessionStart | `compact` | `post-compact-state.sh` | Re-inject scratchpad state lost during compaction |
| 3 | PreToolUse | `WebSearch\|WebFetch` | `websearch-gate.sh` | Block native web tools; allow as emergency fallback if Exa fails >= 3 times |
| 4 | PreToolUse | `mcp__..._firecrawl__(scrape\|map\|crawl\|extract\|check_crawl_status)` | `firecrawl-circuit-breaker.sh` | Block if credits exhausted; block blocked domains (LinkedIn, Facebook, Instagram, Twitter/X, TikTok) |
| 5 | PreToolUse | `Agent` | `task-background-check.sh` | Block background Task calls — MCP tools are unavailable in background agents |
| 6 | PreToolUse | `mcp__..._firecrawl__firecrawl_search` | `firecrawl-search-block.sh` | Hard block — use Exa for search, not Firecrawl search |
| 7 | PreToolUse | `mcp__..._exa__.*` | `exa-validation.sh` | Block `numResults > 25`, invalid categories (e.g., "github"), deprecated params |
| 8 | PreToolUse | `mcp__..._openalex__.*` | `openalex-validation.sh` | Block `per_page > 200`, invalid sort params |
| 9 | PreToolUse | `mcp__..._arxiv__.*` | `arxiv-throttle.sh` | Enforce ArXiv rate limits: 5s minimum, 15s after 429 errors. Deny-then-suggest, no sleep |
| 10 | PostToolUse | `Write` to `.scratchpads/` | `scratchpad-size-guard.sh` | Warn when scratchpad file exceeds 80 lines (advisory, non-blocking) |
| 11 | SubagentStop | `(jadlis-research:)?...-worker` | `subagent-stop-check.sh` | Verify worker wrote its scratchpad; collect metrics; guards for empty agent_type and stop_hook_active |
| 12 | PostToolUseFailure | `mcp__.*` | `mcp-error-recovery.sh` | Circuit breaker: Firecrawl credits->cache, Exa billing->counter, ArXiv 429->cooldown, Reddit->skip |
| 13 | PostToolUseFailure | `Read` | `read-error-recovery.sh` | On MaxFileReadToken error, suggest chunked reading with offset/limit |
| 14 | Stop | (none) | `stop-pipeline-check.sh` | Block stop if track files exist but report.md is missing; `.abort` file as escape hatch |
