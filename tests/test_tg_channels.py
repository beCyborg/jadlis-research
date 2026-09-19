import json
import os
import subprocess
import sys

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "scripts", "tg-channels.py")


def run(tmp_path, *args):
    env = dict(os.environ, TG_CHANNELS_FILE=str(tmp_path / "reg" / "channels.jsonl"))
    p = subprocess.run([sys.executable, SCRIPT, *args], capture_output=True, text=True, env=env)
    return p.returncode, p.stdout, p.stderr


def test_list_empty_registry(tmp_path):
    rc, out, _ = run(tmp_path, "list", "--tags", "seo", "--out", "json")
    assert rc == 0
    assert json.loads(out) == {"channels": [], "all_tags": []}


def test_add_and_list_ranking(tmp_path):
    assert run(tmp_path, "add", "--handle", "@seo_drift", "--tags", "seo,geo", "--cited", "6", "--run", "r6")[0] == 0
    assert run(tmp_path, "add", "--handle", "copy_chan", "--tags", "copywriting", "--cited", "9", "--run", "r1")[0] == 0
    assert run(tmp_path, "add", "--handle", "geo_only", "--tags", "geo", "--cited", "20", "--run", "r6")[0] == 0
    assert run(tmp_path, "add", "--handle", "seo_drift", "--tags", "landing", "--cited", "1", "--run", "r7")[0] == 0
    rc, out, _ = run(tmp_path, "list", "--tags", "seo,geo", "--out", "json")
    d = json.loads(out)
    hs = [c["handle"] for c in d["channels"]]
    assert hs == ["seo_drift", "geo_only"]  # 2 matched tags beat more citations
    top = d["channels"][0]
    assert top["cited"] == 7 and top["runs"] == 2 and "landing" in top["tags"]
    assert d["all_tags"] == ["copywriting", "geo", "landing", "seo"]
    rc, out, _ = run(tmp_path, "list", "--tags", "copywriting")
    assert "@copy_chan" in out and "# all tags:" in out


def test_add_rejects_bad_handle(tmp_path):
    rc, _, err = run(tmp_path, "add", "--handle", "a; rm -rf", "--tags", "x", "--run", "r")
    assert rc == 3 and "bad handle" in err


def test_import_workdir_counts_and_is_idempotent(tmp_path):
    wd = tmp_path / "abc_run-slug"
    wd.mkdir()
    (wd / "telegram.md").write_text(
        "### [tg1] a\n**Source:** https://t.me/seo_drift/455 / **Context:** x\n"
        "### [tg2] b\n**Source:** https://t.me/seo_drift/460?comment=3 / x\n"
        "### [tg3] c\n**Source:** https://t.me/s/other_chan/12 / x\n"
        "### [tg4] d\n**Source:** https://t.me/joinchat/AAAA / x\n", encoding="utf-8")
    rc, out, _ = run(tmp_path, "import-workdir", str(wd), "--tags", "seo")
    assert rc == 0
    assert json.loads(out)["handles"] == {"seo_drift": 2, "other_chan": 1}
    run(tmp_path, "import-workdir", str(wd), "--tags", "seo")
    d = json.loads(run(tmp_path, "list", "--tags", "seo", "--out", "json")[1])
    assert [(c["handle"], c["cited"]) for c in d["channels"]] == [("seo_drift", 2), ("other_chan", 1)]
