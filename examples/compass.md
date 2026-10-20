# /compass: example run

Checkout of ultimate-harness at `~/project`; `RAMOS_SKILL_ROOTS` points at this repo's `skills/`.

```sh
P=$SKILLS/compass/scripts/compass.mjs
node $P index        # the 9 suite skills show dependency_status "declared"; other installed skills "undeclared"
```

## Routes (trimmed to status / skill / branch)
| prompt | result |
|---|---|
| `route "check dependencies for CVE before release"` | ready: red-team / scan (osv-scanner, rg, ast-grep all probed ok) |
| `route "I don't know how the mission cancel flow works before I change it"` | ready: cartographer / baseline |
| `route "the checkout test fails intermittently"` | ready: reproduce / default |
| `route "benchmark my claim that the threads pool is faster"` | ready: proof / **assertion** |
| same prompt with a final argument `perf` | ready: proof / perf |
| same prompt with final argument `nonsense` | blocked: `Unknown branch nonsense; ... (branches of proof: assertion, perf, visual-web, visual-desktop)` |
| `route "make me a sandwich"` | `no-match` |
| `route "scan for vulnerable dependencies" --skill $SKILLS/red-team/SKILL.md` | ready: red-team / scan |
| `nudge "check dependencies for CVE"` | silent (needs two intent signals) |
| `nudge "check dependencies for CVE advisories before release"` | `compass: consider /red-team — investigate security exposure` |

## Blocked, with a recipe
With a PATH lacking `rg` and `ast-grep`:
```sh
PATH=/usr/bin:/bin node $P route "trace the architecture flow of mission cancel"
```
```
status: blocked, selected: cartographer / baseline
rg:       missing, brew install ripgrep
ast-grep: missing, brew install ast-grep
```
Nothing is ever installed for you.

## Two easy mistakes
- The last positional argument is a **branch id**. `route "scan for vulnerable dependencies" red-team` returns `blocked`: `Unknown branch red-team; to pick a skill use --skill <path to SKILL.md> (branches of red-team: scan, github-enrich)`.
- The perf branch is not chosen automatically: a "benchmark ... faster" prompt lands on proof's first branch (`assertion`) unless you pass `perf` as the final argument.

## Exit codes
`ready` and `no-match` exit 0; `blocked` exits 2. A misroute exits 0, so nothing flags it.

## Caveats
Routing is a keyword table, not understanding. An early run showed "the checkout test fails intermittently" routed to proof because only the exact word forms `failing`, `broken`, ... matched; the router now covers those wordings (output above is from the shipped code), but novel phrasing can still miss. Naming the skill (`/reproduce`) always bypasses the router.
