#!/usr/bin/env python3
"""Write {workDir}/_ledger.json from a full-research-core workflow output file (stdlib only).

Usage: python3 write-ledger.py <workflow-output-file> <workDir>

The workflow runner has no filesystem and a model cannot copy a 100+ KB ledger verbatim, so the
skill writes the ledger deterministically in Phase C from the `<task-notification>` output file:
a JSON envelope whose "result" is the core's result object (a bare result object is accepted too).

Exit 0 — written and re-read as valid JSON, or nothing to do (the run reused _ledger.json from
disk: result.ledgerFromDisk). Exit 1 — bad input or a failed write; nothing is half-written
(temp file + os.replace). One line on stdout/stderr says what happened.
"""
import json
import os
import sys
import tempfile

KIND = "full-research-ledger"
VERSION = 2  # 2: written by write-ledger.py from the workflow result (1: persist:ledger agent)


def fail(msg):
    print(f"write-ledger: ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def load_result(path):
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except FileNotFoundError:
        fail(f"output file not found: {path}")
    except (OSError, ValueError) as e:
        fail(f"output file is not JSON ({type(e).__name__}: {e}): {path}")
    res = data.get("result", data) if isinstance(data, dict) else None
    if isinstance(res, str):
        try:
            res = json.loads(res)
        except ValueError:
            fail("envelope 'result' is a string that is not JSON")
    if not isinstance(res, dict):
        fail("no result object in the output file (expected {'result': {...}})")
    return res


def query_title(res, work_dir):
    """result.queryTitle (core ≥ 2.9.0 ledger fix); older results → the one in _curated.json."""
    if isinstance(res.get("queryTitle"), str) and res["queryTitle"]:
        return res["queryTitle"], "result"
    try:
        with open(os.path.join(work_dir, "_curated.json"), encoding="utf-8") as fh:
            t = json.load(fh).get("queryTitle")
        if isinstance(t, str) and t:
            return t, "_curated.json"
    except (OSError, ValueError, AttributeError):
        pass
    return None, None


def build(res, work_dir):
    if res.get("ledgerFromDisk") and not res.get("claimLedger"):
        return None, f"run reused {res['ledgerFromDisk']} — ledger already on disk, not rewritten"
    claims = res.get("claimLedger")
    if not isinstance(claims, list) or not claims:
        fail(f"result has no claimLedger (status={res.get('status')!r}) — nothing to write")
    meta = res.get("synthMeta") if isinstance(res.get("synthMeta"), dict) else {}
    summary = meta.get("ledgerSummary")
    if not isinstance(summary, dict):
        fail("result has no synthMeta.ledgerSummary")
    if summary.get("total") != len(claims):
        fail(f"claimLedger has {len(claims)} claims but ledgerSummary.total={summary.get('total')!r} — inconsistent result, not written")
    title, title_src = query_title(res, work_dir)
    files = res.get("files")
    if not isinstance(files, list) or not files:
        fail("result has no files (channel file list) — a reuse could not check them")
    ledger = {
        "kind": KIND,
        "version": VERSION,
        "writtenBy": "write-ledger.py",
        "ledgerSchemaVersion": res.get("ledgerSchemaVersion"),
        "queryTitle": title,
        "date": res.get("date"),
        "status": res.get("status"),
        "channelsSelected": res.get("channelsSelected"),
        "files": files,
        "channelsAnswered": res.get("channelsAnswered"),
        "channelStatus": res.get("channelStatus"),
        "failedChannels": res.get("failedChannels"),
        "answeredFamilies": res.get("answeredFamilies"),
        "timing": res.get("timing"),
        "completeness": res.get("completeness"),
        "claimLedger": [{k: v for k, v in c.items() if k != "rawVotes"} if isinstance(c, dict) else c for c in claims],
        "ledgerSummary": summary,
        "curation": meta.get("curation"),
        "escalationStats": res.get("escalationStats"),
        "snapshotGate": res.get("snapshotGate"),
        "evidenceHealth": res.get("evidenceHealth"),
        "urlhealthSummary": res.get("urlhealthSummary"),
    }
    note = "" if title_src == "result" else (" (queryTitle from _curated.json)" if title_src else " (WARNING: no queryTitle — reuseStages will not reuse this ledger)")
    return ledger, note


def write(ledger, work_dir):
    if not os.path.isdir(work_dir):
        fail(f"workDir is not a directory: {work_dir}")
    out = os.path.join(work_dir, "_ledger.json")
    # indent=1: every field on its own short line — the analyst Reads the file in offset/limit chunks,
    # and one-line JSON (claims of 4–7 K chars) would defeat line-based reading.
    text = json.dumps(ledger, ensure_ascii=False, indent=1) + "\n"
    fd, tmp = tempfile.mkstemp(prefix="._ledger.", suffix=".tmp", dir=work_dir)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
        os.replace(tmp, out)
    except OSError as e:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        fail(f"cannot write {out}: {e}")
    with open(out, encoding="utf-8") as fh:
        back = json.load(fh)
    if len(back.get("claimLedger") or []) != len(ledger["claimLedger"]):
        fail(f"{out} re-read with a different claim count")
    return out


def main(argv):
    if len(argv) != 3:
        print(__doc__.strip().splitlines()[2], file=sys.stderr)
        sys.exit(1)
    src, work_dir = argv[1], argv[2]
    res = load_result(src)
    ledger, note = build(res, work_dir)
    if ledger is None:
        print(f"write-ledger: skip: {note}")
        return 0
    out = write(ledger, work_dir)
    print(f"write-ledger: ok: {out} — {os.path.getsize(out)} B, {len(ledger['claimLedger'])} claims{note}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
