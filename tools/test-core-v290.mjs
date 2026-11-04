#!/usr/bin/env node
// test-core-v290.mjs — 2.9.0 logic of full-research-core.js, no network, no LLM:
//   1. pure helpers (sliced out between the BEGIN/END PURE HELPERS markers): selectClaims ordering and
//      cap, curationStats, reuseDecision skip decisions, missingLanguageLayers;
//   2. mocked end-to-end runs: curator «as many as needed» counters in the log/ledgerSummary/synthMeta,
//      _curated.json write (no persist:ledger agent — the skill writes _ledger.json with
//      skills/research/scripts/write-ledger.py), reuseStages round trip over a REAL temp workDir: the
//      probe's python3 check is extracted from its prompt and run, the analyst reads the ledger file;
//      Codex defaults, the verifier Reddit route.
// Usage: node tools/test-core-v290.mjs [path/to/full-research-core.js]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
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
  // probe.ledger = the verdict of the python3 check, never the ledger contents (2.9.0 ledger fix)
  const ledger = { exists: true, bytes: 120000, queryTitleMatch: true, claimCount: 1, lengthMatchesTotal: true, ledgerSummary: { total: 1 }, completeness: 'complete', files: ch.map(p => ({ path: p, bytes: 500 })), error: '' }
  const noLedger = { exists: false, bytes: 0, queryTitleMatch: false, claimCount: 0, lengthMatchesTotal: false, ledgerSummary: null, completeness: null, files: [], error: '' }
  const curated = { queryTitle: Q, files: ch, curator: { claims: [{ id: 'c1' }] } }
  const P = (sizes, cur, led, curatedBytes = cur ? 9000 : 0) => ({ files: files(sizes), curated: cur, curatedBytes, ledger: led || noLedger })
  const d0 = H.reuseDecision(null, ch, Q)
  check(!d0.channels && !d0.curator && !d0.verification && d0.notes.length === 1, 'reuseDecision: no probe answer → nothing reused')
  const d1 = H.reuseDecision(P({ '/w/web.md': 500, '/w/reddit.md': 300 }, null, null), ch, Q)
  check(d1.channels && !d1.curator && !d1.verification && d1.channelPaths.length === 2, 'reuseDecision: all channel files non-empty → channels only')
  const d2 = H.reuseDecision(P({ '/w/web.md': 500, '/w/reddit.md': 0 }, null, null), ch, Q)
  check(!d2.channels && d2.notes.some(n => n.includes('/w/reddit.md')), 'reuseDecision: one empty channel file → channels run again, the file is named')
  const d3 = H.reuseDecision(P({ '/w/web.md': 500, '/w/reddit.md': null }, null, null), ch, Q)
  check(!d3.channels, 'reuseDecision: a missing channel file → channels run again')
  const d4 = H.reuseDecision(P({ '/w/web.md': 500, '/w/reddit.md': 300 }, curated, null), ch, Q)
  check(d4.channels && d4.curator && !d4.verification && d4.curated === curated, 'reuseDecision: valid _curated.json → channels + curator skipped')
  const d5 = H.reuseDecision(P({ '/w/web.md': 500, '/w/reddit.md': 300 }, curated, ledger), ch, Q)
  check(d5.channels && d5.curator && d5.verification && d5.ledger && d5.ledger.ledgerSummary.total === 1 && d5.ledger.files.join() === ch.join() && !('claimLedger' in d5.ledger),
    'reuseDecision: valid ledger verdict → channels + curator + verification skipped; carries summary + files, no claims')
  const d6 = H.reuseDecision(P({ '/w/web.md': 500, '/w/reddit.md': 300 }, curated, { ...ledger, lengthMatchesTotal: false, ledgerSummary: { total: 5 } }), ch, Q)
  check(!d6.verification && d6.curator && d6.notes.some(n => n.includes('incomplete')), 'reuseDecision: claimLedger ≠ ledgerSummary.total → falls back to the curated stage')
  const d6b = H.reuseDecision(P({ '/w/web.md': 500, '/w/reddit.md': 300 }, curated, { ...ledger, lengthMatchesTotal: true, claimCount: 3 }), ch, Q)
  check(!d6b.verification, 'reuseDecision: claimCount ≠ ledgerSummary.total is rejected even if the probe says lengthMatchesTotal')
  const d7 = H.reuseDecision(P({ '/w/web.md': 500, '/w/reddit.md': 300 }, { ...curated, queryTitle: 'other' }, { ...ledger, queryTitleMatch: false }), ch, Q)
  check(d7.channels && !d7.curator && !d7.verification && d7.notes.filter(n => n.includes('another query')).length === 2, 'reuseDecision: files of another query → only the channels are reused')
  // a run whose reddit channel failed: the ledger records only web.md; reddit.md missing does not block it
  const d8 = H.reuseDecision(P({ '/w/web.md': 500, '/w/reddit.md': null }, null, { ...ledger, files: [{ path: '/w/web.md', bytes: 500 }] }), ch, Q)
  check(d8.verification && d8.channelPaths.join() === '/w/web.md', 'reuseDecision: the ledger needs only the channel files its run used')
  const d9 = H.reuseDecision(P({ '/w/web.md': 0, '/w/reddit.md': 300 }, null, { ...ledger, files: [{ path: '/w/web.md', bytes: 0 }, { path: '/w/reddit.md', bytes: 300 }] }), ch, Q)
  check(!d9.verification && !d9.channels && d9.notes.some(n => n.includes('/w/web.md')), 'reuseDecision: a ledger whose channel file is empty → not reused')
  const d10 = H.reuseDecision(P({ '/w/web.md': 500, '/w/reddit.md': 300 }, null, { ...noLedger, exists: true, bytes: 900, error: 'JSONDecodeError: x' }), ch, Q)
  check(!d10.verification && d10.channels && d10.notes.some(n => n.includes('unreadable')), 'reuseDecision: unparsable _ledger.json → not reused, named')
  const d11 = H.reuseDecision(P({ '/w/web.md': 500, '/w/reddit.md': 300 }, curated, null, 41 * 1024), ch, Q)
  check(d11.channels && !d11.curator && d11.notes.some(n => n.includes('too big')), 'reuseDecision: _curated.json > 40 KB → curator runs again even if the probe echoed it')
  const d12 = H.reuseDecision(P({ '/w/web.md': 500, '/w/reddit.md': 300 }, curated, null, 40 * 1024), ch, Q)
  check(d12.curator, 'reuseDecision: _curated.json of exactly 40 KB is still reused')
}
{
  const g = H.missingLanguageLayers(['ru', 'en', 'ja', 'pl', 'de', 'fr', 'ko'], ['web', 'reddit', 'ko'])
  check(JSON.stringify(g) === JSON.stringify([{ lang: 'ja', layer: 'ja' }, { lang: 'pl', layer: 'eu' }, { lang: 'de', layer: 'eu' }, { lang: 'fr', layer: null }]),
    `missingLanguageLayers: ja→ja, pl/de→eu, fr has no layer, ko selected, ru/en skipped (got ${JSON.stringify(g)})`)
  check(H.missingLanguageLayers(['uk', 'es'], ['eu']).length === 0, 'missingLanguageLayers: uk/es covered by a selected eu layer')
}

// ── 2. mocked end-to-end runs ──
// A real temp workDir: the reuse runs need real files for the probe's python3 check.
const WD = fs.mkdtempSync(path.join(os.tmpdir(), 'v290-'))
process.on('exit', () => { try { fs.rmSync(WD, { recursive: true, force: true }) } catch (e) {} })
const WRITE_LEDGER = path.join(here, '..', 'skills', 'research', 'scripts', 'write-ledger.py')
const channels = {
  web: { source: 'Web', sourceQuality: 'HIGH', fileWritten: `${WD}/web.md`, findings: [], counterarguments: [], snapshots: [`${WD}/snapshots/w1.md`],
    citations: [{ prefix: '[w1]', url: 'https://docs.example.com/a', relevance: 'HIGH', context: 'a', quotes: ['alpha'], reliability: 'A', reliabilityWhy: 'docs' }] },
  codexweb: { source: 'Codex', sourceQuality: 'HIGH', fileWritten: `${WD}/web-codex.md`, findings: [], counterarguments: [], snapshots: [],
    citations: [{ prefix: '[cx1]', url: 'https://docs.example.com/e', relevance: 'MEDIUM', context: 'e', quotes: [], reliability: 'A', reliabilityWhy: 'docs' }] },
  reddit: { source: 'Reddit', sourceQuality: 'MEDIUM', fileWritten: `${WD}/reddit.md`, findings: [], counterarguments: [], snapshots: [],
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
    if (label === 'reuse:probe') return hooks.probe ? hooks.probe(prompt) : runProbe(prompt)
    if (label.startsWith('curator')) return (hooks.curator || smallCurator)()
    if (label === 'urlhealth') return { status: 'ok', elapsedSec: 1, note: 'mock', items: [] }
    if (label.startsWith('verify:')) return { claimId: label.split(':')[1].split('#')[0], verdict: hooks.verdict ? hooks.verdict(label) : 'CONFIRMED', credibility: 2, evidence: 'mock', url: 'https://v.example.com', numberVerbatim: null, searchedVia: 'mock', interrupted: 'none' }
    if (label.startsWith('escalate:')) return { claimId: label.split(':')[1], status: 'ok', confirmsExclusion: false, verdictSuggested: 'UNCHECKED', reasoning: 'mock', urls: [], liveSearchEvents: 1, interrupted: 'none' }
    if (label.startsWith('persist:')) return { path: prompt.match(/save to (\S+) VERBATIM/)[1], bytes: 1234 }
    if (label.startsWith('analyst')) return { reportPath: `${WD}/draft.md`, queryRu: 'v290', mainConclusion: 'ok', relatedCandidates: [], droppedClaims: [], disputedClaims: [], familySplitClaims: [], gaps: [], interrupted: 'none' }
    throw new Error('unmocked agent label: ' + label)
  }
  const fn = new AsyncFunction('args', 'agent', 'parallel', 'phase', 'log', src)
  const result = await fn(args, agent, fns => Promise.all(fns.map(f => f())), () => {}, m => logs.push(String(m)))
  return { result, calls, prompts, optsBy, logs }
}
// The reuse:probe agent, played by running the python3 heredoc of its prompt for real.
function runProbe(prompt) {
  const m = String(prompt).match(/python3 - <<'PY'\n([\s\S]*?)\nPY\n/)
  if (!m) throw new Error('probe prompt has no python3 heredoc')
  return JSON.parse(execFileSync('python3', ['-'], { input: m[1], encoding: 'utf8' }))
}
const base = { refinedQuery: 'v290 topic «кавычки» it\'s "q"', channels: ['web', 'codexweb', 'reddit'], workDir: WD, pluginRoot: '/tmp/plugin', date: '2026-10-12' }

let stored = null
{
  // default run: curator counters, _curated.json written, NO persist:ledger agent, no probe
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
  check(calls.includes('persist:curated') && !calls.some(c => c === 'persist:ledger'), 'default: _curated.json written by persist:curated; no persist:ledger agent')
  check(!/persistJson\('ledger'/.test(raw) && raw.includes('write-ledger.py'), 'core: no persistJson(\'ledger\'…) call left; the comment names write-ledger.py')
  const pc = prompts['persist:curated']
  check(pc.includes(`save to ${WD}/_curated.json VERBATIM`), 'stage file lands in workDir under _curated.json')
  const C = payloadOf(pc)
  check(C.queryTitle === r.queryTitle && C.curator.claims.length === 40 && C.curator.candidates === 45 && C.files.length === 3 && C.curation.droppedByCap === 8, '_curated.json: raw curator answer + counters + channel files')
  check(Array.isArray(r.stageFiles) && r.stageFiles.length === 1 && r.stageFiles[0].kind === 'curated' && r.stageFiles[0].ok, 'result.stageFiles reports only the curated write')
  check(r.queryTitle === 'v290 topic «кавычки» it\'s \'q\'' && r.date === '2026-10-12' && r.ledgerFromDisk === undefined, 'result carries queryTitle + date (for write-ledger.py), no ledgerFromDisk on a normal run')
  check(!/^(REPORT|SUMMARY|FINDINGS|ANALYSIS).*\.md$/i.test('_curated.json') && !/^(REPORT|SUMMARY|FINDINGS|ANALYSIS).*\.md$/i.test('_ledger.json'), 'stage file names pass the subagent Write gate')
  check(r.reusedStages === undefined, 'default: no reusedStages key in the result')
  check((prompts['analyst'] || '').includes('"id": "k21"') && !(prompts['analyst'] || '').includes('_ledger.json'), 'default analyst prompt: inline LEDGER JSON, no file reference')

  // Phase C: the skill writes _ledger.json deterministically from the workflow output file
  fs.mkdirSync(`${WD}/snapshots`, { recursive: true })
  for (const k of Object.keys(channels)) fs.writeFileSync(channels[k].fileWritten, `# ${k}\nmock channel file\n`)
  fs.writeFileSync(`${WD}/_curated.json`, JSON.stringify(C))
  const outFile = path.join(WD, 'wf.output')
  fs.writeFileSync(outFile, JSON.stringify({ summary: 'mock', result: r }))
  let wl = ''
  try { wl = execFileSync('python3', [WRITE_LEDGER, outFile, WD], { encoding: 'utf8' }) } catch (e) { wl = 'EXIT ' + e.status + ' ' + e.stderr }
  check(/^write-ledger: ok: .*_ledger\.json — \d+ B, 32 claims$/m.test(wl), `write-ledger.py writes the ledger from the output file (${wl.trim()})`)
  const L = JSON.parse(fs.readFileSync(`${WD}/_ledger.json`, 'utf8'))
  check(L.kind === 'full-research-ledger' && L.queryTitle === r.queryTitle && L.claimLedger.length === 32 && L.ledgerSummary.total === 32 && L.escalationStats && L.snapshotGate && L.files.length === 3 && L.curation && !JSON.stringify(L).includes('"rawVotes"'),
    '_ledger.json: claimLedger + ledgerSummary + escalationStats + snapshotGate + curation + files + queryTitle, no rawVotes')
  stored = { C, L, r, analyst: prompts['analyst'] }
}
// From here on the workDir holds real files: 3 channel files, _curated.json, _ledger.json (written by
// write-ledger.py above). The reuse:probe agent is played by running its python3 heredoc for real.
const LEDGER = `${WD}/_ledger.json`, CURATED = `${WD}/_curated.json`
const aside = (f, fn) => async () => { fs.renameSync(f, f + '.aside'); try { return await fn() } finally { fs.renameSync(f + '.aside', f) } }
{
  // reuseStages + _ledger.json → only the analyst runs; the ledger never passes through a model
  let probeAnswer = null
  const { result: r, calls, prompts, logs } = await run({ ...base, reuseStages: true }, { probe: p => (probeAnswer = runProbe(p)) })
  const pp = prompts['reuse:probe'] || ''
  check(pp.includes(LEDGER) && pp.includes(`${WD}/reddit.md`) && pp.includes("python3 - <<'PY'") && !/\bRead it\b|Read with offset/.test(pp), 'reuse: probe runs one python3 check over channel files + stage files, no Read of the ledger')
  check(/[^\x00-\x7f]/.test(base.refinedQuery) && !/[^\x00-\x7f]/.test(pp.split("<<'PY'")[1].split('\nPY\n')[0]), 'reuse: the probe script is ASCII-only (non-ASCII query title \\u-escaped)')
  check(probeAnswer && probeAnswer.ledger.exists && probeAnswer.ledger.queryTitleMatch === true && probeAnswer.ledger.claimCount === 32 && probeAnswer.ledger.lengthMatchesTotal === true && probeAnswer.ledger.ledgerSummary.total === 32 && probeAnswer.ledger.files.length === 3 && probeAnswer.ledger.files.every(f => f.bytes > 0),
    `probe check: exists, title match (quotes/«» survive), claimCount = total, channel files non-empty (got ${JSON.stringify(probeAnswer && { ...probeAnswer.ledger, ledgerSummary: '…' })})`)
  check(probeAnswer && !JSON.stringify(probeAnswer.ledger).includes('claimLedger') && !JSON.stringify(probeAnswer.ledger).includes('"statement"') && probeAnswer.curatedBytes > 0 && probeAnswer.curated && probeAnswer.curated.curator.claims.length === 40,
    'probe answer: no ledger contents; _curated.json (small) echoed with its size')
  const props = Object.keys(Function(`${raw.slice(raw.indexOf('const REUSE_PROBE_SCHEMA'), raw.indexOf('const URLHEALTH_SCHEMA'))}; return REUSE_PROBE_SCHEMA`)().properties.ledger.properties)
  check(props.join() === 'exists,bytes,queryTitleMatch,claimCount,lengthMatchesTotal,ledgerSummary,completeness,files,error', `REUSE_PROBE_SCHEMA.ledger has only the check fields (got ${props})`)
  check(!calls.some(c => ['web', 'codexweb', 'reddit'].includes(c) || c.startsWith('curator') || c.startsWith('verify:') || c.startsWith('reuse:web') || c.startsWith('persist:')),
    `reuse ledger: no channels, no curator, no verifiers, no rewrites (calls ${calls})`)
  check(r.status === 'ok' && Array.isArray(r.claimLedger) && r.claimLedger.length === 0 && r.ledgerFromDisk === LEDGER && r.synthMeta.ledgerSummary.total === 32 && r.files.length === 3,
    'reuse ledger: result has claimLedger: [] + ledgerFromDisk + the stored summary and files')
  check(r.reusedStages && r.reusedStages.channels && r.reusedStages.curator && r.reusedStages.verification, 'reuse ledger: reusedStages all true')
  const ap = prompts['analyst'] || ''
  check(ap.includes(`Read the CROSS-VERIFICATION LEDGER from ${LEDGER} (field claimLedger) completely before writing`) && !ap.includes('"id": "k21"') && ap.includes('claims_confirmed: 32'),
    'reuse ledger: analyst prompt points to the file instead of inline JSON; frontmatter numbers from the stored summary')
  const head = t => t.split('numbers verbatim:\n')[0], tail = t => t.slice(t.indexOf('\n\nLEDGER SUMMARY:'))
  check(head(ap) === head(stored.analyst) && tail(ap) === tail(stored.analyst), 'reuse ledger: the rest of the analyst prompt is identical to the normal run')
  check(logs.some(l => l.startsWith('reuseStages:') && l.includes('из _ledger.json')), 'reuse ledger: logged')
}
{
  // another query → neither stage file is reused, the channels are
  const { result: r, calls } = await run({ ...base, refinedQuery: 'другая тема', reuseStages: true })
  check(r.reusedStages.channels && !r.reusedStages.curator && !r.reusedStages.verification && r.reusedStages.notes.filter(n => n.includes('another query')).length === 2 && calls.includes('curator'),
    'reuse: stage files of another query → only the channels are reused')
}
{
  // truncated ledger on disk (claimLedger ≠ total) → falls back to _curated.json
  const full = fs.readFileSync(LEDGER, 'utf8')
  const cut = JSON.parse(full); cut.claimLedger = cut.claimLedger.slice(0, 5)
  fs.writeFileSync(LEDGER, JSON.stringify(cut))
  try {
    const { result: r } = await run({ ...base, reuseStages: true }, { curator: () => { throw new Error('curator must not run') } })
    check(!r.reusedStages.verification && r.reusedStages.curator && r.reusedStages.notes.some(n => n.includes('incomplete')), 'reuse: truncated _ledger.json → not reused, curated stage reused')
  } finally { fs.writeFileSync(LEDGER, full) }
}
await aside(LEDGER, async () => {
  // reuseStages + _curated.json only → channels restored from files, curator skipped, verification runs
  const { result: r, calls, logs } = await run({ ...base, reuseStages: true }, { curator: () => { throw new Error('curator must not run') } })
  check(['reuse:web', 'reuse:codexweb', 'reuse:reddit'].every(l => calls.includes(l)) && !calls.some(c => ['web', 'codexweb', 'reddit'].includes(c)), 'reuse curated: channels restored by reuse:<key>, no channel researchers')
  check(!calls.some(c => c.startsWith('curator')) && calls.filter(c => c.startsWith('verify:')).length === 64 && !calls.some(c => c.startsWith('persist:')),
    'reuse curated: no curator, verification over the stored 40→32 claims, no persist agent at all')
  check(r.status === 'ok' && r.reusedStages.curator && !r.reusedStages.verification && r.synthMeta.curation.droppedByCap === 8 && r.claimLedger.length === 32 && !r.ledgerFromDisk,
    'reuse curated: status ok, counters recomputed, full claimLedger in the result for write-ledger.py')
  check(logs.some(l => l.includes('куратор не запускаю')), 'reuse curated: logged')
})()
await aside(LEDGER, async () => {
  // _curated.json over 40 KB → the probe does not echo it and the curator runs again
  const small = fs.readFileSync(CURATED, 'utf8')
  const big = JSON.parse(small); big.padding = 'x'.repeat(42 * 1024)
  fs.writeFileSync(CURATED, JSON.stringify(big))
  try {
    let probeAnswer = null
    const { result: r, calls } = await run({ ...base, reuseStages: true }, { probe: p => (probeAnswer = runProbe(p)) })
    check(probeAnswer.curated === null && probeAnswer.curatedBytes > 40 * 1024, 'probe: _curated.json > 40 KB is not echoed (curated=null, size reported)')
    check(r.reusedStages.channels && !r.reusedStages.curator && calls.includes('curator') && r.reusedStages.notes.some(n => n.includes('too big')), 'reuse: _curated.json > 40 KB → fresh curator, note says why')
  } finally { fs.writeFileSync(CURATED, small) }
})()
await aside(LEDGER, aside(CURATED, async () => {
  // reuseStages + channel files only → restore channels, curator runs
  const { calls, result: r } = await run({ ...base, reuseStages: true })
  check(calls.includes('reuse:web') && calls.includes('curator') && calls.includes('persist:curated') && !calls.includes('persist:ledger') && r.reusedStages.channels && !r.reusedStages.curator, 'reuse channels: restored channels, curator + _curated.json write run')
}))()
await aside(`${WD}/reddit.md`, async () => {
  // reuseStages, a channel file missing → the ledger and the channels are not reused
  const { calls, result: r } = await run({ ...base, reuseStages: true })
  check(calls.includes('web') && calls.includes('reddit') && !calls.includes('reuse:web') && r.reusedStages.channels === false && !r.reusedStages.verification, 'reuse: missing channel file → channels run again')
})()
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
  check(vp.includes('reddit-alt__reddit_search') && vp.includes('site:reddit.com') && vp.includes('limit:25') && !vp.includes('reddit_search_communities') && vp.includes('get_post_details / search_all do NOT exist') && !vp.includes('operation_id="discover_subreddits"'),
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
  check(cp.includes('YOUTUBE FAMILY RULE') && cp.includes('own test or first-hand result') && cp.includes('Comments under videos are not evidence'),
    'curator prompt: a YouTube retelling is not a second source family')
}
console.log(failures ? `\n${failures} FAILED` : '\nALL OK')
process.exit(failures ? 1 : 0)
