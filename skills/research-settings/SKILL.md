---
name: research-settings
description: "Source settings for /research: one table of providers, channels and layers — setting (auto/off), access, where to get it; switch Grok or any channel off for good. Triggers: research settings, research sources, disable grok, turn off a channel, which sources are available. RU triggers: настройки ресерча, настройки источников, источники ресерча, отключи grok, выключи канал, какие источники доступны. Do NOT use for: adding keys → /jadlis-search:keys; running research → /research."
allowed-tools:
  - Read
  - AskUserQuestion
  - Bash(python3 ${CLAUDE_PLUGIN_ROOT}/skills/research-settings/scripts/research-sources.py *)
argument-hint: "[status [--probe]] | [set provider grok|codex off|auto] | [set channel <key> off|auto] | [reset]"
model: claude-opus-5-5
effort: medium
---

# /jadlis-research:research-settings — sources of `/research` in one table

`$ARGUMENTS`

```
SCRIPT = python3 "${CLAUDE_PLUGIN_ROOT}/skills/research-settings/scripts/research-sources.py" --data-dir "${CLAUDE_PLUGIN_DATA}"
```

Pass `--data-dir` even when `${CLAUDE_PLUGIN_DATA}` stays a literal (a local trial with
`--plugin-dir`): the script discards a literal/empty value and falls back to its own computed path.
The first line of `status` — `data dir: <path>` — says which file is really in use; show it to the
user only if they ask where the settings live.

**Two states.** `auto` (default) — the source is probed on every research run, the probe result is
cached (Grok 6 h, Codex 2 h, TwitterAPI balance 1 h). `off` — the source is never used and never
probed: the channel is dropped before the run starts, without a message about access.
`off` is stored in `source-settings.json` inside the data dir and survives `claude plugin update`;
it does **not** survive `claude plugin uninstall` without `--keep-data` — after a reinstall repeat
the one `set` command.

## Flow

**1. No arguments → `SCRIPT status`** (uses the cache; stale probes of `auto` sources run in
parallel — a cold cache is ≈6 s, the script's global deadline is 90 s; Bash timeout 120000).
Print the Russian table **verbatim**, including the bucket «Можно подключить, но нет доступа:» —
it is produced by the script, do not rewrite or re-sort it. Then AskUserQuestion «Что сделать?»:

| Option | Action |
|---|---|
| «Перепроверить доступ (--probe)» | `SCRIPT status --probe` → print the fresh table |
| «Выключить / включить источник» | follow-up question, see below |
| «Сбросить настройки» | confirmation, see step 4 |
| «Ничего» | say «Настройки не менял» and stop |

For «Выключить / включить источник» ask a second AskUserQuestion listing the providers
(`grok`, `codex`) and the channels from the table (`web`, `codexweb`, `grokweb`, `reddit`,
`twitter`, `hackernews`, `substack`, `yandex`, `youtube`, `telegram`, `ja`, `zh`, `ko`, `eu`),
each option naming the target state — «grok → off», «codex → auto», «youtube → off» … Take the
current state from the table so an option never proposes the state a source already has. Then run
`SCRIPT set provider <key> <state>` or `SCRIPT set channel <key> <state>`, and after it
`SCRIPT status --no-probe` (fast, no network) to show the result.

**2. `$ARGUMENTS` is `status --probe` / `--probe` / «перепроверь»** → `SCRIPT status --probe`,
bypassing the cache. Warn in one line that this takes up to a minute.

**3. `$ARGUMENTS` already contains `set …`** → run it as given, then `SCRIPT status --no-probe`.
Do not ask anything: the user has spelled the change out.

**4. `$ARGUMENTS` is `reset`** → AskUserQuestion confirmation («Сбросить все настройки источников
в auto?» / «Отмена»); only on confirmation `SCRIPT reset --yes`, then `SCRIPT status --no-probe`.

`catalogue` and `resolve` are debug/machine commands — run them only if the user asks by name.

## What the table says and what to do with it

- Bucket «Можно подключить, но нет доступа:» comes from the script (`no-key`, `no-binary`, `down`,
  `quota`) with the «где взять» hint already in it.
- **Keys are added only through `/jadlis-search:keys`** — never offer to write a key here, never
  edit `settings.json` or the Keychain from this skill.
- Grok: the balance lives at grok.com (Grok Build subscription); an exhausted balance shows up as
  `down`. Codex: quota is shared with `/verif`; no binary → `codex login` after installing the CLI.
- `unknown` access = the probe timed out or its output was unparseable; the source is still treated
  as usable, mention the warning line as is.

## Rules

- **Never print key values** — the script does not print them either; do not add `echo $KEY`,
  `secret.sh KEY` or any other read of a value.
- **Never edit `source-settings.json` / `probe-cache.json` by hand** (no Write, no `jq > file`):
  writes go only through `set` / `reset`, which lock the file.
- Exit **4** — the settings file was corrupt: say «Файл настроек был повреждён, копия сохранена
  рядом как `.bad`, сейчас действуют значения по умолчанию (всё auto)», show the table, offer to
  repeat the `set`.
- Exit **2** (data dir is not writable) or **3** (catalogue unreadable): show the script's message
  as is and stop — do not retry and do not work around the script.
- Exit **1** — a usage error or an unknown source key: show the list of valid keys from the table
  and ask again.

## Connection with `/jadlis-research:research`

The research skill reads these same settings through `SCRIPT resolve --channels … --json` in its
Phase A: a source with `off` never reaches the run, and the reason is shown as «выключено в
настройках», not as a failure. Grok `off` means: the channel `grokweb` is dropped, and the channel
`twitter` runs keyword-only via TwitterAPI.io (`scripts/twitterapi.sh`, Mode B) with Brave
`site:x.com` as the second fallback — the Grok CLI and `mcp__grok-mcp__*` / `mcp__twitterapi-mcp__*`
are not called at all. Say this in one line when the user switches Grok off, so the degradation is
not a surprise: «twitter останется, но keyword-only — семантический угол пропадёт,
sourceQuality ≤ MEDIUM».

A change applies to the next research run; a run already in flight keeps the settings it started
with.
