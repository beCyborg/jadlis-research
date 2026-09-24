---
name: research
description: "Full topic research: web (Brave, Codex, Grok) + communities (Reddit, X, HN, Substack, YouTube, Telegram) via workflow, per-claim verification → vault note. Triggers: full research, deep research, what do people think. RU triggers: полный ресерч, глубокий ресерч, все источники, в соцсетях, что говорят люди. Do NOT use for: web search → /search; papers → /search-paper; docs → Context7; settings → /jadlis-research:research-settings."
allowed-tools:
  - Read
  - Write
  - Glob
  - Bash
  - Bash(python3 ${CLAUDE_PLUGIN_ROOT}/skills/research-settings/scripts/research-sources.py *)
  - AskUserQuestion
  - ExitPlanMode
  - Workflow
  - mcp__plugin_jadlis-search_brave-search__brave_web_search
argument-hint: "<query — research topic>"
model: claude-opus-5-5
effort: high
---

# /research — full research of a topic (hybrid Skill + Workflow)
Before Phase A read `references/gotchas.md` — run failure modes (analyst session limit and resume, the ledger dropping claims, forbidden characters in `QUERY_RU`, paired runs).

The heavy part (N channel researchers → per-claim verification with live Brave counter-search →
analyst synthesis) runs in the deterministic workflow **`full-research-core`**. The skill does the
interactive intake (Phase A: channels + recon + interview → brief in `{WORK_DIR}/_brief.md`; one
AskUserQuestion = launch gate) and the vault write (vault contract: dedup, wikilinks, daily-note
entry).

**User query:** `$ARGUMENTS`

**Settings short-circuit.** If `$ARGUMENTS` is exactly `settings` or `настройки` (trimmed, case
insensitive, nothing else), this is not a research request: answer with the single line
«Настройки источников: запусти `/jadlis-research:research-settings`» and stop. No recon, no
launch gate, no workflow.

Language convention (Plan 2, 2026-09): everything the agents read and write inside the workDir
(channel files, snapshot headers, curator/verifier/escalation output, the claim ledger) is in
English — the curator, 2×16 verifiers and the analyst read those files and Cyrillic tokenises
~1.5-2× dearer. Russian stays where a human reads it: the questions to the user, the report
`draft.md` (it becomes the vault note as is), `queryRu`, the summary of Phase C, Russian example
queries in the Yandex/Telegram protocols, and `quotes[]` in the language of the original.

## Architecture

```
Phase A (INTAKE: channels + recon + interview → brief in {WORK_DIR}/_brief.md; one AskUserQuestion = launch gate)
  → Phase B (Workflow full-research-core) → Phase C (WRITE: vault contract)
```

## Phase A — INTAKE (main session)

0. **Session branch — pick exactly one.**
   - **Normal (default).** No plan mode — do not call `EnterPlanMode`. Steps 1-7 run in the
     session's current mode; the launch gate is the one AskUserQuestion of step 7, the brief goes
     to `{WORK_DIR}/_brief.md`.
   - **Brief already approved.** Narrow signals only: the request carries a `## full-research brief`
     section from an approved plan, gives the path to a `_brief.md`, or explicitly asks to launch
     without questions («без вопросов», «интервью и гейт пропусти»). Skip the interview (step 4)
     and the gate (step 7). Run step 2a only if the brief has no `SELECTED_CHANNELS`; fields the
     brief lacks come from the request and steps 5-6. Then do the launch sequence of step 7
     (`mkdir -p`, `_brief.md` — keep a given one as is, launch line, Workflow). If this file was
     opened with Read rather than loaded as a skill, its plugin-root variables stay unsubstituted —
     use `PLUGIN_ROOT` and `VAULT_PATH` from the brief.
   - **Session already in plan mode** (the user is planning a bigger task; a plan-mode system
     reminder names the plan file). Steps 1-6 as usual. Then APPEND the brief of step 7 as a
     section to that plan file — leave the rest of the plan as it is, no Context/Evidence frame
     around the brief. The first line under `## full-research brief` is
     `EXEC: read ${CLAUDE_SKILL_DIR}/SKILL.md — step 0 «Brief already approved», then Phase B–C; launch without questions`
     so the brief survives «clear context» on approval. The gate is the user's approval of the
     plan: one `ExitPlanMode`, no AskUserQuestion gate. After approval — the launch sequence of
     step 7. If Workflow then refuses with «scriptPath must be a script path this tool returned»,
     the approval switched the session to `auto` — ask the user to switch back to bypass
     permissions and repeat the same call.
   - **Headless** (`-p`, AskUserQuestion unavailable): the interview answers come from the prompt,
     the gate is skipped — write `_brief.md` and launch right away.

1. **Topic.** If `$ARGUMENTS` is empty — ask for the topic via AskUserQuestion (in Russian) and stop.

2. **Channel choice — routing tree.** Sources named explicitly by the user ("в Reddit и HN",
   "only twitter") always override the tree; "соцсети"/"сообщества" →
   `["reddit","twitter","hackernews","substack"]`; "web" → `web,codexweb,grokweb`. The tree only
   PROPOSES channels — availability is decided by the source resolve of step 2a. Otherwise —
   binary questions about the topic, top-down, applied CUMULATIVELY:

   1. **RU/CIS topic?** (Cyrillic phrasing about the Russian market/services/prices,
      «в России / Рунете / СНГ», vc.ru/Habr/Дзен/Telegram context) →
      `yandex` ON (step 2a drops it when `YC_SEARCH_API_KEY` is missing and says so — then the RU
      layer goes through Brave and Telegram only; paid ≈0.1-0.15 ₽/topic, outside the RU branch
      only on explicit request «с Яндексом», because Brave's Runet layer is weak); `telegram` ON
      (native search from the owner's Premium account via `tgsearch.py` — all public posts, chats,
      comments; falls back to public t.me previews + dorks when there is no session; mandatory for
      custdev topics); `twitter`,
      `substack`, `hackernews` — OFF (English silence on RU topics is structural — a platform
      bias, not absence of demand; in the Phase C summary this is NOT counted as a channel
      failure). Add RU inputs for the agents to the brief: anchor domains for `site:` queries
      (vc.ru, habr.com, pikabu.ru, dtf.ru, t-j.ru, secrets.tbank.ru, incrussia.ru, rb.ru),
      `site:t.me` dorks for the Telegram free mode; grey forums are reached through Yandex (their
      threads are in its index). Complementary local channel skills outside the workflow (if the
      user has them installed): the CIS forum index (`/cis-forums`), zelenka/lolz
      (`/zelenka-research`) — suggest them for custdev / grey-market topics.
   2. **Technical / AI topic?** → `hackernews` ON (for RU topics branch 1 has priority);
      `youtube` — offer as opt-in (strong clusters: tech/AI tutorials and reviews, marketing/sales;
      transcripts are free from the home IP).
      `codexweb` — in ALL topics (default set). Do NOT probe Codex here: the Codex subscription
      quota is a shared pool with the verifier `/verif` (verif has priority), and step 2a decides
      availability — a missing binary, an exhausted quota or the provider switched off in the
      settings drops the channel there, with the reason.
   3. **Academic topic?** → suggest `/science-research` (instead of or next to
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
   `["web","codexweb","grokweb","reddit","twitter","hackernews","substack"]` — this is the
   PROPOSAL of the tree; which of them actually run is decided by the source resolve of step 2a
   (user settings + live access). The proposed set itself is never edited
   here. Refinement of the "cluster → channels"
   matrix — by telemetry (local `full-research-telemetry.py --trends`, `--channels`), not by judgement.

2a. **Source resolve (ONE Bash call).** The tree only proposes channels; the user's source
   settings (`/jadlis-research:research-settings`) and live access decide what runs. Make exactly
   one call — no key checks, no liveness probes of your own. Bash `timeout: 120000` (the script
   holds its own 90 s deadline and always answers with JSON):

   ```bash
   python3 "${CLAUDE_PLUGIN_ROOT}/skills/research-settings/scripts/research-sources.py" \
     --data-dir "${CLAUDE_PLUGIN_DATA}" \
     resolve --channels web,codexweb,grokweb,reddit,twitter,hackernews,substack --json
   ```

   `--channels` = the list the tree produced, comma-separated, no spaces. From the JSON take:

   - `SELECTED_CHANNELS` = `.channels` — what actually runs;
   - `CHANNEL_NOTES` = `.notes` — `{channel: text}`, per-channel instructions that take precedence
     over the protocol where they conflict (degradations: `youtube` without `YOUTUBE_API_KEY` runs
     on Brave `site:youtube.com` + transcripts, `reddit` without `REDDITAPIS_KEY`, `twitter` in
     Mode B …). Pass them on verbatim — `{PLUGIN_ROOT}` is substituted inside the workflow;
   - `PROVIDERS_OFF` = `.providers_off` — providers switched off (`grok`, `codex`);
   - `SOURCE_DROPPED` = `.dropped` — `[{channel, reason, detail}]`, reason is
     `disabled-by-settings` or `no-access`.

   Also in the JSON, for your own reading: `.state` (per-channel status), `.families`,
   `.insufficient`, `.warnings`, `.summary_ru`.

   **What to tell the user:** `.summary_ru` **verbatim** (it is already Russian and formatted),
   then every line of `.warnings`. A drop with `reason: disabled-by-settings` gets exactly ONE
   line («grokweb выключен в настройках источников») and NEVER a suggestion to switch it back on
   — that is the user's deliberate choice. A drop with `reason: no-access` is reported with its
   reason (no key, no binary, quota, balance) from `detail`.

   **`.insufficient == true` → do NOT launch the workflow.** Say what is left and offer: add
   `reddit`/`hackernews`, fall back to `/search`, or review the sources in
   `/jadlis-research:research-settings`.

   **Script failure (no JSON, exit ≠ 0, timeout) — FAIL-CLOSED on Grok.** Never fall back to the
   old behaviour: the old default was Grok-first, and Grok must not be touched when its state is
   unknown. Do exactly this:
   - warn the user: «настройки источников недоступны, Grok считаю выключенным»;
   - drop `grokweb` from the tree's list;
   - keep `twitter`, with `CHANNEL_NOTES = {twitter: GROK_DISABLED_NOTE}` (the constant below);
   - `PROVIDERS_OFF = ['grok']`;
     `SOURCE_DROPPED = [{channel: 'grokweb', reason: 'no-access', detail: 'source resolve unavailable'}]`;
   - keep `codexweb` only if `command -v codex` succeeds — otherwise drop it too;
   - the remaining channels go as the tree proposed them.

   **`GROK_DISABLED_NOTE`** — the constant, pass it verbatim:

   ```
   GROK DISABLED by user source settings. Do NOT run ~/.grok/bin/grok, do NOT load
   mcp__grok-mcp__* or mcp__twitterapi-mcp__*. Skip every Grok section of the protocol; run ONLY
   the section 'TwitterAPI.io layer → Mode B keyword-only' via bash
   {PLUGIN_ROOT}/scripts/twitterapi.sh; if the REST layer fails (exit≠0, persistent 429) use
   brave_web_search with site:x.com as the second fallback. sourceQuality no higher than MEDIUM;
   say in findings that the semantic angle is missing.
   ```

   **Edge case.** Explicit "web" mode = `web,codexweb,grokweb`: with Grok off and the Codex quota
   failed only one channel is left → `.insufficient == true`, do not launch. The default set has
   no such hole: without Grok `web, codexweb, reddit, hackernews, substack` = 4 families out of 5
   and the sufficiency gate passes.

3. **Recon.** Make 1-2 calls of `mcp__plugin_jadlis-search_brave-search__brave_web_search`
   (Search tier: 50 req/s, parallel OK; `count: 5`): a broad overview of the topic + optionally one
   clarifying aspect. The goal is orientation (aspects, sub-topics, controversies), not data
   collection. Read-only.
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
   (`{PLUGIN_ROOT}/skills/research/references/language-layers.md` is the dictionary:
   個人開発, 独立开发者, 1인 개발자 …) — e.g. `{"ja": "個人開発 収益 報告 2026", "en": "indie developer revenue reports 2026"}`.
   Rule: a platform is searched in its own language; an English query on a Japanese platform
   returns translators and schools, not practitioners.

6. **Preparation.** Compute: `SESSION_ID = ${CLAUDE_SESSION_ID}` (empty in Bash — use
   `uuidgen | cut -c1-8` instead); `QUERY_SLUG` (Latin transliteration, ≤40, lowercase, hyphens);
   `QUERY_RU` (short Russian phrasing ≤25 chars); `DATE` = !`date +%Y-%m-%d` (already substituted
   when the skill loads, no Bash needed); `VAULT_PATH = ${user_config.VAULT_PATH}` — **if the value
   is empty or is left as the literal `${user_config.VAULT_PATH}` (e.g. during a local trial with
   `--plugin-dir`), use `~/Jadlis`**;
   `DATA_DIR = ${CLAUDE_PLUGIN_DATA}` (the same value step 2a passes as `--data-dir`) — **if it is
   empty or is left as the literal `${CLAUDE_PLUGIN_DATA}` (e.g. during a local trial with
   `--plugin-dir`), pass it anyway: the script ignores an empty/literal value and falls back to
   the computed path**;
   `WORK_DIR = {VAULT_PATH}/.full-research/{SESSION_ID}_{QUERY_SLUG}` — **always an ABSOLUTE path**
   (a relative one resolves from the cwd at the moment the agents are spawned: a `cd` of the main
   session before a resume "lost" files at status ok; this also concerns `resumeFromRunId` calls —
   pass the args in full with the same absolute workDir);
   `VAULT_RESEARCH_DIR = {VAULT_PATH}/Знания/Ресерчи`; `PLUGIN_ROOT = ${CLAUDE_PLUGIN_ROOT}`.

7. **Brief → launch gate.** One AskUserQuestion, in Russian, header «Запуск». The question
   restates the whole proposal so it reads without scrolling back: `REFINED_QUERY`, the channels
   that will run (`SELECTED_CHANNELS`, their number) and `LANGUAGES`, plus dropped channels with a
   short reason if there are any — e.g. «Запускаю полный ресёрч так? Формулировка: «…». Каналы (6):
   web, codexweb, reddit, twitter, hackernews, substack; grokweb выключен в настройках. Языки: ru.»
   Options, in this order:
   - «Запустить (рекомендую)» — start the run;
   - «Поправить формулировку» — take the change from the answer's note or «Other» text (none →
     ask one plain question), update `REFINED_QUERY` and `QUERY_RU`;
   - «Поправить каналы» — which channels to add or drop: a drop edits `SELECTED_CHANNELS`
     directly, an addition re-runs the step 2a resolve with the new list.
   Free text via «Other» is a correction too. After any correction apply it and ask the gate
   again. **Launch only after the user picks «Запустить»** — no Workflow call before the gate has
   returned that answer. Settle every value before the question (a platform searched in its own
   language — step 5): the launch uses exactly what the gate showed, and a change after the
   answer (language, channel, wording) means asking the gate again.

   **Launch sequence** — in the same turn as the answer; the other branches of step 0 reuse it:
   1. `mkdir -p "{WORK_DIR}" "{VAULT_RESEARCH_DIR}"`.
   2. Write the brief to `{WORK_DIR}/_brief.md` in this shape — it holds every Workflow arg:

      ```
      ## full-research brief
      REFINED_QUERY: …
      DECISION_CONTEXT: …
      SELECTED_CHANNELS: [web, codexweb, …]      # = resolve.channels; dropped: … (reason)
      CHANNEL_NOTES: {}                           # = resolve.notes — {channel: text}, verbatim
      PROVIDERS_OFF: []                           # = resolve.providers_off, e.g. [grok]
      SOURCE_DROPPED: []                          # = resolve.dropped — [{channel, reason, detail}]
      LANGUAGES: [ru]                             # + QUERIES per language if not ru/en
      QUERIES: {}
      SUBSTACK_HANDLES: []
      WORK_DIR: /abs/path/.full-research/<id>_<slug>
      QUERY_RU: …
      DATE: YYYY-MM-DD
      VAULT_PATH: /abs/path/to/vault              # step 6 value
      PLUGIN_ROOT: ${CLAUDE_PLUGIN_ROOT}

      ## Checklist
      - [ ] Phase B — Workflow launched (runId: …), result received
      - [ ] Phase C — vault note written (REPORT_PATH: …)
      - [ ] Summary to the user
      ```
      The plan-mode branch of step 0 puts the same block, without `## Checklist`, into the plan
      file, with the `EXEC:` line first under the heading.
   3. Say: «Запущен полный ресерч по {N} каналам: {SELECTED_CHANNELS}; языки: {LANGUAGES}.
      Ожидаю результаты...»
   4. Call Workflow (Phase B) and put the returned runId into the Phase B checklist line.

   **Context compaction or resume mid-run.** Re-read `{WORK_DIR}/_brief.md`: it holds every
   Workflow arg and the checklist; tick each line when its phase is done. A runId in the Phase B
   line means the run already exists — wait for its `<task-notification>` or resume it with
   `resumeFromRunId` and the same args; never launch a second run.

## Phase B — INVOKE

```
Workflow({
  scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/full-research-core.js",
  args: {
    refinedQuery: REFINED_QUERY,
    decisionContext: DECISION_CONTEXT,  // from the interview: which decision the user makes
    channels: SELECTED_CHANNELS,        // keys: web/codexweb/grokweb/reddit/twitter/hackernews/substack (+opt-in: yandex, youtube, telegram, ja, zh, ko, eu)
    channelNotes: CHANNEL_NOTES,        // resolve.notes — {channel: text}; the core injects them into the channel prompt
    providersOff: PROVIDERS_OFF,        // resolve.providers_off — e.g. ["grok"]: the core filters the channels and skips Codex escalation
    sourceDropped: SOURCE_DROPPED,      // resolve.dropped — [{channel, reason, detail}], returned back in sourceSettings
    languages: LANGUAGES,               // e.g. ["ru"] or ["ja","en"]; omitted → detected from the query
    queries: QUERIES,                   // {lang: native phrasing}; may be {}
    substackHandles: SUBSTACK_HANDLES,  // may be empty
    date: DATE,
    workDir: WORK_DIR,
    pluginRoot: PLUGIN_ROOT,            // ${CLAUDE_PLUGIN_ROOT} is NOT interpolated in JS — passed as a value
    vaultPath: VAULT_PATH
  }
})
```

Models inside the workflow: channels, verifiers and curator — Opus 5.5
(`jadlis-research:researcher-opus` / `jadlis-research:orchestrator-opus`; urlhealth runs at effort low);
analyst — **Opus 5.5 at effort xhigh** (`jadlis-research:synth-opus`) by default.
`fableBridge: true` in args → analyst on Fable 5.1 instead (`jadlis-research:synth-fable`,
effort high) — the opt-in while long-context retrieval of Opus 5.5 is unmeasured. Either way, an
analyst that returns null is retried ONCE on the other family (Opus → Fable, Fable → Opus).
Do NOT pass `aiModel`: the workflow derives the frontmatter value itself and reports the model
that actually wrote the report in `aiModelActual`.

The workflow (ledger schema v4) reads the channel protocols itself: the curator selects up to 16
claims with evidence prefixes (the code substitutes the spans); the snapshot gate lowers HIGH to
MEDIUM per citation (`no-snapshot` · `llm-mediated` — codexweb/grokweb/yandex and x.com by
constant · `short-snapshot` < 1 000 chars · `quote-not-found`); `urlhealth` checks the evidence
URLs and the quotes against the snapshots (`snapshotChars` in evidence); two verifiers vote
(CONFIRMED/CHALLENGED/OUTDATED/UNCHECKED), **one per macro-family** (schema v5, 2026-09-17):
verifier #1 challenges the claim in the SAME family it came from (a Reddit claim on Reddit, an HN
claim on HN, an X claim via TwitterAPI.io, a web claim via Brave), verifier #2 takes the other
family (web ↔ communities); each vote is recorded as `family:verdict` plus `searchedVia` (the
platform actually searched). Web and communities disagree (CONFIRMED vs CHALLENGED/OUTDATED) →
`FAMILY-SPLIT`: no Codex (a web tie-breaker would only side with the web), the lead family
follows the claim type (factual → web, experiential → communities), credibility no better than 3,
BOTH stories go to the report. A single exclusion against UNCHECKED → the third vote comes from
Codex (GPT-6 Astra, live search; cap 8 escalations; `codexModel: "gpt-5.6-sol"` in args —
rollback); an unconfirmed exclusion → `DISPUTED` (disputed, not part of the conclusions). Dropped claims are
**filtered** (not merely annotated with criticism), then the analyst writes the draft report to
`{WORK_DIR}/draft.md` (in Russian). Wait for the `<task-notification>` (then tick the Phase B line
of `{WORK_DIR}/_brief.md`) and use the object:
`{workDir, status, ledgerSchemaVersion, languages, channelsAnswered, channelStatus, failedChannels,
aiModelActual, evidenceHealth, urlhealthSummary, snapshotGate, escalationStats, reportPath, queryRu,
relatedCandidates, claimLedger, synthMeta, sourceSettings}`; `sourceSettings` =
`{providersOff, notes, dropped}` — what the source resolve decided, echoed back for Phase C; `ledgerSchemaVersion` = 5; every
ledger claim carries `votes` (`family:verdict`), `familyVotes`, `leadFamily`/`leadVerdict` (FAMILY-SPLIT only), `searchedVia`; `synthMeta.ledgerSummary` = `{total, confirmed,
confirmedSplit, challenged, outdated, unchecked, disputed, familySplit, escalated, escalationSkipped,
weakEvidence, evidenceless, ceilingCapped, credibilityMedian, claimsDroppedByCap}`; `snapshotGate` =
`{minChars, llmMediatedChannels, demotedTotal, byReason: {noSnapshot, shortSnapshot, llmMediated,
quoteNotFound}, byChannel, ceilingCapped}` — how many HIGH citations were lowered to MEDIUM and why
(`args.channelCeiling: {codexweb: "HIGH"}` — the explicit escape of a channel ceiling, no automation).
Progress — in `/workflows`. `escalationCap: N` in args changes the escalation cap (default 8; the
Codex quota is a shared pool with verif).

## Phase C — WRITE (vault contract, main session)

The vault write contract — `${CLAUDE_PLUGIN_ROOT}/shared/obsidian-write-contract.md`.

1. **Partial result.** If `status: "insufficient-sources"` (<2 channels) or
   `status: "synthesis-failed"` (the analyst returned null twice — no report was written) — report
   the error, show what was collected in `{WORK_DIR}`, write NOTHING to the vault, stop here.
   Otherwise continue.

2. **Read the draft:** the path from the workflow object's `reportPath` — normally
   `{WORK_DIR}/draft.md`, but the synthesiser occasionally saves under another name
   (a live run produced `synthesis.md`). Use `reportPath`, never the hardcoded name.

2a. **Draft post-check (deterministic).**
   - **Honest `ai_model`.** Compare the frontmatter `ai_model` with `aiModelActual` from the
     workflow object. They normally agree; a mismatch means the first analyst returned null and
     the retry on the other family wrote the report — fix the frontmatter line to
     `ai_model: "{aiModelActual}"` before writing to the vault.
   - **Canonical sections.** If `synthMeta.ledgerSummary.confirmed > 0`, check
     `grep -c '^### Проверенные факты$' draft`. No section → render it programmatically from
     `claimLedger` (claims with verdict=CONFIRMED: statement translated into Russian + «(N голосов)»
     + credibility badge + the first evidence URL) and insert it as a subsection at the end of
     «## 📚 Контекст и находки». The same for `disputed > 0` and `### Спорные факты` (claims with
     verdict=DISPUTED: statement + votes + `escalation.reasoning`), and for `familySplit > 0` and
     `### Веб и сообщества расходятся` (claims with verdict=FAMILY-SPLIT: statement + «Веб: …» /
     «Сообщества: …» from `evidence`/`urls` per vote + «Приоритет: {leadFamily} — claim {claimType}»).
   - **Ledger metrics in the frontmatter (H8).** Compare with `synthMeta.ledgerSummary` and fix
     deterministically (numbers, not strings): `ledger_schema: 5`,
     `claims_confirmed`, `claims_disputed`, `claims_family_split` (= familySplit), `claims_dropped` (= challenged + outdated),
     `claims_unchecked`, `votes_confirmed_2` (= confirmed − confirmedSplit),
     `votes_confirmed_1` (= confirmedSplit), `escalations` (= escalated),
     `credibility_median`; `languages` (= `languages` from the object). A missing field — add it
     before `gaps:`. This way the report can be re-evaluated without the wf log.

2b. **Short publish address.** Add `permalink: <slug>` to the draft frontmatter (before `gaps:`) unless
   it is already there: 2–4 lowercase English words joined by hyphens that name the topic
   (`spain-tie-name-change`), ASCII only, no date, no `research` prefix. Must be unique in the vault —
   `command grep -rIl "^permalink: <slug>$" "$VAULT_PATH"`; taken → add one distinguishing word. Obsidian
   Publish uses this property as the page URL, so a Cyrillic file name no longer turns into a long
   percent-encoded link.

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
   (Write — copy the draft with the section filled in), then tick the Phase C line of
   `{WORK_DIR}/_brief.md` with that path.

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
   Tick the last checklist line of `{WORK_DIR}/_brief.md` first, then write the summary.
   - The verdict for the decision from the interview (`DECISION_CONTEXT`): what to do / not to do —
     2-4 sentences from the main conclusion of the draft.
   - **Channel status (mandatory).** From `channelStatus`: if `failedChannels` is non-empty —
     list explicitly which SELECTED channels failed/degraded (LOW or no citations) and what that
     means for completeness (a run without part of the selected channels is not a full one).
     All channels ok → one line «все N каналов отработали».
     Then, from `sourceSettings.dropped`, the channels that never started — these are NOT
     failures of the run: `reason: disabled-by-settings` → one line «выключено в настройках:
     grokweb (Grok off)», with no suggestion to switch it back on; `reason: no-access` → «нет
     доступа: yandex (нет ключа YC_SEARCH_API_KEY)» with the reason from `detail` and a pointer:
     «источники и доступ — `/jadlis-research:research-settings`».
   - What verification dropped: from `claimLedger`/`synthMeta.droppedClaims` — which claims are
     CHALLENGED/OUTDATED and why. They **did not enter** the report (filtering, not appended criticism).
   - **Verification in one line** from `ledgerSummary`/`escalationStats`/`snapshotGate`: «проверено
     N claims (по голосу от веба и от сообществ): X подтверждено (Y одним голосом), F расхождений
     веб/сообщества (приоритет по типу claim), Z спорных (эскалаций в Codex: E, пропущено: S —
     причины), W отсеяно, U не проверено; evidence: weak K, без evidence L, потолок MEDIUM по
     снапшот-гейту M (причины из byReason); urlhealth: dead/fabrication».
     `evidenceHealth: "skipped"` → say the URL health was not checked.
   - Gaps (`synthMeta.gaps`): what the research did not cover.
   - Synthesis model: `aiModelActual` — the one that actually wrote the report (Opus 5.5 by
     default, Fable 5.1 with `fableBridge: true`, or the other family on the retry).
   - Report path: `REPORT_PATH` (vault, `Знания/Ресерчи`).
   - Working directory: `{WORK_DIR}/` (per-source files + draft — the full process).
   - Reminder: the report frontmatter has `verified: false` — an AI draft. After review the user
     sets `verified: true` by hand.
   - **Closing line «От тебя:» — only when unverified claims reached the report.** Trigger:
     `ledgerSummary.disputed > 0` or `ledgerSummary.familySplit > 0` (claims with verdict
     `DISPUTED` / `FAMILY-SPLIT` — the report carries them without a verified answer). The
     frontmatter `verified: false` alone is NOT a trigger: every report has it. CHALLENGED/OUTDATED
     are already filtered out and UNCHECKED never entered the report — they are not listed here.
     Then the summary ends with a separate line starting with `**От тебя:**` that names, in Russian,
     what the user checks or decides: per DISPUTED claim — the statement and what exactly to check
     (the number, the source, the version); per FAMILY-SPLIT claim — the choice between the two
     stories («веб говорит X, сообщества — Y: что ближе к твоему случаю»), flagging those that
     back a conclusion (`leadVerdict=CONFIRMED`). At most 3 items, the rest as «и ещё N — в
     разделах «Спорные факты» / «Веб и сообщества расходятся»». Both counters are 0 → no such line.

## Error handling

- The workflow returned `insufficient-sources` — show what was collected, do not write to the vault.
- The workflow returned `synthesis-failed` — the analyst returned null on both families (the first
  model and the retry on the other one). The material is in `{WORK_DIR}` but there is no report:
  show the working directory, do not write to the vault. A re-run of Phase B synthesises from the
  same material.
- The source-resolve script of step 2a failed (no JSON, exit ≠ 0, timeout) — fail-closed on Grok:
  warn «настройки источников недоступны, Grok считаю выключенным», drop `grokweb`, keep `twitter`
  with `GROK_DISABLED_NOTE`, `providersOff: ['grok']`, `codexweb` only if `command -v codex`
  succeeds. Never the old Grok-first behaviour.
- Channel `twitter` in Mode B (Grok off) returns `sourceQuality` ≤ MEDIUM **by design** — this is
  not a failure and is not reported as a degraded channel; the missing part is the semantic angle,
  which the channel itself states in its findings.
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
