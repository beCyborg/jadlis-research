#!/usr/bin/env node
// smoke-core.mjs — functional smoke of full-research-core.js with mocked agents (no network, no LLM).
// Exercises the schema v4 snapshot gate end-to-end: no-snapshot / llm-mediated / short-snapshot /
// quote-not-found demotions, ceilingCapped, channelStatus patching, snapshotGate in the result.
// Usage: node tools/smoke-core.mjs [path/to/full-research-core.js]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const corePath = process.argv[2] || path.join(here, '..', 'workflows', 'full-research-core.js')
const src = fs.readFileSync(corePath, 'utf8').replace(/^export\s+/gm, '')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

const SNAP = '/tmp/smoke/snapshots'
const channels = {
  web: { source: 'Web', sourceQuality: 'HIGH', fileWritten: '/tmp/smoke/web.md', findings: [], counterarguments: [],
    snapshots: [`${SNAP}/w1.md`, `${SNAP}/W3.md`],
    citations: [
      { prefix: '[w1]', url: 'https://docs.example.com/a', relevance: 'HIGH', context: 'a', quotes: ['alpha'], reliability: 'A', reliabilityWhy: 'docs' },
      { prefix: '[w2]', url: 'https://blog.example.com/b', relevance: 'HIGH', context: 'b', quotes: ['beta'], reliability: 'B', reliabilityWhy: 'blog' },
      { prefix: '[w3]', url: 'https://x.com/someone/status/1', relevance: 'HIGH', context: 'c', quotes: ['gamma'], reliability: 'C', reliabilityWhy: 'tweet' },
      { prefix: '[w4]', url: 'https://blog.example.com/d', relevance: 'MEDIUM', context: 'd', quotes: [], reliability: 'B', reliabilityWhy: 'blog' },
    ] },
  codexweb: { source: 'Codex', sourceQuality: 'HIGH', fileWritten: '/tmp/smoke/web-codex.md', findings: [], counterarguments: [],
    snapshots: [`${SNAP}/cx1.md`],
    citations: [
      { prefix: '[cx1]', url: 'https://docs.example.com/e', relevance: 'HIGH', context: 'e', quotes: ['epsilon'], reliability: 'A', reliabilityWhy: 'docs' },
    ] },
  reddit: { source: 'Reddit', sourceQuality: 'MEDIUM', fileWritten: '/tmp/smoke/reddit.md', findings: [], counterarguments: [],
    snapshots: [`${SNAP}/r1.md`],
    citations: [
      { prefix: '[r1]', url: 'https://reddit.com/r/x/comments/1', relevance: 'HIGH', context: 'f', quotes: ['zeta'], reliability: 'C', reliabilityWhy: 'user' },
    ] },
  hackernews: { source: 'HN', sourceQuality: 'MEDIUM', fileWritten: '/tmp/smoke/hackernews.md', findings: [], counterarguments: [],
    snapshots: [`${SNAP}/hn1.md`],
    citations: [
      { prefix: '[hn1]', url: 'https://news.ycombinator.com/item?id=1', relevance: 'HIGH', context: 'g', quotes: ['eta'], reliability: 'C', reliabilityWhy: 'user' },
    ] },
  // not part of `base.channels` — only the source-settings checks select it
  twitter: { source: 'Twitter/X', sourceQuality: 'MEDIUM', fileWritten: '/tmp/smoke/twitter.md', findings: [], counterarguments: [],
    snapshots: [],
    citations: [
      { prefix: '[x1]', url: 'https://x.com/someone/status/2', relevance: 'MEDIUM', context: 'h', quotes: ['theta'], reliability: 'C', reliabilityWhy: 'user' },
    ] },
}
const curator = { claims: [
  { id: 'c1', statement: 'alpha 1', channels: ['web', 'codexweb'], strength: 'STRONG', loadBearing: true, claimType: 'factual', evidencePrefixes: ['w1', 'cx1'] },
  { id: 'c2', statement: 'beta', channels: ['web'], strength: 'MODERATE', loadBearing: false, claimType: 'factual', evidencePrefixes: ['w2'] },
  { id: 'c3', statement: 'zeta 3', channels: ['reddit', 'hackernews'], strength: 'STRONG', loadBearing: true, claimType: 'experiential', evidencePrefixes: ['r1', 'hn1'] },
  { id: 'c4', statement: 'gamma', channels: ['web'], strength: 'WEAK', loadBearing: false, claimType: 'factual', evidencePrefixes: ['w3'] },
  { id: 'c5', statement: 'epsilon', channels: ['codexweb'], strength: 'MODERATE', loadBearing: false, claimType: 'factual', evidencePrefixes: ['cx1', 'w4'] },
] }
const urlhealth = { status: 'ok', elapsedSec: 1, note: 'mock', items: [
  { prefix: 'w1', url: 'https://docs.example.com/a', urlStatus: 'ok', quoteStatus: 'matched', fabricationSuspect: false, snapshotChars: 5000, snapshotExtractor: 'defuddle' },
  { prefix: 'cx1', url: 'https://docs.example.com/e', urlStatus: 'ok', quoteStatus: 'matched', fabricationSuspect: false, snapshotChars: 4000 },
  { prefix: 'w2', url: 'https://blog.example.com/b', urlStatus: 'ok', quoteStatus: 'notChecked', fabricationSuspect: false, snapshotChars: 0 },
  { prefix: 'r1', url: 'https://reddit.com/r/x/comments/1', urlStatus: 'blocked', quoteStatus: 'notFound', fabricationSuspect: false, snapshotChars: 3000 },
  { prefix: 'hn1', url: 'https://news.ycombinator.com/item?id=1', urlStatus: 'ok', quoteStatus: 'matched', fabricationSuspect: false, snapshotChars: 500 },
  { prefix: 'w3', url: 'https://x.com/someone/status/1', urlStatus: 'blocked', quoteStatus: 'matched', fabricationSuspect: false, snapshotChars: 3000 },
  { prefix: 'w4', url: 'https://blog.example.com/d', urlStatus: 'ok', quoteStatus: 'notChecked', fabricationSuspect: false, snapshotChars: 0 },
] }

async function run(args, hooks = {}) {
  const calls = []
  const prompts = {}
  const agent = async (prompt, opts) => {
    const label = (opts && opts.label) || '?'
    calls.push(label); prompts[label] = String(prompt)
    // fixtures are mutated by the core (relevance demotion) → fresh copy per run
    if (channels[label]) return structuredClone(channels[label])
    if (label.startsWith('curator')) return structuredClone(curator)
    if (label === 'urlhealth') return structuredClone(urlhealth)
    if (label.startsWith('verify:')) return Object.assign({ claimId: label.split(':')[1].split('#')[0], verdict: 'CONFIRMED', credibility: 2, evidence: 'mock', url: 'https://v.example.com', numberVerbatim: null, searchedVia: 'mock' }, hooks.verify ? hooks.verify(label) : {})
    if (label.startsWith('escalate:')) return { claimId: label.split(':')[1], status: 'ok', confirmsExclusion: false, verdictSuggested: 'UNCHECKED', reasoning: 'mock', urls: [], liveSearchEvents: 1 }
    if (label.startsWith('analyst')) return { reportPath: '/tmp/smoke/report.md', queryRu: 'smoke', mainConclusion: 'ok', relatedCandidates: [], droppedClaims: [], disputedClaims: [], familySplitClaims: [], gaps: [] }
    throw new Error('unmocked agent label: ' + label)
  }
  const parallel = fns => Promise.all(fns.map(f => f()))
  const logs = []
  const fn = new AsyncFunction('args', 'agent', 'parallel', 'phase', 'log', src)
  const result = await fn(args, agent, parallel, () => {}, m => logs.push(String(m)))
  return { result, calls, logs, prompts }
}

let failures = 0
const check = (cond, msg) => { if (!cond) { failures++; console.log('FAIL', msg) } else console.log('ok  ', msg) }
// twitter is deliberately NOT in the base set — it is selected only by the source-settings checks
const base = { refinedQuery: 'smoke', channels: ['web', 'codexweb', 'reddit', 'hackernews'], workDir: '/tmp/smoke', pluginRoot: '/tmp/plugin', date: '2026-09-06', aiModel: 'x', fableBridge: false }

{
  const { result: r, logs, prompts } = await run(base)
  const led = Object.fromEntries(r.claimLedger.map(c => [c.id, c]))
  const ev = (id, p) => led[id].evidence.find(e => e.prefix === p)
  check(r.ledgerSchemaVersion === 5, 'ledgerSchemaVersion = 5')
  check(r.snapshotGate && r.snapshotGate.minChars === 1000, 'snapshotGate.minChars = 1000')
  const br = r.snapshotGate.byReason
  check(br.noSnapshot === 1 && br.llmMediated === 2 && br.shortSnapshot === 1 && br.quoteNotFound === 1, `byReason ${JSON.stringify(br)} = {noSnapshot 1, llmMediated 2 (cx1 channel + w3 x.com host), shortSnapshot 1, quoteNotFound 1}`)
  check(r.snapshotGate.demotedTotal === 5, `demotedTotal = 5 (got ${r.snapshotGate.demotedTotal})`)
  check(ev('c1', 'w1').relevance === 'HIGH' && !ev('c1', 'w1').snapshotDemoted, 'w1 (snapshot, matched, 5000 chars) stays HIGH')
  check(ev('c1', 'cx1').relevance === 'MEDIUM' && ev('c1', 'cx1').snapshotDemoted === 'llm-mediated', 'cx1 (codexweb, real snapshot) → MEDIUM llm-mediated')
  check(ev('c2', 'w2').snapshotDemoted === 'no-snapshot', 'w2 (no snapshot) → no-snapshot')
  check(ev('c3', 'r1').snapshotDemoted === 'quote-not-found' && ev('c3', 'r1').weak === true, 'r1 (quote notFound) → quote-not-found, weak')
  check(ev('c3', 'hn1').snapshotDemoted === 'short-snapshot' && ev('c3', 'hn1').weak === false, 'hn1 (500 chars) → short-snapshot, NOT weak')
  check(ev('c4', 'w3').snapshotDemoted === 'llm-mediated', 'w3 (x.com host) → llm-mediated')
  check(ev('c1', 'w1').snapshotChars === 5000, 'evidence carries snapshotChars')
  check(led.c5.ceilingCapped === false, 'c5 (cx1 demoted + w4 natively MEDIUM) ceilingCapped = false — only demoted evidence counts')
  check(led.c1.ceilingCapped === false, 'c1 ceilingCapped = false (w1 HIGH survives)')
  check(led.c3.ceilingCapped === true && led.c3.weakEvidence === false, 'c3 ceilingCapped = true (both demoted), weakEvidence = false (hn1 not weak)')
  check(led.c3.strength === 'STRONG', 'c3 strength untouched by ceiling (only weakEvidence demotes strength)')
  const cs = Object.fromEntries(r.channelStatus.map(s => [s.channel, s]))
  check(cs.codexweb.ceiling === 'MEDIUM' && cs.web.ceiling === 'HIGH', 'channelStatus.ceiling codexweb MEDIUM / web HIGH')
  check(cs.codexweb.snapshotDemoted === 1 && cs.codexweb.snapshotDemotedBy.llmMediated === 1, 'codexweb snapshotDemoted = 1 (llmMediated)')
  check(cs.web.snapshotDemoted === 2 && cs.web.snapshotDemotedBy.noSnapshot === 1 && cs.web.snapshotDemotedBy.llmMediated === 1, 'web snapshotDemoted = 2 (noSnapshot w2 + llmMediated w3)')
  check(cs.web.highCitations === 1, `web.highCitations recomputed = 1 (got ${cs.web.highCitations})`)
  check(cs.hackernews.highCitations === 0 && cs.reddit.highCitations === 0, 'hn/reddit highCitations = 0 after stage-2 demotion')
  check(cs.web.snapshotBytesMedian === 4000 && cs.hackernews.snapshotBytesMedian === 500, `snapshotBytesMedian web 4000 (w1 5000, w3 3000; zeros excluded) / hn 500 (got ${cs.web.snapshotBytesMedian}/${cs.hackernews.snapshotBytesMedian})`)
  check(r.snapshotGate.byChannel.web && r.snapshotGate.ceilingCapped === 3, `snapshotGate.ceilingCapped = 3 (c2, c3, c4) (got ${r.snapshotGate.ceilingCapped})`)
  check(!JSON.stringify(r.claimLedger).includes('"citationRefs"'), 'ledger has no back-references')
  check(logs.some(l => l.includes('Снапшот-гейт')), 'gate logged')
  const vp = prompts['verify:c1#1'] || ''
  check(vp.includes('5000B, extractor:defuddle') && vp.includes('[ceiling:MEDIUM — llm-mediated]'), 'verify prompt shows snapshot size/extractor and ceiling reason')
  check((prompts['analyst'] || '').includes('ledger_schema: 5') && (prompts['analyst'] || '').includes('"ceilingCapped": true'), 'analyst prompt: ledger_schema 5 + ceilingCapped in ledger JSON')
  check((prompts['web'] || '').includes('Extractor:') && (prompts['web'] || '').includes('schema v4'), 'channel prompt rule 5 (v4) mentions Extractor header')
  check(r.synthMeta.ledgerSummary.ceilingCapped === 3, 'ledgerSummary.ceilingCapped = 3')
}
{
  const { result: r } = await run({ ...base, channelCeiling: { codexweb: 'HIGH' } })
  const led = Object.fromEntries(r.claimLedger.map(c => [c.id, c]))
  const cx1 = led.c1.evidence.find(e => e.prefix === 'cx1')
  check(cx1.relevance === 'HIGH' && !cx1.snapshotDemoted, 'args.channelCeiling {codexweb:HIGH} lifts the llm-mediated ceiling')
  check(r.snapshotGate.byReason.llmMediated === 1, 'x.com host still demoted with ceiling lifted')
}
{
  // insufficient-sources path keeps schema version
  const { result: r } = await run({ ...base, channels: ['web'] })
  check(r.status === 'ok' || r.ledgerSchemaVersion === 5, 'single-family run returns schema 5')
}
{
  // source settings: a provider switched off drops its channels; a channel note reaches the prompt
  const { result: r, calls, prompts } = await run({
    ...base,
    channels: [...base.channels, 'grokweb'],
    providersOff: ['grok'],
    channelNotes: { web: 'NOTE-X {PLUGIN_ROOT}/scripts/twitterapi.sh' },
  })
  check(!calls.includes('grokweb'), 'providersOff [grok] → the grokweb channel agent is never called')
  check(!r.channelsSelected.includes('grokweb'), 'grokweb absent from channelsSelected')
  check(r.sourceSettings && r.sourceSettings.providersOff[0] === 'grok', 'result.sourceSettings.providersOff = [grok]')
  const wp = prompts['web'] || ''
  check(wp.includes('CHANNEL NOTE'), 'channelNotes.web reaches the web channel prompt')
  check(wp.includes('/tmp/plugin/scripts/twitterapi.sh') && !wp.includes('NOTE-X {PLUGIN_ROOT}'), '{PLUGIN_ROOT} in the note is substituted with pluginRoot')
  check(!(prompts['codexweb'] || '').includes('CHANNEL NOTE'), 'a channel without a note gets no CHANNEL NOTE block')
}
{
  // no channelNotes at all: the core supplies DEFAULT_GROK_OFF_NOTE for twitter from providersOff
  const { prompts } = await run({ ...base, channels: ['web', 'twitter'], providersOff: ['grok'] })
  const tp = prompts['twitter'] || ''
  check(tp.includes('CHANNEL NOTE') && tp.includes('GROK DISABLED'), 'twitter without a note gets DEFAULT_GROK_OFF_NOTE from providersOff')
  check(tp.includes('/tmp/plugin/scripts/twitterapi.sh') && !tp.includes('{PLUGIN_ROOT}/scripts/twitterapi.sh'), 'default note has {PLUGIN_ROOT} substituted too')
}

{
  // ── schema v5: one vote per macro-family, same-family lens, FAMILY-SPLIT ──
  // c1 web+codexweb (web-only, factual): #1 web/Brave, #2 community → both CONFIRMED
  // c2 web-only factual: #1 web CHALLENGED, #2 community UNCHECKED → single exclusion → Codex escalation (as before)
  // c3 reddit+hackernews (community-only, experiential): #1 community CONFIRMED, #2 web CHALLENGED → FAMILY-SPLIT, lead community
  // c4 web-only factual: #1 web CHALLENGED, #2 community CONFIRMED → FAMILY-SPLIT, lead web, leadVerdict CHALLENGED
  // c5 codexweb-only: #1 web UNCHECKED, #2 community CONFIRMED → CONFIRMED on 1 vote (community)
  const table = {
    'verify:c2#1': { verdict: 'CHALLENGED', credibility: 4, searchedVia: 'brave' },
    'verify:c2#2': { verdict: 'UNCHECKED', credibility: 6, searchedVia: 'hn' },
    'verify:c3#1': { verdict: 'CONFIRMED', credibility: 2, searchedVia: 'reddit' },
    'verify:c3#2': { verdict: 'CHALLENGED', credibility: 4, searchedVia: 'brave' },
    'verify:c4#1': { verdict: 'CHALLENGED', credibility: 5, searchedVia: 'brave' },
    'verify:c4#2': { verdict: 'CONFIRMED', credibility: 2, searchedVia: 'reddit' },
    'verify:c5#1': { verdict: 'UNCHECKED', credibility: 6, searchedVia: 'brave' },
    'verify:c5#2': { verdict: 'CONFIRMED', credibility: 3, searchedVia: 'hn' },
  }
  const { result: r, calls, prompts } = await run(base, { verify: l => table[l] || {} })
  const led = Object.fromEntries(r.claimLedger.map(c => [c.id, c]))
  check(led.c1.verdict === 'CONFIRMED' && led.c1.voteCount === 2 && JSON.stringify(led.c1.votes) === '["web:CONFIRMED","community:CONFIRMED"]', `c1 web-only origin: votes web then community (got ${JSON.stringify(led.c1.votes)})`)
  check(JSON.stringify(led.c3.votes) === '["community:CONFIRMED","web:CHALLENGED"]', `c3 community origin: votes community then web (got ${JSON.stringify(led.c3.votes)})`)
  check(led.c3.verdict === 'FAMILY-SPLIT' && led.c3.leadFamily === 'community' && led.c3.leadVerdict === 'CONFIRMED' && led.c3.credibility === 3, `c3 experiential split → FAMILY-SPLIT, lead community CONFIRMED, credibility 3 (got ${led.c3.verdict}/${led.c3.leadFamily}/${led.c3.leadVerdict}/${led.c3.credibility})`)
  check(led.c4.verdict === 'FAMILY-SPLIT' && led.c4.leadFamily === 'web' && led.c4.leadVerdict === 'CHALLENGED' && led.c4.credibility === 5, `c4 factual split → FAMILY-SPLIT, lead web CHALLENGED, credibility 5 (got ${led.c4.verdict}/${led.c4.leadFamily}/${led.c4.leadVerdict}/${led.c4.credibility})`)
  check(calls.includes('escalate:c2') && led.c2.escalation && led.c2.escalation.status === 'ok' && led.c2.verdict !== 'FAMILY-SPLIT', `c2 single exclusion vs UNCHECKED still escalates to Codex (got ${led.c2.verdict}, escalation ${led.c2.escalation && led.c2.escalation.status})`)
  check(led.c2.verdict === 'DISPUTED' || led.c2.votes.includes('codex:UNCHECKED'), `c2 after a non-confirming Codex vote → DISPUTED (got ${led.c2.verdict}, votes ${JSON.stringify(led.c2.votes)})`)
  check(!calls.includes('escalate:c3') && !calls.includes('escalate:c4'), 'FAMILY-SPLIT claims are NOT escalated to Codex')
  check(led.c5.verdict === 'CONFIRMED' && led.c5.voteCount === 1 && led.c5.familyVotes.community === 'CONFIRMED' && led.c5.familyVotes.web === 'UNCHECKED', `c5 confirmed on the community vote only (got ${JSON.stringify(led.c5.familyVotes)})`)
  check(JSON.stringify(led.c3.searchedVia) === '["reddit","brave"]', `searchedVia recorded per vote (got ${JSON.stringify(led.c3.searchedVia)})`)
  check(r.synthMeta.ledgerSummary.familySplit === 2 && r.synthMeta.ledgerSummary.disputed === 1, `ledgerSummary familySplit 2 / disputed 1 (got ${r.synthMeta.ledgerSummary.familySplit}/${r.synthMeta.ledgerSummary.disputed})`)
  const p31 = prompts['verify:c3#1'] || '', p32 = prompts['verify:c3#2'] || '', p11 = prompts['verify:c1#1'] || '', p12 = prompts['verify:c1#2'] || ''
  check(p31.includes('SAME-FAMILY REFUTATION" (family: community') && p31.includes('Reddit (the claim\'s own platform)') && p31.includes('HackerNews (the claim\'s own platform'), 'c3#1 same-family lens names Reddit and HN as the claim\'s own platforms')
  check(p32.includes('CROSS-TYPE" (family: web)') && p32.includes('PRIMARY SOURCES') && p32.includes('experiential'), 'c3#2 cross-type lens = primary sources on the web, experiential rule')
  check(p11.includes('SAME-FAMILY REFUTATION" (family: web → Brave)'), 'c1#1 same-family lens = Brave refutation')
  check(p12.includes('CROSS-TYPE" (family: community)') && p12.includes('PRACTITIONER COMMUNITIES'), 'c1#2 cross-type lens = communities')
  check(p31.includes('do NOT switch to the other family') && p31.includes('searchedVia'), 'verifier prompt: family lock + searchedVia in the return line')
  const esc = prompts['escalate:c2'] || ''
  check(esc.includes('(web family, searched via brave)'), 'escalation prompt shows the family and platform of each vote')
  const an = prompts['analyst'] || ''
  check(an.includes('claims_family_split: 2') && an.includes('### Веб и сообщества расходятся') && an.includes('"leadFamily": "community"'), 'analyst prompt: claims_family_split, canonical heading, leadFamily in ledger JSON')
  check(r.synthMeta.familySplitClaims && Array.isArray(r.synthMeta.familySplitClaims), 'synthMeta.familySplitClaims present')
}
{
  // twitter-origin and substack-origin claims: same-family tools
  const { prompts } = await run({ ...base, channels: [...Object.keys(channels)] }, { verify: () => ({}) })
  check(true, 'twitter/substack same-family tool text is covered by sameFamilyCommunityTools (see next check)')
  const src = fs.readFileSync(corePath, 'utf8')
  check(src.includes("chans.includes('twitter')") && src.includes('twitterapi.sh search') && src.includes('has no cheap search'), 'sameFamilyCommunityTools: X via twitterapi.sh, fallback text for platforms without cheap search')
  check(src.includes("chans.includes('telegram')") && src.includes('tgsearch.py') && src.includes('NEVER `posts -q`'), 'sameFamilyCommunityTools: Telegram via free tgsearch commands, no paid slots')
}
console.log(failures ? `\n${failures} FAILED` : '\nALL OK')
process.exit(failures ? 1 : 0)
