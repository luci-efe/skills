# /red-team: example run

Target: a shallow clone of ultimate-harness at `~/project` (Bun lockfiles plus a Python requirements file). Everything is read-only; the `osv-scanner fix` step was not run.

```sh
mkdir -p $RAMOS_STATE_DIR/red-team
osv-scanner scan source -r --format json --output-file $RAMOS_STATE_DIR/red-team/osv.json .    # osv-scanner 2.7.0
echo $?                                                                                        # 1 = vulnerabilities found
jq -r '.results[].source.path' $RAMOS_STATE_DIR/red-team/osv.json | sort -u                    # which lockfiles were scanned
bun pm why undici                                                                              # direct or transitive?
rg -n -w <pkg> ...; ast-grep run -p 'import $$$ from "undici"' -l ts .                         # is it reachable?
```
The scan covered 3 manifests (`bun.lock` 215 packages, `apps/docs/bun.lock` 830, a Python `requirements-dev.txt` 5) and returned 120 advisory rows. Exit 1 means "advisories found"; exit 128 would mean "nothing scannable", never "clean". Capture `$?` directly: a `| tail` after the scan hides it.

## Rollup (top 5 packages by advisory count)
| package | advisories | direct? | finding |
|---|---|---|---|
| undici (two versions) | 21 each | transitive, via build tooling | not found within stated coverage |
| starlette | 14 | transitive, test-only pin | suspected (the plugin may run inside a host process whose version this repo does not control) |
| brace-expansion | 6 | transitive | not found within stated coverage |
| anyio | 4 | transitive | not found within stated coverage |
| js-yaml | 4 | transitive | not found within stated coverage |

Zero rows are `confirmed`, because no reproducing test was written. Packages beyond the top five are listed as untriaged in `report.md` rather than silently dropped.

## What it caught
All findings sit in transitive, dev-only or test-only dependencies, and none of the five packages is imported by repo code (the ast-grep import pattern was validated by running the same pattern for a package that is imported). The one real item for a human is the starlette hosting question.

## Caveats
- "Not found within stated coverage" is grep and AST based; it cannot see dynamic loading or code inside the tools themselves.
- `gh api .../dependabot/alerts` returned `[]`, which cannot distinguish "no alerts" from "disabled or unreadable".
- Write the scan JSON outside the clone (`$RAMOS_STATE_DIR/red-team`) so it is not committed by accident.
