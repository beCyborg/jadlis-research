export const meta = {
  name: 'full-research-core',
  description: 'Ядро full-research: N канальных исследователей → curator (evidence-префиксы) → urlhealth → per-claim верификация (2 линзы) → эскалация расхождений в Codex → analyst пишет отчёт в workDir. Vault-контракт — в скилле.',
  phases: [
    { title: 'Fan-out', detail: 'до 10 канальных агентов (web×3: brave/codex/grok + reddit/twitter/hn/substack + opt-in yandex/youtube/telegram) параллельно; evidence-пакеты (дословные quotes) + снапшоты' },
    { title: 'Verify', detail: 'curator (Opus 5) выделяет claims с evidence-префиксами → urlhealth (здоровье URL/цитат) → снапшот-гейт v4 → per-claim verifiers: линза-опровержение (Brave) + кросс-тип линза → расхождение голосов → третий голос Codex → CONFIRMED/CHALLENGED/OUTDATED/UNCHECKED/DISPUTED (schema v4)' },
    { title: 'Synthesize', detail: 'analyst (Fable 5.1, agentType) пишет отчёт (verified:false): три корзины (проверенные / спорные / отсеянные), блок «Веса» в методологии' },
  ],
}

// ── Parameters (the skill passes them after Phase A: recon + interview; defaults are for dry-run) ──
// args may arrive as a JSON string — normalise.
const A = (() => { try { return typeof args === 'string' ? JSON.parse(args) : (args || {}) } catch (e) { return {} } })()
const QUERY = A.refinedQuery || 'Compare local AI coding assistants in 2026: privacy vs capability'
const DECISION = A.decisionContext || ''
const DATE = A.date || 'DRYRUN-DATE'
const WORK_DIR = A.workDir || '.full-research/dryrun'
// ${CLAUDE_PLUGIN_ROOT} is NOT interpolated inside JS — the skill passes it as a value.
// The default only serves dry-run: without pluginRoot the agents cannot find the protocols.
const PLUGIN_ROOT = A.pluginRoot || '.'
const VAULT_PATH = A.vaultPath || ''
const SUBSTACK_HANDLES = Array.isArray(A.substackHandles) ? A.substackHandles : []
const VERIFIERS = 2
// schema v3: the curator emits up to CLAIM_HARD_CAP claims (sorted loadBearing desc, strength desc).
const CLAIM_HARD_CAP = 16
// Cap on Codex escalations per run (vote splits beyond the cap → exclusion on a single vote + flag 'cap').
const ESCALATION_CAP = Number.isFinite(A.escalationCap) ? A.escalationCap : 8
// Codex model for escalation (third vote). gpt-6-astra since 2026-09-05 (owner decision);
// rollback — args.codexModel: 'gpt-5.6-sol' (still in the CLI catalogue). Effort high explicitly
// (Astra default is medium), service_tier default explicitly (the global config could hand out
// priority ≈2.5× quota). The codexweb channel literals live in protocols/codex-web-protocol.md —
// the agent reads that file itself.
const CODEX_MODEL = A.codexModel || 'gpt-6-astra'
const CODEX_LABEL = A.codexModel ? `Codex/${A.codexModel}` : 'Codex/GPT-6 Astra'
// Worker: Opus 5 pinned with effort high through the researcher-opus subagent.
// The agent registry is cached at session start — if the subagent was created in the current
// session, the orchestrator may pass workerOpts: { model: 'opus' } as a fallback.
const WORKER_OPTS = A.workerOpts || { agentType: 'jadlis-research:researcher-opus' }
const w = extra => Object.assign({}, WORKER_OPTS, extra)
// Orchestrator roles (curator, analyst — heavy logic: claim selection, synthesis).
// curator ALWAYS goes through orchestrator-opus (Opus 5) — structural claim extraction is
// not intelligence-sensitive, there is no Fable edge here.
// analyst is the only place with a real Fable advantage (synthesis over 400–600K of context).
// It runs as an ordinary subagent: the headless bridge existed only to dodge our own
// CLAUDE_CODE_SUBAGENT_MODEL_FORCE, removed 2026-09-07. The two synth-* agents pin the model,
// effort high and the tool allow-list (Read, Write, Glob) — agent() has no allowedTools option.
// The argument name stays `fableBridge`: one vocabulary across all eight workflows.
const FABLE_SYNTH = A.fableBridge !== false
const SYNTH_AGENT = FABLE_SYNTH ? 'jadlis-research:synth-fable' : 'jadlis-research:synth-opus'
// ai_model of the report: printed from what actually ran, not from what the caller guessed.
const AI_MODEL = FABLE_SYNTH ? 'claude-fable-5-1' : 'claude-opus-5'
const AI_MODEL_RETRY = 'claude-opus-5'
const ORCH_OPTS = A.orchOpts || { agentType: 'jadlis-research:orchestrator-opus' }
const o = extra => Object.assign({}, ORCH_OPTS, extra)

// ── Language slot (Plan 2, tranche 2). languages[] = languages the channels must search in;
//    default = language of the query. queries = optional per-language query phrasings
//    { ru: '…', en: '…', ja: '…' } prepared by the skill during intake. ──
const langOf = q => {
  const s = String(q || '')
  const letters = [...s].filter(ch => /\p{L}/u.test(ch))
  if (!letters.length) return 'en'
  const n = letters.length
  const cnt = t => letters.filter(ch => (typeof t === 'function' ? t(ch) : t.test(ch))).length
  if (cnt(/\p{Script=Hiragana}|\p{Script=Katakana}/u) / n >= 0.05) return 'ja'
  if (cnt(/\p{Script=Hangul}/u) / n >= 0.2) return 'ko'
  if (cnt(/\p{Script=Han}/u) / n >= 0.2) {
    // kanji-only query: shinjitai (発 開 売 …) vs simplified (发 开 卖 …) markers decide
    const JA = '発開関円売収険験図気帰単実対続読応変沢済検権蔵労働価絵拡広鉱歳斎雑残糸児辞湿処叙将奨焼称証嬢縄畳争総伝仏体余与予', ZH = '发开关业员门这说时们个为无电东车书长马鸟见页贝龙齐齿产创办买卖过还进达运连远选边计认让设话语读调询导对应变济检权劳动价绘扩广矿岁杂残丝儿处叙将奖烧称证传佛体馀与预'
    return cnt(ch => JA.includes(ch)) > cnt(ch => ZH.includes(ch)) ? 'ja' : 'zh'
  }
  if (cnt(/\p{Script=Cyrillic}/u) / n >= 0.3) return 'ru'
  return 'en'
}
const LANGUAGES = (Array.isArray(A.languages) && A.languages.length) ? A.languages.map(l => String(l).toLowerCase()) : [langOf(QUERY)]
const QUERIES = (A.queries && typeof A.queries === 'object') ? A.queries : {}
const NON_DEFAULT_LANGS = LANGUAGES.filter(l => l !== 'ru' && l !== 'en')
const LANGUAGE_LAYERS = `${PLUGIN_ROOT}/skills/research/references/language-layers.md`


const PROTO_DIR = `${PLUGIN_ROOT}/skills/research/protocols`
const ALL_CHANNELS = {
  web: { source: 'Web (Brave Search)', prefix: 'w', protocol: `${PROTO_DIR}/web-protocol.md`, file: 'web.md' },
  codexweb: { source: `Web (${CODEX_LABEL})`, prefix: 'cx', protocol: `${PROTO_DIR}/codex-web-protocol.md`, file: 'web-codex.md' },
  grokweb: { source: 'Web (Grok)', prefix: 'gw', protocol: `${PROTO_DIR}/grok-web-protocol.md`, file: 'web-grok.md' },
  reddit: { source: 'Reddit', prefix: 'r', protocol: `${PROTO_DIR}/reddit-protocol.md`, file: 'reddit.md' },
  twitter: { source: 'Twitter/X', prefix: 'x', protocol: `${PROTO_DIR}/twitter-protocol.md`, file: 'twitter.md' },
  hackernews: { source: 'HackerNews', prefix: 'hn', protocol: `${PROTO_DIR}/hackernews-protocol.md`, file: 'hackernews.md' },
  substack: { source: 'Substack', prefix: 'ss', protocol: `${PROTO_DIR}/substack-protocol.md`, file: 'substack.md' },
  // opt-in channel for RU topics (paid: ~0.1-0.2 ₽/topic); not part of the default SELECTED set
  yandex: { source: 'Web (Yandex, Runet)', prefix: 'y', protocol: `${PROTO_DIR}/yandex-protocol.md`, file: 'web-yandex.md' },
  // opt-in channels (2026-08-15): enabled by the routing tree in SKILL.md, not part of the default set
  youtube: { source: 'YouTube', prefix: 'yt', protocol: `${PROTO_DIR}/youtube-protocol.md`, file: 'youtube.md' },
  telegram: { source: 'Telegram (public channels)', prefix: 'tg', protocol: `${PROTO_DIR}/telegram-protocol.md`, file: 'telegram.md' },
  // language layers (Plan 2, tranche 3): trigger-scoped, never in the default set; one shared feed fetcher
  ja: { source: 'Japan (Qiita / Hatena / Zenn / note)', prefix: 'ja', protocol: `${PROTO_DIR}/ja-protocol.md`, file: 'ja.md' },
  zh: { source: 'China (V2EX / Juejin / Zhihu)', prefix: 'zh', protocol: `${PROTO_DIR}/zh-protocol.md`, file: 'zh.md' },
  ko: { source: 'Korea (tistory / Velog / Disquiet)', prefix: 'ko', protocol: `${PROTO_DIR}/ko-protocol.md`, file: 'ko.md' },
  eu: { source: 'EU (DOU / Golem / heise / Xataka / Menéame / Wykop)', prefix: 'eu', protocol: `${PROTO_DIR}/eu-protocol.md`, file: 'eu.md' },
}
// Family = an independent TYPE of source. web/codexweb/grokweb are three engines over the same
// open web: their agreement is NOT independent triangulation. Language layers are their own
// families (regional communities), one per language.
const FAMILY = { web: 'web', codexweb: 'web', grokweb: 'web', yandex: 'web', reddit: 'reddit', twitter: 'twitter', hackernews: 'hn', substack: 'substack', youtube: 'youtube', telegram: 'telegram', ja: 'ja', zh: 'zh', ko: 'ko', eu: 'eu' }
const COMMUNITY = ['reddit', 'twitter', 'hackernews', 'substack', 'youtube', 'telegram', 'ja', 'zh', 'ko', 'eu']
// ── Snapshot gate (schema v4, 2026-09-05): per-citation relevance ceiling ──
// A snapshot shorter than MIN_SNAPSHOT_CHARS does not close the gate (stub/truncation, not content).
const MIN_SNAPSHOT_CHARS = 1000
// LLM-mediated channels: the output is a model synthesis, the page snapshot is written by the agent
// after the fact, and nothing can prove the quote came from the page rather than the retelling →
// MEDIUM ceiling by channel constant (the snapshot header is the agent's self-report, never a gate input).
// The only escape is explicit: args.channelCeiling = { codexweb: 'HIGH' } lifts the ceiling for a channel.
const LLM_MEDIATED_CHANNELS = new Set(['codexweb', 'grokweb', 'yandex'])
// x.com/twitter.com: Firecrawl returns AI-processed text, there is no verbatim page body.
const LLM_MEDIATED_HOSTS = /(^|\.)(x\.com|twitter\.com|mobile\.twitter\.com)$/i
const CHANNEL_CEILING = (A.channelCeiling && typeof A.channelCeiling === 'object') ? A.channelCeiling : {}
const hostOf = u => { try { return String(new URL(String(u || '')).hostname || '').toLowerCase() } catch (e) { return '' } }
const SELECTED = (Array.isArray(A.channels) && A.channels.length)
  ? A.channels.filter(c => ALL_CHANNELS[c])
  : ['web', 'codexweb', 'grokweb', 'reddit', 'twitter', 'hackernews', 'substack']

// ── Schemas ──
const CHANNEL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    source: { type: 'string' },
    findings: { type: 'array', items: { type: 'string' }, description: '3-5 key theses' },
    citations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          prefix: { type: 'string', description: 'e.g. [w1], [r3]' },
          url: { type: 'string' },
          relevance: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
          context: { type: 'string', description: 'English summary of what the source says' },
          quotes: { type: 'array', items: { type: 'string' }, description: 'evidence pack (schema v3): 1-3 VERBATIM spans of the source, ≤400 chars each, IN THE ORIGINAL LANGUAGE (never translate); empty array = no verbatim text (snippet/reconstruction)' },
          reliability: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E', 'F'], description: 'reliability of the SOURCE by the Admiralty scale (not plausibility of the information)' },
          reliabilityWhy: { type: 'string', description: 'one line: source type / author expertise / freshness / conflict of interest' },
        },
        required: ['prefix', 'url', 'relevance', 'context', 'quotes', 'reliability', 'reliabilityWhy'],
      },
    },
    counterarguments: { type: 'array', items: { type: 'string' } },
    sourceQuality: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
    fileWritten: { type: 'string' },
    snapshots: { type: 'array', items: { type: 'string' }, description: 'paths of the snapshots written to workDir/snapshots/ (empty = not a single HIGH source snapshotted — telemetry sees this)' },
    startedAt: { type: 'string', description: 'YYYY-MM-DD HH:MM:SS — before the first search' },
    finishedAt: { type: 'string', description: 'YYYY-MM-DD HH:MM:SS — after Write' },
  },
  required: ['source', 'findings', 'citations', 'counterarguments', 'sourceQuality', 'fileWritten', 'snapshots'],
}

const CURATOR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    claims: {
      type: 'array',
      description: `the strongest cross-channel claims (up to ${CLAIM_HARD_CAP}) for live verification`,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          statement: { type: 'string', description: 'checkable statement (atomic), in English' },
          channels: { type: 'array', items: { type: 'string' }, description: 'which channels support it (channel keys)' },
          strength: { type: 'string', enum: ['STRONG', 'MODERATE', 'WEAK'] },
          loadBearing: { type: 'boolean', description: 'true — the report conclusion/advice rests on this claim; false — background fact' },
          claimType: { type: 'string', enum: ['factual', 'experiential'], description: 'factual — checkable fact about the world (number, date, product property, event); experiential — generalisation of people\'s experience ("users complain about X", "in practice Y works like this")' },
          evidencePrefixes: { type: 'array', items: { type: 'string' }, description: 'ONLY citation prefixes from the channel files, e.g. ["w1","r3","hn2"] — no text; the orchestrator substitutes the spans from the channel files' },
        },
        required: ['id', 'statement', 'channels', 'strength', 'loadBearing', 'claimType', 'evidencePrefixes'],
      },
    },
  },
  required: ['claims'],
}

const URLHEALTH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['ok', 'partial', 'failed'] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          prefix: { type: 'string' },
          url: { type: 'string' },
          urlStatus: { type: 'string', enum: ['ok', 'blocked', 'dead', 'skipped'] },
          quoteStatus: { type: 'string', enum: ['matched', 'notFound', 'notChecked'] },
          fabricationSuspect: { type: 'boolean' },
          snapshotChars: { type: 'integer', description: 'length of the snapshot body in characters (0 — no snapshot / not read)' },
          snapshotExtractor: { type: 'string', description: 'value of the Extractor: header line of the snapshot (empty string — not given); telemetry only, never a gate input' },
        },
        required: ['prefix', 'url', 'urlStatus', 'quoteStatus', 'fabricationSuspect', 'snapshotChars', 'snapshotExtractor'],
      },
    },
    elapsedSec: { type: 'number' },
    note: { type: 'string' },
  },
  required: ['status', 'items', 'elapsedSec', 'note'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    claimId: { type: 'string' },
    verdict: { type: 'string', enum: ['CONFIRMED', 'CHALLENGED', 'OUTDATED', 'UNCHECKED'], description: 'UNCHECKED is an OPERATIONAL verdict: could not check (paywall / tool failure / source unavailable / call budget exhausted / found no confirmation). NOT evidential: absence of confirmation ≠ refutation' },
    credibility: { type: 'integer', enum: [1, 2, 3, 4, 5, 6], description: 'how well the claim is confirmed (Admiralty): 1 confirmed independently, 2 probably true, 3 possibly true, 4 doubtful, 5 improbable, 6 cannot be judged (always 6 for UNCHECKED)' },
    evidence: { type: 'string', description: 'what the counter-search found' },
    url: { type: 'string' },
    numberVerbatim: { type: ['string', 'null'], description: 'for numeric claims — the number/date/version VERBATIM from the source found (as written, no normalisation); null — claim not numeric or number not found' },
  },
  required: ['claimId', 'verdict', 'credibility', 'evidence', 'url', 'numberVerbatim'],
}

const ESCALATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    claimId: { type: 'string' },
    status: { type: 'string', enum: ['ok', 'no-binary', 'quota', 'timeout', 'invalid-output', 'no-live-search'], description: 'ok — Codex answered and ran a live search; anything else — the reason the third vote did not happen' },
    confirmsExclusion: { type: 'boolean', description: 'true — Codex confirms the claim should be excluded (refuted/outdated); false — exclusion not confirmed' },
    verdictSuggested: { type: 'string', enum: ['CONFIRMED', 'CHALLENGED', 'OUTDATED', 'UNCHECKED'] },
    reasoning: { type: 'string' },
    urls: { type: 'array', items: { type: 'string' } },
    liveSearchEvents: { type: 'integer', description: 'number of web_search events in the codex JSONL output' },
  },
  required: ['claimId', 'status', 'confirmsExclusion', 'verdictSuggested', 'reasoning', 'urls', 'liveSearchEvents'],
}

const ANALYST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reportPath: { type: 'string', description: 'path of the draft report in workDir' },
    queryRu: { type: 'string', description: 'short Russian phrasing of the topic (vault file name)' },
    mainConclusion: { type: 'string' },
    relatedCandidates: { type: 'array', items: { type: 'string' }, description: 'keywords/topics for the obsidian search of related notes (the skill runs it)' },
    droppedClaims: { type: 'array', items: { type: 'string' }, description: 'claims filtered out as CHALLENGED/OUTDATED' },
    disputedClaims: { type: 'array', items: { type: 'string' }, description: 'DISPUTED claims — moved to «Спорные факты», not part of the conclusions' },
    gaps: { type: 'array', items: { type: 'string' }, description: 'what the research did not cover (frontmatter + methodology callout)' },
  },
  required: ['reportPath', 'queryRu', 'mainConclusion', 'relatedCandidates', 'droppedClaims', 'disputedClaims', 'gaps'],
}

const TOOL_NOTE = 'IMPORTANT: do NOT use the built-in WebSearch/WebFetch (banned). Load the MCP tools you need through ToolSearch before calling them. Brave (Search tier): 50 req/s — parallel calls are fine. Firecrawl scrape: 1 req/s.'

// ── Language block shared by the channel prompts ──
function languageBlock(key) {
  const lines = [`LANGUAGES: ${LANGUAGES.join(', ')} (search each platform in ITS OWN language: site:zhihu.com → Chinese, site:wykop.pl → Polish, Brave for Korean forums → Korean; an English query on a non-English platform returns translators and course sellers, not practitioners).`]
  const per = LANGUAGES.map(l => QUERIES[l] ? `  ${l}: ${QUERIES[l]}` : null).filter(Boolean)
  if (per.length) lines.push(`QUERIES per language (use verbatim as the seed, expand with the platform's own terms):\n${per.join('\n')}`)
  if (NON_DEFAULT_LANGS.length && (FAMILY[key] === 'web' || NON_DEFAULT_LANGS.includes(key))) {
    lines.push(`MANDATORY before the first search: Read ${LANGUAGE_LAYERS} — the native-term dictionary (e.g. 個人開発, 独立开发者, 1인 개발자) and the platform map for ${NON_DEFAULT_LANGS.join(', ')}; a query on the wrong term kills the whole layer.`)
  }
  return lines.join('\n')
}

// ── Channel agent prompt (port of Phase 3 of SKILL.md) ──
function channelPrompt(key) {
  const c = ALL_CHANNELS[key]
  const handlesLine = (key === 'substack' && SUBSTACK_HANDLES.length)
    ? `\nSUBSTACK_HANDLES: ${SUBSTACK_HANDLES.join(', ')}\n(handles are provided — skip Layer 0 and use them)`
    : ''
  const decisionLine = DECISION ? `\nRESEARCH FOR A DECISION: ${DECISION}\n(priority — material that helps make exactly this decision)` : ''
  return `You are the ${c.source} researcher. Find as much information on the topic as possible.

QUERY: ${QUERY}${decisionLine}
DATE: ${DATE}${handlesLine}
${languageBlock(key)}

SEARCH PROTOCOL:
Read the file ${c.protocol} (Read tool) and follow it step by step, including the "Counterarguments" layer.

PLUGIN_ROOT = ${PLUGIN_ROOT}
Inside the protocol, paths are written as {PLUGIN_ROOT}/… — substitute the value above for the placeholder. Never send a literal \`{PLUGIN_ROOT}\` to a command.

${TOOL_NOTE}

RULES:
1. Follow the protocol step by step; on an MCP error — use the fallback from the protocol.
2. Collect at least 5-10 citations with URLs. Citation prefixes: [${c.prefix}1], [${c.prefix}2], ...
3. Give every citation a reliability — reliability of the SOURCE by the Admiralty scale (NOT plausibility of the information itself; the verifiers judge that):
   A — primary source: official docs, the vendor, first-hand data;
   B — established expert/practitioner with a track record, no conflict of interest;
   C — anonymous or little-known community member, but specifics from personal experience;
   D — weak source: retelling of someone else, no details;
   E — interested party: marketing, sales, affiliation;
   F — cannot be judged.
   reliabilityWhy — one line: source type / author and their expertise / date / bias signals.
4. Do NOT spawn sub-agents — do everything yourself. Write ALL output in ENGLISH (findings, context, counterarguments, the channel file) — EXCEPT the quotes field (see rule 6): the curator, 2×${CLAIM_HARD_CAP} verifiers and the analyst read these files, English tokenises ~1.5-2× cheaper than Cyrillic. Proper names, product names and numbers exactly as in the source.
5. SNAPSHOTS (schema v4, MANDATORY step): for the 3-5 MOST IMPORTANT sources (relevance HIGH) save the full extracted page text to ${WORK_DIR}/snapshots/${c.prefix}<N>.md (Write). FILE NAME = CITATION PREFIX (\`${c.prefix}3.md\`, not \`thread-42.md\`) — otherwise the orchestrator cannot link the snapshot to the citation. File header (first lines, then a \`---\` line and the full text): \`URL: <url>\`, \`Date: <YYYY-MM-DD>\`, \`Prefix: [${c.prefix}N]\`, \`Extractor: <defuddle|jina|exa-full|tavily|firecrawl|pdf-fetch|hn-fetch|substack-fetch|tg-preview|yt-transcript|feed-fetch|llm-mediated>\` (the ladder is in web-protocol.md Layer 3) — what really extracted the text (telemetry, be honest). This is the frozen evidence base for the verifiers — they read the same text, not different versions of the page. RULES: (a) a citation with relevance HIGH and NO snapshot is not allowed — could not get the full text (paywall/CAPTCHA/challenge) → do not write a snapshot, lower relevance to MEDIUM and mark "[no-snapshot: blocked]"; (b) a file shorter than ~${MIN_SNAPSHOT_CHARS} characters does NOT close the gate (snippet/stub/truncation is not content) — MEDIUM as well; (c) channels codexweb/grokweb/yandex have a MEDIUM ceiling regardless of the snapshot (the output is a model synthesis and you write the page snapshot after the fact; set HIGH only if you are sure the verifier will find the span in the snapshot, the gate will still lower it to MEDIUM — that is not an error). Return the written paths in the snapshots[] field (an empty array = an honest "none"). The orchestrator enforces the gate in code per citation: no-snapshot / llm-mediated / short-snapshot / quote-not-found → HIGH is lowered to MEDIUM; nothing is ever raised.
6. EVIDENCE PACK (schema v3): every citation has a quotes field — 1-3 VERBATIM fragments of the source text (≤400 chars each), IN THE ORIGINAL LANGUAGE — the one exception to "everything in English": the spans are matched against the snapshot and the primary source character by character, translation destroys their value. The English summary goes into context. No verbatim text (search-engine snippet, reconstruction, unreachable page) → quotes: [] — never invent.

TELEMETRY (mandatory):
BEFORE the first search run Bash \`date '+%Y-%m-%d %H:%M:%S'\` → this is startedAt; AFTER Write run it again → finishedAt. Put both strings into the file header (Started:/Finished:) and return them in the schema (startedAt/finishedAt).

SAVING:
With Write save the result to ${WORK_DIR}/${c.file} in this format:
# ${c.source} — results for "${QUERY}"
Started: {startedAt} / Finished: {finishedAt}
## Key findings
## Citations
### [${c.prefix}1] {description}
**Source:** {URL} / **Context:** {English summary} / **Relevance:** HIGH/MEDIUM/LOW / **Admiralty:** {A-F} — {reliabilityWhy}
**Quotes:** «{verbatim span 1}» · «{verbatim span 2}» (original language; none — "—")
## Counterarguments (found on ${c.source})
## Source assessment
(for every citation: Evidence type / Author / Date / Bias signals / Cites original)

After writing, return the structure (schema): source="${c.source}", findings[], citations[{prefix,url,relevance,context,quotes,reliability,reliabilityWhy}], counterarguments[], sourceQuality, fileWritten="${WORK_DIR}/${c.file}".
If the channel is unavailable after the fallbacks — return sourceQuality="LOW", empty citations and note it in findings.`
}

// ── Claim curator prompt ──
function curatorPrompt(files) {
  return `You are the curator of cross-channel verification. Read the channel results and select the STRONGEST claims for live checking.

QUERY: ${QUERY}
${DECISION ? `USER'S DECISION: ${DECISION}` : ''}

Channel files (Read each):
${files.map(f => `- ${f}`).join('\n')}

Task:
1. Read all files.
2. Select up to ${CLAIM_HARD_CAP} of the most important claims (priority to those repeated across channels OR load-bearing for the conclusions under the decision). The orchestrator keeps the first ${CLAIM_HARD_CAP} in "loadBearing → strength" order, so list the load-bearing claims first.
3. For each: statement (checkable statement), channels (who supports it — use EXACTLY the channel keys: web, codexweb, grokweb, yandex, reddit, twitter, hackernews, substack, youtube, telegram, ja, zh, ko, eu; NOT file names), strength, loadBearing, claimType, evidencePrefixes.
   SOURCE FAMILIES: web/codexweb/grokweb/yandex are ENGINES over one open web (Yandex is another index, but the same web) = ONE family 'web'; reddit, twitter, hackernews, substack, youtube, telegram and the language layers ja/zh/ko/eu are separate families. strength=STRONG ONLY with support from 2+ DIFFERENT families (e.g. web+reddit); agreement between web engines only (w/cx/gw/y) is NOT independence — MODERATE at most.
   claimType: factual — checkable fact about the world (number, date, version, product property, event, price); experiential — generalisation of people's lived experience ("in practice X breaks under Y", "users massively complain about Z"). For experiential claims, first-person specifics from communities are full testimony, not "opinion".
   evidencePrefixes: ONLY citation prefixes from the channel files (e.g. ["w1","r3","hn2"] — NO brackets and NO text). You do NOT return the span text — the orchestrator substitutes quotes from the channel files by prefix. An unknown prefix is dropped; a claim without a single real prefix is marked evidenceless and cannot be STRONG. At least one prefix per claim, better 2-4 from different channels.

4. ATOMICITY (schema v2): every statement is ONE checkable factual core WITHOUT a superlative/evaluative wrapper. Forbidden in a statement: "best/#1", "consensus", "unanimous", "bible/canon", ratings by hearsay. KEEP significant qualifiers (dates, versions, applicability conditions) — atomic does not mean truncated. Split a compound statement into separate claims or take only the load-bearing core. Write numbers/dates/versions in the statement as in the source (do not round).

Every claim is a concrete statement that can be checked by web search or in communities. Not a matter of taste. Write the statement IN ENGLISH (proper names/terms/numbers as in the source). Return strictly by the schema.`
}

// ── urlhealth (A2): one light agent runs the script over the evidence URLs of the selected claims ──
function urlhealthPrompt(items) {
  const inFile = `${WORK_DIR}/_urlhealth-in.json`
  const outFile = `${WORK_DIR}/_urlhealth.json`
  return `You are the technical executor of the urlhealth step. No role work — three steps, no reasoning:

1. With Write save to ${inFile} VERBATIM the JSON between the markers <<<IN and IN>>>.
2. ONE Bash call (timeout: 180000):
python3 "${PLUGIN_ROOT}/scripts/urlhealth.py" --in "${inFile}" --workdir "${WORK_DIR}" --deadline 90 --per-url 10 > "${outFile}" 2>"${WORK_DIR}/_urlhealth.err"; echo "EXIT=$?"
3. Read ${outFile} (Read) and return by the schema: status ("ok" if partial=false and there is no error field; "partial" if partial=true; "failed" if the file is empty/not JSON/has error), items — array {prefix,url,urlStatus,quoteStatus,fabricationSuspect,snapshotChars,snapshotExtractor} from .items (urlStatus not in ok|blocked|dead → "skipped"; quoteStatus not in the set → "notChecked"; fabricationSuspect missing → false; snapshotChars — integer from .snapshotChars, missing/not a number → 0; snapshotExtractor — string from .snapshotExtractor, missing/null → ""), elapsedSec from .elapsedSec (missing → 0), note — a short string (counter summary or the error text).
File missing or unparsable → status="failed", items=[], note with the reason. Do NOT fix the script, do NOT re-run requests by hand, do NOT spawn sub-agents.

<<<IN
${JSON.stringify(items)}
IN>>>`
}

// ── Verifier prompt (per claim; two different lenses: refutation via Brave and a cross-type
//    check through a counter-channel of ANOTHER source family) ──
const BRAVE_TOOLS = 'mcp__plugin_jadlis-search_brave-search__brave_web_search,mcp__plugin_jadlis-search_brave-search__brave_llm_context'
const HN_CMD = `\`${PLUGIN_ROOT}/scripts/hn-fetch.sh search "<query>" --tags story --limit 10\` and/or \`--tags comment\` (full comment texts right in the output; exit 3 = HN search unavailable → take Reddit)`
const REDDIT_CMD = `ToolSearch "select:mcp__plugin_jadlis-search_reddit__execute_operation" → execute_operation(operation_id="discover_subreddits", parameters={query,limit:5,min_confidence:0.4}) → execute_operation(operation_id="search_subreddit", parameters={subreddit_name,query,sort:"relevance",time_filter:"all"}) — do NOT call discover_operations/get_operation_schema`

function evidenceBlock(claim) {
  const ev = claim.evidence || []
  if (!ev.length) return 'EVIDENCE: the curator attached no real citation (evidenceless) — check the claim from scratch.'
  const snapInfo = e => e.snapshotPath ? ` (snapshot: ${e.snapshotPath}${Number.isFinite(e.snapshotChars) ? `, ${e.snapshotChars}B` : ''}, extractor:${e.snapshotExtractor || '?'})` : ''
  const ceilInfo = e => e.snapshotDemoted ? ` [ceiling:MEDIUM — ${e.snapshotDemoted}]` : ''
  return `EVIDENCE (verbatim spans from the channel sources — check THEM, not the retelling; the relevance of each citation has already passed the snapshot gate):
${ev.map(e => `- [${e.prefix}] ${e.url}${snapInfo(e)}${e.health ? ` [url:${e.health.urlStatus}, quote:${e.health.quoteStatus}${e.health.fabricationSuspect ? ', FABRICATION-SUSPECT' : ''}]` : ''}${ceilInfo(e)}
${(e.quotes || []).length ? e.quotes.map(q => `  «${q}»`).join('\n') : '  (no verbatim span — summary only: ' + String(e.context || '').slice(0, 300) + ')'}`).join('\n')}
FABRICATION-SUSPECT / url:dead / quote:notFound = the span is not confirmed by the snapshot or the source is dead — treat such a span as NOT evidence; url:blocked / quote:notChecked — neutral (access restricted, not the source's fault).
[ceiling:MEDIUM — <reason>] = the citation was lowered by the gate from HIGH to MEDIUM: no-snapshot (no full text), llm-mediated (channel codexweb/grokweb/yandex or x.com — model output/AI retelling, not the page body), short-snapshot (file < ${MIN_SNAPSHOT_CHARS} chars), quote-not-found (span not found in the snapshot). llm-mediated and short-snapshot are NOT fabrication but a channel limitation: the span may be true, yet it cannot be confirmed against the snapshot — find the primary source yourself.`
}

function verifyPrompt(claim, idx) {
  const chans = claim.channels || []
  const communityOrigin = chans.some(ch => COMMUNITY.includes(ch))
  const webOrigin = chans.some(ch => FAMILY[ch] === 'web')
  const experiential = claim.claimType === 'experiential'
  // Cross-community: a different community family than the claim's source channels.
  const fromHN = chans.includes('hackernews')
  const crossCommunity = fromHN
    ? `Reddit (a different family than HN): ${REDDIT_CMD}`
    : `HackerNews (Bash, no ToolSearch): ${HN_CMD}${chans.includes('reddit') ? '' : `; alternative — Reddit: ${REDDIT_CMD}`}`
  const lens = idx === 0
    ? `LENS "REFUTATION" (Brave): look for REFUTING evidence — counterarguments, contradictions, debunks. Queries like "<topic> problems", "<claim> debunked", "<topic> criticism".
TOOLS: ToolSearch "select:${BRAVE_TOOLS}" → 1-2 queries (llm_context for page content, web_search for coverage; parallel calls are fine).`
    : `LENS "CROSS-TYPE" — confirm or refute the claim with a source of ANOTHER TYPE (another family) than the claim's source channels:
${webOrigin && !communityOrigin
  ? `- The claim came from web engines → check it against PRACTITIONER COMMUNITIES. Preferably HackerNews (Bash, no ToolSearch): ${HN_CMD}. Alternative — Reddit via execute_operation DIRECTLY: ${REDDIT_CMD}.`
  : communityOrigin && !webOrigin
    ? `- The claim came from communities (W2, the order is MANDATORY): (1) FIRST cross-community — ${crossCommunity}: you look for INDEPENDENT testimony of other people (other accounts, another platform, another time); (2) THEN primary sources: ToolSearch "select:${BRAVE_TOOLS}" → 1 query like "<claim> official docs" / "<topic> changelog". ${experiential ? 'The claim is experiential: first person with specifics (Admiralty C — "X broke on my prod under Y") is FULL independent testimony; absence of a mention in the official docs does NOT refute people\'s experience.' : 'The claim is factual: people\'s experience supports, but the primary source decides.'}`
    : `- The claim is supported by both web and communities → check its CURRENCY against primary sources (official docs/changelog, "<topic> 2026") via ToolSearch "select:${BRAVE_TOOLS}".`}
BUDGET: ≤3 tool calls, load EXACTLY ONE tool set. FORBIDDEN: Grok CLI (~/.grok/bin/grok) and mcp__grok-mcp__x_search — too slow/expensive for verification; Yandex (yandex-search.sh) — paid, not used in verification; Reddit discover_operations/get_operation_schema — call execute_operation directly.`
  const numericBlock = claim.numeric ? `
NUMERIC CLAIM — normalisation rules (a difference in notation is NOT a substantive difference): "1 000" = "1000" = "1k"; "10 %" = "10%"; "$1.2B" = "1.2 billion USD"; rounding within ±2% — a match; different units — convert before comparing; a date in another format — the same date. CHALLENGED on a number ONLY if the number found differs IN SUBSTANCE (another order of magnitude, another year, another version). Return the number found VERBATIM in numberVerbatim (as written in the source).` : ''
  return `You are adversarial verifier #${idx + 1}. Check the claim through an INDEPENDENT live search. Do not trust the original research.

CLAIM: "${claim.statement}"
(source channels: ${chans.join(', ') || '—'}; declared strength: ${claim.strength}; type: ${claim.claimType || 'factual'}${claim.loadBearing ? '; LOAD-BEARING for the conclusions' : ''})

${evidenceBlock(claim)}

${lens}${numericBlock}

${TOOL_NOTE}
On InputValidationError — ToolSearch first, then repeat the call.

SNAPSHOTS: snapshot paths are given in EVIDENCE — read them BEFORE the live search (Read): these are the frozen full texts of the channel sources, the shared evidence base of all verifiers. If the claim has no snapshots — Glob "${WORK_DIR}/snapshots/*.md" and read the relevant ones.

Judge:
- COULD NOT check (paywall, tool failure, source unavailable, call budget exhausted before any signal) OR simply FOUND neither confirmation nor refutation? → UNCHECKED (credibility 6). ABSENCE OF CONFIRMATION ≠ REFUTATION: "not found on the web/in communities" is UNCHECKED, not CHALLENGED.
- Is the claim current or outdated? → if outdated (newer data supersedes it): OUTDATED.
- Are there weighty refutations/contradictions IN SUBSTANCE (a source found directly contradicts it)? → CHALLENGED.
- Confirmed independently, no refutations? → CONFIRMED.
- credibility (1-6): 1 — confirmed by an independent source of another type; 2 — probably true (logical, consistent, no direct independent confirmation); 3 — possibly true; 4 — doubtful; 5 — improbable; 6 — cannot be judged.

Return by the schema: claimId="${claim.id}", verdict (CONFIRMED/CHALLENGED/OUTDATED/UNCHECKED), credibility (1-6), evidence (what you found, in English; for UNCHECKED — what exactly failed and why), url (key verification source; for UNCHECKED — the unreachable URL or an empty string), numberVerbatim (the number verbatim or null).
Do NOT spawn sub-agents.`
}

// ── Vote-split escalation: third vote from Codex (CODEX_MODEL) with a live-search gate ──
function escalationPrompt(claim, votes) {
  const pf = `${WORK_DIR}/_codex-esc-${claim.id}-prompt.md`
  const jf = `${WORK_DIR}/_codex-esc-${claim.id}.jsonl`
  const lf = `${WORK_DIR}/_codex-esc-${claim.id}-last.md`
  const exclusionVote = votes.find(v => v.verdict === 'CHALLENGED' || v.verdict === 'OUTDATED')
  const rolePrompt = `You are a third, independent adversarial verifier (tie-breaker). Two verifiers disagreed about a claim from a multi-source research run. Use LIVE web search (mandatory: at least one search) and decide whether the claim should be EXCLUDED from the report.

CLAIM: "${claim.statement}"
Claim type: ${claim.claimType || 'factual'}; origin channels: ${(claim.channels || []).join(', ') || '-'}.

EVIDENCE SPANS from the original sources (verbatim, original language):
${(claim.evidence || []).map(e => `- [${e.prefix}] ${e.url}\n${(e.quotes || []).map(q => `  "${q}"`).join('\n') || '  (no verbatim span)'}`).join('\n') || '- (none)'}

VERIFIER VOTES:
${votes.map((v, i) => `- verifier ${i + 1}: ${v.verdict} (credibility ${v.credibility}) — ${String(v.evidence || '').slice(0, 600)}${v.url ? ` [${v.url}]` : ''}`).join('\n')}

ARGUMENT FOR EXCLUSION (from the ${exclusionVote ? exclusionVote.verdict : 'dissenting'} vote): ${exclusionVote ? String(exclusionVote.evidence || '').slice(0, 800) : '(none given)'}

Rules: absence of confirmation is NOT refutation (that is UNCHECKED). Numeric differences that are only formatting/rounding (±2%) are NOT a refutation. Confirm exclusion (CHALLENGED/OUTDATED) ONLY if you find a source that directly contradicts or supersedes the claim. Cite URLs.

Answer with EXACTLY one JSON object as the final message, no prose after it:
{"confirmsExclusion": true|false, "verdictSuggested": "CONFIRMED"|"CHALLENGED"|"OUTDATED"|"UNCHECKED", "reasoning": "<=600 chars", "urls": ["..."]}`
  return `You are a technical BRIDGE to the Codex CLI (third verification vote). Do NOT do the role work yourself. Exactly four steps:

1. With Write save to ${pf} VERBATIM the text between the markers <<<ROLE_PROMPT and ROLE_PROMPT>>>.

2. Check the binary: Bash \`command -v codex >/dev/null && echo HAVE || echo NONE\`. NONE → return status="no-binary" (other fields: confirmsExclusion=false, verdictSuggested="UNCHECKED", reasoning="codex binary missing", urls=[], liveSearchEvents=0) and stop.

3. ONE Bash call (parameter timeout: 300000; < /dev/null is mandatory):
codex exec -m ${CODEX_MODEL} -s read-only --skip-git-repo-check -c model_reasoning_effort="high" -c service_tier="default" -c 'tools.web_search={mode="live"}' --json -o "${lf}" "$(cat "${pf}")" < /dev/null > "${jf}" 2>"${WORK_DIR}/_codex-esc-${claim.id}.err"; echo "EXIT=$?"

4. Parsing:
   - EXIT≠0 and ${jf}/.err contains "usage limit" / "quota" / "rate limit" / 429 → status="quota". Bash timeout (call interrupted) → status="timeout".
   - Live-search gate: Bash \`grep -c '"web_search' "${jf}"\` → liveSearchEvents. 0 → status="no-live-search" (Codex answered from memory — such a vote does not count).
   - Final JSON: read ${lf} (Read); if the file is missing — the last line of ${jf} with item.type=="agent_message" (field .item.text). Extract the JSON object (the last {...} block). Unparsable → status="invalid-output".
   - All fine → status="ok", fields from the JSON. verdictSuggested outside the enum → "UNCHECKED".
Return strictly by the schema: claimId="${claim.id}", status, confirmsExclusion, verdictSuggested, reasoning, urls, liveSearchEvents. Do NOT spawn sub-agents, do NOT repeat the codex call (no retries — the quota is shared with /verif).

<<<ROLE_PROMPT
${rolePrompt}
ROLE_PROMPT>>>`
}

// ── Analyst prompt (decision-first report: conclusions and actions for the reader; process → callout/frontmatter).
//    Instructions are in English; the REPORT ITSELF is written in Russian — it becomes the vault note as is. ──
function analystPrompt(files, ledger, stats, aiModel) {
  return `You are the analyst. Read the channel results, cross-validate them and write the final report IN RUSSIAN in the DECISION-FIRST + CONTEXT format: on top — conclusions and advice for the decision (what the reader sees first); below — a separate section «📚 Контекст и находки» with the researched substance of the topic. The collapsed callout «Методология» takes ONLY the meta-process (how you searched, what was dropped), NOT the substantive context of the subject. IMPORTANT: claims with verdict CHALLENGED/OUTDATED go neither into the conclusions nor into the context — filter, do not append criticism. DISPUTED claims go into a separate subsection «Спорные факты» and are not part of the conclusions.

QUERY: ${QUERY}
${DECISION ? `USER'S DECISION (the whole report is built around it): ${DECISION}` : 'USER\'S DECISION: not given — deliver the verdict for the most likely decision behind the query.'}
DATE: ${DATE}

Channel files (Read each; a missing file = the channel was unavailable):
${files.map(f => `- ${f}`).join('\n')}

STYLE EXAMPLE (Read): ${PLUGIN_ROOT}/skills/research/examples/sample-report.md —
shows tone, density and layout. The binding contract is the format spec below; adapt structure and length to the topic, do not copy the example's skeleton literally.

CROSS-VERIFICATION LEDGER (live checking of claims; each has verdict, credibility 1-6, vote vector votes[], claimType, loadBearing, evidence spans, ceilingCapped — all evidence of the claim was lowered to MEDIUM by the snapshot gate, escalation when escalated). Statements are in English — translate them into Russian in the report, numbers verbatim:
${JSON.stringify(ledger.map(c => ({ id: c.id, statement: c.statement, channels: c.channels, strength: c.strength, claimType: c.claimType, loadBearing: c.loadBearing, verdict: c.verdict, votes: c.votes, voteCount: c.voteCount, credibility: c.credibility, evidence: c.verifierEvidence, urls: c.urls, evidenceRefs: (c.evidence || []).map(e => e.prefix), weakEvidence: !!c.weakEvidence, evidenceless: !!c.evidenceless, ceilingCapped: !!c.ceilingCapped, escalation: c.escalation ? { status: c.escalation.status, confirmsExclusion: c.escalation.confirmsExclusion, reasoning: c.escalation.reasoning } : null, escalationSkipped: c.escalationSkipped || null })), null, 2)}

LEDGER SUMMARY: ${JSON.stringify(stats)}

CROSS-VALIDATION (for selecting material; the process itself is NOT written into the report):
- Triangulation: is a thesis confirmed by DIFFERENT source types? (web+community=strong; two reddit posts=weak). Circular reporting: 2 sources on 1 original = 1 source.
- WEB FAMILY: the files web.md/web-codex.md/web-grok.md/web-yandex.md are ENGINES (Brave [w], Codex [cx], Grok [gw], Yandex [y]) over ONE open web. Deduplicate their findings by URL. Engine agreement = reinforcement WITHIN the web type, NOT independent triangulation (independence = web+community). A finding given by only ONE engine and confirmed by nobody else — reduced credibility (badge digit no better than 3) + a short note "только {движок}".
- Community consensus = strong ONLY when independent (different accounts/time, no incentives).
- WEIGHTS (schema v3): the weight of a statement is made of four axes — (1) independence: number of DIFFERENT source families (web, reddit, hn, twitter, substack, youtube, telegram, ja, zh, ko, eu); (2) source reliability: Admiralty A-F from the channel files; (3) claim type: for factual the primary source decides (web/docs is the priority family), for experiential the communities decide (first person with specifics, Admiralty C, is full testimony; the web only complements); (4) confirmation: credibility 1-6 from the ledger. Do not apply a global priority "social over web" or vice versa — the family priority follows the claim TYPE.
- Claims from the ledger: CONFIRMED → not only license verdicts in the conclusions but are RENDERED EXPLICITLY in the subsection «Проверенные факты» of the section «📚 Контекст и находки» (with evidence and a credibility badge) — this is the confirmed foundation, it must not be "dissolved" into the conclusions. The VOTE VECTOR is visible to the reader: every confirmed fact carries «(2 голоса)» when voteCount=2 or «(1 голос — split: второй верификатор не смог проверить)» when voteCount=1 — the reader must distinguish double from single confirmation. DISPUTED → subsection «Спорные факты» (votes split, the third vote did not confirm exclusion): statement + what the disagreement is + badge; not part of conclusions and advice. CHALLENGED/OUTDATED → NOT in conclusions and NOT in context, only a line in the methodology callout with the reason. UNCHECKED → NOT in the report; one line in the methodology callout: «не удалось проверить: N claims (причины кратко)». weakEvidence/evidenceless → badge no better than 3 even when CONFIRMED. ceilingCapped → badge no better than 3 even when CONFIRMED (all evidence of the claim is llm-mediated/short-snapshot/no-snapshot/quote-not-found: not fabrication but a channel limitation — the span is not confirmed against the page body); one line in the methodology callout: «потолок MEDIUM по снапшот-гейту: N claims».

CREDIBILITY BADGES: every link in the advice and in «Источники» has the form [w1·B2](URL): the letter A-F — source reliability (from the channel files, the Admiralty field), the digit 1-6 — how well the information is confirmed. YOU assign the digit by these rules: 1-2 ONLY with independent confirmation (CONFIRMED in the ledger or 2+ sources of different types); 3 — a single plausible source; 4-5 — doubtful/improbable; 6 — cannot be judged. The scales are independent: A6 and E1 both happen.

REPORT FORMAT (Obsidian Flavored Markdown, structure EXACTLY as in the reference), frontmatter AT THE VERY BEGINNING:
---
type: research
created: ${DATE}
ai_drafted: true
verified: false
ai_model: "${aiModel}"
tags: []
query: "{the original query; replace inner double quotes with «»}"
decision: "{the user's decision or empty}"
channels: [{keys of the selected channels; collapse the web engines (web/codexweb/grokweb) into a single "web"; yandex (if selected) — its own key}]
languages: [${LANGUAGES.map(l => `"${l}"`).join(', ')}]
ledger_schema: 4
claims_confirmed: ${stats.confirmed}
claims_disputed: ${stats.disputed}
claims_dropped: ${stats.challenged + stats.outdated}
claims_unchecked: ${stats.unchecked}
votes_confirmed_2: ${stats.confirmed - stats.confirmedSplit}
votes_confirmed_1: ${stats.confirmedSplit}
escalations: ${stats.escalated}
credibility_median: ${stats.credibilityMedian}
gaps: [{2-4 gap lines, in Russian}]
work_dir: "${WORK_DIR}"
---
(the numeric ledger fields — exactly these values; the orchestrator checks them against the summary and fixes them deterministically)

Sections as in the reference (all headings and text IN RUSSIAN):
1. # {Topic in short} + the line **Дата:** | **Источники:**
2. > [!abstract] Главный вывод — BLUF, 3-6 lines: the whole point of the research; the answer "what do I do with this" — in the first two sentences.
3. > [!success] Вердикт для твоего решения — a direct answer under the decision: «Делай X, не делай Y, при условии Z».
4. ## ✅ Делать / ❌ Не делать
5. ## Решения: принимать / не принимать
6. ## Как относиться / как не относиться
7. ## Учитывать / игнорировать
8. ## 📚 Контекст и находки — the EXPANDED substance of the topic (the essence of the subject, NOT the research process). Adaptive length: a simple topic — compact, a complex/unfamiliar one — detailed. Subsections as needed:
   - **Ландшафт темы**: what it is, how it works, key players/approaches/terms + the mechanisms of "why so".
   - **Факты и цифры**: concrete numbers, ranges, verbatim source quotes (TRANSLATED into Russian) — each with a badge link [pref·Badge](URL).
   - **Проверенные факты**: ledger claims with verdict=CONFIRMED — list them explicitly, with evidence and a credibility badge; this is the confirmed foundation of the conclusions. The subsection heading is EXACTLY \`### Проверенные факты\` (canonical, the post-check greps it; do NOT merge with «Факты и цифры»). No confirmed claims — skip the subsection.
   - **Спорные факты**: claims with verdict=DISPUTED — heading EXACTLY \`### Спорные факты\` (canonical); each line: statement, who found what (votes), why unresolved; badge no better than 4. No DISPUTED — skip the subsection.
   - **Разногласия и нюансы**: where sources/communities disagree, which camps, what is in question — do NOT average into a false consensus.
   Only material that passed cross-validation goes into this section; CHALLENGED/OUTDATED claims do NOT (they are a single line in the methodology callout).
9. ## Кому доверять в этой теме — a table: Источник | Надёжность (A-F) | Почему.
10. ## Источники — subsections per channel; the web engines — ONE subsection "### Web" (the engine is distinguishable by the prefix w/cx/gw/y, do not repeat URL duplicates between engines); each line: [префикс·Бейдж](URL) Title — one line in Russian about what it is.
11. ## Связанные заметки — an EMPTY placeholder section (the orchestrator adds the wikilinks).
12. > [!note]- Методология и проверка — ONE COLLAPSED callout ≤25 lines at the very end: channels and number of sources; checked K claims: X confirmed (Y of them by a single vote), Z disputed (escalated to the third vote: N), W dropped (the dropped list + reason: оспорено/устарело), could not check: U; the block **«Веса»** — 2-4 lines: the formula (families → independence; Admiralty A-F → source reliability; claimType → priority family; credibility 1-6 → confirmation) and which families contributed to each key conclusion (e.g. «вывод 1: web A + reddit C, factual → приоритет web»); gaps; sampling bias; data date; «полный процесс — в work_dir из frontmatter».

TEXT RULES:
- Sections 4-7: every piece of advice is a callout > [!tip] (делать/принимать/относиться/учитывать) or > [!failure] (не делать/не принимать/игнорировать). The callout title is a concrete action; the body is one line of "why" + badge links. 2-4 pieces of advice per section; nothing to say for a section — skip it entirely, do not invent.
- Plain Russian. Translate ALL quotes into Russian (do not duplicate the original — the link leads to the source).
- FORBIDDEN: narrating the PROCESS: sections Adversarial Review, Evidence Strength, "how the cross-validation was done", Research details, "All links" — their content is compressed into the methodology callout, the frontmatter and the badges. BUT the context of the SUBJECT (section «📚 Контекст и находки») is mandatory and NOT covered by the ban: only the meta-story of HOW you searched is forbidden, not the substance of the topic.
- Keep the verdict block (sections «делать/не делать» etc.) dense. Scale the section «📚 Контекст и находки» to the complexity of the topic — no hard limit, but no filler: every line carries a fact/number/quote, not generalities.
- Links ONLY in single brackets: [w1·B2](URL). ❌ NOT [[w1]](URL). Do NOT use wikilinks.

SAVING: with Write save the draft report to ${WORK_DIR}/report.md (NOT to the vault — the orchestrator writes to the vault).
After writing, return by the schema: reportPath="${WORK_DIR}/report.md", queryRu (a short Russian phrasing ≤25 chars for the file name), mainConclusion, relatedCandidates (3-6 keywords/topics for the obsidian search of related notes), droppedClaims (what was filtered as CHALLENGED/OUTDATED), disputedClaims (what was moved to «Спорные факты»), gaps (the same as in the frontmatter).
Do NOT spawn sub-agents, do NOT call skills, read only the channel files in ${WORK_DIR}, the snapshots and the reference.`
}

// ═══ Phase 1 — Fan-out ═══
phase('Fan-out')
log(`Запускаю ${SELECTED.length} канальных исследователей: ${SELECTED.join(', ')}; языки: ${LANGUAGES.join(', ')}`)

const channelResults = (await parallel(SELECTED.map(key => () =>
  agent(channelPrompt(key), w({ label: key, phase: 'Fan-out', schema: CHANNEL_SCHEMA }))
    .then(r => (r ? Object.assign({ channelKey: key }, r) : null))
))).filter(Boolean)

const files = channelResults.map(r => r.fileWritten).filter(Boolean)
// Channel success = non-LOW sourceQuality AND non-empty valid citations (with URLs).
// A failed channel returns LOW + empty citations — it counts for neither gates nor families.
const okChannel = r => r.sourceQuality !== 'LOW' && Array.isArray(r.citations) && r.citations.some(c => c && c.url)
const okResults = channelResults.filter(okChannel)

// Citation index by prefix: the curator returns only prefixes, JS substitutes the spans
// (the curator physically cannot invent a citation — only reference a non-existent one).
// Built BEFORE the gate (schema v4): the gate works per citation over the index. citationRefs —
// back-references to the channel citation objects (a separate map: the index entry is copied into
// claim.evidence → ledger → wf log, an object reference would produce duplicates).
const normPrefix = p => String(p || '').replace(/[\[\]\s]/g, '').toLowerCase()
const citationIndex = {}
const citationRefs = {}
for (const r of channelResults) {
  const snaps = (Array.isArray(r.snapshots) ? r.snapshots : []).filter(Boolean)
  for (const c of (r.citations || [])) {
    if (!c || !c.prefix) continue
    const p = normPrefix(c.prefix)
    const snap = snaps.find(s => normPrefix(String(s).split('/').pop().replace(/\.md$/i, '')) === p) || null
    if (!citationIndex[p]) {
      citationIndex[p] = { prefix: p, url: c.url, quotes: Array.isArray(c.quotes) ? c.quotes.filter(Boolean).map(q => String(q).slice(0, 400)) : [], context: c.context || '', reliability: c.reliability || 'F', relevance: c.relevance, channel: r.channelKey, snapshotPath: snap, snapshotDemoted: null }
      citationRefs[p] = c
    }
  }
}

// Snapshot gate (schema v4) — per citation, deterministic. The order of reasons is fixed, the first
// one wins: no-snapshot → llm-mediated. short-snapshot / quote-not-found come after urlhealth (they
// need file reads; the runner sandbox has no fs). Nothing is ever raised.
// relevance changes both in the index (→ claim evidence) and on the channel citation object (→ channelStatus).
const demote = (p, reason) => {
  const e = citationIndex[p]; const c = citationRefs[p]
  if (!e || e.snapshotDemoted) return false
  e.relevance = 'MEDIUM'; e.snapshotDemoted = reason
  if (c) { c.relevance = 'MEDIUM'; c.snapshotDemoted = reason }
  return true
}
const REASON_KEY = { 'no-snapshot': 'noSnapshot', 'short-snapshot': 'shortSnapshot', 'llm-mediated': 'llmMediated', 'quote-not-found': 'quoteNotFound' }
const demotedBy = {}   // channel → { noSnapshot, shortSnapshot, llmMediated, quoteNotFound }
const noteDemotion = (channel, reason) => {
  const d = demotedBy[channel] || (demotedBy[channel] = { noSnapshot: 0, shortSnapshot: 0, llmMediated: 0, quoteNotFound: 0 })
  d[REASON_KEY[reason]]++
}
const channelCeiling = k => (CHANNEL_CEILING[k] === 'HIGH') ? 'HIGH' : (LLM_MEDIATED_CHANNELS.has(k) ? 'MEDIUM' : 'HIGH')
for (const p of Object.keys(citationIndex)) {
  const e = citationIndex[p]
  if (e.relevance !== 'HIGH') continue
  const reason = !e.snapshotPath ? 'no-snapshot'
    : (channelCeiling(e.channel) === 'MEDIUM' || LLM_MEDIATED_HOSTS.test(hostOf(e.url))) ? 'llm-mediated'
    : null
  if (reason && demote(p, reason)) noteDemotion(e.channel, reason)
}
if (Object.keys(demotedBy).length) log(`⚠ Снапшот-гейт (v4): HIGH→MEDIUM: ${Object.entries(demotedBy).map(([k, d]) => `${k}(${Object.entries(d).filter(([, n]) => n).map(([r, n]) => `${r} ${n}`).join(', ')})`).join('; ')}`)

const sumDemoted = d => d ? Object.values(d).reduce((a, b) => a + b, 0) : 0
const channelStatus = SELECTED.map(k => {
  const r = channelResults.find(x => x.channelKey === k)
  const cits = r ? (r.citations || []) : []
  return { channel: k, answered: !!r, ok: r ? okChannel(r) : false, sourceQuality: r ? r.sourceQuality : null, citations: cits.length, snapshots: r ? (r.snapshots || []).length : 0, highCitations: cits.filter(c => c && c.relevance === 'HIGH').length, quotedCitations: cits.filter(c => c && Array.isArray(c.quotes) && c.quotes.length).length, snapshotDemoted: sumDemoted(demotedBy[k]), snapshotDemotedBy: demotedBy[k] || { noSnapshot: 0, shortSnapshot: 0, llmMediated: 0, quoteNotFound: 0 }, ceiling: channelCeiling(k), snapshotBytesMedian: null }
})
const failedChannels = channelStatus.filter(s => !s.ok).map(s => s.channel)
const answeredFamilies = [...new Set(okResults.map(r => FAMILY[r.channelKey]))]
const selectedFamilies = [...new Set(SELECTED.map(k => FAMILY[k]))]
log(`Каналов успешно: ${okResults.length}/${SELECTED.length} (упали/деградировали: ${failedChannels.join(', ') || 'нет'}); семей источников: ${answeredFamilies.length}/${selectedFamilies.length}`)

// Gate: web/codexweb/grokweb are one family (the open web). If ≥2 families were selected but only
// one succeeded, there will be no triangulation. A deliberate web-only run (1 family) is fine.
if (okResults.length < 2 || (selectedFamilies.length >= 2 && answeredFamilies.length < 2)) {
  log(`Недостаточно независимых источников (успешных каналов: ${okResults.length}, семей: ${answeredFamilies.length}) — отдаю что есть, без синтеза.`)
  return { workDir: WORK_DIR, status: 'insufficient-sources', ledgerSchemaVersion: 4, languages: LANGUAGES, channelsAnswered: channelResults.length, channelStatus, failedChannels, answeredFamilies, files, channelResults, claimLedger: [] }
}

// ═══ Phase 2 — Verify (per-claim live counter-search) ═══
phase('Verify')

// Resilience to a curator failure (network drop / quota limit / empty answer): without this gate
// null.claims crashed the WHOLE run after a successful fan-out (incident 2026-09-01).
// One retry, then degradation: synthesis proceeds with an empty ledger, the report is still written.
let curated = await agent(curatorPrompt(files), o({ label: 'curator', phase: 'Verify', schema: CURATOR_SCHEMA }))
if (!curated || !Array.isArray(curated.claims) || !curated.claims.length) {
  log('Curator не вернул claims — один повтор.')
  curated = await agent(curatorPrompt(files), o({ label: 'curator-retry', phase: 'Verify', schema: CURATOR_SCHEMA }))
}
if (!curated || !Array.isArray(curated.claims)) {
  log('⚠ Curator недоступен после повтора — иду в синтез с ПУСТЫМ ledger (claims не верифицированы).')
  curated = { claims: [] }
}

const STRENGTH_RANK = { STRONG: 3, MODERATE: 2, WEAK: 1 }
const NUMERIC_RE = /\d/
const allClaims = curated.claims.map((c, i) => {
  const prefixes = Array.isArray(c.evidencePrefixes) ? c.evidencePrefixes.map(normPrefix).filter(Boolean) : []
  const evidence = []; const evidenceOrphans = []
  for (const p of [...new Set(prefixes)]) (citationIndex[p] ? evidence : evidenceOrphans).push(citationIndex[p] ? { ...citationIndex[p] } : p)
  const evidenceless = evidence.length === 0
  let strength = c.strength || 'WEAK'
  if (evidenceless && strength === 'STRONG') strength = 'MODERATE'
  return { ...c, id: c.id || `c${i + 1}`, strength, loadBearing: !!c.loadBearing, claimType: c.claimType === 'experiential' ? 'experiential' : 'factual', numeric: NUMERIC_RE.test(String(c.statement || '')), evidence, evidenceOrphans, evidenceless }
})
allClaims.sort((a, b) => (Number(b.loadBearing) - Number(a.loadBearing)) || ((STRENGTH_RANK[b.strength] || 0) - (STRENGTH_RANK[a.strength] || 0)))
const claims = allClaims.slice(0, CLAIM_HARD_CAP)
const claimsDroppedByCap = allClaims.length - claims.length
const orphanTotal = claims.reduce((n, c) => n + c.evidenceOrphans.length, 0)
log(`Куратор выделил ${allClaims.length} claims → на live-проверку ${claims.length} (кап ${CLAIM_HARD_CAP}, отброшено ${claimsDroppedByCap}); несущих: ${claims.filter(c => c.loadBearing).length}, experiential: ${claims.filter(c => c.claimType === 'experiential').length}, без evidence: ${claims.filter(c => c.evidenceless).length}, неизвестных префиксов: ${orphanTotal}`)

// ── urlhealth (A2): only the evidence URLs of the selected claims; a failure of the step does not fail the run ──
let evidenceHealth = 'skipped'
let urlhealthSummary = null
try {
  const seen = new Set()
  const items = []
  for (const c of claims) for (const e of c.evidence) {
    if (!e.url || seen.has(e.prefix)) continue
    seen.add(e.prefix)
    items.push({ prefix: e.prefix, url: e.url, quote: (e.quotes || [])[0] || '', snapshotPath: e.snapshotPath })
  }
  if (items.length) {
    const uh = await agent(urlhealthPrompt(items), w({ label: 'urlhealth', phase: 'Verify', schema: URLHEALTH_SCHEMA }))
    if (uh && Array.isArray(uh.items) && uh.status !== 'failed') {
      const byPrefix = {}
      for (const it of uh.items) byPrefix[normPrefix(it.prefix)] = it
      const counts = { ok: 0, blocked: 0, dead: 0, skipped: 0, matched: 0, notFound: 0, notChecked: 0, fabricationSuspect: 0 }
      for (const it of uh.items) { counts[it.urlStatus] = (counts[it.urlStatus] || 0) + 1; counts[it.quoteStatus] = (counts[it.quoteStatus] || 0) + 1; if (it.fabricationSuspect) counts.fabricationSuspect++ }
      // Policy: dead / fabricationSuspect / notFound → span weak; blocked / notChecked NEVER demote.
      // Snapshot gate v4, second stage (needs file reads): quote notFound → 'quote-not-found',
      // snapshot body < MIN_SNAPSHOT_CHARS → 'short-snapshot'. The new reasons do NOT enter e.weak
      // (otherwise all of codexweb would become "weak evidence" and drag strength) — instead the
      // aggregate c.ceilingCapped for the analyst (credibility badge ≤3).
      const snapCharsByChannel = {}
      for (const c of claims) {
        for (const e of c.evidence) {
          const h = byPrefix[e.prefix]
          if (!h) continue
          const chars = Number.isFinite(h.snapshotChars) ? h.snapshotChars : 0
          e.health = { urlStatus: h.urlStatus, quoteStatus: h.quoteStatus, fabricationSuspect: !!h.fabricationSuspect }
          e.snapshotChars = chars
          e.snapshotExtractor = h.snapshotExtractor ? String(h.snapshotExtractor) : null
          e.weak = h.urlStatus === 'dead' || !!h.fabricationSuspect || h.quoteStatus === 'notFound'
          if (chars > 0) (snapCharsByChannel[e.channel] || (snapCharsByChannel[e.channel] = [])).push(chars)
          // Stage 2 of the gate: the index may already have demoted the citation (no-snapshot/llm-mediated) — then the first reason stays.
          const reason = h.quoteStatus === 'notFound' ? 'quote-not-found'
            : (e.snapshotPath && chars > 0 && chars < MIN_SNAPSHOT_CHARS) ? 'short-snapshot'
            : null
          if (reason && (citationIndex[e.prefix] ? citationIndex[e.prefix].relevance === 'HIGH' : e.relevance === 'HIGH')) {
            if (demote(e.prefix, reason)) noteDemotion(e.channel, reason)
          }
          if (citationIndex[e.prefix] && citationIndex[e.prefix].snapshotDemoted) { e.relevance = 'MEDIUM'; e.snapshotDemoted = citationIndex[e.prefix].snapshotDemoted }
        }
        const checked = c.evidence.filter(e => e.health)
        c.weakEvidence = checked.length > 0 && checked.every(e => e.weak)
        if (c.weakEvidence && c.strength === 'STRONG') { c.strength = 'MODERATE'; c.strengthDemoted = 'weak-evidence' }
        c.ceilingCapped = c.evidence.length > 0 && c.evidence.every(e => !!e.snapshotDemoted)
      }
      // channelStatus is built before the early return — patch it after urlhealth.
      for (const st of channelStatus) {
        const cr = channelResults.find(x => x.channelKey === st.channel)
        if (cr) st.highCitations = (cr.citations || []).filter(c => c && c.relevance === 'HIGH').length
        st.snapshotDemoted = sumDemoted(demotedBy[st.channel])
        st.snapshotDemotedBy = demotedBy[st.channel] || st.snapshotDemotedBy
        const v = (snapCharsByChannel[st.channel] || []).slice().sort((a, b) => a - b)
        st.snapshotBytesMedian = v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : Math.round((v[v.length / 2 - 1] + v[v.length / 2]) / 2)) : null
      }
      evidenceHealth = uh.status
      urlhealthSummary = { ...counts, items: uh.items.length, elapsedSec: uh.elapsedSec, note: uh.note }
      log(`urlhealth (${uh.status}, ${uh.elapsedSec}s): url ok=${counts.ok} blocked=${counts.blocked} dead=${counts.dead} skipped=${counts.skipped}; quote matched=${counts.matched} notFound=${counts.notFound} notChecked=${counts.notChecked}; fabricationSuspect=${counts.fabricationSuspect}; claims weakEvidence=${claims.filter(c => c.weakEvidence).length}, ceilingCapped=${claims.filter(c => c.ceilingCapped).length}`)
    } else {
      log(`⚠ urlhealth не дал результата (${uh && uh.note ? uh.note : 'нет ответа'}) — шаг пропущен.`)
    }
  } else {
    log('urlhealth: у выделенных claims нет evidence-URL — шаг пропущен.')
  }
} catch (e) {
  log(`⚠ urlhealth упал (${e && e.message ? e.message : e}) — шаг пропущен, прогон продолжается.`)
}

// ── Verifier votes ──
const voted = (await parallel(claims.map(c => () =>
  parallel(Array.from({ length: VERIFIERS }, (_, i) => () =>
    agent(verifyPrompt(c, i), w({ label: `verify:${c.id}#${i + 1}`, phase: 'Verify', schema: VERIFY_SCHEMA }))
  )).then(votes => ({ claim: c, votes: votes.filter(Boolean) }))
))).filter(Boolean)

// ── Vote aggregation (schema v3) — truth table ──
//   CONFIRMED+CONFIRMED → CONFIRMED; CONFIRMED+UNCHECKED → CONFIRMED (1 vote, split);
//   agreed exclusion (CHALLENGED/OUTDATED × CHALLENGED/OUTDATED) → exclusion without Codex;
//   UNCHECKED+UNCHECKED → UNCHECKED; a split (CONFIRMED vs CHALLENGED/OUTDATED,
//   CHALLENGED/OUTDATED vs UNCHECKED) → third vote from Codex (cap ESCALATION_CAP).
const EXCL = v => v === 'CHALLENGED' || v === 'OUTDATED'
const pickExclusion = verdicts => verdicts.includes('OUTDATED') ? 'OUTDATED' : 'CHALLENGED'
function aggregate(c, v) {
  const all = v.map(x => x.verdict)
  const real = v.filter(x => x.verdict !== 'UNCHECKED')
  const verdicts = real.map(x => x.verdict)
  let verdict, needsEscalation = false
  if (!v.length) verdict = 'UNVERIFIED'
  else if (!real.length) verdict = 'UNCHECKED'
  else if (verdicts.every(x => x === 'CONFIRMED')) verdict = 'CONFIRMED'
  else if (verdicts.every(EXCL) && real.length >= 2) verdict = pickExclusion(verdicts)
  else { verdict = pickExclusion(verdicts); needsEscalation = true } // CONFIRMED vs EXCL, or a single EXCL with UNCHECKED
  // confirmation — conservatively over the SUBSTANTIVE votes (UNCHECKED does not pull towards 6)
  const credibility = real.length ? Math.max(...real.map(x => x.credibility || 6)) : 6
  return { ...c, verdict, votes: all, voteCount: real.length, credibility, verifierEvidence: v.map(x => x.evidence), urls: v.map(x => x.url), numbersVerbatim: v.map(x => x.numberVerbatim || null), rawVotes: v, needsEscalation }
}
let claimLedger = voted.map(({ claim, votes }) => aggregate(claim, votes))

const escalationCandidates = claimLedger.filter(c => c.needsEscalation)
escalationCandidates.sort((a, b) => Number(b.loadBearing) - Number(a.loadBearing))
const toEscalate = escalationCandidates.slice(0, ESCALATION_CAP)
escalationCandidates.slice(ESCALATION_CAP).forEach(c => { c.escalationSkipped = 'cap' })
log(`Расхождений голосов: ${escalationCandidates.length}; эскалирую в Codex: ${toEscalate.length} (кап ${ESCALATION_CAP})`)

const escalationStats = { candidates: escalationCandidates.length, escalated: 0, confirmedExclusion: 0, disputed: 0, skipped: {}, cap: ESCALATION_CAP }
if (toEscalate.length) {
  const results = await parallel(toEscalate.map(c => async () => {
    try {
      return await agent(escalationPrompt(c, c.rawVotes), w({ label: `escalate:${c.id}`, phase: 'Verify', schema: ESCALATION_SCHEMA }))
    } catch (e) {
      // `budget`/failure throws — without the catch the claim would vanish from the ledger together with the paid votes
      return { claimId: c.id, status: /budget/i.test(String(e && e.message)) ? 'budget' : 'timeout', confirmsExclusion: false, verdictSuggested: 'UNCHECKED', reasoning: String(e && e.message || e), urls: [], liveSearchEvents: 0 }
    }
  }))
  toEscalate.forEach((c, i) => {
    const r = results[i]
    if (!r || r.status !== 'ok') {
      c.escalationSkipped = (r && r.status) || 'invalid-output'
      c.escalation = r || null
      return // exclusion on a single vote as in v2 + flag
    }
    escalationStats.escalated++
    c.escalation = r
    c.votes = [...c.votes, `codex:${r.verdictSuggested}`]
    if (r.confirmsExclusion) {
      c.verdict = r.verdictSuggested === 'OUTDATED' || c.verdict === 'OUTDATED' ? 'OUTDATED' : 'CHALLENGED'
      escalationStats.confirmedExclusion++
    } else {
      // A JS aggregate, NOT a verifier enum: the votes split, exclusion not confirmed.
      c.verdict = 'DISPUTED'
      c.credibility = Math.max(4, c.credibility || 4)
      escalationStats.disputed++
    }
  })
}
for (const c of claimLedger) {
  if (c.escalationSkipped) escalationStats.skipped[c.escalationSkipped] = (escalationStats.skipped[c.escalationSkipped] || 0) + 1
  delete c.needsEscalation
}

const count = v => claimLedger.filter(c => c.verdict === v).length
const confirmed = count('CONFIRMED')
const challenged = count('CHALLENGED')
const outdated = count('OUTDATED')
const unchecked = count('UNCHECKED')
const disputed = count('DISPUTED')
const confirmedSplit = claimLedger.filter(c => c.verdict === 'CONFIRMED' && c.voteCount === 1).length
const weakEvidence = claimLedger.filter(c => c.weakEvidence).length
const evidencelessN = claimLedger.filter(c => c.evidenceless).length
const credVals = claimLedger.filter(c => c.verdict !== 'UNCHECKED' && c.verdict !== 'UNVERIFIED').map(c => c.credibility).sort((a, b) => a - b)
const credibilityMedian = credVals.length ? (credVals.length % 2 ? credVals[(credVals.length - 1) / 2] : (credVals[credVals.length / 2 - 1] + credVals[credVals.length / 2]) / 2) : null
const ceilingCappedN = claimLedger.filter(c => c.ceilingCapped).length
const ledgerSummary = { total: claimLedger.length, confirmed, confirmedSplit, challenged, outdated, unchecked, disputed, escalated: escalationStats.escalated, escalationSkipped: Object.values(escalationStats.skipped).reduce((a, b) => a + b, 0), weakEvidence, evidenceless: evidencelessN, ceilingCapped: ceilingCappedN, credibilityMedian, claimsDroppedByCap }
log(`Ledger v4: CONFIRMED=${confirmed} (split: ${confirmedSplit}), DISPUTED=${disputed}, CHALLENGED=${challenged}, OUTDATED=${outdated}, UNCHECKED=${unchecked}; эскалаций ${escalationStats.escalated}, пропущено ${ledgerSummary.escalationSkipped}; weakEvidence=${weakEvidence}; ceilingCapped=${ceilingCappedN}; медиана credibility=${credibilityMedian}`)

// ═══ Phase 3 — Synthesize ═══
phase('Synthesize')

// Options are assembled explicitly, NOT through o()/w(): a caller-supplied orchOpts.model would
// survive the merge and beat the agent frontmatter (per-invocation model wins).
const synthOpts = (label, agentType) => ({ label, phase: 'Synthesize', schema: ANALYST_SCHEMA, agentType })

// Ledger out — without raw votes (rawVotes duplicate evidence/urls)
const ledgerOut = claimLedger.map(({ rawVotes, ...c }) => c)

let report = await agent(analystPrompt(files, claimLedger, ledgerSummary, AI_MODEL),
  synthOpts(FABLE_SYNTH ? 'analyst→fable' : 'analyst', SYNTH_AGENT))

// One retry on Opus 5 — only on the Fable branch: with fableBridge:false the first call was already
// Opus, and a repeat would just re-run what a human may have skipped on purpose.
let synthFellBack = false
if (!report && FABLE_SYNTH) {
  log('analyst (Fable) вернул null — одна попытка на Opus 5.')
  report = await agent(analystPrompt(files, claimLedger, ledgerSummary, AI_MODEL_RETRY),
    synthOpts('analyst→opus-retry', 'jadlis-research:synth-opus'))
  synthFellBack = true
}
if (!report) {
  log('Синтез не удался дважды. Материалы собраны, отчёт не написан.')
  return { workDir: WORK_DIR, status: 'synthesis-failed', claimLedger: ledgerOut, synthMeta: { ledgerSummary } }
}
const aiModelActual = (FABLE_SYNTH && !synthFellBack) ? 'claude-fable-5-1' : 'claude-opus-5'

return {
  workDir: WORK_DIR,
  status: 'ok',
  // Version of the ledger/verdict schema: bump when VERIFY_SCHEMA/aggregation changes —
  // telemetry segments the confirmed trends by this version (compare only within one).
  // v2 (2026-08-15): UNCHECKED + vote vector + atomic curator + snapshots.
  // v3 (2026-09-01): curator evidence prefixes + urlhealth + W2 lens + Codex escalation +
  //   DISPUTED + numberVerbatim + 16-claim cap + snapshot gate in code.
  // v4 (2026-09-05): per-citation snapshot gate (no-snapshot / llm-mediated / short-snapshot /
  //   quote-not-found → MEDIUM ceiling), ceilingCapped, snapshotChars in evidence, snapshotGate.
  ledgerSchemaVersion: 4,
  languages: LANGUAGES,
  channelsAnswered: channelResults.length,
  channelsSelected: SELECTED,
  channelStatus,
  failedChannels,
  aiModelActual,
  answeredFamilies,
  timing: channelResults.map(r => ({ channel: r.channelKey, startedAt: r.startedAt || null, finishedAt: r.finishedAt || null })),
  files,
  claimLedger: ledgerOut,
  evidenceHealth,
  urlhealthSummary,
  snapshotGate: {
    minChars: MIN_SNAPSHOT_CHARS,
    llmMediatedChannels: [...LLM_MEDIATED_CHANNELS],
    demotedTotal: Object.values(demotedBy).reduce((n, d) => n + sumDemoted(d), 0),
    byReason: Object.values(demotedBy).reduce((acc, d) => { for (const k of Object.keys(d)) acc[k] = (acc[k] || 0) + d[k]; return acc }, { noSnapshot: 0, shortSnapshot: 0, llmMediated: 0, quoteNotFound: 0 }),
    byChannel: demotedBy,
    ceilingCapped: claimLedger.filter(c => c.ceilingCapped).length,
  },
  escalationStats,
  reportPath: report.reportPath || `${WORK_DIR}/report.md`,
  queryRu: report.queryRu,
  relatedCandidates: report.relatedCandidates || [],
  synthMeta: {
    mainConclusion: report.mainConclusion,
    droppedClaims: report.droppedClaims || [],
    disputedClaims: report.disputedClaims || [],
    gaps: report.gaps || [],
    ledgerSummary,
  },
}
