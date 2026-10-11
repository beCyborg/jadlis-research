import importlib.util
import pathlib
import subprocess
import sys

SCRIPT = pathlib.Path(__file__).resolve().parent.parent / "skills/research/scripts/citation-check.py"
spec = importlib.util.spec_from_file_location("citation_check", SCRIPT)
cc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cc)

SNAP_W1 = """URL: https://example.com/a
Date: 2026-10-01
Prefix: [w1]
Extractor: defuddle
---
Stripe lets you open an account in another country. You need a **legal entity**, a tax ID and a
physical address — not a PO box. Reserves are held for 90 days. In 2025 there were 900,000 such
companies, and the fraud rate was 17 times higher than average. This sentence is padding so the
snapshot has enough words for the built-in positive and negative control of the checker to run.
"""

SNAP_RU = """URL: https://t.me/chan/1
Prefix: [tg1]
---
Классическая схема «компания в одной стране, директор в другой» вызывает много вопросов у банков.
"""

DRAFT = """---
title: test
gaps: ["«цитата во frontmatter» не проверяется"]
---
# Отчёт

> [!tip] Вывод
> Stripe требует «a tax ID and a physical address» [w1·A2](https://example.com/a).
> Stripe пишет «we never close accounts without warning» [w1·A2](https://example.com/a).

## 📚 Контекст и находки

1. Резерв держат 90 дней, компаний 900 000, в 25 раз чаще [w1·A2](https://example.com/a).
Цитата «You need a legal entity … and a physical address» [w1·A2](https://example.com/a).
Цитата «stripe LETS you open an account» [w1·A2](https://example.com/a).
Перевод: «Stripe позволяет открыть аккаунт в другой стране» [w1·A2](https://example.com/a).
Банки: «Компания в одной стране, директор в другой» [tg1·C2](https://t.me/chan/1).
Без снимка: «это никто не проверит строкой» [r9·C3](https://reddit.com/x).
Кластер: «held for 90 days» [r9·C3](https://reddit.com/x), [w1·A2](https://example.com/a).
Заголовок фолбэка: «open an account in another country» [cx3·A3](https://example.com/c).

## Источники
- [w1·A2](https://example.com/a) «Требования к аккаунту в другой стране»

## Связанные заметки

> [!note]- Методология и проверка
> 2 канала.
> Полный процесс — в work_dir из frontmatter.
"""


def make(tmp_path):
    snaps = tmp_path / "wd" / "snapshots"
    snaps.mkdir(parents=True)
    (snaps / "w1.md").write_text(SNAP_W1, encoding="utf-8")
    (snaps / "tg1.md").write_text(SNAP_RU, encoding="utf-8")
    # glob fallback: file not named exactly after the prefix
    (snaps / "cx3-stripe.md").write_text(SNAP_W1.replace("[w1]", "[cx3]"), encoding="utf-8")
    draft = tmp_path / "draft.md"
    draft.write_text(DRAFT, encoding="utf-8")
    return draft, tmp_path / "wd"


def test_counts(tmp_path):
    draft, wd = make(tmp_path)
    r = cc.check(draft, wd)
    assert r["self_check"] == "pass"
    assert r["links"] == 12 and r["links_no_snapshot"] == 2
    assert r["prefixes_no_snapshot"] == ["r9"]
    assert r["quotes_matched"] == 6          # exact, ellipsis, case, ru→ru, cluster, glob fallback
    assert r["quotes_not_found"] == 1        # the fabricated one
    assert r["quotes_translated"] == 1
    assert r["quotes_no_snapshot"] == 1
    nf = [p for p in r["problems"] if p["issue"] == "quote-not-found"]
    assert nf[0]["line"] == 9 and nf[0]["conclusion"] is True
    nums = [p["number"] for p in r["problems"] if p["issue"] == "number-not-in-snapshot"]
    assert nums == ["25"]                    # 90 and 900 000 are in the snapshot; «1.» is a list number


def test_apply_marks_and_is_idempotent(tmp_path):
    draft, wd = make(tmp_path)
    for _ in range(2):
        out = subprocess.run([sys.executable, str(SCRIPT), str(draft), str(wd), "--apply"],
                             capture_output=True, text=True)
        assert out.returncode == 0
    text = draft.read_text(encoding="utf-8")
    lines = text.split("\n")
    assert lines[8].endswith("(⚠ цитата не найдена в снимке)")
    assert text.count("⚠ цитата не найдена в снимке") == 1
    assert text.count("> Проверка цитат: 12 ссылок, 7 цитат сверено, 1 не найдено в снимке, 2 ссылок без снимка") == 1
    summary = lines.index(next(l for l in lines if l.startswith("> Проверка цитат:")))
    assert lines[summary + 1].startswith("> - «we never close accounts without warning» — w1")
    assert lines[summary + 2].startswith("> Полный процесс")
    # citations themselves are untouched
    assert text.count("[w1·A2](https://example.com/a)") == DRAFT.count("[w1·A2](https://example.com/a)")


def test_number_forms():
    assert "900000" in cc.num_values("900 000") & cc.num_values("900,000")
    assert "0.9" in cc.num_values("0,9")
    assert "0.45" in cc.num_values("0.45.1")
    assert cc.num_values("02.10") == set()
    assert cc.num_values("22.04.2026") == {"2026"}


def test_never_fails(tmp_path):
    out = subprocess.run([sys.executable, str(SCRIPT), str(tmp_path / "missing.md"), str(tmp_path), "--json"],
                         capture_output=True, text=True)
    assert out.returncode == 0 and '"error"' in out.stdout
