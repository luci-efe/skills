# Bisecting a regression without touching the user's checkout

1. You need a test or script that exits 0 on good and non-zero on bad (exit `125` means skip, for example when it doesn't build). Write it **outside** the tracked tree so every commit sees the same predicate, e.g. `.ramos/reproduce/predicate.sh`.
2. Pick a known-good ref (tag, release, or a commit the user names) and bad = `HEAD`.
3. Isolated worktree:
   ```sh
   git worktree add .ramos/worktrees/bisect HEAD --detach
   cd .ramos/worktrees/bisect
   git bisect start HEAD <good>
   git bisect run sh ../../reproduce/predicate.sh
   git bisect log > ../../reproduce/bisect.log
   git bisect reset
   ```
4. Report the first bad commit **under that predicate**. A first bad commit can contain unrelated hunks, and bisect doesn't tell you which hunk caused it. Read the diff (`git show <sha>`), narrow to the hunk, and confirm by reverting just that hunk in the worktree.
5. Remove the worktree with `git worktree remove .ramos/worktrees/bisect` only after confirming it's clean (`git -C .ramos/worktrees/bisect status --short` is empty).

Parallel bisection across Herdr panes is not worth it unless one test run takes minutes. Adaptive bisection is sequential by nature.
