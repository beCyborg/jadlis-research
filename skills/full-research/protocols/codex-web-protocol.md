# Web (Codex/GPT-6 Astra) — search protocol for the agent

## Tool: Codex CLI (via Bash)

Web search via **Codex CLI** (`codex exec`) with web search enabled. Billing — ChatGPT subscription → marginal cost ≈ $0. The model, the reasoning effort and the tier are pinned directly in the commands: `gpt-6-astra`, effort `high`, `service_tier="default"` — the channel does not depend on the global default in `~/.codex/config.toml`. When the model generation changes, update the pin here (all commands below, escalation included), the `CODEX_MODEL` constant and the source signature in `{PLUGIN_ROOT}/workflows/full-research-core.js`, the probe in `SKILL.md` and the channel line in `README.md`.

> [!note] `service_tier="priority"` ("Fast" in the Codex UI) — do NOT use
> The name `gpt-5.6-sol-fast` does not exist in the API (HTTP 400 "not supported when using Codex with a ChatGPT account" — verified 2026-08-15). The "Fast" setting in the Codex UI = `service_tier="priority"`: officially "1.5x speed, increased usage", by the user's estimate ≈2.5× the quota burn for −15% of the time (A/B 2026-08-15: sol-high 177 s → 151 s, live searches the same — 11). Decision 2026-09-05: the priority is quota spent on evidence, not speed → an explicit `service_tier="default"` in every command (the global `~/.codex/config.toml` is on `default` too, so that a call without the flag does not inherit priority).
> **The channel model is `gpt-6-astra` as of 2026-09-05** (the user's decision; part B of Plan 1, "astra vs sol", has been dropped as a gate — the comparison of live searches happens after the fact, on the first escalation of tranche 1 of Plan 2). Effort `high` explicitly: Astra's default is `medium`, and search depth is the whole point of the channel. Do not use Luna/Terra: the luna-high measurement gave −43% of the time, but half as many live searches (5 vs 11). **Rollback** — `gpt-5.6-sol` (alive in the CLI catalog, priority 6): if the first escalation yields < 5 live `web_search` calls against the Sol benchmark of 11 (measurement 2026-08-15) — restore the literals here and `CODEX_MODEL` in the core in a single commit.

Base command (Bash, `timeout: 300000` ms per call):

```bash
codex exec -m gpt-6-astra -s read-only --skip-git-repo-check -c model_reasoning_effort="high" -c service_tier="default" -c 'tools.web_search={mode="live"}' --json '<PROMPT>' < /dev/null
```

> [!warning] `< /dev/null` is MANDATORY in every call — without it the channel hangs until timeout
> `codex exec` reads stdin (when a prompt is passed, the pipe is appended as a `<stdin>` block), and
> the Bash tool does not close stdin → Codex waits for EOF forever. Symptom: **0 bytes of stdout, exit 143
> (SIGTERM on timeout), `Reading additional input from stdin...` in stderr**. This is NOT an
> authorization problem and NOT a transient. A/B verified 2026-08-06 on codex-cli 0.146.0: without the redirect —
> killed by timeout, 0 bytes; with `< /dev/null` — exit 0 in 6 s on a trivial prompt, 156 s on
> a real one. The likely reason codexweb is the slowest channel in the telemetry
> (median 1078 s ≈ hangs + retries).

- The `--search` flag does NOT exist (checked on codex-cli 0.146.0, verified 2026-08-06) — web search is enabled only via `-c`.
- **`tools.web_search={mode="live"}` — a MANDATORY pin (checked on 0.147.0, 2026-08-15).** A bare `true` may return the OpenAI index CACHE (cached mode: snippets from the cache, and when the network is unavailable — fabrication without an error). `{mode="live"}` is valid and produces live web_search events (probe: 2 live searches, the current HN top). The value `"live"` as a string is an invalid config — only the object `{mode="live"}`.
- `-s read-only` is mandatory: the user's global config is `danger-full-access`, which is not needed for search.
- `--json` — JSONL events in stdout (checked on 0.146.0, verified 2026-08-06). The agent's final text:
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

Query language: whenever `languages` is not ru/en only, both `codex exec` prompts must explicitly ask Codex to search in the LANGUAGES from the orchestrator prompt (e.g. "search in Japanese and English") — Codex web search returns pages in the language of the query — and in that case Read `{PLUGIN_ROOT}/skills/full-research/references/language-layers.md` first (native-term dictionary).

### Call 1 — Broad overview (mandatory)

```bash
codex exec -m gpt-6-astra -s read-only --skip-git-repo-check -c model_reasoning_effort="high" -c service_tier="default" -c 'tools.web_search={mode="live"}' --json 'Research the web for: <expanded query — topic, aspects, what decision is being made>. Use ONLY the web search tool - run real searches, do NOT answer from memory. Every claim MUST have a source URL and publication date; omit claims without URLs. Prefer 2024-2026 sources. Open and READ THE FULL PAGE of every key source before citing it - do NOT cite from search-result snippets alone; quote specifics that only appear in the page body. Return: key findings (bulleted, each with URL), notable numbers/quotes with URLs, and a final Sources section listing all URLs.' < /dev/null
```

### Call 2 — Counter-arguments (mandatory)

```bash
codex exec -m gpt-6-astra -s read-only --skip-git-repo-check -c model_reasoning_effort="high" -c service_tier="default" -c 'tools.web_search={mode="live"}' --json 'Search the web for criticism, problems, failures and counter-arguments about: <topic>. Use ONLY the web search tool - real searches, NOT memory; every claim needs a source URL. Who disagrees and why? Known issues, regressions, negative experience reports. Open and READ THE FULL PAGE of key sources before citing - do NOT cite from snippets alone. Return bulleted findings with URLs + Sources section.' < /dev/null
```

Launch both calls in ONE message (two Bash calls in parallel), each with a `timeout` of ~300000 ms.
`< /dev/null` at the end of every command is mandatory (see the warning above), otherwise both calls
will burn out on timeout for nothing. The time margin is narrow: with the fix, one high-effort call = 156 s.

## Budget: 2 calls

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
- Messages in stderr about web search being disabled — the `tools.web_search` config key has been renamed
  (check `codex exec --help` and `~/.codex/config.toml`).

## Verification escalation (third voice, schema v3)

Besides serving as a channel, Codex is used by the `full-research-core` workflow as a **third, heterogeneous voice** when the two verifiers disagree (`CONFIRMED` vs `CHALLENGED/OUTDATED`, or `CHALLENGED/OUTDATED` vs `UNCHECKED`). Agreeing voices do not go to Codex: `CONFIRMED×2` → confirmed, an agreeing exclusion → dropped, `UNCHECKED×2` → unchecked. The cap is 8 escalations per run (`args.escalationCap`); beyond the cap — exclusion on a single voice + the `escalationSkipped: 'cap'` flag.

The call (made by a lightweight subagent bridge, the `escalationPrompt` prompt in core.js):

```bash
codex exec -m gpt-6-astra -s read-only --skip-git-repo-check -c model_reasoning_effort="high" -c service_tier="default" -c 'tools.web_search={mode="live"}' --json -o "<workDir>/_codex-esc-<claimId>-last.md" "$(cat "<workDir>/_codex-esc-<claimId>-prompt.md")" < /dev/null > "<workDir>/_codex-esc-<claimId>.jsonl"
```

- **Live-search gate:** the JSONL must contain ≥1 `web_search` event (`grep -c '"web_search'`); 0 → the voice does not count (`escalationSkipped: 'no-live-search'`) — Codex was answering from memory.
- Codex confirms the exclusion → the claim is `CHALLENGED`/`OUTDATED` (dropped). Does not confirm → `DISPUTED` (a JS aggregate, not a verifier enum): credibility ≥4, a `### Спорные факты` section in the report, not included in the conclusions.
- Degradations collapse into a single `escalationSkipped` enum: `no-binary` · `quota` · `timeout` · `invalid-output` · `no-live-search` · `budget` · `cap` → exclusion on a single voice as in schema v2 + a flag in the ledger/telemetry. There are no retries: the Codex quota is a shared pool with `/jadlis-research:verif`, and verif has priority.
- Rules for Codex in the prompt: the absence of confirmation ≠ a refutation (that is UNCHECKED); a discrepancy in numbers that is purely a matter of notation/rounding ±2% is not a refutation; confirm an exclusion ONLY on the basis of a source that directly contradicts or supersedes the claim.

## The quota pool has a third consumer: the Responses-API replacement (since 2026-09-04)

The ChatGPT-subscription quota is one finite pool for the codexweb channel (automatic, ~2 calls per run), the Codex verifier of `/jadlis-research:verif` (on request) and — since 2026-09-04 — every script that used to call the OpenAI Responses API. `OPENAI_API_KEY` returned 12 answers (`gpt-5.5-2026-04-23` + `web_search`, ≈31K tokens and 40 s per call) and then hit **`HTTP 429: You have no credits remaining`**; the API balance is ≈0 and `GET /v1/organization/costs` is not available to that key (no `api.usage.read` scope). Only the owner can top the balance up (platform.openai.com → Billing).

Replacement, same OpenAI web_search backend (Bing index + OAI-SearchBot), ≈30–80 s per question, `agent_message.text` = JSON matching the schema:

```bash
codex exec -m gpt-5.6-sol -s read-only --skip-git-repo-check -c 'tools.web_search={mode="live"}' --json --output-schema schema.json '<PROMPT>' < /dev/null
```

`web_search` events show the queries (but not the list of opened sources — only the cited ones). Priority inside the pool: `/jadlis-research:verif` > codexweb > everything else. Before a mass run make one probe API call (the 429 arrives immediately) and one `codex exec ... 'ok' < /dev/null` probe; a usage-limit answer means the channel goes off. Any script built on the Responses API must ship with a `codex exec` fallback.
