# /council

Several model families review one artifact in two rounds through Herdr panes.

**When:** Use for a consequential decision (architecture, risky diff). Not for routine work.

## Example
```sh
node skills/council/scripts/council.mjs init --artifact plan.md --seats claude,codex,agy
node skills/council/scripts/council.mjs status --dir <run-dir>
```

## Writes
`.ramos/council/<run>/`: round prompts, one file per seat per round, `SYNTHESIS.md`.

## Notes
Needs `herdr` with `HERDR_ENV=1` and 2+ harness families. At least 2 completed reviews per round or it reports `blocked`.

Full procedure: [`skills/council/SKILL.md`](../skills/council/SKILL.md).
