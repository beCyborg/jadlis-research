"""Probe parsing and resolve verdicts of skills/research-settings/scripts/research-sources.py."""
import importlib.util
import json
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "skills" / "research-settings" / "scripts" / "research-sources.py"


@pytest.fixture()
def rs():
    spec = importlib.util.spec_from_file_location("research_sources_probes_mod", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def jl(*events):
    return "\n".join(json.dumps(e) for e in events) + "\n"


SEARCH_DONE = {"type": "item.completed", "item": {"type": "web_search", "query": "x"}}
SEARCH_START = {"type": "item.started", "item": {"type": "web_search"}}
MESSAGE = {"type": "item.completed", "item": {"type": "agent_message", "text": "Title"}}


# ── Codex ────────────────────────────────────────────────────────────────────
def test_codex_ok_counts_completed_searches_only(rs):
    out = jl({"type": "thread.started"}, SEARCH_START, SEARCH_DONE, MESSAGE)
    state, detail = rs.classify_codex(0, out, "Reading additional input from stdin...\n", 8.2)
    assert state == "ok"
    assert "1 web_search" in detail


def test_codex_zero_searches_is_fail(rs):
    state, detail = rs.classify_codex(0, jl(MESSAGE), "", 5.0)
    assert state == "fail"
    assert "0 событий web_search" in detail


def test_codex_code_mode_host_is_fail_even_with_exit0_and_search(rs):
    err = "ERROR codex_core::tools::router: error=timed out negotiating with the code-mode host\n"
    state, detail = rs.classify_codex(0, jl(SEARCH_DONE, MESSAGE), err, 40.0)
    assert state == "fail"
    assert "code-mode host" in detail


def test_codex_code_mode_host_in_partial_output_after_timeout(rs):
    err = "error=timed out negotiating with the code-mode host"
    state, _ = rs.classify_codex(None, "", err, 80.0, timed_out=True)
    assert state == "fail"


def test_codex_plain_timeout_is_unknown(rs):
    state, detail = rs.classify_codex(None, "", "", 80.0, timed_out=True)
    assert (state, detail) == ("unknown", "timeout 80s")


def test_codex_quota_from_stderr_or_error_event(rs):
    assert rs.classify_codex(1, "", "You've hit your usage limit.", 2.0)[0] == "quota"
    out = jl({"type": "turn.failed", "error": {"message": "429 rate limit"}})
    assert rs.classify_codex(1, out, "", 2.0)[0] == "quota"


def test_codex_quota_words_in_answer_text_do_not_trip(rs):
    msg = {"type": "item.completed", "item": {"type": "agent_message", "text": "rate limit docs"}}
    assert rs.classify_codex(0, jl(SEARCH_DONE, msg), "", 3.0)[0] == "ok"


def test_count_web_search_falls_back_to_line_grep(rs):
    out = '{"type":"item.done","item":{"type":"web_search_call"}}\nnot json "web_search here\n'
    assert rs.count_web_search(out) == 2


def test_probe_codex_command_env_and_stdin(rs, monkeypatch):
    calls = {}

    def fake_run(cmd, **kw):
        calls["cmd"], calls["kw"] = cmd, kw
        return subprocess.CompletedProcess(cmd, 0, jl(SEARCH_DONE, MESSAGE).encode(), b"")

    monkeypatch.setattr(rs.shutil, "which", lambda name: "/usr/local/bin/codex")
    monkeypatch.setattr(rs, "codex_home", lambda: ("/tmp/research-codex-home", ""))
    monkeypatch.setattr(rs.subprocess, "run", fake_run)
    res = rs.probe_codex()
    assert res["state"] == "ok" and res["checked"]
    cmd = calls["cmd"]
    assert cmd[:2] == ["/usr/local/bin/codex", "exec"]
    assert cmd[cmd.index("-m") + 1] == "gpt-6.1-sol"
    assert 'service_tier="priority"' in cmd
    assert 'tools.web_search={mode="live"}' in cmd
    assert "--json" in cmd
    assert calls["kw"]["stdin"] is subprocess.DEVNULL
    assert calls["kw"]["env"]["CODEX_HOME"] == "/tmp/research-codex-home"
    assert calls["kw"]["timeout"] <= rs.GLOBAL_DEADLINE


def test_probe_codex_timeout_reads_partial_stderr(rs, monkeypatch):
    def fake_run(cmd, **kw):
        exc = subprocess.TimeoutExpired(cmd, kw["timeout"])
        exc.stdout = b""
        exc.stderr = b"timed out negotiating with the code-mode host"
        raise exc

    monkeypatch.setattr(rs.shutil, "which", lambda name: "/usr/local/bin/codex")
    monkeypatch.setattr(rs, "codex_home", lambda: ("/tmp/h", ""))
    monkeypatch.setattr(rs.subprocess, "run", fake_run)
    assert rs.probe_codex()["state"] == "fail"


def test_probe_codex_without_login_is_no_key(rs, monkeypatch):
    monkeypatch.setattr(rs.shutil, "which", lambda name: "/usr/local/bin/codex")
    monkeypatch.setattr(rs, "codex_home", lambda: (None, "codex-home.sh exit 2: no /x/auth.json"))
    assert rs.probe_codex()["state"] == "no-key"


# ── Yandex ───────────────────────────────────────────────────────────────────
YA_403 = ('[error] API HTTP 403:\n{"code":7, "message":"rpc error: code = PermissionDenied desc = '
          'Permission to [resource-manager.folder b1g] denied"}\n')


def test_yandex_403_is_fail_with_fixed_detail(rs):
    state, detail = rs.classify_yandex(3, "", YA_403)
    assert state == "fail"
    assert detail == "403 PermissionDenied: у сервисного аккаунта нет роли search-api.webSearch.user"


def test_yandex_other_verdicts(rs):
    assert rs.classify_yandex(0, "operation_id=abc\n", "[cost] async ~0.0305₽ | тест")[0] == "ok"
    assert rs.classify_yandex(2, "", "[error] YC_SEARCH_API_KEY not set")[0] == "no-key"
    assert rs.classify_yandex(3, "", "[error] API HTTP 401:\n{}")[0] == "fail"
    err501 = '[error] API HTTP 501:\n{"code":12, "message":"unknown service yandex.cloud.priv.searchapi.v2.WebSearchAsyncService"}'
    assert rs.classify_yandex(3, "", err501) == ("fail", rs.YANDEX_501_DETAIL)
    state, detail = rs.classify_yandex(3, "", "[error] API HTTP 504:\nstream timeout")
    assert state == "unknown" and "504" in detail


def test_probe_yandex_skips_call_without_key(rs, monkeypatch):
    monkeypatch.setattr(rs, "check_key", lambda name: {"state": "no-key"})
    monkeypatch.setattr(rs.subprocess, "run", lambda *a, **k: pytest.fail("must not call the API"))
    res = rs.probe_yandex()
    assert res["state"] == "no-key" and res["checked"] is None  # not cached


def test_probe_yandex_cheap_call(rs, monkeypatch):
    seen = {}

    def fake_run(cmd, **kw):
        seen["cmd"], seen["kw"] = cmd, kw
        return subprocess.CompletedProcess(cmd, 3, b"", YA_403.encode())

    monkeypatch.setattr(rs, "check_key", lambda name: {"state": "present"})
    monkeypatch.setattr(rs.subprocess, "run", fake_run)
    assert rs.probe_yandex()["state"] == "fail"
    assert "--no-wait" in seen["cmd"] and "--no-log" in seen["cmd"]
    assert seen["kw"]["stdin"] is subprocess.DEVNULL


# ── resolve ──────────────────────────────────────────────────────────────────
def run_main(rs, capsys, *argv):
    with pytest.raises(SystemExit) as exc:
        rs.main(list(argv))
    return exc.value.code, capsys.readouterr().out


def test_resolve_drops_yandex_on_403_caches_it_and_notes_telegram(rs, monkeypatch, capsys, tmp_path):
    probes = []

    def fake_yandex():
        probes.append(1)
        return rs._result("fail", rs.YANDEX_403_DETAIL)

    monkeypatch.setitem(rs.PROBE_FUNCS, "yandex-access", fake_yandex)
    monkeypatch.setattr(rs, "check_key", lambda name: {"state": "present", "rail": "env", "detail": "env"})
    code, out = run_main(rs, capsys, "--data-dir", str(tmp_path), "resolve",
                         "--channels", "web,yandex,telegram", "--json")
    data = json.loads(out)
    assert code == 0
    assert "yandex" not in data["channels"]
    drop = [d for d in data["dropped"] if d["channel"] == "yandex"][0]
    assert drop["reason"] == "no-access"
    assert drop["detail"] == rs.YANDEX_403_DETAIL
    assert "FREE SLOTS ONLY" in data["notes"]["telegram"]
    cache = json.loads((tmp_path / rs.CACHE_NAME).read_text())
    assert cache["yandex-access"]["state"] == "fail"
    # second run: served from cache, the probe is not called again
    run_main(rs, capsys, "--data-dir", str(tmp_path), "resolve", "--channels", "web,yandex", "--json")
    assert len(probes) == 1


def test_resolve_keeps_yandex_when_alive(rs, monkeypatch, capsys, tmp_path):
    monkeypatch.setitem(rs.PROBE_FUNCS, "yandex-access", lambda: rs._result("ok", "async submit принят"))
    monkeypatch.setattr(rs, "check_key", lambda name: {"state": "present", "rail": "env", "detail": "env"})
    _, out = run_main(rs, capsys, "--data-dir", str(tmp_path), "resolve", "--channels", "web,yandex", "--json")
    assert json.loads(out)["channels"] == ["web", "yandex"]


def test_telegram_paid_option_removes_free_note(rs, monkeypatch, capsys, tmp_path):
    monkeypatch.setattr(rs, "check_key", lambda name: {"state": "present", "rail": "env", "detail": "env"})
    code, _ = run_main(rs, capsys, "--data-dir", str(tmp_path), "set", "option", "telegram-stars", "paid")
    assert code == 0
    saved = json.loads((tmp_path / rs.SETTINGS_NAME).read_text())
    assert saved["options"] == {"telegram-stars": "paid"}
    _, out = run_main(rs, capsys, "--data-dir", str(tmp_path), "resolve", "--channels", "web,telegram", "--json")
    assert "telegram" not in json.loads(out)["notes"]
    run_main(rs, capsys, "--data-dir", str(tmp_path), "set", "option", "telegram-stars", "free")
    assert json.loads((tmp_path / rs.SETTINGS_NAME).read_text())["options"] == {}


def test_set_option_rejects_unknown_value(rs, capsys, tmp_path):
    code, _ = run_main(rs, capsys, "--data-dir", str(tmp_path), "set", "option", "telegram-stars", "maybe")
    assert code == rs.EXIT_USAGE
