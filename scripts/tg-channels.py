#!/usr/bin/env python3
"""Registry of Telegram channels/chats that earned citations in past /research runs.

Append-only JSONL, one line per (handle, run). Stores handles and counters only —
never post texts (Telegram ToS: raw outputs live only in the run's WORK_DIR).

  add            --handle h --tags a,b --cited N --kind channel|chat --run slug [--title T] [--subs N]
  list           --tags a,b [--limit 15] [--out tsv|json]
  import-workdir WORK_DIR --tags a,b [--run slug] [--dry-run]

File: $TG_CHANNELS_FILE or ~/.claude/jadlis/telegram-search/channels.jsonl.
Python 3.9 compatible, stdlib only.
"""
import argparse
import datetime as dt
import json
import os
import re
import sys

HANDLE_RE = re.compile(r"^[A-Za-z0-9_]{4,32}$")
TAG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
SOURCE_RE = re.compile(r"\*\*Source:\*\*\s*https?://t\.me/(?:s/)?([A-Za-z0-9_]{4,32})(?:/|\b)")
NOT_HANDLES = {"joinchat", "addlist", "share", "proxy", "socks", "contact", "iv"}


def registry_path():
    return os.path.expanduser(
        os.environ.get("TG_CHANNELS_FILE", "~/.claude/jadlis/telegram-search/channels.jsonl"))


def norm_handle(h):
    h = (h or "").strip().lstrip("@")
    if h.startswith("https://t.me/"):
        h = h[len("https://t.me/"):].split("/")[0]
    if not HANDLE_RE.match(h) or h.lower() in NOT_HANDLES:
        return None
    return h.lower()


def norm_tags(raw):
    tags = []
    for t in (raw or "").split(","):
        t = t.strip().lower().replace(" ", "-").replace("_", "-")
        if t and TAG_RE.match(t) and t not in tags:
            tags.append(t)
    return tags


def append(rec):
    path = registry_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    line = (json.dumps(rec, ensure_ascii=False) + "\n").encode("utf-8")
    # one write() on an O_APPEND fd: parallel runs never interleave or clobber lines
    fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
    try:
        os.write(fd, line)
    finally:
        os.close(fd)


def load():
    path = registry_path()
    if not os.path.exists(path):
        return []
    out = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            try:
                r = json.loads(line)
            except ValueError:
                continue  # a torn line never breaks the registry
            if isinstance(r, dict) and r.get("handle"):
                out.append(r)
    return out


def make_rec(handle, tags, cited, kind, run, title=None, subs=None):
    rec = {"handle": handle, "tags": tags, "cited": int(cited), "kind": kind,
           "run": run, "date": dt.date.today().isoformat()}
    if title:
        rec["title"] = title[:120]
    if subs is not None:
        rec["subs"] = int(subs)
    return rec


def cmd_add(a):
    h = norm_handle(a.handle)
    if not h:
        print(json.dumps({"error": "bad handle", "handle": a.handle}), file=sys.stderr)
        return 3
    tags = norm_tags(a.tags)
    if not tags:
        print(json.dumps({"error": "no valid tags"}), file=sys.stderr)
        return 3
    append(make_rec(h, tags, a.cited, a.kind, a.run, a.title, a.subs))
    print(json.dumps({"added": h, "tags": tags, "cited": a.cited}))
    return 0


def aggregate(recs):
    agg = {}
    for r in recs:
        h = r["handle"]
        g = agg.setdefault(h, {"handle": h, "tags": set(), "cited": 0, "runs": set(),
                               "last": "", "kind": r.get("kind", "channel"), "title": ""})
        g["tags"].update(r.get("tags") or [])
        g["cited"] += int(r.get("cited") or 0)
        g["runs"].add(r.get("run") or "")
        if (r.get("date") or "") >= g["last"]:
            g["last"] = r.get("date") or g["last"]
            g["kind"] = r.get("kind", g["kind"])
            g["title"] = r.get("title") or g["title"]
    return agg


def cmd_list(a):
    want = set(norm_tags(a.tags))
    agg = aggregate(load())
    all_tags = sorted({t for g in agg.values() for t in g["tags"]})
    rows = []
    for g in agg.values():
        m = sorted(want & g["tags"]) if want else []
        if want and not m:
            continue
        rows.append(dict(g, matched=m))
    rows.sort(key=lambda g: (len(g["matched"]), g["cited"], g["last"]), reverse=True)
    rows = rows[: a.limit]
    if a.out == "json":
        print(json.dumps({"channels": [
            {"handle": g["handle"], "kind": g["kind"], "title": g["title"], "matched": g["matched"],
             "tags": sorted(g["tags"]), "cited": g["cited"], "runs": len(g["runs"]), "last": g["last"]}
            for g in rows], "all_tags": all_tags}, ensure_ascii=False))
    else:
        print("handle\tkind\tmatched\tcited\truns\tlast\ttags")
        for g in rows:
            print("\t".join(["@" + g["handle"], g["kind"], ",".join(g["matched"]), str(g["cited"]),
                             str(len(g["runs"])), g["last"], ",".join(sorted(g["tags"]))]))
        # tags drift between runs — show the vocabulary so the agent reuses it
        print("# all tags: " + (",".join(all_tags) if all_tags else "(registry empty)"))
    return 0


def cmd_import(a):
    wd = os.path.expanduser(a.workdir.rstrip("/"))
    path = os.path.join(wd, "telegram.md") if os.path.isdir(wd) else wd
    if not os.path.isfile(path):
        print(json.dumps({"error": "no telegram.md", "path": path}), file=sys.stderr)
        return 3
    tags = norm_tags(a.tags)
    if not tags:
        print(json.dumps({"error": "no valid tags"}), file=sys.stderr)
        return 3
    run = a.run or os.path.basename(os.path.dirname(path))
    counts = {}
    with open(path, encoding="utf-8") as f:
        for m in SOURCE_RE.finditer(f.read()):
            h = norm_handle(m.group(1))
            if h:
                counts[h] = counts.get(h, 0) + 1
    if not a.dry_run:
        done = {(r["handle"], r.get("run")) for r in load()}  # re-import is a no-op
        for h, n in counts.items():
            if (h, run) not in done:
                append(make_rec(h, tags, n, "channel", run))
    print(json.dumps({"run": run, "tags": tags, "handles": counts}, ensure_ascii=False))
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd")
    s = sub.add_parser("add")
    s.add_argument("--handle", required=True)
    s.add_argument("--tags", required=True)
    s.add_argument("--cited", type=int, default=1)
    s.add_argument("--kind", choices=["channel", "chat"], default="channel")
    s.add_argument("--run", required=True)
    s.add_argument("--title")
    s.add_argument("--subs", type=int)
    s = sub.add_parser("list")
    s.add_argument("--tags", default="")
    s.add_argument("--limit", type=int, default=15)
    s.add_argument("--out", choices=["tsv", "json"], default="tsv")
    s = sub.add_parser("import-workdir")
    s.add_argument("workdir")
    s.add_argument("--tags", required=True)
    s.add_argument("--run")
    s.add_argument("--dry-run", action="store_true")
    a = p.parse_args(argv)
    if a.cmd == "add":
        return cmd_add(a)
    if a.cmd == "list":
        return cmd_list(a)
    if a.cmd == "import-workdir":
        return cmd_import(a)
    p.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
