# Web (Codex/GPT-6.1 Sol) — search protocol for the agent

## Tool: Codex CLI (via Bash)

Web search via **Codex CLI** (`codex exec`) with web search enabled. Billing — ChatGPT subscription → marginal cost ≈ $0. The model, the reasoning effort and the tier are pinned directly in the commands: `gpt-6.1-sol`, effort `high`, `service_tier="priority"` (Fast) for the two channel calls AND for the escalation — the channel does not depend on the global default in `~/.codex/config.toml`. When the model generation changes, update the pin here (all commands below, escalation included), the `CODEX_MODEL` constant and the source signature in `{PLUGIN_ROOT}/workflows/full-research-core.js`, the availability probe in `{PLUGIN_ROOT}/skills/research-settings/scripts/research-sources.py` and the channel line in `README.md`.

> [!note] Model and tier — decision 2026-10-12 (owner): `gpt-6.1-sol`, effort `high`, `service_tier="priority"` everywhere
> - **Model.** GPT-6.1 Sol replaces GPT-6 Astra for the channel and for the third verification voice. Mini A/B 2026-10-12 (both arms priority, effort high, isolated home): q1 — Sol 198 s / 44 searches / 18 sources vs Astra 155 s / 42 / 15; q7 — Sol 251 s / 44 / 15 vs Astra 169 s / 38 / 16. Sol is 28–49 % slower, runs slightly more searches, finds as many sources. Effort stays `high` (the owner rejected `medium` on 2026-10-12): search depth is the whole point of the channel. Ultrafast is not supported for 6.1 Sol. **Rollback** — `gpt-6-astra` in every command here and in `CODEX_MODEL`, one commit.
> - **Tier.** `service_tier="priority"` ("Fast" in the Codex UI) speeds up generation, not the amount of work (A/B 2026-09-30 on Astra: median ×1.7 faster, the same number of searches and opened pages). It burns the subscription quota faster. Since 2026-10-12 the escalation runs on priority too. Rollback — `priority` → `default` in the commands.
> - History, short: 2026-08-15 `gpt-5.6-sol`; 2026-09-05 `gpt-6-astra` high on `default`; 2026-09-30 priority for the two channel calls; 2026-10-12 `gpt-6.1-sol` on priority everywhere. The name `gpt-5.6-sol-fast` does not exist (HTTP 400 on a ChatGPT account) — the tier is set only by `service_tier`.

> [!warning] Isolated Codex home — every call goes through `scripts/codex-home.sh` (since 2026-09-30)
> A bare `codex exec` inherits the user's `~/.codex`: `model_instructions_file` (replaces the Codex base prompt), the global `AGENTS.md`, memories, plugins and MCP servers. Measured 2026-09-30: a global "answer in Russian" rule turned 7 of 8 English research prompts into 63–75% Cyrillic answers — quotes got translated and could no longer be matched against the source pages. `codex-home.sh` keeps a separate `CODEX_HOME` (`~/.claude/research-homes/codex`, login symlinked from `~/.codex/auth.json`) with its own search-worker `AGENTS.md` (answer in the prompt's language, verbatim quotes, URL + date per claim, batched queries) and prints its path. `--ignore-user-config` is not enough: it still loads the global `AGENTS.md`.

Base command (Bash, `timeout: 600000` ms per call):

```bash
CODEX_HOME="$(bash {PLUGIN_ROOT}/scripts/codex-home.sh)" codex exec -m gpt-6.1-sol -s read-only --skip-git-repo-check -c model_reasoning_effort="high" -c service_tier="priority" --json '<PROMPT>' < /dev/null
```

> [!warning] `< /dev/null` is MANDATORY in every call — without it the channel hangs until timeout
> `codex exec` reads stdin (when a prompt is passed, the pipe is appended as a `<stdin>` block), and
> the Bash tool does not close stdin → Codex waits for EOF forever. Symptom: **0 bytes of stdout, exit 143
> (SIGTERM on timeout), `Reading additional input from stdin...` in stderr**. This is NOT an
> authorization problem and NOT a transient. Since the fix there are no hangs (0 of 69 channel agents,
> audit 2026-10-11). The line `Reading additional input from stdin...` is printed even with the
> redirect — with exit 0 it is harmless.

> [!note] Why the channel is slow (audit 2026-10-11, 69 agents on Astra)
> The channel agent's median is 1244 s (p90 1800 s). The cause is the depth of each call, not hangs:
> Codex runs ~34 search turns per call, so one channel call takes a median of 525 s (p90 808 s).
> Sol was 28–49 % slower than Astra in the 2026-10-12 mini A/B — expect longer calls.
> A call that outlives the 600 s Bash timeout is moved to the background ("Command did not complete
> within its 600s timeout and was moved to the background") — wait for its notification, do NOT
> relaunch it.

- The `--search` flag does NOT exist (re-checked on codex-cli 0.162.1, 2026-10-11).
- **Live web search comes from the isolated home, not from a flag:** `scripts/codex-home.sh` writes `web_search = "live"` into `$CODEX_HOME/config.toml` on every call. Do NOT add `-c 'tools.web_search={mode=…}'` — Codex 0.166 silently ignores that field (audit 2026-11, `codex debug prompt-input`: `tools.web_search={mode="bogus"}` → rc=0, no error; the top-level `web_search="bogus"` → rc=1 `unknown variant`, so only the top-level key sets the mode). Without that config line Codex falls back to `cached` (snippets from the OpenAI index cache, fabrication without an error when the network is down) — so never call `codex exec` without the `CODEX_HOME="$(bash … codex-home.sh)"` prefix. The JSONL check below proves that a search ran at all.
- `-s read-only` is mandatory: the user's global config is `danger-full-access`, which is not needed for search.
- `--json` — JSONL events in stdout (re-checked on 0.162.1). The agent's final text:
  ```bash
  ... --json | jq -rs '[.[] | select(.type == "item.completed" and .item.type == "agent_message")] | last | .item.text'
  ```
  Checking that the search was LIVE: the JSONL must contain `item.type == "web_search"` events —
  count only the completed ones, otherwise the counter doubles (each search produces a pair of
  `item.started` + `item.completed`; in the 2026-08-06 probe "26 events" = **13 real searches**):
  ```bash
  ... --json | jq -s '[.[] | select(.type == "item.completed" and .item.type == "web_search")] | length'
  ```
  ≥ 1 — the search is live. If 0 — the answer came from memory, the channel has failed (see Degradation).

## CRITICAL: live search only, not the model's memory

Every Codex prompt STRICTLY requires:
> "Use ONLY the web search tool — run real search queries. Answering from memory/learned knowledge is FORBIDDEN: every claim MUST have a source URL and a publication date. Do not write a claim without a URL at all. At the end — a Sources section with all the URLs."

This is exactly the point of the channel: to compare what a DIFFERENT search stack finds. An answer "off the top of the head" is useless and harmful.

**Depth (2026-08-15):** Codex's web_search on its own returns result snippets, not page text — "snippet hallucination" is a documented class of defects. That is why every prompt requires opening and reading the full pages of the key sources before citing them (the wording is already in the commands below). Quotes that could not possibly come from a snippet (numbers/details from deep inside the page) are a signal that the requirement worked.

## Protocol (2 calls IN ONE message — in parallel)

Query language: whenever `languages` is not ru/en only, both `codex exec` prompts must explicitly ask Codex to search in the LANGUAGES from the orchestrator prompt (e.g. "search in Japanese and English") — Codex web search returns pages in the language of the query — and in that case Read `{PLUGIN_ROOT}/skills/research/references/language-layers.md` first (native-term dictionary).

### Call 1 — Broad overview (mandatory)

```bash
CODEX_HOME="$(bash {PLUGIN_ROOT}/scripts/codex-home.sh)" codex exec -m gpt-6.1-sol -s read-only --skip-git-repo-check -c model_reasoning_effort="high" -c service_tier="priority" --json 'Research the web for: <expanded query — topic, aspects, what decision is being made>. Use ONLY the web search tool - run real searches, do NOT answer from memory. Every claim MUST have a source URL and publication date; omit claims without URLs. Prefer sources from the last 24 months (today is <DATE from the orchestrator prompt>). Open and READ THE FULL PAGE of every key source before citing it - do NOT cite from search-result snippets alone; quote specifics that only appear in the page body. Return: key findings (bulleted, each with URL), notable numbers/quotes with URLs, and a final Sources section listing all URLs.' < /dev/null
```

### Call 2 — Counter-arguments (mandatory)

```bash
CODEX_HOME="$(bash {PLUGIN_ROOT}/scripts/codex-home.sh)" codex exec -m gpt-6.1-sol -s read-only --skip-git-repo-check -c model_reasoning_effort="high" -c service_tier="priority" --json 'Search the web for criticism, problems, failures and counter-arguments about: <topic>. Use ONLY the web search tool - real searches, NOT memory; every claim needs a source URL. Who disagrees and why? Known issues, regressions, negative experience reports. Open and READ THE FULL PAGE of key sources before citing - do NOT cite from snippets alone. Return bulleted findings with URLs + Sources section.' < /dev/null
```

Launch both calls in ONE message (two Bash calls in parallel), each with a `timeout` of 600000 ms.
`< /dev/null` at the end of every command is mandatory (see the warning above), otherwise both calls
will burn out on timeout for nothing. One high-effort call takes a median of 525 s (p90 808 s, Astra,
audit 2026-10-11); a call past 600 s moves to the background — wait for its notification.

## Budget: 2 calls

Reality (telemetry v5, 72 runs, Fan-out phase): median 2 `codex exec` calls per agent — the budget
holds; 14 of 69 agents made more (retries and diagnostics after failures). The agent's median of 29
tool calls is mostly snapshot fetching (defuddle, pdf-fetch) and the file write, not Codex.

## Processing the result

1. From the answers, collect citations: URL + brief context. Prefixes: [cx1], [cx2], ...
2. Give every citation an Admiralty reliability (A-F) based on the type of the SOURCE (not Codex, but the page the URL points to).
3. Discard URLs without context and claims without URLs (a violation of the "not from memory" contract).

## Degradation

On a failure — non-zero exit, timeout, empty stdout or an answer without a single URL:
- one retry of the failed call (it may be a transient);
- if both calls failed — return **empty** citations, sourceQuality = LOW, and a note in findings: "The Codex web channel is unavailable";
- **Do NOT crash** the workflow — the remaining channels must finish.
- If an answer did arrive but the model ignored the "not from memory" ban (claims without URLs) — use only the claims that have URLs; if there are none, the channel counts as unavailable.

Diagnostics:
- **Empty stdout (0 bytes) + `Reading additional input from stdin...` in stderr + exit 143/142** —
  this is NOT authorization and NOT a rate limit, but an unclosed stdin under the Bash tool. Cured by `< /dev/null`
  at the end of the command; a retry without the redirect will hang in exactly the same way and burn a second timeout.
- `codex login status` — an expired ChatGPT authorization.
- **`ERROR codex_core::tools::router: error=timed out negotiating with the code-mode host` in stderr, exit 0** —
  the web-search tool inside Codex could not start; the answer says "Sources: None retrieved" or has no
  URLs, and the JSONL has 0 completed `web_search` events. Seen in 3 of 69 channel agents
  (2026-09-21, 2026-10-11); the same command worked again hours later (cause unconfirmed — likely a
  transient failure of the local code-mode host). Handle it as a failed call: ONE retry, then
  Degradation. Do NOT spend turns on `--disable code_mode_host`, `standalone_web_search` or sandbox
  changes — agents tried them, none helped.
- Messages in stderr about web search being disabled — the `web_search` config key has been renamed
  (check `codex exec --help` and the `config.toml` that `scripts/codex-home.sh` writes).

## Verification escalation (third voice, schema v5)

Besides serving as a channel, Codex is used by the `full-research-core` workflow as a **third, heterogeneous voice** — since schema v5 (2026-09-17) ONLY when a single `CHALLENGED/OUTDATED` vote stands against `UNCHECKED`. Every claim gets one vote from the web family and one from the community family, so `CONFIRMED` vs `CHALLENGED/OUTDATED` is by construction a web-vs-community split → `FAMILY-SPLIT` in the ledger, never escalated: a web tie-breaker would only side with the web; the analyst renders both stories with the lead family by claim type. Agreeing voices do not go to Codex either: `CONFIRMED×2` → confirmed, an agreeing exclusion → dropped, `UNCHECKED×2` → unchecked. The cap is 8 escalations per run (`args.escalationCap`); beyond the cap — exclusion on a single voice + the `escalationSkipped: 'cap'` flag.

The call (made by a lightweight subagent bridge, the `escalationPrompt` prompt in core.js):

```bash
CODEX_HOME="$(bash {PLUGIN_ROOT}/scripts/codex-home.sh)" codex exec -m gpt-6.1-sol -s read-only --skip-git-repo-check -c model_reasoning_effort="high" -c service_tier="priority" --json -o "<workDir>/_codex-esc-<claimId>-last.md" "$(cat "<workDir>/_codex-esc-<claimId>-prompt.md")" < /dev/null > "<workDir>/_codex-esc-<claimId>.jsonl"
```

- **Live-search gate:** the JSONL must contain ≥1 `web_search` event (`grep -c '"web_search'`); 0 → the voice does not count (`escalationSkipped: 'no-live-search'`) — Codex was answering from memory.
- Codex confirms the exclusion → the claim is `CHALLENGED`/`OUTDATED` (dropped). Does not confirm → `DISPUTED` (a JS aggregate, not a verifier enum): credibility ≥4, a `### Спорные факты` section in the report, not included in the conclusions.
- Degradations collapse into a single `escalationSkipped` enum: `no-binary` · `quota` · `timeout` · `invalid-output` · `no-live-search` · `budget` · `cap` → exclusion on a single voice as in schema v2 + a flag in the ledger/telemetry. There are no retries: the Codex quota is a shared pool with `/verif`, and verif has priority.
- Rules for Codex in the prompt: the absence of confirmation ≠ a refutation (that is UNCHECKED); a discrepancy in numbers that is purely a matter of notation/rounding ±2% is not a refutation; confirm an exclusion ONLY on the basis of a source that directly contradicts or supersedes the claim.

## The quota pool has a third consumer: the Responses-API replacement (since 2026-09-04)

The ChatGPT-subscription quota is one finite pool for the codexweb channel (automatic, ~2 calls per run), the Codex verifier of `/verif` (on request) and — since 2026-09-04 — every script that used to call the OpenAI Responses API. `OPENAI_API_KEY` returned 12 answers (`gpt-5.5-2026-04-23` + `web_search`, ≈31K tokens and 40 s per call) and then hit **`HTTP 429: You have no credits remaining`**; the API balance is ≈0 and `GET /v1/organization/costs` is not available to that key (no `api.usage.read` scope). Only the owner can top the balance up (platform.openai.com → Billing).

Replacement, same OpenAI web_search backend (Bing index + OAI-SearchBot), ≈30–80 s per question, `agent_message.text` = JSON matching the schema:

```bash
CODEX_HOME="$(bash {PLUGIN_ROOT}/scripts/codex-home.sh)" codex exec -m gpt-6.1-sol -s read-only --skip-git-repo-check --json --output-schema schema.json '<PROMPT>' < /dev/null
```

`web_search` events show the queries (but not the list of opened sources — only the cited ones). Priority inside the pool: `/verif` > codexweb > everything else. Before a mass run make one probe API call (the 429 arrives immediately) and one `codex exec ... 'ok' < /dev/null` probe; a usage-limit answer means the channel goes off. Any script built on the Responses API must ship with a `codex exec` fallback.
