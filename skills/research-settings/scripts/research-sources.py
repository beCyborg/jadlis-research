#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""research-sources.py — one entry point for the source settings of /jadlis-research.

Catalogue (sources.json) + user settings + liveness probes in a single stdlib script.
Commands: status / resolve / set / reset / catalogue.

Two files live in the data dir and have DIFFERENT writers, so a long `resolve` from one
profile can never overwrite a `set` from another:
  source-settings.json  — written ONLY by `set` and `reset` (read-modify-write under flock)
  probe-cache.json      — written ONLY by the probes

Exit codes: 0 ok · 1 usage / unknown name · 2 data dir not writable · 3 catalogue unreadable
            · 4 settings file corrupt (backed up to *.bad, defaults used)

Python 3.9 compatible: no `match`, no `X | Y` annotations at runtime, stdlib only.
Key VALUES are never printed.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import fcntl
import json
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# ── constants ────────────────────────────────────────────────────────────────
EXIT_OK = 0
EXIT_USAGE = 1
EXIT_DATA_DIR = 2
EXIT_CATALOGUE = 3
EXIT_SETTINGS = 4

SCRIPT = Path(__file__).resolve()
PLUGIN_ROOT = SCRIPT.parents[3]
CATALOGUE_PATH = SCRIPT.parents[1] / "sources.json"
SECRET_SH = PLUGIN_ROOT / "scripts" / "secret.sh"
TWITTERAPI_SH = PLUGIN_ROOT / "scripts" / "twitterapi.sh"

SETTINGS_NAME = "source-settings.json"
CACHE_NAME = "probe-cache.json"
LOCK_NAME = "source-settings.lock"
DATA_DIR_LEAF = "jadlis-research-jadlis"

PROBE_TTL = {"grok-402": 6 * 3600, "codex-quota": 2 * 3600, "twitterapi-balance": 3600}
GLOBAL_DEADLINE = 90.0
KEY_TIMEOUT = 15
GROK_TIMEOUT = 40
CODEX_TIMEOUT = 60
TWITTERAPI_TIMEOUT = 30

START = time.monotonic()
_PENDING_THREADS = False

GROK_DEATH_RE = re.compile(
    r"usage limit|SuperGrok|free Grok Build|402|balance exhausted|Payment Required|unauthenticated",
    re.IGNORECASE,
)
CODEX_QUOTA_RE = re.compile(r"usage limit|quota|rate limit|429", re.IGNORECASE)

ACCESS_RU = {
    "ok": "ок",
    "no-key": "нет ключа",
    "no-binary": "нет бинарника",
    "down": "нет баланса",
    "quota": "квота",
    "unknown": "неизвестно",
    "n/a": "—",
}
STATE_RU = {
    "ok": "работает",
    "disabled-by-settings": "выключено в настройках",
    "no-access": "нет доступа",
}
BAD_ACCESS = ("no-key", "no-binary", "down", "quota")

GROK_OFF_NOTE = (
    "{cause}. Do NOT run ~/.grok/bin/grok, do NOT load mcp__grok-mcp__* or "
    "mcp__twitterapi-mcp__*. Skip every Grok section of the protocol; run ONLY the section "
    "'TwitterAPI.io layer → Mode B keyword-only' via bash {{PLUGIN_ROOT}}/scripts/twitterapi.sh; "
    "if the REST layer fails (exit≠0, persistent 429) use brave_web_search with site:x.com as "
    "the second fallback. sourceQuality no higher than MEDIUM; say in findings that the semantic "
    "angle is missing."
)
CAUSE_SETTINGS = "GROK DISABLED by user source settings"
CAUSE_PROBE = "GROK DOWN (probe)"


# ── small helpers ────────────────────────────────────────────────────────────
def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(value):
    if not value:
        return None
    try:
        return datetime.strptime(str(value), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def age_seconds(checked):
    dt = parse_iso(checked)
    if dt is None:
        return None
    return (datetime.now(timezone.utc) - dt).total_seconds()


def human_age(checked):
    secs = age_seconds(checked)
    if secs is None:
        return "—"
    if secs < 90:
        return "только что"
    if secs < 3600:
        return "%d мин назад" % int(secs // 60)
    if secs < 86400:
        return "%d ч назад" % int(secs // 3600)
    return "%d дн назад" % int(secs // 86400)


def budget(default):
    """Sub-process timeout capped by the global deadline (2 s reserved for output)."""
    left = GLOBAL_DEADLINE - (time.monotonic() - START) - 2.0
    return max(1.0, min(float(default), left))


def trim(text, limit=120):
    text = " ".join(str(text or "").split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def first_line(text):
    for line in str(text or "").splitlines():
        if line.strip():
            return line.strip()
    return ""


def finish(code):
    sys.stdout.flush()
    sys.stderr.flush()
    if _PENDING_THREADS:
        os._exit(code)  # a probe thread is still hanging; do not wait for it at exit
    sys.exit(code)


def out_json(payload):
    print(json.dumps(payload, ensure_ascii=False, indent=2))


class Parser(argparse.ArgumentParser):
    def error(self, message):
        sys.stderr.write("usage error: %s\n" % message)
        self.print_usage(sys.stderr)
        finish(EXIT_USAGE)


# ── paths, settings, cache ───────────────────────────────────────────────────
def _usable(value):
    return bool(value) and not str(value).startswith("${")


def resolve_data_dir(arg):
    if _usable(arg):
        return Path(str(arg)).expanduser()
    env = os.environ.get("CLAUDE_PLUGIN_DATA", "")
    if _usable(env):
        return Path(env).expanduser()
    cfg = os.environ.get("CLAUDE_CONFIG_DIR", "")
    base = Path(cfg).expanduser() if _usable(cfg) else Path.home() / ".claude"
    return base / "plugins" / "data" / DATA_DIR_LEAF


def default_settings():
    return {"version": 1, "updated": None, "providers": {}, "channels": {}}


def load_catalogue():
    try:
        with open(CATALOGUE_PATH, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except Exception as exc:  # noqa: BLE001 — any failure here is fatal by contract
        sys.stderr.write("catalogue unreadable (%s): %s\n" % (CATALOGUE_PATH, exc))
        finish(EXIT_CATALOGUE)
        return {}
    for section in ("providers", "channels", "layers", "tools"):
        if not isinstance(data.get(section), dict):
            sys.stderr.write("catalogue broken: section %s missing\n" % section)
            finish(EXIT_CATALOGUE)
    data.setdefault("keys", {})
    return data


def load_settings(data_dir):
    """→ (settings, corrupt). A corrupt file is moved to *.bad and defaults are used."""
    path = data_dir / SETTINGS_NAME
    if not path.exists():
        return default_settings(), False
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if not isinstance(data, dict):
            raise ValueError("not an object")
    except Exception:  # noqa: BLE001
        try:
            shutil.move(str(path), str(path) + ".bad")
        except OSError:
            pass
        return default_settings(), True
    settings = default_settings()
    for section in ("providers", "channels"):
        block = data.get(section)
        if isinstance(block, dict):
            for name, state in block.items():
                if state in ("auto", "off"):
                    settings[section][str(name)] = state
    settings["updated"] = data.get("updated")
    return settings, False


def ensure_dir(data_dir):
    try:
        data_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        sys.stderr.write("data dir not writable (%s): %s\n" % (data_dir, exc))
        finish(EXIT_DATA_DIR)


def atomic_write(path, payload):
    tmp = path.with_name(path.name + ".tmp.%d" % os.getpid())
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    os.replace(str(tmp), str(path))


def update_settings(data_dir, mutate):
    """Read-modify-write under flock. → corrupt flag of the file we replaced."""
    ensure_dir(data_dir)
    lock_path = data_dir / LOCK_NAME
    try:
        lock = open(str(lock_path), "a+")
    except OSError as exc:
        sys.stderr.write("data dir not writable (%s): %s\n" % (data_dir, exc))
        finish(EXIT_DATA_DIR)
        return False
    try:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        settings, corrupt = load_settings(data_dir)
        mutate(settings)
        settings["version"] = 1
        settings["updated"] = now_iso()
        try:
            atomic_write(data_dir / SETTINGS_NAME, settings)
        except OSError as exc:
            sys.stderr.write("cannot write %s: %s\n" % (data_dir / SETTINGS_NAME, exc))
            finish(EXIT_DATA_DIR)
        return corrupt
    finally:
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        finally:
            lock.close()


def load_cache(data_dir):
    path = data_dir / CACHE_NAME
    if not path.exists():
        return {}
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if not isinstance(data, dict):
            raise ValueError("not an object")
    except Exception:  # noqa: BLE001 — a corrupt cache is simply recreated
        try:
            path.unlink()
        except OSError:
            pass
        return {}
    return {k: v for k, v in data.items() if isinstance(v, dict)}


def save_cache(data_dir, results, warnings):
    """Best effort: a failing cache write degrades to a warning, never to an exit code."""
    if not results:
        return
    try:
        ensure_dir_soft(data_dir)
        cache = load_cache(data_dir)
        cache["version"] = 1
        for pid, res in results.items():
            cache[pid] = {
                "state": res.get("state"),
                "checked": res.get("checked"),
                "detail": res.get("detail", ""),
            }
        atomic_write(data_dir / CACHE_NAME, cache)
    except OSError as exc:
        warnings.append("кэш проб не записан (%s)" % trim(exc, 60))


def ensure_dir_soft(data_dir):
    data_dir.mkdir(parents=True, exist_ok=True)


# ── key and binary checks ────────────────────────────────────────────────────
def check_key(name):
    value = os.environ.get(name)
    if value:
        return {"state": "present", "rail": "env", "detail": "env"}
    if not SECRET_SH.exists():
        return {"state": "unknown", "rail": "", "detail": "secret.sh not found"}
    try:
        proc = subprocess.run(
            ["bash", str(SECRET_SH), "--which", name],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=budget(KEY_TIMEOUT),
        )
    except subprocess.TimeoutExpired:
        return {"state": "unknown", "rail": "", "detail": "timeout"}
    except OSError as exc:
        return {"state": "unknown", "rail": "", "detail": trim(exc, 60)}
    text = (proc.stdout.decode("utf-8", "replace") + proc.stderr.decode("utf-8", "replace")).strip()
    if proc.returncode == 0:
        rail = text.split(":", 1)[1].strip() if ":" in text else ""
        return {"state": "present", "rail": rail, "detail": rail}
    if proc.returncode == 1 and "не найден" in text:
        return {"state": "no-key", "rail": "", "detail": "ключ не заведён"}
    return {"state": "unknown", "rail": "", "detail": "secret.sh exit %s" % proc.returncode}


def grok_binary():
    path = Path.home() / ".grok" / "bin" / "grok"
    if path.exists() and os.access(str(path), os.X_OK):
        return str(path)
    return shutil.which("grok")


def provider_binary(name, pdef):
    if name == "grok":
        return grok_binary()
    declared = str(pdef.get("binary") or name)
    if declared.startswith("~") or "/" in declared:
        path = Path(declared).expanduser()
        if path.exists() and os.access(str(path), os.X_OK):
            return str(path)
        return shutil.which(path.name)
    return shutil.which(declared)


def check_tool(name):
    return shutil.which(name)


# ── probes ───────────────────────────────────────────────────────────────────
def _result(state, detail):
    return {"state": state, "detail": trim(detail), "checked": now_iso(), "cached": False}


def probe_grok():
    binary = grok_binary()
    if not binary:
        return _result("no-binary", "~/.grok/bin/grok не найден")
    iso_home = Path.home() / ".cache" / "grok-iso-home"
    try:
        iso_home.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    env = os.environ.copy()
    env["HOME"] = str(iso_home)
    env["GROK_HOME"] = str(Path.home() / ".grok")
    cmd = [binary, "-p", "ok", "-m", "grok-4.6", "--effort", "low", "--max-turns", "1"]
    grok_timeout = budget(GROK_TIMEOUT)
    try:
        proc = subprocess.run(
            cmd,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=grok_timeout,
            env=env,
        )
    except subprocess.TimeoutExpired:
        return _result("unknown", "timeout %.0fs" % grok_timeout)
    except OSError as exc:
        return _result("unknown", trim(exc, 60))
    text = proc.stdout.decode("utf-8", "replace")
    hit = GROK_DEATH_RE.search(text)
    if hit:
        line = ""
        for candidate in text.splitlines():
            if GROK_DEATH_RE.search(candidate):
                line = candidate.strip()
                break
        return _result("down", line or hit.group(0))
    head = first_line(text)
    if head.startswith("Error:") and "max turns reached" not in head and '"text"' not in text:
        return _result("down", head)
    return _result("ok", "exit %s" % proc.returncode)


def probe_codex():
    binary = shutil.which("codex")
    if not binary:
        return _result("no-binary", "бинарник codex не найден")
    cmd = [
        binary, "exec", "-m", "gpt-6-astra", "-s", "read-only",
        "--skip-git-repo-check", "-c", 'service_tier="default"', "ok",
    ]
    started = time.monotonic()
    codex_timeout = budget(CODEX_TIMEOUT)
    try:
        proc = subprocess.run(
            cmd,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=codex_timeout,
        )
    except subprocess.TimeoutExpired:
        return _result("unknown", "timeout %.0fs" % codex_timeout)
    except OSError as exc:
        return _result("unknown", trim(exc, 60))
    text = proc.stdout.decode("utf-8", "replace")
    elapsed = time.monotonic() - started
    if CODEX_QUOTA_RE.search(text):
        line = ""
        for candidate in text.splitlines():
            if CODEX_QUOTA_RE.search(candidate):
                line = candidate.strip()
                break
        return _result("quota", line or "usage limit")
    if proc.returncode == 0:
        return _result("ok", "exit 0, %.1fs" % elapsed)
    return _result("unknown", "exit %s: %s" % (proc.returncode, trim(first_line(text), 60)))


def _find_credits(obj):
    if isinstance(obj, dict):
        value = obj.get("recharge_credits")
        if isinstance(value, bool):
            value = None
        if isinstance(value, (int, float)):
            return float(value)
        for nested in obj.values():
            found = _find_credits(nested)
            if found is not None:
                return found
    elif isinstance(obj, list):
        for nested in obj:
            found = _find_credits(nested)
            if found is not None:
                return found
    return None


def probe_twitterapi():
    if not TWITTERAPI_SH.exists():
        return _result("unknown", "twitterapi.sh not found")
    api_timeout = budget(TWITTERAPI_TIMEOUT)
    try:
        proc = subprocess.run(
            ["bash", str(TWITTERAPI_SH), "balance"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=api_timeout,
        )
    except subprocess.TimeoutExpired:
        return _result("unknown", "timeout %.0fs" % api_timeout)
    except OSError as exc:
        return _result("unknown", trim(exc, 60))
    body = proc.stdout.decode("utf-8", "replace").strip()
    err = proc.stderr.decode("utf-8", "replace").strip()
    if proc.returncode == 2:
        return _result("no-key", "ключ TWITTERAPI_IO_KEY не заведён")
    if proc.returncode == 0:
        try:
            data = json.loads(body) if body else None
        except ValueError:
            data = None
        credits = _find_credits(data)
        if credits is None:
            return _result("unknown", "ответ без recharge_credits")
        if credits > 0:
            return _result("ok", "%d credits" % int(credits))
        return _result("down", "no credits")
    blob = (body + " " + err).strip()
    if re.search(r"\b(401|403)\b", blob):
        return _result("down", "key revoked (%s)" % ("401" if "401" in blob else "403"))
    if proc.returncode == 1:
        return _result("down", trim(first_line(blob) or "non-2xx", 80))
    return _result("unknown", "exit %s: %s" % (proc.returncode, trim(first_line(blob), 60)))


PROBE_FUNCS = {
    "grok-402": probe_grok,
    "codex-quota": probe_codex,
    "twitterapi-balance": probe_twitterapi,
}


# ── parallel execution with a global deadline ────────────────────────────────
def run_parallel(key_names, probe_ids, warnings):
    """All key checks and probes at once; whatever misses the deadline becomes `unknown`."""
    global _PENDING_THREADS
    keys = {}
    probes = {}
    jobs = []
    if not key_names and not probe_ids:
        return keys, probes
    pool = concurrent.futures.ThreadPoolExecutor(max_workers=max(1, len(key_names) + len(probe_ids)))
    try:
        for name in sorted(key_names):
            jobs.append((("key", name), pool.submit(check_key, name)))
        for pid in sorted(probe_ids):
            jobs.append((("probe", pid), pool.submit(PROBE_FUNCS[pid])))
        left = GLOBAL_DEADLINE - (time.monotonic() - START)
        concurrent.futures.wait([f for _, f in jobs], timeout=max(0.1, left))
        for (kind, name), fut in jobs:
            if fut.done() and not fut.cancelled():
                try:
                    value = fut.result()
                except Exception as exc:  # noqa: BLE001
                    value = {"state": "unknown", "rail": "", "detail": trim(exc, 60)}
                    if kind == "probe":
                        value["checked"] = now_iso()
                        value["cached"] = False
            else:
                fut.cancel()
                _PENDING_THREADS = True
                warnings.append("%s %s: не уложился в дедлайн 90 с" % (kind, name))
                value = {"state": "unknown", "rail": "", "detail": "deadline"}
                if kind == "probe":
                    value["checked"] = None
                    value["cached"] = False
            if kind == "key":
                keys[name] = value
            else:
                probes[name] = value
    finally:
        pool.shutdown(wait=False)
    return keys, probes


def plan_probes(wanted, cache, mode):
    """mode: 'auto' (cache, then run if stale) | 'force' | 'never'."""
    to_run = set()
    resolved = {}
    for pid in wanted:
        if pid not in PROBE_FUNCS:
            continue
        entry = cache.get(pid) or {}
        age = age_seconds(entry.get("checked"))
        fresh = entry.get("state") and age is not None and age <= PROBE_TTL.get(pid, 3600)
        if mode == "force":
            to_run.add(pid)
        elif fresh:
            resolved[pid] = {
                "state": entry.get("state"),
                "detail": entry.get("detail", ""),
                "checked": entry.get("checked"),
                "cached": True,
            }
        elif mode == "never":
            resolved[pid] = {
                "state": "unknown",
                "detail": "not probed",
                "checked": entry.get("checked"),
                "cached": False,
            }
        else:
            to_run.add(pid)
    return to_run, resolved


# ── state assembly ───────────────────────────────────────────────────────────
def provider_info(name, pdef, settings, probes):
    setting = settings["providers"].get(name, "auto")
    info = {"setting": setting, "access": "n/a", "checked": None, "cached": False, "detail": ""}
    if setting == "off":
        info["detail"] = "выключен в настройках"
        return info
    if not provider_binary(name, pdef):
        info["access"] = "no-binary"
        info["detail"] = "бинарник не найден (%s)" % pdef.get("binary", name)
        return info
    res = probes.get(pdef.get("probe"))
    if res is None:
        info["access"] = "unknown"
        info["detail"] = "not probed"
        return info
    info["access"] = res.get("state", "unknown")
    info["detail"] = res.get("detail", "")
    info["checked"] = res.get("checked")
    info["cached"] = bool(res.get("cached"))
    return info


def provider_usable(info):
    return info["setting"] != "off" and info["access"] in ("ok", "unknown")


def needed_keys(catalogue, channel_keys=None):
    names = set()
    channels = catalogue["channels"]
    wanted = channel_keys if channel_keys is not None else list(channels.keys())
    for key in wanted:
        cdef = channels.get(key) or {}
        for req in cdef.get("requires", []) or []:
            if req.get("key"):
                names.add(req["key"])
        for opt in cdef.get("optional_keys", []) or []:
            names.add(opt)
        for alt in cdef.get("alternatives", []) or []:
            if alt.get("key"):
                names.add(alt["key"])
    return names


def telegram_mode():
    """Native mode needs the tgsearch.py script and its session file; no network call here."""
    script = Path(os.environ.get("TGSEARCH_PY") or
                  Path.home() / ".claude/skills/telegram-search/scripts/tgsearch.py").expanduser()
    session = Path.home() / ".claude/jadlis/telegram-search/session/tgsearch.session"
    if script.is_file() and session.is_file():
        return "нативный поиск (Premium-аккаунт, tgsearch.py)"
    return "превью t.me + Brave (нет сессии tgsearch.py)"


def channel_access(key, cdef, settings, keys, providers):
    """→ (access, detail). Channel-level view used by both status and resolve."""
    if settings["channels"].get(key, "auto") == "off":
        return "n/a", "выключен в настройках"
    pname = cdef.get("provider")
    pinfo = providers.get(pname) if pname else None
    if key == "twitter":
        if pinfo is not None and provider_usable(pinfo):
            return "ok", "Grok Mode A"
        alt_key = "TWITTERAPI_IO_KEY"
        if keys.get(alt_key, {}).get("state") == "present":
            return "ok", "Mode B через TwitterAPI.io (Grok недоступен)"
        if pinfo is not None and pinfo["setting"] == "off":
            return "n/a", "Grok выключен, нет TWITTERAPI_IO_KEY"
        return "no-key", "нет TWITTERAPI_IO_KEY, Grok недоступен"
    if key == "telegram":
        return "ok", telegram_mode()
    if pinfo is not None:
        if pinfo["setting"] == "off":
            return "n/a", "провайдер %s выключен" % pname
        if pinfo["access"] not in ("ok", "unknown"):
            return pinfo["access"], pinfo["detail"]
    for req in cdef.get("requires", []) or []:
        if req.get("drop_without_key") and keys.get(req["key"], {}).get("state") == "no-key":
            return "no-key", "нет %s" % req["key"]
    return "ok", ""


def how_to_get_for_channel(catalogue, key, cdef, access, keys, providers):
    if access == "no-binary" and cdef.get("provider"):
        return catalogue["providers"][cdef["provider"]].get("how_to_get", "")
    if access in ("down", "quota") and cdef.get("provider"):
        return catalogue["providers"][cdef["provider"]].get("how_to_get", "")
    if access == "no-key":
        for req in cdef.get("requires", []) or []:
            if keys.get(req["key"], {}).get("state") == "no-key":
                return catalogue["keys"].get(req["key"], {}).get("how_to_get", req["key"])
        if key == "twitter":
            return catalogue["keys"].get("TWITTERAPI_IO_KEY", {}).get("how_to_get", "")
    return ""


# ── resolve ──────────────────────────────────────────────────────────────────
def cmd_resolve(args, catalogue, data_dir, settings, corrupt):
    channels_def = catalogue["channels"]
    requested = [c.strip() for c in str(args.channels or "").split(",") if c.strip()]
    unknown = [c for c in requested if c not in channels_def]
    if not requested or unknown:
        sys.stderr.write("unknown channel(s): %s\n" % ", ".join(unknown or ["<empty>"]))
        finish(EXIT_USAGE)

    warnings = []
    if corrupt:
        warnings.append(
            "файл настроек был повреждён: бэкап *.bad, применены значения по умолчанию (всё auto)"
        )

    mode = "auto"
    if args.fresh:
        mode = "force"
    elif args.no_probe:
        mode = "never"

    provider_names = set()
    for key in requested:
        pname = (channels_def[key] or {}).get("provider")
        if pname:
            provider_names.add(pname)

    wanted_probes = set()
    for pname in provider_names:
        if settings["providers"].get(pname, "auto") == "off":
            continue
        pdef = catalogue["providers"].get(pname) or {}
        if not provider_binary(pname, pdef):
            continue
        if pdef.get("probe"):
            wanted_probes.add(pdef["probe"])
    if "twitter" in requested:
        wanted_probes.add("twitterapi-balance")

    cache = load_cache(data_dir)
    to_run, resolved = plan_probes(wanted_probes, cache, mode)
    keys_wanted = needed_keys(catalogue, requested)
    keys, fresh_probes = run_parallel(keys_wanted, to_run, warnings)
    save_cache(data_dir, {k: v for k, v in fresh_probes.items() if v.get("checked")}, warnings)
    probes = dict(resolved)
    probes.update(fresh_probes)

    providers = {}
    for pname in sorted(provider_names):
        pdef = catalogue["providers"].get(pname) or {}
        providers[pname] = provider_info(pname, pdef, settings, probes)

    grok = providers.get("grok")
    balance = probes.get("twitterapi-balance") or {}
    twitterapi_present = keys.get("TWITTERAPI_IO_KEY", {}).get("state") == "present"

    kept = []
    dropped = []
    notes = {}
    state = {}

    for key in requested:
        cdef = channels_def[key] or {}
        pname = cdef.get("provider")
        pinfo = providers.get(pname) if pname else None

        # 1. explicit off (channel or provider)
        if settings["channels"].get(key, "auto") == "off":
            dropped.append({"channel": key, "reason": "disabled-by-settings",
                            "detail": "канал выключен в настройках"})
            state[key] = "disabled-by-settings"
            continue
        if key != "twitter" and pinfo is not None and pinfo["setting"] == "off":
            dropped.append({"channel": key, "reason": "disabled-by-settings",
                            "detail": "провайдер %s выключен в настройках" % pname})
            state[key] = "disabled-by-settings"
            continue

        # 3. twitter — alternatives before the provider verdict
        if key == "twitter":
            if pinfo is not None and provider_usable(pinfo):
                notes[key] = (
                    "GROK OK — run the twitter protocol as written (Mode A: Grok CLI first, "
                    "TwitterAPI.io as the complement layer)."
                )
                if not twitterapi_present:
                    notes[key] += (
                        " TWITTERAPI_IO_KEY is missing: skip the TwitterAPI.io complement "
                        "(replies, author profile, trends) and rely on the Grok calls."
                    )
                kept.append(key)
                state[key] = "ok"
                continue
            if twitterapi_present:
                cause = CAUSE_SETTINGS if (pinfo is not None and pinfo["setting"] == "off") else CAUSE_PROBE
                note = GROK_OFF_NOTE.format(cause=cause)
                if balance.get("state") == "ok" and balance.get("detail"):
                    note += " (TwitterAPI.io balance: %s)" % balance["detail"]
                elif balance.get("state") in ("down", "no-key") and balance.get("detail"):
                    note += " (TwitterAPI.io balance: %s)" % balance["detail"]
                notes[key] = note
                kept.append(key)
                state[key] = "ok"
                if balance.get("state") == "down":
                    warnings.append("twitter: TwitterAPI.io отвечает «%s» — канал может отвалиться"
                                    % balance.get("detail", "нет баланса"))
                continue
            detail = "Grok недоступен (%s) и нет TWITTERAPI_IO_KEY" % (
                (pinfo or {}).get("access", "unknown"))
            dropped.append({"channel": key, "reason": "no-access", "detail": detail})
            state[key] = "no-access"
            continue

        # 2. provider auto but not usable
        if pinfo is not None and not provider_usable(pinfo):
            dropped.append({"channel": key, "reason": "no-access",
                            "detail": "%s: %s%s" % (pname, ACCESS_RU.get(pinfo["access"], pinfo["access"]),
                                                    (" — " + pinfo["detail"]) if pinfo["detail"] else "")})
            state[key] = "no-access"
            continue
        if pinfo is not None and pinfo["access"] == "unknown":
            warnings.append("провайдер %s: доступ неизвестен (%s) — считаю пригодным"
                            % (pname, pinfo.get("detail") or "не проверялся"))

        # 4. required keys
        missing = None
        for req in cdef.get("requires", []) or []:
            if req.get("drop_without_key") and keys.get(req["key"], {}).get("state") == "no-key":
                missing = req["key"]
                break
        if missing:
            dropped.append({"channel": key, "reason": "no-access", "detail": "нет ключа %s" % missing})
            state[key] = "no-access"
            if key == "web":
                warnings.append(
                    "нет BRAVE_API_KEY: канал web выпал, Brave нужен и верификаторам — ресерч "
                    "считается недостаточным"
                )
            continue

        kept.append(key)
        state[key] = "ok"

        # 5. notes for kept channels
        if key == "youtube" and keys.get("YOUTUBE_API_KEY", {}).get("state") != "present":
            notes[key] = (
                "No YOUTUBE_API_KEY: skip every mcp__plugin_jadlis-search_youtube__* call; work "
                "through brave_web_search site:youtube.com plus "
                "python3 {PLUGIN_ROOT}/scripts/yt-transcript.py. This is a normal degradation, "
                "not a channel failure."
            )
        if key == "reddit" and keys.get("REDDITAPIS_KEY", {}).get("state") != "present":
            notes[key] = (
                "No REDDITAPIS_KEY: the redditapis.com fallback "
                "(mcp__plugin_jadlis-search_reddit-alt__*) is unavailable — use the standard "
                "Reddit MCP only and do not retry through the alt server."
            )
        if key == "eu" and keys.get("WYKOP_API_KEY", {}).get("state") != "present":
            notes[key] = (
                "No WYKOP_API_KEY: feed-fetch.py returns exit 3 for the wykop source — cover "
                "wykop.pl through brave_web_search site:wykop.pl; the other EU sites are unaffected."
            )

    families_in = set((channels_def[c] or {}).get("family") for c in requested)
    families_out = set((channels_def[c] or {}).get("family") for c in kept)
    insufficient = len(kept) < 2 or (len(families_in) >= 2 and len(families_out) < 2)

    providers_off = sorted(
        name for name, info in providers.items() if info["setting"] == "off"
    )
    # fail-closed: a provider that is down is also reported as unusable to the workflow
    unusable = sorted(
        name for name, info in providers.items()
        if info["setting"] != "off" and not provider_usable(info)
    )
    for name in unusable:
        if name not in providers_off:
            providers_off.append(name)
    providers_off = sorted(set(providers_off))

    summary = ["Каналы: %s (%d из %d, семейств %d)."
               % (", ".join(kept) if kept else "нет", len(kept), len(requested), len(families_out))]
    off_list = [d for d in dropped if d["reason"] == "disabled-by-settings"]
    na_list = [d for d in dropped if d["reason"] == "no-access"]
    if off_list:
        summary.append("Выключено в настройках: %s."
                       % ", ".join("%s (%s)" % (d["channel"], d["detail"]) for d in off_list))
    if na_list:
        summary.append("Нет доступа: %s."
                       % ", ".join("%s (%s)" % (d["channel"], trim(d["detail"], 60)) for d in na_list))
    if "twitter" in kept and "twitter" in notes and notes["twitter"].startswith(("GROK DISABLED", "GROK DOWN")):
        summary.append("Twitter идёт keyword-only через TwitterAPI.io (Mode B, sourceQuality ≤ MEDIUM).")
    if insufficient:
        summary.append("Источников недостаточно — запускать ресерч не стоит.")

    payload = {
        "channels": kept,
        "dropped": dropped,
        "notes": notes,
        "providers": providers,
        "providers_off": providers_off,
        "state": state,
        "families": len(families_out),
        "families_in": len(families_in),
        "insufficient": insufficient,
        "warnings": warnings,
        "summary_ru": " ".join(summary),
        "data_dir": str(data_dir),
    }

    if args.table and not args.as_json:
        print("data dir: %s" % data_dir)
        print(payload["summary_ru"])
        rows = [["Канал", "Статус", "Деталь"]]
        for key in requested:
            st = state.get(key, "?")
            detail = ""
            for item in dropped:
                if item["channel"] == key:
                    detail = trim(item["detail"], 70)
            if not detail and key in notes:
                detail = trim(notes[key], 60)
            rows.append([key, STATE_RU.get(st, st), detail])
        print_table(rows)
        for warning in warnings:
            print("! %s" % warning)
    else:
        out_json(payload)
    return EXIT_SETTINGS if corrupt else EXIT_OK


# ── status ───────────────────────────────────────────────────────────────────
def print_table(rows):
    if not rows:
        return
    widths = []
    for col in range(len(rows[0])):
        widths.append(max(len(str(row[col])) for row in rows))
    for index, row in enumerate(rows):
        cells = []
        for col, cell in enumerate(row):
            text = str(cell)
            cells.append(text if col == len(row) - 1 else text.ljust(widths[col]))
        print("  " + "  ".join(cells).rstrip())
        if index == 0:
            print("  " + "  ".join("-" * widths[col] for col in range(len(row))))


def cmd_status(args, catalogue, data_dir, settings, corrupt):
    warnings = []
    if corrupt:
        warnings.append(
            "файл настроек был повреждён: бэкап *.bad, применены значения по умолчанию (всё auto)"
        )
    mode = "force" if args.probe else ("never" if args.no_probe else "auto")

    wanted_probes = set()
    for pname, pdef in catalogue["providers"].items():
        if settings["providers"].get(pname, "auto") == "off":
            continue
        if not provider_binary(pname, pdef):
            continue
        if pdef.get("probe"):
            wanted_probes.add(pdef["probe"])
    for ldef in catalogue["layers"].values():
        if ldef.get("probe"):
            wanted_probes.add(ldef["probe"])

    cache = load_cache(data_dir)
    to_run, resolved = plan_probes(wanted_probes, cache, mode)

    keys_wanted = needed_keys(catalogue)
    for ldef in catalogue["layers"].values():
        if ldef.get("key"):
            keys_wanted.add(ldef["key"])

    keys, fresh_probes = run_parallel(keys_wanted, to_run, warnings)
    save_cache(data_dir, {k: v for k, v in fresh_probes.items() if v.get("checked")}, warnings)
    probes = dict(resolved)
    probes.update(fresh_probes)

    providers = {}
    for pname in sorted(catalogue["providers"].keys()):
        providers[pname] = provider_info(pname, catalogue["providers"][pname], settings, probes)

    channels = {}
    for key, cdef in catalogue["channels"].items():
        access, detail = channel_access(key, cdef, settings, keys, providers)
        channels[key] = {
            "setting": settings["channels"].get(key, "auto"),
            "access": access,
            "detail": detail,
            "family": cdef.get("family"),
            "default_set": bool(cdef.get("default_set")),
            "provider": cdef.get("provider"),
        }

    layers = {}
    for name, ldef in catalogue["layers"].items():
        key_state = keys.get(ldef.get("key", ""), {}).get("state", "unknown")
        access = {"present": "ok", "no-key": "no-key"}.get(key_state, "unknown")
        checked = None
        cached = False
        probe_detail = ""
        if ldef.get("probe"):
            res = probes.get(ldef["probe"]) or {}
            if res.get("state") in ("ok", "down", "no-key", "quota"):
                if access == "ok":
                    access = "ok" if res["state"] == "ok" else res["state"]
                probe_detail = res.get("detail", "")
                checked = res.get("checked")
                cached = bool(res.get("cached"))
        layers[name] = {
            "key": ldef.get("key"),
            "access": access,
            "detail": probe_detail,
            "checked": checked,
            "cached": cached,
            "channels": ldef.get("channels", []),
        }

    tools = {}
    for name, tdef in catalogue["tools"].items():
        path = check_tool(name)
        tools[name] = {
            "access": "ok" if path else "no-binary",
            "detail": path or "",
            "channels": tdef.get("channels", []),
        }

    missing = []
    for pname, info in providers.items():
        if info["access"] in BAD_ACCESS:
            missing.append({
                "kind": "провайдер", "name": pname,
                "label": catalogue["providers"][pname].get("label", pname),
                "access": info["access"], "detail": info["detail"],
                "how_to_get": catalogue["providers"][pname].get("how_to_get", ""),
            })
    for key, info in channels.items():
        if info["access"] in BAD_ACCESS:
            cdef = catalogue["channels"][key]
            missing.append({
                "kind": "канал", "name": key, "label": cdef.get("label", key),
                "access": info["access"], "detail": info["detail"],
                "how_to_get": how_to_get_for_channel(catalogue, key, cdef, info["access"], keys, providers),
            })
    for name, info in layers.items():
        if info["access"] in BAD_ACCESS:
            ldef = catalogue["layers"][name]
            missing.append({
                "kind": "слой", "name": name, "label": ldef.get("label", name),
                "access": info["access"], "detail": info["detail"],
                "how_to_get": ldef.get("how_to_get", ""),
            })
    for name, info in tools.items():
        if info["access"] in BAD_ACCESS:
            tdef = catalogue["tools"][name]
            missing.append({
                "kind": "бинарник", "name": name, "label": tdef.get("label", name),
                "access": info["access"], "detail": "",
                "how_to_get": tdef.get("how_to_get", ""),
            })

    payload = {
        "data_dir": str(data_dir),
        "settings": {"providers": settings["providers"], "channels": settings["channels"],
                     "updated": settings.get("updated")},
        "providers": providers,
        "channels": channels,
        "layers": layers,
        "tools": tools,
        # states only — key VALUES never leave secret.sh
        "keys": dict((name, {"state": info.get("state"), "rail": info.get("rail", "")})
                     for name, info in sorted(keys.items())),
        "missing": missing,
        "warnings": warnings,
    }

    if args.as_json:
        out_json(payload)
        return EXIT_SETTINGS if corrupt else EXIT_OK

    print("data dir: %s" % data_dir)
    print("")
    header = ["Источник", "Тип", "Каналы", "Настройка", "Доступ", "Проверено", "Без него / где взять"]

    print("Провайдеры моделей")
    rows = [header]
    for pname in sorted(providers.keys()):
        pdef = catalogue["providers"][pname]
        info = providers[pname]
        access = info["access"]
        note = pdef.get("degrade", "") if access in ("ok", "unknown", "n/a") else pdef.get("how_to_get", "")
        rows.append([
            pdef.get("label", pname), "провайдер", ", ".join(pdef.get("powers", [])),
            info["setting"],
            ACCESS_RU.get(access, access) + (" (кэш)" if info["cached"] else ""),
            human_age(info["checked"]),
            trim(("%s — %s" % (info["detail"], note)) if info["detail"] else note, 96),
        ])
    print_table(rows)
    print("")

    print("Каналы")
    rows = [header]
    for key in catalogue["channels"].keys():
        cdef = catalogue["channels"][key]
        info = channels[key]
        access = info["access"]
        note = cdef.get("degrade", "") if access in ("ok", "unknown", "n/a") else \
            how_to_get_for_channel(catalogue, key, cdef, access, keys, providers) or cdef.get("degrade", "")
        rows.append([
            cdef.get("label", key),
            "канал · дефолт" if cdef.get("default_set") else "канал · opt-in",
            key, info["setting"], ACCESS_RU.get(access, access), "—",
            trim(("%s — %s" % (info["detail"], note)) if info["detail"] else note, 96),
        ])
    print_table(rows)
    print("")

    print("Слои и бинарники")
    rows = [header]
    for name in catalogue["layers"].keys():
        ldef = catalogue["layers"][name]
        info = layers[name]
        access = info["access"]
        note = ldef.get("degrade", "") if access in ("ok", "unknown") else ldef.get("how_to_get", "")
        rows.append([
            ldef.get("label", name), "слой (%s)" % ldef.get("key", "—"),
            ", ".join(ldef.get("channels", [])), "—",
            ACCESS_RU.get(access, access) + (" (кэш)" if info["cached"] else ""),
            human_age(info["checked"]),
            trim(("%s — %s" % (info["detail"], note)) if info["detail"] else note, 96),
        ])
    for name in catalogue["tools"].keys():
        tdef = catalogue["tools"][name]
        info = tools[name]
        access = info["access"]
        note = tdef.get("degrade", "") if access == "ok" else tdef.get("how_to_get", "")
        rows.append([
            tdef.get("label", name), "бинарник", ", ".join(tdef.get("channels", [])), "—",
            ACCESS_RU.get(access, access), "—", trim(note, 96),
        ])
    print_table(rows)
    print("")

    if missing:
        print("Можно подключить, но нет доступа:")
        for item in missing:
            detail = (" — %s" % item["detail"]) if item["detail"] else ""
            print("  · %s %s (%s)%s: %s" % (
                item["kind"], item["name"], ACCESS_RU.get(item["access"], item["access"]),
                detail, item["how_to_get"] or "см. /jadlis-search:keys"))
        print("")
    for warning in warnings:
        print("! %s" % warning)
    if warnings:
        print("")
    print("Ключи заводятся через /jadlis-search:keys")
    return EXIT_SETTINGS if corrupt else EXIT_OK


# ── set / reset / catalogue ──────────────────────────────────────────────────
def cmd_set(args, catalogue, data_dir, settings, corrupt):
    kind = args.kind
    name = args.name
    state = args.state
    if state not in ("auto", "off"):
        sys.stderr.write("unknown state %r (expected auto|off)\n" % state)
        finish(EXIT_USAGE)
    section = "providers" if kind == "provider" else "channels"
    known = catalogue["providers"] if kind == "provider" else catalogue["channels"]
    if name not in known:
        sys.stderr.write("unknown %s %r (known: %s)\n" % (kind, name, ", ".join(sorted(known))))
        finish(EXIT_USAGE)

    def mutate(current):
        if state == "auto":
            current[section].pop(name, None)
        else:
            current[section][name] = state

    write_corrupt = update_settings(data_dir, mutate)
    corrupt = corrupt or write_corrupt
    if args.as_json:
        out_json({"ok": True, "kind": kind, "name": name, "state": state,
                  "data_dir": str(data_dir), "settings_corrupt": bool(corrupt)})
    else:
        label = known[name].get("label", name)
        print("data dir: %s" % data_dir)
        if state == "off":
            print("%s «%s» (%s) выключен: probe не запускается, канал(ы) не выбираются."
                  % ("Провайдер" if kind == "provider" else "Канал", label, name))
            if kind == "provider":
                print("Без него: %s" % known[name].get("degrade", ""))
        else:
            print("%s «%s» (%s) → auto: доступ решает probe на каждом прогоне."
                  % ("Провайдер" if kind == "provider" else "Канал", label, name))
        if corrupt:
            print("! файл настроек был повреждён, бэкап *.bad, остальные переопределения сброшены")
    return EXIT_SETTINGS if corrupt else EXIT_OK


def cmd_reset(args, catalogue, data_dir, settings, corrupt):
    if not args.yes:
        sys.stderr.write("reset: нужен --yes (удаляет %s и %s)\n" % (SETTINGS_NAME, CACHE_NAME))
        finish(EXIT_USAGE)
    removed = []
    for name in (SETTINGS_NAME, CACHE_NAME, LOCK_NAME):
        path = data_dir / name
        try:
            if path.exists():
                path.unlink()
                removed.append(name)
        except OSError as exc:
            sys.stderr.write("cannot remove %s: %s\n" % (path, exc))
            finish(EXIT_DATA_DIR)
    if args.as_json:
        out_json({"ok": True, "removed": removed, "data_dir": str(data_dir)})
    else:
        print("data dir: %s" % data_dir)
        print("Настройки сброшены: %s. Все провайдеры и каналы снова auto."
              % (", ".join(removed) if removed else "удалять было нечего"))
    return EXIT_OK


def cmd_catalogue(args, catalogue, data_dir, settings, corrupt):
    payload = {
        "plugin_root": str(PLUGIN_ROOT),
        "catalogue_path": str(CATALOGUE_PATH),
        "data_dir": str(data_dir),
        "settings": settings,
        "probe_ttl_seconds": PROBE_TTL,
        "catalogue": catalogue,
    }
    out_json(payload)
    return EXIT_SETTINGS if corrupt else EXIT_OK


# ── entry point ──────────────────────────────────────────────────────────────
def build_parser():
    parser = Parser(prog="research-sources.py",
                    description="Source catalogue, settings and probes for /jadlis-research.")
    parser.add_argument("--data-dir", dest="data_dir", default="")
    parser.add_argument("--json", dest="as_json", action="store_true")
    sub = parser.add_subparsers(dest="command")

    def add_common(p):
        p.add_argument("--json", dest="as_json_sub", action="store_true")
        p.add_argument("--data-dir", dest="data_dir_sub", default="")

    status = sub.add_parser("status", help="таблица доступа по всем источникам")
    status.add_argument("--probe", action="store_true")
    status.add_argument("--no-probe", dest="no_probe", action="store_true")
    add_common(status)

    resolve = sub.add_parser("resolve", help="отфильтровать список каналов по настройкам и доступу")
    resolve.add_argument("--channels", required=True)
    resolve.add_argument("--fresh", action="store_true")
    resolve.add_argument("--no-probe", dest="no_probe", action="store_true")
    resolve.add_argument("--table", action="store_true")
    add_common(resolve)

    setter = sub.add_parser("set", help="set provider|channel <name> <auto|off>")
    setter.add_argument("kind", choices=["provider", "channel"])
    setter.add_argument("name")
    setter.add_argument("state")
    add_common(setter)

    reset = sub.add_parser("reset", help="удалить файл настроек и кэш проб")
    reset.add_argument("--yes", action="store_true")
    add_common(reset)

    cat = sub.add_parser("catalogue", help="слитый каталог (отладка)")
    add_common(cat)
    return parser


def main(argv):
    parser = build_parser()
    args = parser.parse_args(argv)
    if not args.command:
        parser.print_usage(sys.stderr)
        finish(EXIT_USAGE)
    args.as_json = bool(args.as_json or getattr(args, "as_json_sub", False))
    data_dir_arg = args.data_dir or getattr(args, "data_dir_sub", "")

    catalogue = load_catalogue()
    data_dir = resolve_data_dir(data_dir_arg)
    settings, corrupt = load_settings(data_dir)

    handlers = {
        "status": cmd_status,
        "resolve": cmd_resolve,
        "set": cmd_set,
        "reset": cmd_reset,
        "catalogue": cmd_catalogue,
    }
    code = handlers[args.command](args, catalogue, data_dir, settings, corrupt)
    finish(code)


if __name__ == "__main__":
    main(sys.argv[1:])
