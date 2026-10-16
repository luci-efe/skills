# /reproduce

No fix without an observed failure; the deliverable is a regression test.

**When:** Use for any bug, failing test, regression or "it used to work".

## Example
```sh
/reproduce checkout total is wrong when a coupon and gift card are combined
```

## Writes
A committed regression test; bisect logs under the state dir (`reproduce/bisect.log`).

## Notes
`references/bisect.md` bisects in an isolated worktree, for regressions or (with `--term-old/--term-new`) fixes. Needs `git`.

Full procedure: [`skills/reproduce/SKILL.md`](../skills/reproduce/SKILL.md).
