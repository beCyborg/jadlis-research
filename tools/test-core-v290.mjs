#!/usr/bin/env node
// test-core-v290.mjs — 2.9.0 logic of full-research-core.js, no network, no LLM:
//   1. pure helpers (sliced out between the BEGIN/END PURE HELPERS markers): selectClaims ordering and
//      cap, curationStats, reuseDecision skip decisions, missingLanguageLayers;
//   2. mocked end-to-end runs: curator «as many as needed» counters in the log/ledgerSummary/synthMeta,
//      _curated.json/_ledger.json writes, reuseStages round trip from the written files, Codex defaults,
//      the verifier Reddit route.
// Usage: node tools/test-core-v290.mjs [path/to/full-research-core.js]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const corePath = process.argv[2] || path.join(here, '..', 'workflows', 'full-research-core.js')
const raw = fs.readFileSync(corePath, 'utf8')
const src = raw.replace(/^export\s+/gm, '')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

let failures = 0
const check = (cond, msg) => { if (!cond) { failures++; console.log('FAIL', msg) } else console.log('ok  ', msg) }

// ── 1. pure helpers ──
const b = raw.indexOf('// BEGIN PURE HELPERS'), e = raw.indexOf('// END PURE HELPERS')
check(b > 0 && e > b, 'pure-helper markers present')
const H = new Function(raw.slice(b, e) + '\nreturn { selectClaims, curationStats, reuseDecision, missingLanguageLayers, importanceOf }')()

{
  const C = (id, o) => ({ id, strength: 'MODERATE', loadBearing: false, importance: 'background', ...o })
  const all = [
    C('bg-strong', { strength: 'STRONG' }),
    C('crit-weak', { importance: 'critical', strength: 'WEAK' }),
    C('lb-bg', { loadBearing: true }),
    C('crit-strong', { importance: 'critical', strength: 'STRONG' }),
    C('lb-crit', { loadBearing: true, importance: 'critical' }),
    C('bg-mod-1'),
    C('bg-mod-2'),
  ]
  const { kept, dropped } = H.selectClaims(all, 32)
  check(kept.map(c => c.id).join(',') === 'lb-crit,lb-bg,crit-strong,crit-weak,bg-strong,bg-mod-1,bg-mod-2',
    `selectClaims: load-bearing → critical → background, strength inside, curator order on ties (got ${kept.map(c => c.id)})`)
  check(dropped.length === 0, 'selectClaims: under the cap nothing is dropped, nothing is padded')
  const cut = H.selectClaims(all, 3)
  check(cut.kept.map(c => c.id).join(',') === 'lb-crit,lb-bg,crit-strong' && cut.dropped.map(c => c.id).join(',') === 'crit-weak,bg-strong,bg-mod-1,bg-mod-2',
    `selectClaims cap 3: background goes first, then the weakest critical (got kept ${cut.kept.map(c => c.id)})`)
  const st = H.curationStats({ candidates: 12, criticalTaken: 4, droppedByCap: 2 }, cut.kept, cut.dropped)
  check(st.candidates === 12 && st.returned === 7 && st.taken === 3 && st.criticalTaken === 2 && st.backgroundTaken === 1 && st.loadBearing === 2,
    `curationStats: candidates/returned/taken/critical/background/loadBearing (got ${JSON.stringify(st)})`)
  check(st.droppedByCap === 6 && st.criticalDroppedByCap === 3 && st.curatorReported.droppedByCap === 2,
    `curationStats: droppedByCap = curator-reported 2 + orchestrator cut 4; critical among them 2+1 (got ${st.droppedByCap}/${st.criticalDroppedByCap})`)
  const st2 = H.curationStats({ claims: [] }, kept, [])
  check(st2.candidates === 7 && st2.curatorReported.candidates === null && st2.droppedByCap === 0, 'curationStats: no counters from the curator → candidates = returned, nulls reported')
  check(H.importanceOf({ loadBearing: true }) === 'critical' && H.importanceOf({}) === 'background' && H.importanceOf({ importance: 'background', loadBearing: true }) === 'background',
    'importanceOf: pre-2.9.0 answer falls back to loadBearing; an explicit value wins')
}
{
  const Q = 'topic'
  const ch = ['/w/web.md', '/w/reddit.md']
  const files = (sizes) => Object.entries(sizes).map(([p, n]) => ({ path: p, exists: n !== null, bytes: n || 0 }))
  const ledger = { queryTitle: Q, files: ch, claimLedger: [{ id: 'c1' }], ledgerSummary: { total: 1 } }
  const curated = { queryTitle: Q, files: ch, curator: { claims: [{ id: 'c1' }] } }
  const d0 = H.reuseDecision(null, ch, Q)
  check(!d0.channels && !d0.curator && !d0.verification && d0.notes.length === 1, 'reuseDecision: no probe answer → nothing reused')
  const d1 = H.reuseDecision({ files: files({ '/w/web.md': 500, '/w/reddit.md': 300 }), curated: null, ledger: null }, ch, Q)
  check(d1.channels && !d1.curator && !d1.verification && d1.channelPaths.length === 2, 'reuseDecision: all channel files non-empty → channels only')
  const d2 = H.reuseDecision({ files: files({ '/w/web.md': 500, '/w/reddit.md': 0 }), curated: null, ledger: null }, ch, Q)
  check(!d2.channels && d2.notes.some(n => n.includes('/w/reddit.md')), 'reuseDecision: one empty channel file → channels run again, the file is named')
  const d3 = H.reuseDecision({ files: files({ '/w/web.md': 500, '/w/reddit.md': null }), curated: null, ledger: null }, ch, Q)
  check(!d3.channels, 'reuseDecision: a missing channel file → channels run again')
  const d4 = H.reuseDecision({ files: files({ '/w/web.md': 500, '/w/reddit.md': 300 }), curated, ledger: null }, ch, Q)
  check(d4.channels && d4.curator && !d4.verification && d4.curated === curated, 'reuseDecision: valid _curated.json → channels + curator skipped')
  const d5 = H.reuseDecision({ files: files({ '/w/web.md': 500, '/w/reddit.md': 300 }), curated, ledger }, ch, Q)
  check(d5.channels && d5.curator && d5.verification && d5.ledger === ledger, 'reuseDecision: valid _ledger.json → channels + curator + verification skipped')
  const d6 = H.reuseDecision({ files: files({ '/w/web.md': 500, '/w/reddit.md': 300 }), curated, ledger: { ...ledger, ledgerSummary: { total: 5 } } }, ch, Q)
  check(!d6.verification && d6.curator && d6.notes.some(n => n.includes('incomplete')), 'reuseDecision: truncated ledger echo (length ≠ total) → falls back to the curated stage')
  const d7 = H.reuseDecision({ files: files({ '/w/web.md': 500, '/w/reddit.md': 300 }), curated: { ...curated, queryTitle: 'other' }, ledger: { ...ledger, queryTitle: 'other' } }, ch, Q)
  check(d7.channels && !d7.curator && !d7.verification && d7.notes.filter(n => n.includes('another query')).length === 2, 'reuseDecision: files of another query → only the channels are reused')
  // a run whose reddit channel failed: the ledger records only web.md; reddit.md missing does not block it
  const d8 = H.reuseDecision({ files: files({ '/w/web.md': 500, '/w/reddit.md': null }), curated: null, ledger: { ...ledger, files: ['/w/web.md'] } }, ch, Q)
  check(d8.verification && d8.channelPaths.join() === '/w/web.md', 'reuseDecision: the ledger needs only the channel files its run used')
  const d9 = H.reuseDecision({ files: files({ '/w/web.md': 0, '/w/reddit.md': 300 }), curated: null, ledger }, ch, Q)
  check(!d9.verification && !d9.channels && d9.notes.some(n => n.includes('/w/web.md')), 'reuseDecision: a ledger whose channel file is empty → not reused')
}
{
  const g = H.missingLanguageLayers(['ru', 'en', 'ja', 'pl', 'de', 'fr', 'ko'], ['web', 'reddit', 'ko'])
  check(JSON.stringify(g) === JSON.stringify([{ lang: 'ja', layer: 'ja' }, { lang: 'pl', layer: 'eu' }, { lang: 'de', layer: 'eu' }, { lang: 'fr', layer: null }]),
    `missingLanguageLayers: ja→ja, pl/de→eu, fr has no layer, ko selected, ru/en skipped (got ${JSON.stringify(g)})`)
  check(H.missingLanguageLayers(['uk', 'es'], ['eu']).length === 0, 'missingLanguageLayers: uk/es covered by a selected eu layer')
}

// ── 2. mocked end-to-end runs ──
const channels = {
  web: { source: 'Web', sourceQuality: 'HIGH', fileWritten: '/tmp/v290/web.md', findings: [], counterarguments: [], snapshots: ['/tmp/v290/snapshots/w1.md'],
    citations: [{ prefix: '[w1]', url: 'https://docs.example.com/a', relevance: 'HIGH', context: 'a', quotes: ['alpha'], reliability: 'A', reliabilityWhy: 'docs' }] },
  codexweb: { source: 'Codex', sourceQuality: 'HIGH', fileWritten: '/tmp/v290/web-codex.md', findings: [], counterarguments: [], snapshots: [],
    citations: [{ prefix: '[cx1]', url: 'https://docs.example.com/e', relevance: 'MEDIUM', context: 'e', quotes: [], reliability: 'A', reliabilityWhy: 'docs' }] },
  reddit: { source: 'Reddit', sourceQuality: 'MEDIUM', fileWritten: '/tmp/v290/reddit.md', findings: [], counterarguments: [], snapshots: [],
    citations: [{ prefix: '[r1]', url: 'https://reddit.com/r/x/comments/1', relevance: 'MEDIUM', context: 'f', quotes: ['zeta'], reliability: 'C', reliabilityWhy: 'user' }] },
}
// 40 claims: 2 load-bearing critical, 30 critical, 8 background → cap 32 cuts all background + nothing critical
const bigCurator = () => ({
  candidates: 45, criticalTaken: 32, droppedByCap: 0, interrupted: 'none',
  claims: Array.from({ length: 40 }, (_, i) => ({
    id: `k${i + 1}`, statement: `claim ${i + 1}`, channels: i % 2 ? ['web'] : ['reddit'], strength: 'MODERATE',
    importance: i < 32 ? 'critical' : 'background', loadBearing: i === 5 || i === 20,
    claimType: 'factual', evidencePrefixes: i % 2 ? ['w1'] : ['r1'],
  })).reverse(), // the curator listed background first — the orchestrator must reorder
})
const smallCurator = () => ({
  candidates: 3, criticalTaken: 1, droppedByCap: 0, interrupted: 'none',
  claims: [
    { id: 'c1', statement: 'alpha 1', channels: ['web', 'codexweb'], strength: 'STRONG', importance: 'critical', loadBearing: true, claimType: 'factual', evidencePrefixes: ['w1', 'cx1'] },
    { id: 'c2', statement: 'beta', channels: ['web'], strength: 'MODERATE', importance: 'background', loadBearing: false, claimType: 'factual', evidencePrefixes: ['w1'] },
    { id: 'c3', statement: 'zeta', channels: ['reddit'], strength: 'MODERATE', importance: 'background', loadBearing: false, claimType: 'experiential', evidencePrefixes: ['r1'] },
  ],
})
const payloadOf = p => JSON.parse(String(p).split('<<<JSON\n')[1].split('\nJSON>>>')[0])

async function run(args, hooks = {}) {
  const calls = [], prompts = {}, optsBy = {}, logs = []
  const agent = async (prompt, opts) => {
    const label = (opts && opts.label) || '?'
    calls.push(label); prompts[label] = String(prompt); optsBy[label] = opts || {}
    if (channels[label]) return structuredClone(channels[label])
    if (label.startsWith('reuse:') && label !== 'reuse:probe') return structuredClone(channels[label.slice(6)])
    if (label === 'reuse:probe') return hooks.probe ? hooks.probe(prompt) : null
    if (label.startsWith('curator')) return (hooks.curator || smallCurator)()
    if (label === 'urlhealth') return { status: 'ok', elapsedSec: 1, note: 'mock', items: [] }
    if (label.startsWith('verify:')) return { claimId: label.split(':')[1].split('#')[0], verdict: hooks.verdict ? hooks.verdict(label) : 'CONFIRMED', credibility: 2, evidence: 'mock', url: 'https://v.example.com', numberVerbatim: null, searchedVia: 'mock', interrupted: 'none' }
    if (label.startsWith('escalate:')) return { claimId: label.split(':')[1], status: 'ok', confirmsExclusion: false, verdictSuggested: 'UNCHECKED', reasoning: 'mock', urls: [], liveSearchEvents: 1, interrupted: 'none' }
    if (label.startsWith('persist:')) return { path: prompt.match(/save to (\S+) VERBATIM/)[1], bytes: 1234 }
    if (label.startsWith('analyst')) return { reportPath: '/tmp/v290/draft.md', queryRu: 'v290', mainConclusion: 'ok', relatedCandidates: [], droppedClaims: [], disputedClaims: [], familySplitClaims: [], gaps: [], interrupted: 'none' }
    throw new Error('unmocked agent label: ' + label)
  }
  const fn = new AsyncFunction('args', 'agent', 'parallel', 'phase', 'log', src)
  const result = await fn(args, agent, fns => Promise.all(fns.map(f => f())), () => {}, m => logs.push(String(m)))
  return { result, calls, prompts, optsBy, logs }
}
const base = { refinedQuery: 'v290 topic', channels: ['web', 'codexweb', 'reddit'], workDir: '/tmp/v290', pluginRoot: '/tmp/plugin', date: '2026-10-12' }

let stored = null
{
  // default run: curator counters, stage files written, no probe
  const { result: r, calls, prompts, logs } = await run(base, { curator: bigCurator })
  check(!calls.includes('reuse:probe') && !calls.some(c => c.startsWith('reuse:')), 'default: no reuse:probe, no restore agents (reuseStages off)')
  const ids = r.claimLedger.map(c => c.id)
  check(ids.length === 32 && ids[0] === 'k21' && ids[1] === 'k6' && ids.slice(2).every(id => Number(id.slice(1)) <= 32),
    `cap 32: load-bearing first, then the 30 other critical claims, all 8 background cut (got ${ids.slice(0, 4)}… ${ids.length})`)
  const cur = r.synthMeta.curation
  check(cur && cur.candidates === 45 && cur.criticalTaken === 32 && cur.backgroundTaken === 0 && cur.droppedByCap === 8 && cur.criticalDroppedByCap === 0 && cur.loadBearing === 2,
    `curation counters in synthMeta (got ${JSON.stringify(cur)})`)
  check(r.synthMeta.ledgerSummary.curation === cur || JSON.stringify(r.synthMeta.ledgerSummary.curation) === JSON.stringify(cur), 'curation counters in ledgerSummary')
  check(r.synthMeta.ledgerSummary.claimsDroppedByCap === 8, 'ledgerSummary.claimsDroppedByCap kept (orchestrator cut)')
  check(logs.some(l => l.includes('кандидатов 45') && l.includes('критичных 32') && l.includes('отброшено потолком 8')), 'curation counters logged')
  check(calls.filter(c => c.startsWith('verify:')).length === 64, 'verification: 2 votes × 32 claims')
  check(calls.includes('persist:curated') && calls.includes('persist:ledger'), 'default: _curated.json and _ledger.json are written')
  const pc = prompts['persist:curated'], pl = prompts['persist:ledger']
  check(pc.includes('save to /tmp/v290/_curated.json VERBATIM') && pl.includes('save to /tmp/v290/_ledger.json VERBATIM'), 'stage files land in workDir under _curated.json / _ledger.json')
  const C = payloadOf(pc), L = payloadOf(pl)
  check(C.queryTitle === 'v290 topic' && C.curator.claims.length === 40 && C.curator.candidates === 45 && C.files.length === 3 && C.curation.droppedByCap === 8, '_curated.json: raw curator answer + counters + channel files')
  check(L.claimLedger.length === 32 && L.ledgerSummary.total === 32 && L.escalationStats && L.snapshotGate && L.files.length === 3 && !JSON.stringify(L).includes('"rawVotes"'),
    '_ledger.json: claimLedger + ledgerSummary + escalationStats + snapshotGate, no rawVotes')
  check(Array.isArray(r.stageFiles) && r.stageFiles.length === 2 && r.stageFiles.every(f => f.ok), 'result.stageFiles reports both writes')
  check(!/^(REPORT|SUMMARY|FINDINGS|ANALYSIS).*\.md$/i.test('_curated.json') && !/^(REPORT|SUMMARY|FINDINGS|ANALYSIS).*\.md$/i.test('_ledger.json'), 'stage file names pass the subagent Write gate')
  check(r.reusedStages === undefined, 'default: no reusedStages key in the result')
  stored = { C, L }
}
{
  // a failed persist agent does not fail the run
  const { result: r } = await run(base)
  check(r.status === 'ok', 'persist mocked → ok')
}
const probeWith = (sizes, curated, ledger) => prompt => ({
  files: Object.entries(sizes).map(([p, n]) => ({ path: p, exists: n !== null, bytes: n || 0 })),
  curated: curated ? structuredClone(curated) : null, ledger: ledger ? structuredClone(ledger) : null, note: 'mock',
})
const allFiles = { '/tmp/v290/web.md': 900, '/tmp/v290/web-codex.md': 800, '/tmp/v290/reddit.md': 700 }
{
  // reuseStages + _ledger.json → only the analyst runs over the stored ledger
  const { result: r, calls, prompts, logs } = await run({ ...base, reuseStages: true }, { probe: probeWith(allFiles, stored.C, stored.L) })
  check(calls.includes('reuse:probe') && prompts['reuse:probe'].includes('/tmp/v290/_ledger.json') && prompts['reuse:probe'].includes('/tmp/v290/reddit.md'), 'reuse: probe asks for channel files + stage files')
  check(!calls.some(c => ['web', 'codexweb', 'reddit'].includes(c) || c.startsWith('curator') || c.startsWith('verify:') || c.startsWith('reuse:web') || c.startsWith('persist:')),
    `reuse ledger: no channels, no curator, no verifiers, no rewrites (calls ${calls})`)
  check(r.status === 'ok' && r.claimLedger.length === 32 && r.synthMeta.ledgerSummary.total === 32 && r.escalationStats && r.snapshotGate && r.channelStatus.length === 3,
    'reuse ledger: result carries the stored ledger, summary, escalation stats, gate, channel status')
  check(r.reusedStages && r.reusedStages.channels && r.reusedStages.curator && r.reusedStages.verification, 'reuse ledger: reusedStages all true')
  check((prompts['analyst'] || '').includes('claims_confirmed: 32'), 'reuse ledger: analyst prompt built from the stored summary')
  check(logs.some(l => l.startsWith('reuseStages:') && l.includes('из _ledger.json')), 'reuse ledger: logged')
}
{
  // reuseStages + _curated.json only → channels restored from files, curator skipped, verification runs
  const { result: r, calls, logs } = await run({ ...base, reuseStages: true }, { probe: probeWith(allFiles, stored.C, null), curator: () => { throw new Error('curator must not run') } })
  check(['reuse:web', 'reuse:codexweb', 'reuse:reddit'].every(l => calls.includes(l)) && !calls.some(c => ['web', 'codexweb', 'reddit'].includes(c)), 'reuse curated: channels restored by reuse:<key>, no channel researchers')
  check(!calls.some(c => c.startsWith('curator')) && calls.filter(c => c.startsWith('verify:')).length === 64 && !calls.includes('persist:curated') && calls.includes('persist:ledger'),
    'reuse curated: no curator, verification over the stored 40→32 claims, only _ledger.json written')
  check(r.status === 'ok' && r.reusedStages.curator && !r.reusedStages.verification && r.synthMeta.curation.droppedByCap === 8, 'reuse curated: status ok, counters recomputed from the stored answer')
  check(logs.some(l => l.includes('куратор не запускаю')), 'reuse curated: logged')
}
{
  // reuseStages + channel files only → restore channels, curator runs
  const { calls, result: r } = await run({ ...base, reuseStages: true }, { probe: probeWith(allFiles, null, null) })
  check(calls.includes('reuse:web') && calls.includes('curator') && calls.includes('persist:curated') && r.reusedStages.channels && !r.reusedStages.curator, 'reuse channels: restored channels, curator + both writes run')
}
{
  // reuseStages, a channel file missing → everything runs as usual
  const { calls, result: r } = await run({ ...base, reuseStages: true }, { probe: probeWith({ ...allFiles, '/tmp/v290/reddit.md': null }, null, null) })
  check(calls.includes('web') && calls.includes('reddit') && !calls.includes('reuse:web') && calls.includes('curator') && r.reusedStages.channels === false, 'reuse: missing channel file → channels run again')
}
{
  // probe dies → everything runs
  const { calls, result: r } = await run({ ...base, reuseStages: true }, { probe: () => null })
  check(calls.includes('web') && r.status === 'ok' && r.reusedStages.notes.length === 1, 'reuse: probe null → full run, note in reusedStages')
}
{
  // Codex defaults (owner decision 12.10): gpt-6.1-sol on priority; args.codexModel still overrides
  const split = { verdict: l => (l === 'verify:c2#1' ? 'CHALLENGED' : l === 'verify:c2#2' ? 'UNCHECKED' : 'CONFIRMED') }
  const { prompts } = await run(base, split)
  const esc = prompts['escalate:c2'] || ''
  check(esc.includes('codex exec -m gpt-6.1-sol ') && esc.includes('service_tier="priority"') && !esc.includes('service_tier="default"'), 'escalation: -m gpt-6.1-sol with service_tier="priority"')
  check((prompts['codexweb'] || '').startsWith('You are the Web (Codex/GPT-6.1 Sol) researcher'), 'codexweb channel label = Codex/GPT-6.1 Sol')
  const o = await run({ ...base, codexModel: 'gpt-6-astra' }, split)
  check((o.prompts['escalate:c2'] || '').includes('codex exec -m gpt-6-astra ') && (o.prompts['codexweb'] || '').startsWith('You are the Web (Codex/gpt-6-astra) researcher'), 'args.codexModel overrides model and label')
  check(/12\.10|2026-10-12/.test(raw.slice(raw.indexOf('// Codex model for escalation'), raw.indexOf('const CODEX_MODEL'))) && raw.includes('28–49% slower'), 'Codex comment block records the 12.10 decision and the A/B')
}
{
  // verifier Reddit route (audit R1): reddit-alt discovery, limit:25, no non-existent operations
  const { prompts } = await run(base)
  const vp = prompts['verify:c3#1'] || ''
  check(vp.includes('reddit-alt__reddit_search_communities') && vp.includes('limit:25') && vp.includes('get_post_details / search_all do NOT exist') && !vp.includes('operation_id="discover_subreddits"'),
    'verifier Reddit route: alt discovery, limit:25, unknown operations named, no primary discover')
}
{
  // language layers: a note only, the channel set is untouched
  const { result: r, calls, logs } = await run({ ...base, languages: ['ru', 'ja', 'pl'] })
  check(logs.some(l => l.includes('ja') && l.includes('«ja»')) && logs.some(l => l.includes('pl') && l.includes('«eu»')) && !calls.includes('ja') && !calls.includes('eu'),
    'language layers: missing ja/eu logged, not added')
  check(JSON.stringify(r.languageLayerGaps) === JSON.stringify([{ lang: 'ja', layer: 'ja' }, { lang: 'pl', layer: 'eu' }]), 'result.languageLayerGaps')
}
{
  // curator prompt: «as many as needed» wording
  const { prompts } = await run(base)
  const cp = prompts['curator'] || ''
  check(cp.includes('critical') && cp.includes('background') && cp.includes('Do NOT pad') && cp.includes('Expect 3-8') && cp.includes('hard ceiling 32') && cp.includes('evidencePrefixes: ONLY citation prefixes'),
    'curator prompt: critical/background, no padding, 3-8 load-bearing, ceiling 32, evidencePrefixes rules intact')
}
console.log(failures ? `\n${failures} FAILED` : '\nALL OK')
process.exit(failures ? 1 : 0)
