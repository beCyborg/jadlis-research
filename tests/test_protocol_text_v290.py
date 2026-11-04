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


def test_web_exa_lite_default_and_ladder_2026_11():
    s = read(PROTO / "web-protocol.md")
    assert "add `--type keyword`" not in s
    assert "never `--type keyword`" in s
    assert ".response.results" in s
    assert "Exa `lite` is the default engine for every intent except news" in s
    assert "--include-domains" in s
    # every brave_llm_context call carries a token cap
    calls = re.findall(r"brave_llm_context\(([^)]*)\)", s)
    assert calls and all("maximum_number_of_tokens=4096" in c for c in calls)
    assert "not bench-tested" in s and "STOP … 402" in s
    i = s.index("pdf-fetch.sh")
    assert i < s.index("r.jina.ai", i) < s.index('parsers:["pdf"]', i)
    j = s.index("**HTML — the default: r.jina.ai**")
    assert j < s.index('proxy="auto"', j)
    assert "JINA_API_KEY" in s and "429" in s
    # the dropped rungs are named only in the «not in the ladder» note
    assert 'contents "<url>" --full' not in s and "defuddle parse" not in s
    assert "crawl4ai-venv" not in s and "api.tavily.com" not in s
    assert "Base64-Image-Removed" in s and "6-word shingles" in s


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
