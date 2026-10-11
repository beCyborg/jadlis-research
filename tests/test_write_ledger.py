import json
import pathlib
import subprocess
import sys

SCRIPT = pathlib.Path(__file__).resolve().parent.parent / "skills/research/scripts/write-ledger.py"


def result(**over):
    claims = [{"id": "c1", "statement": "a", "verdict": "CONFIRMED", "rawVotes": [1]},
              {"id": "c2", "statement": "b «ё»", "verdict": "UNCHECKED"}]
    r = {"workDir": "/w", "status": "ok", "ledgerSchemaVersion": 5, "queryTitle": "Тема «x»", "date": "2026-10-12",
         "files": ["/w/web.md"], "channelStatus": [{"channel": "web"}], "completeness": "complete",
         "claimLedger": claims, "escalationStats": {"escalated": 0}, "snapshotGate": {"demotedTotal": 0},
         "synthMeta": {"ledgerSummary": {"total": 2, "confirmed": 1}, "curation": {"candidates": 4}}}
    r.update(over)
    return r


def run(tmp_path, payload, raw=None):
    out = tmp_path / "wf.output"
    out.write_text(raw if raw is not None else json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    wd = tmp_path / "wd"
    wd.mkdir(exist_ok=True)
    p = subprocess.run([sys.executable, str(SCRIPT), str(out), str(wd)], capture_output=True, text=True)
    return p, wd / "_ledger.json"


def test_writes_ledger_from_envelope(tmp_path):
    p, f = run(tmp_path, {"summary": "s", "result": result()})
    assert p.returncode == 0, p.stderr
    assert "2 claims" in p.stdout
    d = json.loads(f.read_text(encoding="utf-8"))
    assert d["kind"] == "full-research-ledger" and d["queryTitle"] == "Тема «x»"
    assert len(d["claimLedger"]) == d["ledgerSummary"]["total"] == 2
    assert "rawVotes" not in f.read_text(encoding="utf-8")
    assert d["curation"] == {"candidates": 4} and d["escalationStats"] and d["snapshotGate"] and d["files"] == ["/w/web.md"]
    assert max(len(line) for line in f.read_text(encoding="utf-8").splitlines()) < 200  # line-based Read stays possible


def test_query_title_fallback_from_curated(tmp_path):
    (tmp_path / "wd").mkdir()
    (tmp_path / "wd" / "_curated.json").write_text(json.dumps({"queryTitle": "from curated"}), encoding="utf-8")
    r = result()
    del r["queryTitle"]
    p, f = run(tmp_path, {"result": r})
    assert p.returncode == 0 and "from _curated.json" in p.stdout
    assert json.loads(f.read_text(encoding="utf-8"))["queryTitle"] == "from curated"


def test_reuse_path_is_a_skip(tmp_path):
    p, f = run(tmp_path, {"result": result(claimLedger=[], ledgerFromDisk="/w/_ledger.json")})
    assert p.returncode == 0 and "skip" in p.stdout and not f.exists()


def test_inconsistent_or_empty_result_fails_without_writing(tmp_path):
    p, f = run(tmp_path, {"result": result(synthMeta={"ledgerSummary": {"total": 5}})})
    assert p.returncode == 1 and "inconsistent" in p.stderr and not f.exists()
    p, f = run(tmp_path, {"result": result(status="curation-failed", claimLedger=[])})
    assert p.returncode == 1 and "no claimLedger" in p.stderr and not f.exists()
    p, f = run(tmp_path, None, raw="not json")
    assert p.returncode == 1 and "not JSON" in p.stderr


def test_result_as_json_string(tmp_path):
    p, f = run(tmp_path, {"result": json.dumps(result())})
    assert p.returncode == 0 and f.exists()
