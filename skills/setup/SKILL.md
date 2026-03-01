---
name: setup
description: Interactive setup wizard for jadlis-research. Configures API keys, validates MCP servers, and runs health checks. Run after installation or to reconfigure.
disable-model-invocation: true
user-invocable: true
---

# jadlis-research Setup Wizard

You are the setup wizard for the **jadlis-research** plugin. Guide the user through configuring API keys, validating MCP server connections, and running health checks.

**Security rules — enforce throughout ALL phases:**
1. **Never echo a full API key** — always confirm as `"Received key (length N)"` only
2. **Single-quote escaping** — when writing to `~/.jadlis-research/env`, wrap values in single quotes. Escape any literal single quote in the value as `'\''`
3. **No key values in diagnostic output** — never print key values
4. **Managed block pattern** — always use markers `# >>> jadlis-research managed env >>>` / `# <<< jadlis-research managed env <<<`

---

## Phase 1 — Detect Current State

Check each environment variable by running:

```bash
env | grep -E '^(EXA_API_KEY|FIRECRAWL_API_KEY|SEMANTIC_SCHOLAR_API_KEY|PUBMED_API_KEY|OPENALEX_API_KEY|TWITTER_BEARER_TOKEN|GOOGLE_MAPS_API_KEY|SERPAPI_KEY|CROSSREF_MAILTO|DOWNLOAD_BASE_URL)=' || true
```

Also read `~/.jadlis-research/env` if it exists (use Read tool) to see what has been persisted.

Build an internal status map: `{service → configured | missing}`. A variable counts as configured **only if non-empty**.

Display a brief status summary:

```
Current configuration:
  Exa:              configured / missing
  Firecrawl:        configured / missing
  Semantic Scholar: configured / missing
  ...
```

---

## Phase 2 — Core Keys (Required)

Core keys are **EXA_API_KEY** and **FIRECRAWL_API_KEY**. These power the research pipeline.

| Key | Service | Registration URL | Free tier |
|-----|---------|-----------------|-----------|
| `EXA_API_KEY` | Exa | https://dashboard.exa.ai/ | 1,000 searches/month |
| `FIRECRAWL_API_KEY` | Firecrawl | https://www.firecrawl.dev/ | 500 credits/month |

For each **missing** core key:

1. Show the user: service name, description, registration URL, free tier info from the table above
2. Use `AskUserQuestion`:
   - Question: `"Paste your {ServiceName} API key (or choose Skip)"`
   - Options: `"Skip for now"` (description: "You can add this key later by re-running /jadlis-research:setup")
3. If the user selects "Skip for now" → mark as SKIPPED, continue
4. If the user provides a value (via "Other"):
   - **Validate**: non-empty, length >= 8, no surrounding whitespace (trim if needed)
   - **Confirm**: `"Received key (length {N})"` — never echo the full key
   - **Write to env file**: use Bash to source `scripts/env-management.sh` and call `write_env_var`:
     ```bash
     source "${CLAUDE_PLUGIN_ROOT}/scripts/env-management.sh"
     write_env_var {KEY_NAME} '{escaped_value}'
     ```
   - **Write to session**: for immediate availability (use single-quote escaping like env file):
     ```bash
     if [[ -n "${CLAUDE_ENV_FILE:-}" ]]; then
       echo "export {KEY_NAME}='{escaped_value}'" >> "$CLAUDE_ENV_FILE"
     fi
     ```

If a core key is already configured (detected in Phase 1), **skip the prompt** and note: `"{ServiceName}: already configured"`.

---

## Phase 3 — Recommended Keys (User Choice)

Use `AskUserQuestion` with `multiSelect: true`:

- Question: `"Which recommended academic sources do you want to configure?"`
- Options (skip any already configured):

| Option | Key | Registration URL | Notes |
|--------|-----|-----------------|-------|
| Semantic Scholar | `SEMANTIC_SCHOLAR_API_KEY` | https://www.semanticscholar.org/product/api | Free, higher rate limits with key |
| PubMed | `PUBMED_API_KEY` | https://www.ncbi.nlm.nih.gov/account/ | Free, 10 req/s with key |
| OpenAlex | `OPENALEX_API_KEY` | https://openalex.org/ | Free, polite pool with email |

For each selected: same validate → confirm → write flow as Phase 2.
For each already configured: skip and note.

If all recommended keys are already configured, skip this phase entirely and note it.

---

## Phase 4 — Optional Keys (User Choice)

Use `AskUserQuestion` with `multiSelect: true`:

- Question: `"Which optional sources do you want to configure?"`
- Options (skip any already configured):

| Option | Key | Registration URL | Notes |
|--------|-----|-----------------|-------|
| Twitter | `TWITTER_BEARER_TOKEN` | https://developer.twitter.com/ | Free Basic tier |
| Google Maps | `GOOGLE_MAPS_API_KEY` | https://console.cloud.google.com/ | $200/month free credit |
| CrossRef | `CROSSREF_MAILTO` | https://www.crossref.org/ | Free, just provide your email |
| Paper Download | `DOWNLOAD_BASE_URL` | — | Custom base URL for institutional access |

Same validate → confirm → write flow per selected key.

**Note:** SerpAPI is not included — the serpapi-mcp package is not available as npm/PyPI.

---

## Phase 5 — Free Sources Info

No configuration needed. Display:

```
Free sources (no API key required):
  - arXiv — works automatically
  - Hacker News — works automatically
  - Substack — works automatically
  - Reddit — basic access works automatically
    For higher rate limits: set REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET
    Register at: https://www.reddit.com/prefs/apps
  - Xpoz / Instagram — requires one-time OAuth browser authentication on first use
```

---

## Phase 6 — Health Check

For each service that is configured (detected in Phase 1 or just added in Phases 2-4), run a health check probe. Skip services marked as MISSING or SKIPPED.

**Timeout: 10 seconds per service.**

### Probe table

| Service | ToolSearch query | Probe call | Success criteria |
|---------|-----------------|------------|-----------------|
| Exa | `+exa web_search` | `web_search_exa("test", numResults=1)` | Non-empty results |
| Firecrawl | `+firecrawl scrape` | `firecrawl_scrape("https://example.com")` | HTTP 200 content |
| Semantic Scholar | `+semantic search_papers` | `search_papers("test", limit=1)` | Non-empty results |
| OpenAlex | `+openalex` | First available tool, minimal query | Non-empty response |
| PubMed | `+pubmed` | `search("test", maxResults=1)` | Non-empty results |
| arXiv | `+arxiv` | `search_papers("test", max_results=1)` | Non-empty results |

### Procedure per service

1. Run `ToolSearch` with the query from the table. If no tools found → report `SERVER NOT RUNNING`, skip probe.
2. Call the probe. Interpret results:
   - Success → `OK`
   - 401 or 403 response → `FAIL (auth error — invalid API key)`
   - Connection refused / unreachable → `FAIL (network error)`
   - Timeout > 10s → `FAIL (timeout)`
   - ToolSearch returns no results → `SERVER NOT RUNNING`
3. **After the first FAIL**: use `AskUserQuestion`:
   - Question: `"A service health check failed. Skip remaining checks?"`
   - Options: `"Yes, skip remaining"` / `"No, continue checking"`

---

## Phase 7 — Finalize

### 7a. Source line in ~/.zshrc

Read `~/.zshrc` (use Read tool). Check if `source ~/.jadlis-research/env` already exists.

- If present: do nothing
- If not present: append using Bash:
  ```bash
  printf '\n# jadlis-research: load API keys\nsource ~/.jadlis-research/env\n' >> ~/.zshrc
  ```
- If `~/.zshrc` does not exist: create it first, then append
- If `~/.zshrc` is read-only: show error `"Unable to write to ~/.zshrc. Manually add: source ~/.jadlis-research/env"`

### 7b. Permissions

```bash
chmod 700 ~/.jadlis-research
[ -f ~/.jadlis-research/env ] && chmod 600 ~/.jadlis-research/env
```

### 7c. Marker file

```bash
echo "0.9.0" > ~/.jadlis-research/.install-version
```

If `~/.jadlis-research/env` does not exist (user skipped all keys), still create the directory and marker file with correct permissions. Skip `chmod 600` for env file if it doesn't exist.

---

## Phase 8 — Summary Table

Display:

```markdown
## Setup Complete

| Service          | Status     | Health Check          |
|------------------|------------|-----------------------|
| Exa              | Configured | OK                    |
| Firecrawl        | Missing    | —                     |
| Semantic Scholar | Configured | OK                    |
| PubMed           | Skipped    | —                     |
| OpenAlex         | Skipped    | —                     |
| arXiv            | Free       | OK (no key needed)    |
| Hacker News      | Free       | — (no MCP probe)      |
| Substack         | Free       | — (no MCP probe)      |
| Reddit           | Free       | — (basic access)      |
```

### Next steps

- If keys were added: `"Restart Claude Code (or run 'source ~/.zshrc') for shell changes to take effect in new terminals."`
- Suggest: `"Try '/jadlis-research:research What is the latest in quantum computing?' to test your configuration."`
- If core keys are still missing: `"Note: Exa and Firecrawl are required for the full research pipeline. Re-run /jadlis-research:setup to add them."`

---

## Edge Cases

| Situation | Behavior |
|-----------|----------|
| `~/.jadlis-research/` does not exist | Create with `mkdir -p ~/.jadlis-research && chmod 700 ~/.jadlis-research` |
| `~/.zshrc` does not exist | Create file, then add source line |
| `~/.zshrc` is read-only | Show error: "Unable to write to ~/.zshrc. Manually add: `source ~/.jadlis-research/env`" |
| Env var is set but empty string | Treat as missing (not configured) |
| API key contains shell special characters | Single-quote escaping handles `$`, backticks; `'\''` pattern handles embedded quotes |
| User skips all keys | Proceed to Phase 7; create directory and marker file; show graceful summary |
| Health check: MCP server times out | Report FAIL (timeout), offer to skip remaining |
| Re-run setup: key already in managed block | Replace (not append) the line for that key |
| `$CLAUDE_ENV_FILE` not set | Warn and skip write-to-session step; env file write still proceeds |
