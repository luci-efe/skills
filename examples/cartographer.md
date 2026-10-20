# /cartographer: example run

Flow chosen: **`uh mission cancel`** in ultimate-harness (CLI, then plugin HTTP, then process terminate). The checkout at `~/project` has no GitNexus index, so `status` selects baseline mode (`rg` + `ast-grep`).

```sh
C=$SKILLS/cartographer/scripts/cartographer.mjs
node $C status
# {"indexed":null,"current":"9705d50","dirty_files":[],"errors":[],"gitnexus":"unindexed", ...}
node $C query "cancelMissionRunViaPlugin" --pattern 'cancelMissionRunViaPlugin($$$)' --lang ts
```
Output (trimmed): `status:"ok"`, `mode:"baseline"`, `ast_scope:"rg_files"`, `truncated:false`
```
rg_matches (8):  src/cli.ts:28 (import), src/cli.ts:1250 (call), src/harness/mission-cancel.ts:31 (def),
                 tests/mission-cancel.test.ts:3, :21, :24, :40, :44
ast_matches (4): tests/mission-cancel.test.ts:24, :40, :44 and the call in src/cli.ts:1250
```

## `--limit`
`--limit` caps the rg and AST match lists (default 50, max 100). Overflow sets `truncated:true`.

| command | rg_matches | ast_matches | truncated |
|---|---|---|---|
| (default) | 8 | 4 | false |
| `--limit 2` | 2 | 2 | true |
| `--limit 0`, `101`, `abc` | | | `status:"blocked"`, exit 2: `limit must be an integer from 1 to 100` |

## AST scope is not exhaustive
`query "mission-cancel" --pattern 'appendRuntimeCancelledEvent($$$)'` returns **1** AST match: AST search runs only on files the text search hit. Repo-wide `ast-grep run -p 'appendRuntimeCancelledEvent($$$)' -l ts src tests` finds **5**. The output says so with `ast_scope:"rg_files"`; when `--pattern` is given and rg found nothing, the scope widens to the whole repo (`ast_scope:"repo"`). Without `--pattern`, no AST hits are returned.

## Malformed pattern
`--pattern 'function ('` gives exit 2, `status:"blocked"`, `errors:["ast-grep: invalid pattern: Warning: Pattern contains an ERROR node..."]`, not a silent empty result.

## The artifact
The script writes nothing. The flow slice below was written by hand from the query results plus `rg -n`, and every cited line was re-checked against the file (excerpt):
```
# Flow: mission cancel (`uh mission cancel`)
1. CLI command "cancel"                            src/cli.ts:1224-1225
2. cancelMissionRunViaPlugin(opts.pluginUrl, ...)  call src/cli.ts:1250, def src/harness/mission-cancel.ts:31
3. POST ${base}/runs/<id>/cancel                   src/harness/mission-cancel.ts:39
4. Plugin route cancel_run                         apps/hermes-plugin/dashboard/plugin_api.py:1283-1284
5. proc.terminate(), status -> cancelled           plugin_api.py:1308, 1319
Invariants: already-finished run -> 409 already_finished (plugin_api.py:1294), CLI exits 1 (src/cli.ts:1254);
            unknown run -> 404 not_found (:1295); default URL overridable by UH_PLUGIN_URL (mission-cancel.ts:25-29)
Tests:      tests/mission-cancel.test.ts:13, :21, :32
Unknowns:   Python lines found with rg, not ast-grep; dynamic route registration not traced
```

## What it caught
The whole TypeScript side of the flow and its covering tests in two queries.

## Caveats
- It does not follow HTTP edges: the Python hop is reached through a URL string, so it needed a manual `rg` and was recorded under Unknowns.
- AST results are scoped, not exhaustive (above).
- `--help` is not supported; use `status` or `query`.
