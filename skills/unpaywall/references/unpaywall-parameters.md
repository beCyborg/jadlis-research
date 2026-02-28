# Unpaywall (paper-download-mcp) — Parameter Reference

## MCP Server

```
MCP namespace (plugin-registered):
  mcp__plugin_jadlis-research_paper-download__paper_download
  mcp__plugin_jadlis-research_paper-download__paper_get_metadata

Alternative (if plugin prefix absent):
  mcp__paper-download__paper_download
  mcp__paper-download__paper_get_metadata

Server ID in .mcp.json: "paper-download"
Package: paper-download-mcp (Oxidane-bot/paper-download-mcp)
Install: uvx paper-download-mcp
Required env: PAPER_DOWNLOAD_EMAIL=your@email.com (Unpaywall API polite pool)
```

Note: Skill directory is `unpaywall/` but server ID is `paper-download`. Intentional — skill named for primary data source, server named for package.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PAPER_DOWNLOAD_EMAIL` | Required | Email for Unpaywall API polite pool. Rate-limited or rejected without it. Export in `~/.zshrc`. |

```bash
export PAPER_DOWNLOAD_EMAIL="your@email.com"
```

---

## Tool 1: `paper_download`

Downloads papers (batch 1–50) from OA sources with automatic fallback: arXiv → Unpaywall → CORE → Sci-Hub.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `papers` | list[string] | Yes | — | Paper identifiers. Accepts DOI, arXiv ID, or URL. Batch: 1–50 items per call. |
| `parallel` | integer | No | 5 | Concurrent download workers (concurrency, not batch size). Range: 1–50. `parallel=1` adds 2-second sequential delay between items for polite access. |
| `to_markdown` | boolean | No | `false` | Convert downloaded PDF to Markdown. Requires `marker` library in the uvx environment. Useful for content extraction. |
| `output_dir` | string | No | OS temp | Directory for downloaded files. |

### Batch Behavior

- 1–50 identifiers per call; split larger batches across multiple calls
- Source routing by identifier type:
  - arXiv IDs → arXiv directly (free, fast)
  - DOIs → Unpaywall → CORE → Sci-Hub (final fallback for paywalled papers)
  - Direct URLs → fetched directly
- `parallel=1`: built-in 2-second inter-item delay (server-enforced; no additional throttling needed)
- `parallel > 1`: concurrent downloads (default: 5)

### Example Call

```json
{
  "papers": ["10.1038/nature12345", "2401.12345", "10.1016/j.cell.2023.01.001"],
  "parallel": 3,
  "to_markdown": true
}
```

### Response Schema

```json
{
  "results": [
    {
      "identifier": "10.1038/nature12345",
      "status": "success",
      "source_used": "unpaywall",
      "file_path": "/tmp/paper-download/nature12345.pdf",
      "markdown_path": "/tmp/paper-download/nature12345.md",
      "error_message": null
    }
  ],
  "summary": {
    "total": 3,
    "success": 2,
    "failed": 1,
    "sources_used": {"unpaywall": 1, "arxiv": 1}
  }
}
```

`source_used` indicates which fallback tier served the paper. `markdown_path` is `null` if `to_markdown` was `false` or conversion failed.

---

## Tool 2: `paper_get_metadata`

Lightweight metadata lookup without downloading the paper. Use to check OA status before committing to a download.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `identifier` | string | Yes | — | Single identifier: DOI, arXiv ID, or URL. |

### Response Schema

```json
{
  "identifier": "10.1038/nature12345",
  "title": "Example paper title",
  "authors": ["Author A", "Author B"],
  "year": 2023,
  "journal": "Nature",
  "doi": "10.1038/nature12345",
  "is_open_access": true,
  "oa_url": "https://europepmc.org/articles/PMC1234567",
  "oa_source": "unpaywall",
  "abstract": "..."
}
```

If `is_open_access: false` and no `oa_url`, the paper is paywalled — `paper_download` may still succeed via CORE or Sci-Hub fallback.

`oa_source` reflects which source confirmed OA status: `"unpaywall"`, `"arxiv"`, `"core"`, or similar. For arXiv IDs, expect `"arxiv"` rather than `"unpaywall"`.

---

## Usage Patterns

**Pattern 1 — Metadata check before downloading:**
```
paper_get_metadata(identifier="10.xxx/...") → check is_open_access
  → paper_download(papers=["10.xxx/..."]) regardless of OA status
    (CORE/Sci-Hub fallback may still succeed even if is_open_access: false)
```

**Pattern 2 — Batch download with content extraction:**
```
paper_download(papers=[doi_1, doi_2, ..., doi_20], parallel=5, to_markdown=true)
  → read markdown_path files for content extraction
```

**Pattern 3 — Polite sequential access:**
```
paper_download(papers=["10.xxx/1", "10.xxx/2"], parallel=1)
  → server enforces 2-second delay between downloads automatically
```

---

## Sci-Hub Fallback Notice

> **Legal Notice:** `paper_download` uses Sci-Hub as a last-resort fallback for paywalled papers not found via Unpaywall or CORE. Sci-Hub access may violate copyright law depending on your jurisdiction. Users are responsible for compliance with applicable copyright law. To avoid Sci-Hub: use `paper_get_metadata` first; if `is_open_access: false`, consider skipping the download or consulting your institution's legal resources.

---

## Quirk Notes

- `to_markdown` requires the `marker` Python library in the uvx environment. If PDF-to-Markdown conversion fails silently, verify `marker` is installed in the tool's virtualenv.
- `parallel` controls concurrency; max batch is always 50 regardless of `parallel` value (as documented in plan; verify against installed version if behavior differs).
- `parallel=1` delay (2s) is built into the server — agent does not need to implement additional throttling.
- Server ID `"paper-download"` ≠ skill directory `unpaywall/` — see namespace note above.
