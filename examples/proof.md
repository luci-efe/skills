# /proof: example run

ultimate-harness at `~/project`, `RAMOS_STATE_DIR` set. Manifest `checks.json` declares a typecheck plus `vitest run` on 3 test files (32 tests), with `required_checks: ["typecheck","unit"]`.

## 1. Pass
```sh
S=$SKILLS/proof/scripts
node $S/run.mjs checks.json --run-id pass-1 --session s1 --branch assertion   # exit 0
node $S/check.mjs pass-1                                                       # exit 0
# {"ok":true,"reason":null}
```
`result.json` records `status:"passed"`, the git `head`, `dirty`, an `input_digest`, and a log hash per check.

## 2. Stale block
After the run, one comment line was appended to `src/cli.ts`:
```
$ node $S/check.mjs pass-1
{"ok":false,"reason":"Evidence is stale: source inputs changed"}       # exit 2
$ git checkout src/cli.ts && node $S/check.mjs pass-1
{"ok":true,"reason":null}                                              # exit 0 again
$ node $S/run.mjs checks.json --run-id pass-1 ...
run id already exists: pick a new --run-id (pass-1)                    # exit 2
```
That is the point: a "done" claim whose evidence no longer matches the tree is refused. In Claude Code the Stop hook turns this into a block.

## 3. Perf gate
Two real checks over the same workload, differing only in the vitest pool: baseline `unit-forks` (`--pool=forks`) versus changed `unit-threads` (`--pool=threads`). The manifest adds:
```json
"perf": {"baseline_check": "unit-forks", "changed_check": "unit-threads", "max_ratio": 1.2}
```
| run | max_ratio | baseline ms | changed ms | ratio | result |
|---|---|---|---|---|---|
| a | 1.2 | 3384 | 4884 | 1.44 | failed: `Perf ratio 1.44 exceeds max_ratio 1.2` (`check.mjs`: exit 2, `terminal:true`) |
| b | 1.5 | 4505 | 2974 | 0.66 | passed |
| c | 0.5 | 1480 | 2191 | 1.48 | failed: `Perf ratio 1.48 exceeds max_ratio 0.5` |

Other guards, on the shipped code:
```
--branch perf with no perf block:  perf branch needs manifest.perf {baseline_check, changed_check, max_ratio}    # exit 2
baseline check that ran 13ms:      Perf inconclusive: baseline ran 13ms (< 50ms), so the ratio is noise; make the workload longer
```
The second is a `blocked` result: a baseline under 50 ms is never treated as a measurement.

## 4. Forged evidence
Editing `perf.ratio` in `result.json` to `0.5` is detected, because `check.mjs` recomputes the ratio from the logged check timestamps:
```
{"ok":false,"reason":"Perf record does not match check timestamps (recorded ratio 0.5, recomputed 0.66)"}   # exit 2
```

## Caveats
- Noise is real: the same workload measured 1.44x on a cold run (row a) and 0.66x on a later one (row b). Single-run wall-clock needs a workload that dwarfs noise; the cold failure was cache noise, not a regression. Rows a and c come from the first run of this example; row b and section 4 from a re-run on the final code.
- This is a local gate: it stops accidental false claims, not deliberate fabrication. CI re-execution is the real proof.
- Only 3 of 75 test files ran, to keep the demo fast; not the repo's full suite.
- A silent check (here `tsc`) leaves an empty log, so its sha256 is the empty-string hash.
