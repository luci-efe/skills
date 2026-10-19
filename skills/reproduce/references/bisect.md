# Bisecting a regression without touching the user's checkout

1. You need a test or script that exits 0 on good and non-zero on bad (exit `125` means skip, for example when it doesn't build). Write it **outside** the tracked tree so every commit sees the same predicate, e.g. `$STATE/reproduce/predicate.sh`, with `STATE=${RAMOS_STATE_DIR:-$ROOT/.ramos}`. If state lives inside the repo it must be git-ignored, or it changes the proof digest.
   Predicates that need scratch files in the worktree (a copied probe, a `node_modules` symlink) dirty it; prefer absolute paths to files outside the tree.
2. Pick a known-good ref (tag, release, or a commit the user names) and bad = `HEAD`.
   **Before `bisect run`, run the predicate by hand at both endpoints** (old must exit as old, new as new). Otherwise merge ancestry can make bisect "find" a commit without ever observing the behaviour change.
3. Isolated worktree (run from the repo root and keep absolute paths, so cleanup runs from the right place):
   ```sh
   ROOT=$(git rev-parse --show-toplevel)
   STATE=${RAMOS_STATE_DIR:-$ROOT/.ramos}
   WT="$STATE/worktrees/bisect"
   git worktree add "$WT" HEAD --detach
   git -C "$WT" bisect start HEAD <good>
   git -C "$WT" bisect run sh "$STATE/reproduce/predicate.sh"
   git -C "$WT" bisect log > "$STATE/reproduce/bisect.log"
   git -C "$WT" bisect reset
   ```
   To find where something was *fixed* instead, use `git -C "$WT" bisect start --term-old=broken --term-new=fixed HEAD <old>`. Custom terms only rename the states, they invert nothing: `bisect run` still treats exit `0` as the **old** term and `1-127` (except `125` skip) as the **new** term. So here the predicate exits `0` when the bug is present (old = broken) and non-zero when fixed. The final line still says "first bad commit" even though it is the first *fixed* one.
4. Report the first bad commit **under that predicate**. A first bad commit can contain unrelated hunks, and bisect doesn't tell you which hunk caused it. Read the diff (`git show <sha>`), narrow to the hunk, and confirm by reverting just that hunk in the worktree.
5. From `$ROOT`, remove the worktree with `git worktree remove "$WT"` only after confirming it's clean (`git -C "$WT" status --short` prints nothing). If it lists only your own predicate artifacts (e.g. `.probe.ts`, a `node_modules` symlink), confirm that and use `git worktree remove --force "$WT"`; anything else dirty means stop and look.

Parallel bisection across Herdr panes is not worth it unless one test run takes minutes. Adaptive bisection is sequential by nature.
