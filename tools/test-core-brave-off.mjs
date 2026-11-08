#!/usr/bin/env node
// test-core-brave-off.mjs — 2.11.0: with providersOff ['brave'] no prompt of full-research-core.js names a
// Brave tool, and every role gets a working Exa / Reddit / X route instead. No network, no LLM.
//   1. the channel notes come from the real resolver (research-sources.py resolve --no-probe in a temp
//      data dir with `brave` and `grok` switched off) — the same path the skill takes;
//   2. a mocked run with claims from every family (web, reddit, twitter, telegram, eu layer, hn, youtube)
//      collects every agent prompt: channels, curator, verifiers (both lenses), analyst;
//   3. control run with Brave on: the web verifier still gets the Brave tools (the check can fail).
// Usage: node tools/test-core-brave-off.mjs [path/to/full-research-core.js]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const corePath = process.argv[2] || path.join(root, 'workflows', 'full-research-core.js')
const src = fs.readFileSync(corePath, 'utf8').replace(/^export\s+/gm, '')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

let failures = 0
const check = (cond, msg) => { if (!cond) { failures++; console.log('FAIL', msg) } else console.log('ok  ', msg) }

const WD = fs.mkdtempSync(path.join(os.tmpdir(), 'brave-off-'))
const DD = fs.mkdtempSync(path.join(os.tmpdir(), 'brave-off-data-'))
process.on('exit', () => { for (const d of [WD, DD]) { try { fs.rmSync(d, { recursive: true, force: true }) } catch (e) {} } })

// ── 1. notes from the real resolver ──
const RS = path.join(root, 'skills', 'research-settings', 'scripts', 'research-sources.py')
const rs = (...a) => execFileSync('python3', [RS, '--data-dir', DD, ...a], { encoding: 'utf8' })
rs('set', 'provider', 'brave', 'off')
rs('set', 'provider', 'grok', 'off')
const CHANNELS = ['web', 'reddit', 'twitter', 'hackernews', 'telegram', 'youtube', 'substack', 'eu']
const resolved = JSON.parse(rs('resolve', '--channels', CHANNELS.join(','), '--json', '--no-probe'))
check(resolved.providers_off.includes('brave') && resolved.providers_off.includes('grok'), `resolver: providers_off = ${resolved.providers_off}`)
check(resolved.channels.includes('web') && !resolved.insufficient, 'resolver: web stays on Exa, the run is sufficient')
check(Object.values(resolved.notes).every(n => !n.includes('brave_')), 'resolver: no note names a Brave tool')

// ── 2. mocked run ──
const cite = (p, url) => ({ prefix: `[${p}]`, url, relevance: 'MEDIUM', context: p, quotes: [p], reliability: 'C', reliabilityWhy: 'x' })
const PFX = { web: 'w', reddit: 'r', twitter: 'x', hackernews: 'hn', telegram: 'tg', youtube: 'yt', substack: 'ss', eu: 'eu' }
const channelMock = k => ({ source: k, sourceQuality: 'MEDIUM', fileWritten: `${WD}/${k}.md`, findings: [], counterarguments: [], snapshots: [],
  citations: [cite(`${PFX[k]}1`, `https://${k}.example.com/1`)] })
const claim = (id, channels, claimType = 'factual') => ({ id, statement: `claim ${id}`, channels, strength: 'MODERATE', importance: 'critical',
  loadBearing: false, claimType, evidencePrefixes: channels.map(c => `${PFX[c]}1`) })
const CLAIMS = [
  claim('cw', ['web']), claim('cr', ['reddit'], 'experiential'), claim('cx', ['twitter']), claim('ctg', ['telegram']),
  claim('ceu', ['eu']), claim('cmix', ['web', 'hackernews']), claim('cyt', ['youtube']), claim('css', ['substack']),
]

async function run(args) {
  const prompts = {}
  const agent = async (prompt, opts) => {
    const label = (opts && opts.label) || '?'
    prompts[label] = String(prompt)
    if (PFX[label]) { fs.writeFileSync(`${WD}/${label}.md`, `# ${label}\n`); return channelMock(label) }
    if (label.startsWith('curator')) return { candidates: CLAIMS.length, criticalTaken: CLAIMS.length, droppedByCap: 0, interrupted: 'none', claims: structuredClone(CLAIMS) }
    if (label === 'urlhealth') return { status: 'ok', elapsedSec: 1, note: 'mock', items: [] }
    if (label.startsWith('verify:')) return { claimId: label.split(':')[1].split('#')[0], verdict: 'CONFIRMED', credibility: 2, evidence: 'mock', url: 'https://v.example.com', numberVerbatim: null, searchedVia: 'exa', interrupted: 'none' }
    if (label.startsWith('escalate:')) return { claimId: label.split(':')[1], status: 'ok', confirmsExclusion: false, verdictSuggested: 'UNCHECKED', reasoning: 'mock', urls: [], liveSearchEvents: 1, interrupted: 'none' }
    if (label.startsWith('persist:')) return { path: prompt.match(/save to (\S+) VERBATIM/)[1], bytes: 1234 }
    if (label.startsWith('analyst')) return { reportPath: `${WD}/draft.md`, queryRu: 'brave-off', mainConclusion: 'ok', relatedCandidates: [], droppedClaims: [], disputedClaims: [], familySplitClaims: [], gaps: [], interrupted: 'none' }
    throw new Error('unmocked agent label: ' + label)
  }
  const fn = new AsyncFunction('args', 'agent', 'parallel', 'phase', 'log', src)
  await fn(args, agent, fns => Promise.all(fns.map(f => f())), () => {}, () => {})
  return prompts
}

const base = { refinedQuery: 'brave off topic', workDir: WD, pluginRoot: '/tmp/plugin', date: '2026-11-08', languages: ['en', 'pl'] }
const P = await run({ ...base, channels: resolved.channels, channelNotes: resolved.notes, providersOff: resolved.providers_off })
const labels = Object.keys(P)
check(CHANNELS.every(c => labels.includes(c)), `all channel agents ran (${labels.filter(l => PFX[l]).join(',')})`)
check(CLAIMS.every(c => labels.includes(`verify:${c.id}#1`) && labels.includes(`verify:${c.id}#2`)), 'both verifier lenses ran for every claim')
const leaks = labels.filter(l => P[l].includes('brave_'))
check(leaks.length === 0, `no prompt contains "brave_" (leaks: ${leaks.join(', ') || 'none'})`)
check(labels.filter(l => PFX[l]).every(l => P[l].includes('BRAVE SEARCH IS OFF') && P[l].includes('websearch.py exa')), 'every channel prompt carries the Brave-off note with the Exa command')
check(P.web.includes('You are the Web (Exa) researcher'), 'web channel is named Web (Exa)')
check(P.twitter.includes('NO second fallback') && P.twitter.includes('GROK DISABLED'), 'twitter channel: Grok off, no x.com web fallback')

const v = (id, i) => P[`verify:${id}#${i}`]
check(v('cw', 1).includes('family: web → Exa') && v('cw', 1).includes('websearch.py exa'), 'web claim, same-family lens: Exa refutation')
check(v('cr', 2).includes('websearch.py exa') && v('cr', 2).includes('LENS "CROSS-TYPE" (family: web)'), 'reddit claim, cross-type lens: Exa primary-source check')
check(v('cmix', 2).includes('websearch.py exa'), 'mixed web+hn claim: the web vote goes through Exa')
const vr = v('cr', 1)
check(vr.includes('reddit-alt__reddit_search') && vr.includes('operation_id="search_subreddit"') && vr.includes('reddit-archive.py search') && !vr.includes('site:reddit.com'),
  'reddit same-family lens: reddit_search, then search_subreddit and Arctic Shift without a key, no site:reddit.com')
check(v('cw', 2).includes('reddit-archive.py search') || v('cw', 2).includes('hn-fetch.sh'), 'web claim, community lens: HN / Reddit tools without Brave')
check(v('cx', 1).includes('twitterapi.sh') && v('cx', 1).includes('no web fallback'), 'twitter same-family lens: twitterapi.sh, no web fallback')
check(v('ctg', 1).includes('--include-domains t.me'), 'telegram same-family lens: Exa site fallback on t.me')
check(v('ceu', 1).includes('--include-domains <the layer'), 'eu layer same-family lens: Exa with the layer domains')
check(labels.filter(l => l.startsWith('verify:')).every(l => P[l].includes('searchedVia (the platform you ACTUALLY searched: exa |')), 'verifiers report searchedVia = exa')
const an = labels.find(l => l.startsWith('analyst'))
check(an && P[an].includes('Exa [w]'), 'analyst sees the web engine as Exa')

// ── 3. control: Brave on ──
const C = await run({ ...base, channels: ['web', 'reddit'], providersOff: ['grok'] })
check(C['verify:cw#1'].includes('family: web → Brave') && C['verify:cw#1'].includes('brave_web_search'), 'control: with Brave on the web verifier keeps the Brave tools')
check(!C.web.includes('BRAVE SEARCH IS OFF'), 'control: no Brave-off note when Brave is on')

console.log(failures ? `\n${failures} FAILED` : '\nALL OK')
process.exit(failures ? 1 : 0)
