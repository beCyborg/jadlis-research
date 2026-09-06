---
name: full-research
description: "Full topic research: web (Brave, Codex, Grok) + communities (Reddit, X, HN, Substack, YouTube, Telegram) via workflow, per-claim verification → vault note. Triggers: full research, deep research, what do people think. RU triggers: полный ресерч, глубокий ресерч, все источники, в соцсетях, что говорят люди. Do NOT use for: web search → /search; papers → /search-paper; docs → Context7."
allowed-tools:
  - Read
  - Write
  - Glob
  - Bash
  - AskUserQuestion
  - EnterPlanMode
  - ExitPlanMode
  - Workflow
  - mcp__plugin_jadlis-research_brave-search__brave_web_search
argument-hint: "<query — research topic>"
model: claude-opus-5
effort: high
---

# /jadlis-research:full-research — full research of a topic (hybrid Skill + Workflow)
Before Phase A read `references/gotchas.md` — run failure modes (analyst session limit and resume, the ledger dropping claims, forbidden characters in `QUERY_RU`, paired runs).

The heavy part (N channel researchers → per-claim verification with live Brave counter-search →
analyst synthesis) runs in the deterministic workflow **`full-research-core`**. The skill does the
interactive intake (Phase A: channels + recon + interview, in plan mode) and the vault write
(vault contract: dedup, wikilinks, daily-note entry).

**User query:** `$ARGUMENTS`

Language convention (Plan 2, 2026-09): everything the agents read and write inside the workDir
(channel files, snapshot headers, curator/verifier/escalation output, the claim ledger) is in
English — the curator, 2×16 verifiers and the analyst read those files and Cyrillic tokenises
~1.5-2× dearer. Russian stays where a human reads it: the questions to the user, the report
`report.md` (it becomes the vault note as is), `queryRu`, the summary of Phase C, Russian example
queries in the Yandex/Telegram protocols, and `quotes[]` in the language of the original.

## Architecture

```
Phase A (INTAKE in plan mode: channels + recon + interview → brief in the plan file; ExitPlanMode = launch gate)
  → Phase B (Workflow full-research-core, exec) → Phase C (WRITE: vault contract)
```

Under `opusplan` the main session is Fable 5.1 while in plan mode and Opus 5 in exec: the intake
(judgement: channel choice, refined query, decision context) runs on Fable, the mechanical part
(launching the workflow, writing the vault) on Opus. The frontmatter `model:` above holds for one
turn only — do not rely on it beyond the first turn.

## Phase A — INTAKE (main session, plan mode)

0. **Enter plan mode.** Call `EnterPlanMode` before anything else: recon is read-only, the
   interview goes through AskUserQuestion, the brief is written into the plan file. No file in the
   vault or the workDir is written in Phase A. If plan mode is unavailable (headless, `-p`), run the
   same steps without it and write the brief to `{WORK_DIR}/_brief.md` instead.

1. **Topic.** If `$ARGUMENTS` is empty — ask for the topic via AskUserQuestion (in Russian) and stop.

2. **Channel choice — routing tree.** Sources named explicitly by the user ("в Reddit и HN",
   "only twitter") always override the tree; "соцсети"/"сообщества" →
   `["reddit","twitter","hackernews","substack"]`; "web" → `web,codexweb,grokweb` (codexweb — after
   the quota probe, grokweb — after the Grok liveness probe, see the gates below). Otherwise —
   binary questions about the topic, top-down, applied CUMULATIVELY:

   1. **RU/CIS topic?** (Cyrillic phrasing about the Russian market/services/prices,
      «в России / Рунете / СНГ», vc.ru/Habr/Дзен/Telegram context) →
      `yandex` ON **only with the key `YC_SEARCH_API_KEY`** (gate below; no key — do not enable the
      channel, tell the user the RU layer goes through Brave and Telegram only); `telegram` ON
      (public t.me previews + dorks, free contour; mandatory for custdev topics); `twitter`,
      `substack`, `hackernews` — OFF (English silence on RU topics is structural — a platform
      bias, not absence of demand; in the Phase C summary this is NOT counted as a channel
      failure). Add RU inputs for the agents to the brief: anchor domains for `site:` queries
      (vc.ru, habr.com, pikabu.ru, dtf.ru, t-j.ru, secrets.tbank.ru, incrussia.ru, rb.ru),
      `site:t.me` dorks for the Telegram layer; grey forums are reached through Yandex (their
      threads are in its index). Complementary local channel skills outside the workflow (if the
      user has them installed): the CIS forum index (`/cis-forums`), zelenka/lolz
      (`/zelenka-research`) — suggest them for custdev / grey-market topics.
   2. **Technical / AI topic?** → `hackernews` ON (for RU topics branch 1 has priority);
      `youtube` — offer as opt-in (strong clusters: tech/AI tutorials and reviews, marketing/sales;
      transcripts are free from the home IP).
      `codexweb` — in ALL topics (default set). **Codex quota probe (always before enabling):** the
      Codex subscription quota is a shared pool with the verifier `/jadlis-research:verif` (verif has
      priority). Probe: `codex exec -m gpt-6-astra
      -s read-only --skip-git-repo-check -c service_tier="default" 'ok' < /dev/null` (≈6 s); a
      usage-limit error → channel OFF, tell the user («codexweb пропущен: квота Codex
      зарезервирована/исчерпана»). No `codex` binary → channel OFF without an error message.
   3. **Academic topic?** → suggest `/jadlis-research:search-paper` (instead of or next to
      full-research).
   4. **Local / everyday topic (places)?** («найди/выбери заведение, клинику, сервис, секцию в
      Варшаве/городе») → the `web` channel gets the place layer (section "Place layer" in
      web-protocol.md: places-fetch.sh → Brave Place); the channels `youtube` (place reviews) and
      `telegram` (local chats) — offer as opt-in. places-fetch gate: the key
      `GOOGLE_PLACES_API_KEY` (no key → the script degrades to Brave Place by itself, that is
      normal). Default region PL, overridden by the variable `PLACES_REGION`.
   5. **Asian / EU market topic, or query language ∉ {ru, en}?** (Plan 2, tranche 3 — language
      layers, trigger-scoped) → add the matching language channels `ja` / `zh` / `ko` / `eu` (own
      protocols, own families; NEVER in the default set) and set `languages` accordingly (below).
      Only the layers the topic really needs — a Japanese indie-dev topic gets `ja`, not all four.
      A language layer moves into the default set only after a leave-one-out check by the 2026-08
      criterion (≥1 CONFIRMED claim per run attributable to it).

   **Default set** (no branch fired, or the cluster is mixed/undetermined):
   `["web","codexweb","grokweb","reddit","twitter","hackernews","substack"]` — codexweb is in by
   default (after the quota probe of branch 2; probe failed → drop it from the set with a message);
   `grokweb` and `twitter` — after the Grok liveness probe (gate below; `GROK_DOWN` → drop both
   from this run's set, do not change the set itself). Refinement of the "cluster → channels"
   matrix — by telemetry (local `full-research-telemetry.py --trends`, `--channels`), not by judgement.

   **Gate `yandex`.** The channel needs the key `YC_SEARCH_API_KEY` (env, or the macOS Keychain via `scripts/secret.sh`)
   (written by the skill `/jadlis-research:keys` into the Keychain; the plugin userConfig is no
   good here — sensitive values do not reach Bash). Key not configured → do not offer `yandex` at all. If there is no key
   but the channel was still chosen: `yandex-search.sh` returns `exit 2`, the channel degrades
   (`sourceQuality=LOW`, empty citations) and the workflow does NOT fail. Paid: ≈0.1-0.15 ₽/topic.
   Outside the RU branch — only on explicit request («с Яндексом»). Brave's Runet layer is weak
   (measured 01.2026: Yandex has the highest domain diversity of results, 164 domains out of 1630
   SERP entries appeared in no other engine).

   **Gate `youtube`.** With the key `YOUTUBE_API_KEY` (plugin userConfig) the channel uses the
   MCP `mcp__plugin_jadlis-research_youtube__*` for search and metadata. Without the key — **skip**
   the MCP calls, the channel works through Brave `site:youtube.com` + transcripts
   (`scripts/yt-transcript.py`), a normal degradation.

   **Gate `grokweb` / `twitter` (Grok liveness probe).** Both channels go through the Grok CLI,
   whose Grok Build subscription balance runs out independently of Claude (03-04.09.2026 —
   468 refusals `API error (status 402 Payment Required): Grok Build usage balance exhausted`,
   05.09 balance topped up). Probe before enabling (cost $0; a 402 arrives in ~0.6 s, a live
   answer in 5-10 s):

   ```bash
   GROK_ISO_HOME="$HOME/.cache/grok-iso-home"; mkdir -p "$GROK_ISO_HOME"
   GROK_PROBE=$(HOME="$GROK_ISO_HOME" GROK_HOME="$HOME/.grok" ~/.grok/bin/grok \
     -p 'ok' -m grok-4.6 --effort low --max-turns 1 2>&1 | head -20)
   echo "$GROK_PROBE" | grep -qiE '402|balance exhausted|Payment Required|unauthenticated' \
     && echo GROK_DOWN || echo GROK_OK
   ```

   `HOME="$GROK_ISO_HOME"` is mandatory — otherwise Grok reads the `permissions.deny` of the main
   profile and mutes its own `web_fetch` (see `protocols/grok-web-protocol.md`). A non-zero exit
   and `Error: max turns reached` are NOT signs of death: the probe judges ONLY by the grep,
   `--max-turns 1` legitimately cuts a live answer at the first tool call.

   `GROK_DOWN` → drop `grokweb` from this run's `SELECTED_CHANNELS`; for `twitter` first check
   the TwitterAPI.io key (`bash ${CLAUDE_PLUGIN_ROOT}/scripts/twitterapi.sh balance` → JSON = key
   ok, `exit 2` = no key): with the key the channel STAYS in the set in keyword-only mode
   (protocol section "TwitterAPI.io layer", Mode B); without it drop `twitter` too. Tell the
   user: «Grok недоступен (402 usage balance exhausted) — grokweb пропущен; twitter идёт
   keyword-only через TwitterAPI.io» (or «…grokweb/twitter пропущены; вернутся сами после
   пополнения баланса» when there is no key). The default channel set is NOT changed — the
   probe gates the run, not the config, and after a top-up the channels return by themselves,
   without edits or a render. `GROK_OK` → both channels work as usual; with the key the
   `twitter` channel additionally runs Mode A of the same section (replies, author profile,
   trends — ≤3 cheap REST calls).

   **Edge case.** The explicit "web" mode = `web,codexweb,grokweb`: if Grok is dead AND the
   codexweb quota probe failed, one channel remains → the workflow returns
   `insufficient-sources`. Then offer to add `reddit`/`hackernews` or to fall back to
   `/jadlis-research:search`. The default set has no such hole: without Grok
   `web, codexweb, reddit, hackernews, substack` = 4 families out of 5 remain, the sufficiency
   gate passes (real run 03.09: channels 5/7, families 4/5, status ok).

3. **Recon.** Make 1-2 calls of `mcp__plugin_jadlis-research_brave-search__brave_web_search`
   (Search tier: 50 req/s, parallel OK; `count: 5`): a broad overview of the topic + optionally one
   clarifying aspect. The goal is orientation (aspects, sub-topics, controversies), not data
   collection. Read-only — plan mode allows it.
   **Substack handle extraction:** if "substack" is among the channels — parse URLs of the form
   `<handle>.substack.com` from the Brave results → the array `SUBSTACK_HANDLES`.

4. **Interview (ALWAYS, no skip).** Through AskUserQuestion, in Russian:
   - Mandatory first question: «Какое решение ты будешь принимать на основе этого ресёрча?» —
     form the hypothesis options from the recon. The answer → `DECISION_CONTEXT` (1-2 sentences:
     what the person will do/choose based on the result).
   - 1-3 more questions based on the recon: which aspect matters; context/use case; time
     horizon/recency. If the query is already narrow these may be skipped, but the decision
     question is always asked.
   Form `REFINED_QUERY` (1-3 sentences). Language of REFINED_QUERY: the language of the user's
   query (usually Russian) — the channel agents receive it as is and search in `LANGUAGES`.

5. **Language slot.** `LANGUAGES` = the languages the channels must search in. Default = the
   language of the query (the core detects ru/en/ja/zh/ko itself). Set it explicitly when the
   topic lives on platforms in another language (branch 5 above, or the user says «на японском /
   по китайским источникам»): e.g. `["ja","en"]`. For every non-default language also prepare
   `QUERIES` — one native phrasing per language using the platform's own terms
   (`{PLUGIN_ROOT}/skills/full-research/references/language-layers.md` is the dictionary:
   個人開発, 独立开发者, 1인 개발자 …) — e.g. `{"ja": "個人開発 収益 報告 2026", "en": "indie developer revenue reports 2026"}`.
   Rule: a platform is searched in its own language; an English query on a Japanese platform
   returns translators and schools, not practitioners.

6. **Preparation.** Compute: `SESSION_ID = ${CLAUDE_SESSION_ID}` (empty in Bash — use
   `uuidgen | cut -c1-8` instead); `QUERY_SLUG` (Latin transliteration, ≤40, lowercase, hyphens);
   `QUERY_RU` (short Russian phrasing ≤25 chars); `DATE` = !`date +%Y-%m-%d` (already substituted
   when the skill loads, no Bash needed); `VAULT_PATH = ${user_config.VAULT_PATH}` — **if the value
   is empty or is left as the literal `${user_config.VAULT_PATH}` (e.g. during a local trial with
   `--plugin-dir`), use `~/Jadlis`**;
   `WORK_DIR = {VAULT_PATH}/.full-research/{SESSION_ID}_{QUERY_SLUG}` — **always an ABSOLUTE path**
   (a relative one resolves from the cwd at the moment the agents are spawned: a `cd` of the main
   session before a resume "lost" files at status ok; this also concerns `resumeFromRunId` calls —
   pass the args in full with the same absolute workDir);
   `VAULT_RESEARCH_DIR = {VAULT_PATH}/Знания/Ресерчи`; `PLUGIN_ROOT = ${CLAUDE_PLUGIN_ROOT}`.

7. **Brief → plan file → launch gate.** Write the brief into the plan file (plan mode) in this
   shape — the exec turn reads it and launches Phase B without re-asking:

   ```
   ## full-research brief
   REFINED_QUERY: …
   DECISION_CONTEXT: …
   SELECTED_CHANNELS: [web, codexweb, …]      # after the probes; dropped: … (reason)
   LANGUAGES: [ru]                             # + QUERIES per language if not ru/en
   QUERIES: {}
   SUBSTACK_HANDLES: []
   WORK_DIR: /abs/path/.full-research/<id>_<slug>
   QUERY_RU: …
   DATE: YYYY-MM-DD
   ```
   Then `ExitPlanMode`. Approval of the plan = the launch gate. After approval (exec):
   `mkdir -p "{WORK_DIR}" "{VAULT_RESEARCH_DIR}"` and say: «Запущен полный ресерч по {N} каналам:
   {SELECTED_CHANNELS}; языки: {LANGUAGES}. Ожидаю результаты...»

## Phase B — INVOKE

```
Workflow({
  scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/full-research-core.js",
  args: {
    refinedQuery: REFINED_QUERY,
    decisionContext: DECISION_CONTEXT,  // from the interview: which decision the user makes
    channels: SELECTED_CHANNELS,        // keys: web/codexweb/grokweb/reddit/twitter/hackernews/substack (+opt-in: yandex, youtube, telegram, ja, zh, ko, eu)
    languages: LANGUAGES,               // e.g. ["ru"] or ["ja","en"]; omitted → detected from the query
    queries: QUERIES,                   // {lang: native phrasing}; may be {}
    substackHandles: SUBSTACK_HANDLES,  // may be empty
    aiModel: "claude-fable-5-1",        // analyst model (synthesis goes through the Fable bridge)
    date: DATE,
    workDir: WORK_DIR,
    pluginRoot: PLUGIN_ROOT,            // ${CLAUDE_PLUGIN_ROOT} is NOT interpolated in JS — passed as a value
    vaultPath: VAULT_PATH
  }
})
```

Models inside the workflow: channels, verifiers and curator — Opus 5
(`jadlis-research:researcher-opus` / `jadlis-research:orchestrator-opus`);
analyst — **Fable 5.1 through the bridge** (headless `claude -p`, billed to the same subscription).
Disable the bridge: `fableBridge: false` → analyst also on Opus 5 — then pass
`aiModel: "claude-opus-5"`, the report frontmatter must not lie.

The workflow (ledger schema v4) reads the channel protocols itself: the curator selects up to 16
claims with evidence prefixes (the code substitutes the spans); the snapshot gate lowers HIGH to
MEDIUM per citation (`no-snapshot` · `llm-mediated` — codexweb/grokweb/yandex and x.com by
constant · `short-snapshot` < 1 000 chars · `quote-not-found`); `urlhealth` checks the evidence
URLs and the quotes against the snapshots (`snapshotChars` in evidence); two verifiers vote
(CONFIRMED/CHALLENGED/OUTDATED/UNCHECKED); on a vote split the third vote comes from Codex
(GPT-6 Astra, live search; cap 8 escalations; `codexModel: "gpt-5.6-sol"` in args — rollback);
an unconfirmed exclusion → `DISPUTED` (disputed, not part of the conclusions). Dropped claims are
**filtered** (not merely annotated with criticism), then the analyst writes the draft report to
`{WORK_DIR}/report.md` (in Russian). Wait for the `<task-notification>`, then use the object:
`{workDir, status, ledgerSchemaVersion, languages, channelsAnswered, channelStatus, failedChannels,
aiModelActual, evidenceHealth, urlhealthSummary, snapshotGate, escalationStats, reportPath, queryRu,
relatedCandidates, claimLedger, synthMeta}`; `synthMeta.ledgerSummary` = `{total, confirmed,
confirmedSplit, challenged, outdated, unchecked, disputed, escalated, escalationSkipped,
weakEvidence, evidenceless, ceilingCapped, credibilityMedian, claimsDroppedByCap}`; `snapshotGate` =
`{minChars, llmMediatedChannels, demotedTotal, byReason: {noSnapshot, shortSnapshot, llmMediated,
quoteNotFound}, byChannel, ceilingCapped}` — how many HIGH citations were lowered to MEDIUM and why
(`args.channelCeiling: {codexweb: "HIGH"}` — the explicit escape of a channel ceiling, no automation).
Progress — in `/workflows`. `escalationCap: N` in args changes the escalation cap (default 8; the
Codex quota is a shared pool with verif).

## Phase C — WRITE (vault contract, main session)

The vault write contract — `${CLAUDE_PLUGIN_ROOT}/shared/obsidian-write-contract.md`.

1. **Partial result.** If `status: "insufficient-sources"` (<2 channels) — report the error, show
   what was collected in `{WORK_DIR}`. Otherwise continue.

2. **Read the draft:** `{WORK_DIR}/report.md`.

2a. **Draft post-check (deterministic).**
   - **Honest `ai_model`.** Compare the frontmatter `ai_model` with `aiModelActual` from the
     workflow object (the bridge may have fallen back to Opus — then the frontmatter lies). On a
     mismatch fix the frontmatter line to `ai_model: "{aiModelActual}"` before writing to the vault.
   - **Canonical sections.** If `synthMeta.ledgerSummary.confirmed > 0`, check
     `grep -c '^### Проверенные факты$' draft`. No section → render it programmatically from
     `claimLedger` (claims with verdict=CONFIRMED: statement translated into Russian + «(N голосов)»
     + credibility badge + the first evidence URL) and insert it as a subsection at the end of
     «## 📚 Контекст и находки». The same for `disputed > 0` and `### Спорные факты` (claims with
     verdict=DISPUTED: statement + votes + `escalation.reasoning`).
   - **Ledger metrics in the frontmatter (H8).** Compare with `synthMeta.ledgerSummary` and fix
     deterministically (numbers, not strings): `ledger_schema: 4`,
     `claims_confirmed`, `claims_disputed`, `claims_dropped` (= challenged + outdated),
     `claims_unchecked`, `votes_confirmed_2` (= confirmed − confirmedSplit),
     `votes_confirmed_1` (= confirmedSplit), `escalations` (= escalated),
     `credibility_median`; `languages` (= `languages` from the object). A missing field — add it
     before `gaps:`. This way the report can be re-evaluated without the wf log.

3. **Pre-write dedup.** Order from the shared contract: (1) MCP `qmd` `query` by payload
   (lex+vec over `relatedCandidates`, if the server is connected) → (2) deterministic
   `command grep -rIl "{key}" "{VAULT_RESEARCH_DIR}"` → (3) `obsidian search` only as a fallback
   (flaky, run 2-3×), if Obsidian is open:
   ```bash
   obsidian search query="{keywords from QUERY_RU}" path="Знания/Ресерчи" limit=5 format=json 2>/dev/null || echo "CLI_UNAVAILABLE"
   ```
   Remember the note names found. If there is a very close duplicate — decide: supersede / link.

4. **Name collision.** `REPORT_PATH = {VAULT_RESEARCH_DIR}/{queryRu}.md`. Bash
   `test -e "{REPORT_PATH}" && echo EXISTS || echo FREE`. EXISTS → `{queryRu} ({DATE}).md`, test
   again; EXISTS → suffix ` v2`, ` v3`… until free.

5. **Wikilinks + write.** In the section `## Связанные заметки` of the draft (it is empty — a
   placeholder) put wikilinks `[[Название]]` **ONLY** to notes really found in step 3 (do NOT create
   unresolved links; `relatedCandidates` from the object are only search hints). If the obsidian
   CLI is unavailable — leave the section empty/remove it. Write the final file to `REPORT_PATH`
   (Write — copy the draft with the section filled in).

6. **Post-write (daily note).** If Obsidian is open:
   ```bash
   NOTE_NAME=$(basename "{REPORT_PATH}" .md)
   DAILY=$(obsidian daily:path 2>/dev/null) || DAILY="Периоды/День/$(date +%F).md"
   obsidian append path="$DAILY" content="- [[${NOTE_NAME}]] — полное исследование, ожидает ревью" 2>/dev/null || true
   obsidian backlinks file="${NOTE_NAME}" counts 2>/dev/null || true
   # workDir retention (30 days with a link from the vault, 7 without; dry-run only without --yes) and
   # machine-local read-side telemetry — missing scripts do not break the contract
   python3 "${CLAUDE_PLUGIN_ROOT}/scripts/workdir-gc.py" --root "{VAULT_PATH}" --keep-days 30 --dry-run 2>/dev/null | tail -2 || true
   python3 ~/.claude/scripts/full-research-telemetry.py --sync >/dev/null 2>&1 || true
   ```
   (gc prints deletion candidates; the deletion itself — only on the user's explicit request: `--yes`.)

7. **Summary to the user (in Russian; ledger statements are English — translate them, numbers verbatim):**
   - The verdict for the decision from the interview (`DECISION_CONTEXT`): what to do / not to do —
     2-4 sentences from the main conclusion of the draft.
   - **Channel status (mandatory).** From `channelStatus`: if `failedChannels` is non-empty —
     list explicitly which SELECTED channels failed/degraded (LOW or no citations) and what that
     means for completeness (a run without part of the selected channels is not a full one).
     All channels ok → one line «все N каналов отработали».
   - What verification dropped: from `claimLedger`/`synthMeta.droppedClaims` — which claims are
     CHALLENGED/OUTDATED and why. They **did not enter** the report (filtering, not appended criticism).
   - **Verification in one line** from `ledgerSummary`/`escalationStats`/`snapshotGate`: «проверено
     N claims: X подтверждено (Y одним голосом), Z спорных (эскалаций в Codex: E, пропущено: S —
     причины), W отсеяно, U не проверено; evidence: weak K, без evidence L, потолок MEDIUM по
     снапшот-гейту M (причины из byReason); urlhealth: dead/fabrication».
     `evidenceHealth: "skipped"` → say the URL health was not checked.
   - Gaps (`synthMeta.gaps`): what the research did not cover.
   - Synthesis model: `aiModelActual` — the one that actually ran (the bridge may have fallen back to Opus).
   - Report path: `REPORT_PATH` (vault, `Знания/Ресерчи`).
   - Working directory: `{WORK_DIR}/` (per-source files + draft — the full process).
   - Reminder: the report frontmatter has `verified: false` — an AI draft. After review the user
     sets `verified: true` by hand.

## Error handling

- The workflow returned `insufficient-sources` — show what was collected, do not write to the vault.
- Channel agents have built-in fallbacks (Brave `site:` instead of MCP) inside the protocols.
- Channel `yandex`: `exit 2` — no `YC_SEARCH_API_KEY`; `exit 3` — API error; `exit 4` — polling
  timeout. In all three cases the channel returns `sourceQuality=LOW` without retries and without a
  Brave fallback; the workflow continues on the other channels.
- Channels `hackernews` and `substack` work through their own fetchers (`scripts/hn-fetch.sh`,
  `scripts/substack-fetch.py`). There is no MCP fallback in the plugin: fetcher broken → the channel
  degrades (`sourceQuality=LOW`), the workflow continues.
- Language channels `ja`/`zh`/`ko`/`eu` work through `scripts/feed-fetch.py` (RSS/Atom/JSON → md
  snapshot with `Extractor: feed-fetch`) + Brave in the platform language; a dead feed → the
  channel degrades, the workflow continues.
- obsidian CLI unavailable (Obsidian closed) — the vault contract degrades: write the file to
  `REPORT_PATH` without dedup/wikilinks/daily-note entry, warn the user.
