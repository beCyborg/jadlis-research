---
name: unpaywall
description: "Open-access paper retrieval via Unpaywall/CORE/Sci-Hub fallback. 2 tools: paper_download (batch 1-50, PDF+Markdown) and paper_get_metadata (DOI/arXiv/URL lookup). Final-step access utility — use after primary sources identify papers."
user-invocable: false
allowed-tools: mcp__plugin_jadlis-research_paper-download__paper_download, mcp__plugin_jadlis-research_paper-download__paper_get_metadata
---

## When to Use This Source

Unpaywall is a final-step access utility, not a discovery tool. Use it:
- After Semantic Scholar, OpenAlex, PubMed, or arXiv identify papers and full text is needed
- When a paper is not already available on arXiv or PubMed Central OA
- For batch retrieval: 1–50 papers per call

Do not use for discovery — no search capability, accepts only identifiers.

## Tool Decision Table

| Task | Tool |
|------|------|
| Get quick metadata (title, authors, OA status) without downloading | `paper_get_metadata` |
| Download 1 or more papers for full-text reading | `paper_download` |

## Source Routing in `paper_download`

Internal fallback chain (automatic):
- arXiv IDs → arXiv directly (free, fast)
- DOIs → Unpaywall → CORE → Sci-Hub (final fallback, older/paywalled papers)

`to_markdown: true` converts PDF to Markdown for content extraction. Recommended for full-text analysis.

## Key Parameters

**`paper_download`:**
- `identifier` — DOI, arXiv ID, or URL (required)
- `to_markdown` — bool (JSON: `true`/`false`); converts PDF to Markdown (recommended for content extraction)
- `parallel` — int 1–50; **concurrency level** (not batch size — batch is the `identifier` list length). `parallel=1` downloads sequentially with 2s delay for politeness; higher values download concurrently

**`paper_get_metadata`:**
- `identifier` — DOI, arXiv ID, or URL (required)

For batch download, pass a list of identifiers to `paper_download`.

## Legal Notice

> **Sci-Hub Disclosure:** `paper-download-mcp` uses Sci-Hub as a fallback source for paywalled papers. Sci-Hub access is **jurisdiction-dependent** — in some regions, accessing Sci-Hub may violate copyright law. The user is responsible for copyright compliance. Sci-Hub fallback activates automatically for paywalled papers when Unpaywall and CORE return no result; it can be disabled via a tool parameter — see `skills/unpaywall/references/unpaywall-parameters.md` for the specific parameter name.

## Required Environment Variable

```
PAPER_DOWNLOAD_EMAIL=your@email.com   # Unpaywall API polite pool — required
```

Export in `~/.zshrc`. Without it, Unpaywall API may throttle or block requests.

## MCP Namespace Note

Primary: `mcp__plugin_jadlis-research_paper-download__<tool>`
Fallback: `mcp__paper-download__<tool>`

If tools silently fail (no response, no error), the plugin prefix may be absent — try the fallback form and update `allowed-tools` in the frontmatter accordingly.

## Cross-Reference

- See `skills/unpaywall/references/unpaywall-parameters.md` for full parameter tables and response schema
- Complements: `crossref` skill (citation metadata), `arxiv` skill (direct arXiv download)
- Used by: `academic-worker` agent as final-step access utility
