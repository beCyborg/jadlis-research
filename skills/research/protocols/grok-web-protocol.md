# Web (Grok) — search protocol for the agent

## Tool: headless Grok CLI with web_search (via Bash)

Web search through the **built-in `web_search`/`web_fetch` tools of the Grok CLI** — the same
headless launch as in the Twitter channel, but with web tools instead of x_*.
Billing — **subscription (OIDC), marginal cost ≈ $0** (verified 2026-07-10 on grok 0.2.93 /
grok-4.5; re-verified 2026-08-13 on grok 1.0.3 / grok-4.6: exit 0, live URL).
Do NOT use the MCP `mcp__grok-mcp__web_search` —
it goes to the xAI API (XAI_API_KEY, paid credits of the team account), forbidden by design.

Time reference: **~90 s per call** (verified 2026-08-06 on grok 0.2.118: 87 s, 4 turns,
`--effort xhigh --max-turns 6`). The old "~20 sec" estimate was off by a factor of four — it does not
affect `timeout: 300000`, but it was misleading when planning the fan-out.

Base command (Bash, `timeout: 300000` ms per call):

Once before the calls (HOME isolation — see below):

```bash
GROK_ISO_HOME="$HOME/.cache/grok-iso-home"; mkdir -p "$GROK_ISO_HOME"
```

Base command:

```bash
HOME="$GROK_ISO_HOME" GROK_HOME="$HOME/.grok" ~/.grok/bin/grok -p '<PROMPT>' \
  -m grok-4.6 --effort xhigh \
  --output-format json --yolo --no-auto-update \
  --disallowed-tools "run_terminal_cmd" --max-turns 6
```

We pin the model explicitly: `grok-4.6` (500K ctx) — the server default since 2026-08, it replaced grok-4.5 (which is still available); efforts `low|medium|high|xhigh`, high is the default. The pin protects against a change of the server default. effort=xhigh is fixed (directive 2026-08-15, rollback lifted).

> We pass `-m grok-4.6`, but `modelUsage` in the response reports the key `grok-4.6-build` — this is
> a server-side alias, not a broken pin and not a model substitution (verified 2026-08-13, exit 0).

> [!warning] `HOME="$GROK_ISO_HOME"` is mandatory — otherwise `web_fetch` is dead
> The Grok CLI **unconditionally** reads `~/.claude/settings.json` and translates `permissions.deny`
> into its own rules. `"WebFetch"` sits there → Grok's `web_fetch` answers
> `Denied by permission policy`, and the channel lives on `web_search` snippets alone,
> without reading pages. `[compat.claude]` does NOT cover this (it is about skills/rules/agents/mcps/hooks),
> `--allow web_fetch` and `GROK_WEB_FETCH=1` do not help: deny always beats allow.
> Substituting `HOME` hides `~/.claude`, while `GROK_HOME` preserves auth/config/memory.
> In the prefix assignment, `$HOME` inside `GROK_HOME="$HOME/.grok"` expands BEFORE the substitution —
> that is the real home directory, and it is intentional. Verified 2026-07-10.
> `web_search` is not blocked by this, even though `"WebSearch"` is in deny too — only the WebFetch→web_fetch pair is translated.

Parsing: the agent's answer is inside `.text` (the CLI JSON wrapper: `{text, stopReason, sessionId, requestId, thought}`).
But plain `jq -r '.text' | jq .` does NOT parse it: despite the requirement "return ONLY valid
JSON", `.text` = a prose preamble + JSON inside a ```` ```json ```` fence (verified 2026-08-06).
The extraction scheme is **the same tolerant one as in `twitter-protocol.md`** ("Parsing the result"):
fence → otherwise from the first `{` to the last `}` → `jq -e .` → patching up unbalanced braces →
as a last resort, read the findings by eye; the channel is NOT counted as failed in that case.

## CRITICAL: live search only, not the model's memory

Every prompt STRICTLY requires:
> "Use ONLY the web_search/web_fetch tools — run real search queries. Answering from the model's memory is FORBIDDEN: every claim comes with a source URL and a date. Do not include claims without a URL. Do NOT use x_* tools (X/Twitter is covered by another channel). At the end — a Sources list."

The point of this channel is to compare the findings of a different search stack; retelling memory is useless.

**Depth (2026-08-15):** Grok's `web_search` returns a synthesis over result snippets; reading full pages is `web_fetch` (the HOME isolation is built for its sake). Therefore every prompt requires: key sources must be OPENED via web_fetch and quoted from the page body, not from snippets (wording in the commands below).

## Protocol (2 calls IN ONE message — in parallel)

Search the web in the platform's own languages: use the LANGUAGES / QUERIES block from the orchestrator prompt — when `languages` contains anything beyond ru/en, the `-p` prompt must state explicitly which languages to search in (Grok's `web_search` follows the language of the query), and Read `{PLUGIN_ROOT}/skills/research/references/language-layers.md` first (native-term dictionary).

### Call 1 — Broad overview (mandatory, `--max-turns 6`)

```bash
HOME="$GROK_ISO_HOME" GROK_HOME="$HOME/.grok" ~/.grok/bin/grok -p 'Research the web on the topic: <expanded query — topic, aspects, user decision>. Use ONLY web_search/web_fetch (several real searches, NOT memory, NOT x_* tools). Every claim — with the source URL and date; do not include claims without a URL; prioritize 2024-2026. Key sources (3-5) MUST be opened via web_fetch and the full page read before citing — do not cite from web_search snippets; include specifics from the page body in the claim. Return ONLY valid JSON: {"findings":[{"claim","url","date"}],"sources":["url",...]}' \
  -m grok-4.6 --effort xhigh \
  --output-format json --yolo --no-auto-update --disallowed-tools "run_terminal_cmd" --max-turns 6
```

### Call 2 — Counterarguments (mandatory, `--max-turns 4`)

```bash
HOME="$GROK_ISO_HOME" GROK_HOME="$HOME/.grok" ~/.grok/bin/grok -p 'Find criticism, problems, failures and counterarguments on the web about the topic: <topic>. ONLY web_search/web_fetch (real searches, NOT memory, NOT x_*). Who disagrees and why. Every claim — with a URL. Open the top critical sources via web_fetch (full page), do not cite from snippets. Return ONLY JSON {"findings":[{"claim","url","date"}],"sources":["url",...]}' \
  -m grok-4.6 --effort xhigh \
  --output-format json --yolo --no-auto-update --disallowed-tools "run_terminal_cmd" --max-turns 4
```

Both calls — in ONE message (two Bash calls in parallel), each with `timeout: 300000`.

## Budget: 2 calls (hard)

## Handling the result

1. Collect the citations: URL + brief context. Prefixes: [gw1], [gw2], ...
2. Give every citation an Admiralty reliability (A-F) by the type of the SOURCE (the page behind the URL, not Grok itself).
3. Claims without a URL — discard (a violation of the "not from memory" contract).
4. Keep the annotation compact: one reliabilityWhy line per citation.

## Degradation (CLI-only, NO fallback)

One call failed (non-zero exit / timeout / empty `.text`), the other is fine → work with what came back, flag the missing angle.

Both calls failed → ONE sequential retry of a combined call (the parallel
launch may have hit a rate limit). If that fails too → return **empty** citations,
sourceQuality = LOW, a note in findings: "Grok web channel unavailable (CLI)";
**do NOT switch** to the MCP grok-mcp (xAI API, paid credits — forbidden by design)
and not to Brave (that is covered by the web channel); **do NOT fail** the workflow.

CLI diagnostics: an expired OIDC token (`grok login`, visible as exit≠0) or a subscription rate limit; the stderr warnings `Transport channel closed / AuthorizationRequired` with exit 0 are harmless. NOTE: in the /full-research fan-out the Grok CLI also drives the Twitter channel in parallel with this one (2+2 processes) — if both calls fail but a single retry works, run them sequentially and note that in findings.
