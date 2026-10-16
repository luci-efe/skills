# Bisecting a regression without touching the user's checkout

1. You need a test or script that exits 0 on good and non-zero on bad (exit `125` means skip, for example when it doesn't build). Write it **outside** the tracked tree so every commit sees the same predicate, e.g. `.ramos/reproduce/predicate.sh`.
2. Pick a known-good ref (tag, release, or a commit the user names) and bad = `HEAD`.
3. Isolated worktree (run from the repo root and keep absolute paths, so cleanup runs from the right place):
   ```sh
   ROOT=$(git rev-parse --show-toplevel)
   WT="$ROOT/.ramos/worktrees/bisect"
   git worktree add "$WT" HEAD --detach
   git -C "$WT" bisect start HEAD <good>
   git -C "$WT" bisect run sh "$ROOT/.ramos/reproduce/predicate.sh"
   git -C "$WT" bisect log > "$ROOT/.ramos/reproduce/bisect.log"
   git -C "$WT" bisect reset
   ```
4. Report the first bad commit **under that predicate**. A first bad commit can contain unrelated hunks, and bisect doesn't tell you which hunk caused it. Read the diff (`git show <sha>`), narrow to the hunk, and confirm by reverting just that hunk in the worktree.
5. From `$ROOT`, remove the worktree with `git worktree remove "$WT"` only after confirming it's clean (`git -C "$WT" status --short` prints nothing).

Parallel bisection across Herdr panes is not worth it unless one test run takes minutes. Adaptive bisection is sequential by nature.
