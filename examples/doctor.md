# /doctor: example run

Checkout of ultimate-harness at `~/project`, `RAMOS_STATE_DIR` set, `$SKILLS` = this repo's `skills/`.

## 1. Provider matrix
```sh
node $SKILLS/doctor/scripts/doctor.mjs        # exit 2
```
```
Provider | Available | Version | Install / diagnostic
git | yes | git version 2.50.1 (Apple Git-155) | —
node | yes | v22.23.1 | —
rg | yes | ripgrep 15.1.0 | —
ast-grep | yes | ast-grep 0.51.0 | —
osv-scanner | yes | osv-scanner version: 2.7.0 | —
...
semgrep | no | unknown | brew install semgrep (probe ENOENT)
playwright | no | unknown | npm init playwright@latest (probe ENOENT)
odiff | no | unknown | npm install -g odiff-bin (probe ENOENT)
```
19 providers probed, 16 present. Exit 2 because three are missing, as documented, even though none matters for the checks this repo uses. Ask only for what you need:
```sh
node $SKILLS/doctor/scripts/doctor.mjs rg ast-grep osv-scanner --json    # exit 0
[{"id":"rg","ok":true,"version":"ripgrep 15.1.0"},{"id":"ast-grep","ok":true,"version":"ast-grep 0.51.0"},{"id":"osv-scanner","ok":true,"version":"osv-scanner version: 2.7.0"}]
```

## 2. Installing the Claude hooks
```sh
node $SKILLS/doctor/scripts/doctor.mjs --install-hooks claude --dry-run   # prints merged settings, writes nothing
node $SKILLS/doctor/scripts/doctor.mjs --install-hooks claude             # writes .claude/settings.local.json
```
A pre-existing `{"permissions":{"allow":["Bash(ls:*)"]}}` is preserved and `SessionStart`, `UserPromptSubmit` and `Stop` entries are merged in. Running it twice leaves exactly one entry of each. Each hook command embeds absolute paths to the skills checkout and the node binary, so the hooks break if that directory moves (re-run the install).

## 3. Malformed settings are left alone
With `.claude/settings.local.json` containing `{bad json`:
```
Malformed JSON in ~/project/.claude/settings.local.json: Expected property name or '}' in JSON at position 1 (line 1 column 2)
```
Exit 2, file untouched.

## 4. The hooks, driven by hand
Feeding hook JSON to the adapter:
```
UserPromptSubmit "check dependencies for CVE advisories before release"
  -> compass: consider /red-team — investigate security exposure
```
In an earlier run the `Stop` hook, with a /proof run armed for the session and a source file edited afterwards, answered:
```
{"decision":"block","reason":"/proof: Evidence is stale: source inputs changed. Run the declared checks or record a terminal blocker with its reason."}
```
with `{}` on an unchanged tree.

## What it caught
Exactly which tools are absent, with an install recipe for each, and an idempotent, non-destructive hook install.

## Caveats
- Probes check that a binary runs, not that it is authenticated or reachable. `cua-driver`, `agy` and `mnemosyne` report version `unknown`.
- Hook behaviour was exercised by feeding JSON to the adapter, not inside a live Claude Code session.
