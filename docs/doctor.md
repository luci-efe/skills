# /doctor

Check that the suite's tools are installed and wire the Claude hooks.

**When:** Use when installing the suite, a branch reports a missing tool, or you want the Claude Code hooks.

## Example
```sh
node skills/doctor/scripts/doctor.mjs            # matrix of every provider
node skills/doctor/scripts/doctor.mjs rg ast-grep --json
node skills/doctor/scripts/doctor.mjs --install-hooks claude --dry-run   # or codex, gemini
```

## Writes
Nothing, except the harness settings file (`.claude/settings.local.json`, `.codex/hooks.json` or `.gemini/settings.json`) when you run `--install-hooks` (merge only; a malformed file is left untouched).

## Notes
Exit 2 if any requested provider is missing. A binary on PATH does not prove auth or services work.

Example run: [`examples/doctor.md`](../examples/doctor.md)

Full procedure: [`skills/doctor/SKILL.md`](../skills/doctor/SKILL.md).
