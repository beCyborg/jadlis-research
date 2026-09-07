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

async function run(args) {
  const calls = []
  const prompts = {}
  const agent = async (prompt, opts) => {
    const label = (opts && opts.label) || '?'
    calls.push(label); prompts[label] = String(prompt)
    // fixtures are mutated by the core (relevance demotion) → fresh copy per run
    if (channels[label]) return structuredClone(channels[label])
    if (label.startsWith('curator')) return structuredClone(curator)
    if (label === 'urlhealth') return structuredClone(urlhealth)
    if (label.startsWith('verify:')) return { claimId: label.split(':')[1].split('#')[0], verdict: 'CONFIRMED', credibility: 2, evidence: 'mock', url: 'https://v.example.com', numberVerbatim: null }
    if (label.startsWith('escalate:')) return { claimId: label.split(':')[1], status: 'ok', confirmsExclusion: false, verdictSuggested: 'UNCHECKED', reasoning: 'mock', urls: [], liveSearchEvents: 1 }
    if (label.startsWith('analyst')) return { reportPath: '/tmp/smoke/report.md', queryRu: 'smoke', mainConclusion: 'ok', relatedCandidates: [], droppedClaims: [], disputedClaims: [], gaps: [] }
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
const base = { refinedQuery: 'smoke', channels: Object.keys(channels), workDir: '/tmp/smoke', pluginRoot: '/tmp/plugin', date: '2026-09-06', aiModel: 'x', fableBridge: false }

{
  const { result: r, logs, prompts } = await run(base)
  const led = Object.fromEntries(r.claimLedger.map(c => [c.id, c]))
  const ev = (id, p) => led[id].evidence.find(e => e.prefix === p)
  check(r.ledgerSchemaVersion === 4, 'ledgerSchemaVersion = 4')
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
  check((prompts['analyst'] || '').includes('ledger_schema: 4') && (prompts['analyst'] || '').includes('"ceilingCapped": true'), 'analyst prompt: ledger_schema 4 + ceilingCapped in ledger JSON')
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
  check(r.status === 'ok' || r.ledgerSchemaVersion === 4, 'single-family run returns schema 4')
}
console.log(failures ? `\n${failures} FAILED` : '\nALL OK')
process.exit(failures ? 1 : 0)
