# YouTube — search protocol for the agent

Channel added 2026-08-15 (council verdict + a package of refinements). Routing: tech/AI,
marketing/sales, local topics (Warsaw) — per the SKILL.md tree, NOT default.

## Tools

| Tool | Purpose | Cost |
|---|---|---|
| `mcp__brave-search__brave_web_search` with `site:youtube.com` | Video discovery — PRIMARY | free (plan) |
| `mcp__youtube__searchVideos` | Precise search via the YouTube API | **100 units/call out of the 10k/day quota — hard cap ≤3 calls/run** |
| `mcp__youtube__getVideoDetails` | Metadata: views, date, channel | 1 unit — cheap |
| `{PLUGIN_ROOT}/scripts/yt-transcript.py` | FULL video transcript (wrapper: transcript-api → yt-dlp) | free; works over VPN too (verified 2026-08-26) |

## Protocol

### Layer 1 — Discovery (2-3 Brave calls, in parallel)

```json
brave_web_search({ "query": "site:youtube.com <TOPIC>", "count": 15, "extra_snippets": true })
brave_web_search({ "query": "site:youtube.com <TOPIC + review/vs/experience>", "count": 10 })
```
Parse video_id out of the URL (`watch?v=<id>`). Freshness — `freshness="py"`.
Search the platform in its own language: use the LANGUAGES / QUERIES block from the orchestrator prompt;
when `languages` contains anything beyond ru/en, Read `{PLUGIN_ROOT}/skills/full-research/references/language-layers.md`
first (native-term dictionary).

### Layer 2 — Precise top-up (0-3 API calls, NO MORE)

Only if Brave returned no relevant videos (niche topic, very recent material):
```json
mcp__youtube__searchVideos({ "query": "<TOPIC>", "maxResults": 10 })
```
**Gate:** the youtube MCP comes up only when `YOUTUBE_API_KEY` is set (the plugin's userConfig).
No key → Layer 2 is SKIPPED entirely, the channel runs on Brave + transcripts.

**Cap ≤3 calls/run** (each = 100 units out of the daily 10k quota, shared by
all consumers of the MCP). Candidate metadata — `getVideoDetails` (cheap):
views/date/channel → select 3-5 videos for transcripts.

### Layer 3 — Transcripts (3-5 videos, Bash)

```bash
python3 {PLUGIN_ROOT}/scripts/yt-transcript.py <video_id>            # default languages: en,ru,pl
python3 {PLUGIN_ROOT}/scripts/yt-transcript.py <video_id> --lang ru,en
```
JSON on stdout: `status`, `source` (`youtube-transcript-api` | `yt-dlp`), `text` (the full
text), `language`, **`is_generated`** (honest: manual vs auto), `duration_minutes`,
`word_count`, + metadata `title`/`channel`/`upload_date`/`view_count` (when yt-dlp).
Manual subs (`is_generated: false`) take priority over auto; for auto the `*-orig` track is used
(the original language, not a translation). The yt-dlp path retries 429 on the timedtext endpoint and
cycles through the formats json3→srv3→vtt. VOLUME LIMIT: keep to ≤10-12 transcripts per pass —
more in a row catches `HTTP 429 Too Many Requests` on the WHOLE IP (both yt-dlp and the API), cleared
by a cooldown of several minutes (live run 2026-08-26: 11/12 fine, after that the IP was rate-limited).
Inside: first `get_transcript.py` from the youtube-tldr plugin (youtube-transcript-api);
on `IpBlocked` — yt-dlp downloading ONE selected track. Verified 2026-08-26:
youtube-transcript-api returns IpBlocked both over VPN and from the home IP, while yt-dlp downloads
subtitles in both cases; the plugin's built-in yt-dlp fallback does not fire
(`--sub-langs all` + a 30 s timeout). Do NOT patch the plugin (autoUpdate wipes edits).
A window of mass IpBlocked (every video in a row `blocked`) → `YT_TRANSCRIPT_FORCE_YTDLP=1` before
the command — straight to yt-dlp, one wasted request per video less.
Both paths failed (`error_type: blocked_or_network`) → fallback: hosted Supadata
($5/300) — only with confirmation.

### Layer 4 — Counter-arguments (1-2 calls)

Brave: `site:youtube.com <TOPIC> criticism/problems/honest review` → 1-2
transcripts from dissenters.

## Citation rules (council verdict 2026-08-15)

- **Do NOT quote auto-subs (`is_generated: true`) verbatim** — WER ~23%:
  convey the meaning as a paraphrase marked "(auto-subs, paraphrase)". Verbatim
  quotes — only from manual subs.
- Facts from a video = ordinary claims: without independent confirmation the verifiers
  will return UNCHECKED/3 — that is normal.
- Every quote gets views + video date + channel (engagement metadata).
- reliability: a vendor's official channel = A/E (affiliation!); a practitioner
  with a track record = B; a no-name reviewer = C/D.
- Citation prefixes: [yt1], [yt2], ... URLs of the form `https://youtube.com/watch?v=<id>`
  (+ `&t=<sec>` if the quote is tied to a timestamp).
- SNAPSHOTS (schema v4): the transcript text goes into `{WORK_DIR}/snapshots/`
  for HIGH-relevance sources. **The file name = the citation prefix**
  (`yt3.md`, not `<video_id>.md`) — otherwise the orchestrator will not link the
  snapshot to the quote and the quote drops to MEDIUM as `no-snapshot`. Before the body —
  a header: `URL:`, `Date:`, `Prefix: [ytN]`, `Extractor: yt-transcript`, then a `---` line,
  then the full text. A file shorter than ~1 000 characters does not close the gate — such a
  source drops to MEDIUM. A HIGH source without a snapshot → MEDIUM + `[no-snapshot: blocked]`.

## Budget: 6-12 calls (of which ≤3 — youtube API search)

## Fallback

`yt-transcript.py` returned `blocked_or_network` (both paths) → Supadata /
youtube-transcript.io (paid, on confirmation) → quote from the video description + snippets, marked
"(reconstructed, transcript unavailable)". The youtube MCP is dead entirely →
the channel runs on Brave + transcripts (searchVideos is skipped).
