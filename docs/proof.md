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
Local gate stops accidental false claims, not fabricated evidence; CI re-execution is the real proof. The `perf` branch needs `perf:{baseline_check,changed_check,max_ratio}` in the manifest; the wall-clock ratio is recorded and enforced by `run.mjs` and `check.mjs`. Rerunning a run id exits 2 with a clear error.

Example run: [`examples/proof.md`](../examples/proof.md)

Full procedure: [`skills/proof/SKILL.md`](../skills/proof/SKILL.md).
