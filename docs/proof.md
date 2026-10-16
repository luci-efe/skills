# /proof

Runs declared checks and records evidence before anyone says "done".

**When:** Use before claiming work is complete, a performance gain, or a working UI.

## Example
```sh
node skills/proof/scripts/run.mjs checks.json --run-id r1 --session s1 --branch assertion
node skills/proof/scripts/check.mjs r1
```

## Writes
`<state>/runs/<run-id>/result.json` and logs. In Claude Code the Stop hook blocks a stale "done".

## Notes
Local gate stops accidental false claims, not fabricated evidence; CI re-execution is the real proof. The `perf` branch is a label for now (no baseline pairing).

Full procedure: [`skills/proof/SKILL.md`](../skills/proof/SKILL.md).
