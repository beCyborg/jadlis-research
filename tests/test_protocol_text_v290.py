"""Text invariants of the channel protocols after the R1 audit fixes (2.9.0)."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROTO = ROOT / "skills" / "research" / "protocols"
REFS = ROOT / "skills" / "research" / "references"


def read(p):
    return p.read_text(encoding="utf-8")


def test_codex_pins_one_model_and_priority_everywhere():
    s = read(PROTO / "codex-web-protocol.md")
    commands = [l for l in s.splitlines() if "codex exec -m " in l]
    assert len(commands) >= 4  # base, call 1, call 2, escalation (+ Responses replacement)
    assert all("-m gpt-6.1-sol " in l for l in commands)
    assert all('service_tier="default"' not in l for l in commands)
    assert all('service_tier="priority"' in l for l in commands if "service_tier" in l)
    assert "2024-2026" not in s and "Prefer sources from the last 24 months" in s
    assert "timed out negotiating with the code-mode host" in s
    assert "156 s" not in s and "timeout: 300000" not in s


def test_twitter_grok_moved_out_and_note_section_still_exists():
    tw = read(PROTO / "twitter-protocol.md")
    grok = read(PROTO / "twitter-grok-protocol.md")
    # the GROK_OFF_NOTE (resolve, core, SKILL.md) names this section
    assert "## TwitterAPI.io layer" in tw and "### Mode B — keyword-only" in tw
    assert "twitter-grok-protocol.md" in tw and "GROK OK" in tw
    assert "~/.grok/bin/grok -p" not in tw and "x_keyword_search" not in tw
    assert "~/.grok/bin/grok -p" in grok
    assert "486 s" not in tw
    assert re.search(r"0 tweets with rc=0", tw)
    assert "since:<DATE − 12 months>' Top" in tw


def test_telegram_free_slots_rule_and_no_dead_fallbacks():
    s = read(PROTO / "telegram-protocol.md")
    assert "topped up the Stars balance for research" not in s
    assert "free daily slots ONLY" in s
    assert "TGStat API START" not in s and "web.telegram.org" not in s
    assert "Output shape" in s and "never through a shell variable" in s


def test_web_exa_auto_and_pdf_ladder():
    s = read(PROTO / "web-protocol.md")
    assert "add `--type keyword`" not in s
    assert "never `--type keyword`" in s
    assert ".response.results" in s
    i = s.index("pdf-fetch.sh")
    assert i < s.index("r.jina.ai", i) < s.index("contents \"<url>\" --full", i) < s.index('parsers:["pdf"]', i)


def test_youtube_full_tool_names_and_layers_without_grokweb():
    yt = read(PROTO / "youtube-protocol.md")
    assert "mcp__brave-search__" not in yt and "`mcp__youtube__" not in yt
    assert "mcp__plugin_jadlis-search_youtube__searchVideos" in yt
    assert "grokweb" not in read(REFS / "language-layers.md")
    assert "kojinkaihatsu or" not in read(PROTO / "ja-protocol.md")


def test_every_channel_budget_states_reality():
    for name in ["web", "codex-web", "reddit", "twitter", "hackernews", "substack", "telegram",
                 "youtube", "yandex", "eu", "ja", "zh", "ko"]:
        s = read(PROTO / f"{name}-protocol.md")
        assert re.search(r"(Reality|Реальность)", s), name
