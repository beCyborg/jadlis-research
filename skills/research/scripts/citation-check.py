#!/usr/bin/env python3
"""Deterministic citation pass over a research draft (Phase C, step 2c).

Usage: citation-check.py <draft.md> <workDir> [--json] [--apply]

For every badge link `[prefix·Badge](URL)` the script finds the frozen snapshot
`<workDir>/snapshots/<prefix>.md` (fallbacks: `<prefix>-*.md` / `<prefix>_*.md`, then a
snapshot whose header says `Prefix: [<prefix>]` or `URL: <same url>`). For every quoted
span («…», “…”, "…") on a line with a badge it checks the span verbatim against the
snapshot of the nearest badge after normalisation (NFKC, quote and dash forms, whitespace,
case; `…`/`...` and `[insertions]` split the span into fragments that must all be found).
Per line it also reports badges without a snapshot and numbers (percentages, years,
multi-digit values) that do not occur in any snapshot of the line's badges.

Never rewrites citations or deletes text. `--apply` only appends the marker
«⚠ цитата не найдена в снимке» to conclusion lines with a not-found quote and writes the
summary into the «Методология и проверка» callout (idempotent). Exit code is always 0.
Python 3.9 compatible (system python3 on macOS).
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

BADGE_RE = re.compile(r"\[([a-z]{1,6}\d{1,4})·([^\]\s]{1,4})\]\((https?://[^)\s]+)\)")
MD_LINK_RE = re.compile(r"!?\[([^\]]*)\]\(([^)\s]*)\)")
QUOTE_RES = (
    re.compile(r"«([^«»\n]+)»"),
    re.compile(r"“([^“”\n]+)”"),
    re.compile(r"„([^„“\n]+)“"),
    re.compile(r'"([^"\n]+)"'),
)
CYR_RE = re.compile(r"[а-яё]", re.I)
LAT_RE = re.compile(r"[a-z]", re.I)
NUM_RE = re.compile(r"(?<![\w.,])([$€£₽]\s?)?(\d{1,3}(?:[   ]\d{3})+(?!\d|[.,]\d)|\d+(?:[.,]\d+)*)(\s?%)?")
DATE_RE = re.compile(r"\d{1,2}\.\d{1,2}\.(\d{4})")
SHORT_DATE_RE = re.compile(r"(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])")  # 02.10 — no year, nothing to check
LIST_NUM_RE = re.compile(r"^(\s*(?:>\s*)*(?:[-*]\s+)?)(\d+)([.)]\s)")
CLUSTER_GAP_RE = re.compile(r"[\s,;()и]*")
GAP_RE = re.compile(r"\[[^\]]*\]|…|\.\.\.")
MARK = "⚠ цитата не найдена в снимке"
SUMMARY_PREFIX = "Проверка цитат:"
MIN_QUOTE_WORDS = 3          # «drop-директор», «Ltd» are terms, not citations
MIN_FRAGMENT_CHARS = 6       # shorter pieces between gaps prove nothing
MAX_LISTED = 10

QUOTE_MAP = {
    "«": '"', "»": '"', "“": '"', "”": '"', "„": '"', "‟": '"', "″": '"',
    "‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'", "`": "'",
    "–": "-", "—": "-", "‑": "-", "‒": "-", "−": "-",
    "­": "", "​": "", "‌": "", "‍": "", "﻿": "",
}
QUOTE_TABLE = str.maketrans(QUOTE_MAP)


# ---------- normalisation ----------

def norm(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).translate(QUOTE_TABLE)
    text = text.replace("ё", "е").replace("Ё", "Е")
    return re.sub(r"\s+", " ", text).strip().casefold()


def loose(text: str) -> str:
    """Letters and digits only — tolerates dropped commas, markdown emphasis, line breaks."""
    return re.sub(r"[\W_]+", " ", text).strip()


def strip_markdown(text: str) -> str:
    text = MD_LINK_RE.sub(lambda m: m.group(1), text)
    return re.sub(r"[*#>`|]+", " ", text)


def cyr_share(text: str) -> float:
    cyr = len(CYR_RE.findall(text))
    lat = len(LAT_RE.findall(text))
    return cyr / (cyr + lat) if cyr + lat else 0.0


def num_values(raw: str) -> set[str]:
    """Canonical candidates: '900 000'/'900,000' -> 900000; '0,9' -> 0.9; '2,000' -> {2000, 2};
    '22.04.2026' -> {2026} (dates are written differently across languages); '2.1.276' -> itself."""
    s = re.sub(r"[ \u00a0\u202f]", "", raw)
    m = DATE_RE.fullmatch(s)
    if m:
        return {m.group(1)}
    if SHORT_DATE_RE.fullmatch(s):
        return set()
    out = {s}
    if re.fullmatch(r"\d+(?:\.\d+){2,}", s):  # version 0.45.1 also cites 0.45
        parts = s.split(".")
        out |= {".".join(parts[:i]) for i in range(2, len(parts))}
    if re.fullmatch(r"\d{1,3}(?:[.,]\d{3})+", s):
        out.add(re.sub(r"[.,]", "", s))
    if re.fullmatch(r"\d{1,3}(?:,\d{3})+\.\d+", s) or re.fullmatch(r"\d{1,3}(?:\.\d{3})+,\d+", s):
        out.add(re.sub(r"[.,](?=\d{3})", "", s).replace(",", "."))
    if len(re.findall(r"[.,]", s)) <= 1:
        d = s.replace(",", ".")
        if "." in d:
            d = d.rstrip("0").rstrip(".")
        out.add(re.sub(r"^0+(?=\d)", "", d))
    return out


def numbers_in(text: str, *, significant_only: bool) -> list[tuple[int, int, str, set[str]]]:
    out = []
    for m in NUM_RE.finditer(text):
        cur, raw, pct = m.group(1), m.group(2), m.group(3)
        if significant_only and not (pct or cur or len(re.sub(r"\D", "", raw)) >= 2):
            continue
        vals = num_values(raw)
        if not vals:
            continue
        out.append((m.start(), m.end(), m.group(0).strip(), vals))
    return out


# ---------- snapshots ----------

class Snapshot:
    def __init__(self, path: Path):
        self.path = path
        raw = path.read_text(encoding="utf-8", errors="replace")
        head, sep, body = raw.partition("\n---\n")
        if not sep or len(head) > 2000:
            head, body = "", raw
        self.header = head
        self.body = body
        plain = strip_markdown(body)
        self.norm = norm(plain)
        self.loose = loose(self.norm)
        self.cyr = cyr_share(body[:20000])
        self.numbers: set[str] = set()
        for *_, vals in numbers_in(unicodedata.normalize("NFKC", body), significant_only=False):
            self.numbers |= vals
        m = re.search(r"^Prefix:\s*\[?([a-z]{1,6}\d{1,4})\]?", head, re.M)
        self.prefix = m.group(1) if m else None
        m = re.search(r"^URL:\s*(\S+)", head, re.M)
        self.url = m.group(1).rstrip("/") if m else None


class SnapshotIndex:
    def __init__(self, work_dir: Path):
        self.dir = work_dir / "snapshots"
        self.cache: dict[Path, Snapshot] = {}
        self.all = sorted(self.dir.glob("**/*.md")) if self.dir.is_dir() else []

    def _load(self, path: Path) -> Snapshot | None:
        if path not in self.cache:
            try:
                self.cache[path] = Snapshot(path)
            except OSError:
                return None
        return self.cache[path]

    def find(self, prefix: str, url: str) -> Snapshot | None:
        exact = self.dir / f"{prefix}.md"
        if exact.is_file():
            return self._load(exact)
        for pattern in (f"**/{prefix}.md", f"{prefix}-*.md", f"{prefix}_*.md", f"{prefix}.*.md"):
            hits = sorted(self.dir.glob(pattern)) if self.dir.is_dir() else []
            if hits:
                return self._load(hits[0])
        url = url.rstrip("/")
        for path in self.all:
            snap = self._load(path)
            if snap and (snap.prefix == prefix or (snap.url and snap.url == url)):
                return snap
        return None


# ---------- matching ----------

def fragments(quote: str) -> list[str]:
    parts = [p.strip(" ,;:.-") for p in GAP_RE.split(quote)]
    return [p for p in parts if len(p) >= MIN_FRAGMENT_CHARS] or ([quote.strip()] if quote.strip() else [])


def quote_in(quote: str, snap: Snapshot) -> str | None:
    """'exact' | 'loose' | None."""
    frags = fragments(quote)
    if not frags:
        return None
    if all(norm(f) in snap.norm for f in frags):
        return "exact"
    if all(loose(norm(f)) and loose(norm(f)) in snap.loose for f in frags):
        return "loose"
    return None


# ---------- draft parsing ----------

def body_lines(lines: list[str]):
    """Yield (lineno, text, section) for lines outside frontmatter and code fences."""
    in_fm = bool(lines) and lines[0].strip() == "---"
    in_code = False
    section = ""
    for i, line in enumerate(lines, 1):
        if in_fm:
            if i > 1 and line.strip() == "---":
                in_fm = False
            continue
        if line.lstrip().startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        if line.startswith("## "):
            section = line[3:].strip()
        yield i, line, section


def blank_links(line: str) -> str:
    """Links and a leading list number become spaces; positions stay the same."""
    line = LIST_NUM_RE.sub(lambda m: m.group(1) + " " * len(m.group(2)) + m.group(3), line, count=1)
    line = re.sub(r"`[^`]*`", lambda m: " " * len(m.group(0)), line)
    return MD_LINK_RE.sub(lambda m: " " * len(m.group(0)), line)


def check(draft: Path, work_dir: Path) -> dict:
    text = draft.read_text(encoding="utf-8")
    lines = text.split("\n")
    idx = SnapshotIndex(work_dir)
    first_context = next((i for i, l, s in body_lines(lines) if l.startswith("## ") and "Контекст" in l), None)

    res = {
        "draft": str(draft), "work_dir": str(work_dir),
        "snapshots_in_workdir": len(idx.all),
        "links": 0, "links_with_snapshot": 0, "links_no_snapshot": 0,
        "prefixes": 0, "prefixes_no_snapshot": [],
        "lines_with_badges": 0, "lines_badge_no_snapshot": 0,
        "quotes_total": 0, "quotes_short_skipped": 0,
        "quotes_checked": 0, "quotes_matched": 0, "quotes_matched_loose": 0,
        "quotes_matched_other_prefix": 0, "quotes_not_found": 0,
        "quotes_translated": 0, "quotes_no_snapshot": 0,
        "numbers_checked": 0, "numbers_not_found": 0, "numbers_no_snapshot": 0,
        "problems": [],
    }
    prefixes: dict[str, bool] = {}

    for lineno, line, section in body_lines(lines):
        badges = list(BADGE_RE.finditer(line))
        if not badges:
            continue
        in_sources = section.startswith("Источники")
        conclusion = (first_context is not None and lineno < first_context) or (
            first_context is None and line.lstrip().startswith(">"))
        snaps = []
        for b in badges:
            snap = idx.find(b.group(1), b.group(3))
            snaps.append(snap)
            res["links"] += 1
            res["links_with_snapshot" if snap else "links_no_snapshot"] += 1
            prefixes[b.group(1)] = prefixes.get(b.group(1), False) or bool(snap)
        res["lines_with_badges"] += 1

        def problem(issue: str, prefix: str = "", **extra):
            item = {"line": lineno, "prefix": prefix, "issue": issue, "section": section,
                    "conclusion": conclusion}
            item.update(extra)
            res["problems"].append(item)

        if not any(snaps):
            res["lines_badge_no_snapshot"] += 1
            problem("badge-no-snapshot", ",".join(b.group(1) for b in badges))
        if in_sources:
            continue  # titles in the source list are translations, not quotes

        # Badges written back to back («[a·B](…), [b·C](…)») cite one statement together.
        clusters: list[list[int]] = []
        for k, b in enumerate(badges):
            if clusters and CLUSTER_GAP_RE.fullmatch(line[badges[k - 1].end():b.start()]):
                clusters[-1].append(k)
            else:
                clusters.append([k])

        def cluster_for(end: int) -> list[int]:
            return next((c for c in clusters if badges[c[0]].start() >= end), clusters[-1])

        def names(ks) -> str:
            return ",".join(badges[k].group(1) for k in ks)

        scan = blank_links(line)
        for qre in QUOTE_RES:
            for q in qre.finditer(scan):
                quote = q.group(1).strip()
                res["quotes_total"] += 1
                if len(quote.split()) < MIN_QUOTE_WORDS:
                    res["quotes_short_skipped"] += 1
                    continue
                cl = cluster_for(q.end())
                cl_snaps = [snaps[k] for k in cl if snaps[k] is not None]
                hows = [quote_in(quote, sn) for sn in cl_snaps]
                if any(hows):
                    res["quotes_checked"] += 1
                    res["quotes_matched"] += 1
                    if "exact" not in hows:
                        res["quotes_matched_loose"] += 1
                    continue
                other = next((badges[j].group(1) for j, sn in enumerate(snaps)
                              if j not in cl and sn is not None and quote_in(quote, sn)), None)
                if other:
                    res["quotes_checked"] += 1
                    res["quotes_matched"] += 1
                    res["quotes_matched_other_prefix"] += 1
                    problem("quote-in-other-snapshot", names(cl), quote=quote, found_in=other)
                    continue
                if len(cl_snaps) < len(cl):
                    # a source of this statement has no frozen text — a miss proves nothing
                    res["quotes_no_snapshot"] += 1
                    problem("quote-no-snapshot", names(k for k in cl if snaps[k] is None), quote=quote)
                    continue
                if cyr_share(quote) > 0.3 and any(sn.cyr < 0.1 for sn in cl_snaps):
                    res["quotes_translated"] += 1
                    continue
                res["quotes_checked"] += 1
                res["quotes_not_found"] += 1
                problem("quote-not-found", names(cl), quote=quote)

        for start, end, raw, vals in numbers_in(scan, significant_only=True):
            cl = cluster_for(end)
            cl_snaps = [snaps[k] for k in cl if snaps[k] is not None]
            if any(vals & sn.numbers for sn in cl_snaps):
                res["numbers_checked"] += 1
                continue
            if len(cl_snaps) < len(cl):
                res["numbers_no_snapshot"] += 1
                continue
            res["numbers_checked"] += 1
            res["numbers_not_found"] += 1
            problem("number-not-in-snapshot", names(cl), number=raw)

    res["prefixes"] = len(prefixes)
    res["prefixes_no_snapshot"] = sorted(p for p, ok in prefixes.items() if not ok)
    res["self_check"] = self_check(idx)
    return res


def self_check(idx: SnapshotIndex) -> str:
    """Positive and negative control on a real snapshot of this run (a checker can lie too)."""
    for path in idx.all:
        snap = idx._load(path)
        if not snap:
            continue
        words = snap.body.split()
        if len(words) < 40:
            continue
        mid = len(words) // 2
        span = " ".join(words[mid:mid + 8])
        if len(loose(norm(span))) < 20:
            continue
        positive = quote_in(span, snap) is not None
        negative = quote_in(" ".join(reversed(words[mid:mid + 8])) + " zqxj", snap) is None
        return "pass" if positive and negative else f"FAIL (positive={positive}, negative={negative})"
    return "no-snapshot"


# ---------- output ----------

def summary_line(r: dict) -> str:
    s = (f"{SUMMARY_PREFIX} {r['links']} ссылок, {r['quotes_checked']} цитат сверено, "
         f"{r['quotes_not_found']} не найдено в снимке, {r['links_no_snapshot']} ссылок без снимка")
    if r["quotes_translated"]:
        s += f", {r['quotes_translated']} цитат в переводе (строкой не сверить)"
    return s + "."


def render(r: dict) -> str:
    out = [summary_line(r),
           f"Префиксов {r['prefixes']}, без снимка {len(r['prefixes_no_snapshot'])}"
           f"{': ' + ', '.join(r['prefixes_no_snapshot']) if r['prefixes_no_snapshot'] else ''}. "
           f"Строк со ссылкой {r['lines_with_badges']}, из них без снимка {r['lines_badge_no_snapshot']}.",
           f"Цитаты: всего {r['quotes_total']}, короткие (термины) {r['quotes_short_skipped']}, "
           f"сверено {r['quotes_checked']} (совпало {r['quotes_matched']}, из них без пунктуации "
           f"{r['quotes_matched_loose']}, в снимке соседней ссылки {r['quotes_matched_other_prefix']}), "
           f"не найдено {r['quotes_not_found']}, в переводе {r['quotes_translated']}, "
           f"без снимка {r['quotes_no_snapshot']}.",
           f"Числа: проверено {r['numbers_checked']}, нет в снимке {r['numbers_not_found']}, "
           f"у источника нет снимка {r['numbers_no_snapshot']}.",
           f"Контроль чекера: {r['self_check']}.", "", "Проблемные строки:"]
    for p in r["problems"]:
        extra = p.get("quote") or p.get("number") or ""
        if p.get("found_in"):
            extra += f" → найдено в {p['found_in']}"
        tag = " [вывод]" if p["conclusion"] else ""
        out.append(f"  L{p['line']}{tag} {p['prefix']} {p['issue']}" + (f": {extra}" if extra else ""))
    return "\n".join(out)


def apply(draft: Path, r: dict) -> int:
    lines = draft.read_text(encoding="utf-8").split("\n")
    marked = set()
    for p in r["problems"]:
        if p["issue"] == "quote-not-found" and p["conclusion"] and p["line"] not in marked:
            marked.add(p["line"])
            i = p["line"] - 1
            if MARK not in lines[i]:
                lines[i] = lines[i].rstrip() + f" ({MARK})"
    not_found = [p for p in r["problems"] if p["issue"] == "quote-not-found"][:MAX_LISTED]
    block = [f"> {summary_line(r)}"] + [
        f"> - «{p['quote']}» — {p['prefix']}, строка {p['line']}" for p in not_found]
    # drop a previous summary block (idempotent re-run)
    for i, l in enumerate(lines):
        if l.startswith(f"> {SUMMARY_PREFIX}"):
            j = i + 1
            while j < len(lines) and lines[j].startswith("> - «"):
                j += 1
            del lines[i:j]
            break
    head = next((i for i, l in enumerate(lines) if re.match(r">\s*\[!\w+\][-+]?\s*Методология", l)), None)
    if head is None:
        lines += ["", "> [!note]- Проверка цитат"] + block
    else:
        end = head + 1
        while end < len(lines) and lines[end].startswith(">"):
            end += 1
        tail = next((k for k in range(head + 1, end) if lines[k].startswith("> Полный процесс")), end)
        lines[tail:tail] = block
    draft.write_text("\n".join(lines), encoding="utf-8")
    return len(marked)


def main(argv: list[str]) -> int:
    args = [a for a in argv if not a.startswith("--")]
    as_json, do_apply = "--json" in argv, "--apply" in argv
    if len(args) != 2:
        print(__doc__.strip().split("\n\n")[0] if __doc__ else "usage")
        return 0
    try:
        r = check(Path(args[0]), Path(args[1]))
        if do_apply and not r["self_check"].startswith("FAIL"):
            r["lines_marked"] = apply(Path(args[0]), r)  # a lying checker must not touch the draft
        print(json.dumps(r, ensure_ascii=False, indent=1) if as_json else render(r))
    except Exception as e:  # noqa: BLE001 — the pass must never break Phase C
        print(json.dumps({"error": f"{type(e).__name__}: {e}"}, ensure_ascii=False) if as_json
              else f"citation-check: ошибка — {type(e).__name__}: {e}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
