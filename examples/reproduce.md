# /reproduce: example run

Two runs on a checkout of ultimate-harness at `~/project` (`bun install --frozen-lockfile` first). Baseline on HEAD: `npx vitest run` gave 74 files, 882 tests passed.

## 1. Find the fix with a bisect (`references/bisect.md`)
Bug: `parsePiOutput` returned an empty `finalMessage` for the `pi` CLI's native event shape. The fix, found with `git log --grep '^fix'`, is `ab38e02 fix(pi): parse pi's native output shape (#150)`. The predicate script and its probe live outside the tree in the state dir; exit 0 means broken, 1 fixed, 125 skip (adapter absent).
```sh
git worktree add $RAMOS_STATE_DIR/worktrees/bisect HEAD --detach
git -C $WT bisect start --term-old=broken --term-new=fixed HEAD 8d96048     # 8d96048 = "feat: vanilla pi adapter"
git -C $WT bisect run sh $RAMOS_STATE_DIR/reproduce/predicate.sh
# Bisecting: 27 revisions left to test after this (roughly 5 steps)
# ab38e02133b7edbdfb4c9ce255a59949200df587 is the first fixed commit
```
Independent check of the old endpoint: the predicate at `ab38e02~1` printed `finalMessage= ""` and exited 0 (broken).

## 2. A regression test that fails before the fix
Bug: `mission run --auto --force` still filtered adapters by unmet `runtime_requirements`; the fix is `99f4854`. The test was written fresh, then dropped into a worktree at `99f4854~1`, three runs each:
```
99f4854~1 (before the fix), runs 1 to 3, identical:
  × unmet runtime_requirements do not block routing when forced
  AssertionError: expected null to be 'hermes'
99f4854 and main, x3:   Tests  1 passed (1)
```
The test encodes the expected behaviour (unforced is blocked, forced routes) and fails for the reported reason, 3 of 3, so it is not flaky.

## What it caught
The bisect pinpointed the fix commit in about five steps; the regression test fails before the fix and passes after it with the same file at both commits.

## Caveats
- In this bisect every tested midpoint already contained the fix through merge ancestry, so the answer came from the git graph, not from observing a failing commit. Check both endpoints by hand first.
- With `--term-old/--term-new`, `bisect run` exit 0 means the OLD term, so the predicate must exit 0 when broken. The final line still reads "bisect found first bad commit" even though the term is "fixed".
- A predicate that imports repo code needs a probe copied in and `node_modules` symlinked, which dirties the worktree; the "remove only if `status --short` is empty" step then needs `git worktree remove --force`.
- The regression test was left untracked in a scratch worktree; in real use it is committed into the suite.
- Under Node vitest the extra argument to the old function signature is ignored (no typecheck), so the test fails at runtime, not at compile time.
