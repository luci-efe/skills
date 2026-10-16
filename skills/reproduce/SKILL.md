---
name: reproduce
description: Use when something is broken — a bug report, a failing test, a regression, an error in logs, or "it used to work" — before changing any code to fix it.
---

# /reproduce

No fix without an observed failure. The deliverable is a regression test that fails before the fix and passes after it.

## Preflight
- Find the repo's real test command (`package.json` scripts, `Makefile`, `pyproject`, `go test`, `cargo test`). Run it once on HEAD and record the baseline. If the baseline is already red elsewhere, note those failures. They aren't yours.
- Never `stash`, `reset`, or `checkout` over the user's working tree. History work happens in a separate worktree (step 4).

## Decision tree

**1. Classify the report**
- Exact failing test or command given → run it, go to 3.
- Error message or stack trace → find the throw site (`rg -n "<message>"`), read its callers and existing tests, go to 2.
- Vague ("checkout is slow", "sometimes fails") → ask for one concrete input, environment, and expected vs. actual behavior. Max 3 questions, then stop until answered.

**2. Build the smallest failing input**
Write a test in the existing suite, next to similar tests, that encodes *expected* behavior. Run it.
- It fails for the reported reason → go to 3.
- It fails for a different reason (import error, fixture, env) → that's a broken test environment, not the bug. Fix the test setup first.
- It passes → your hypothesis is wrong. Read more code, change the input. After 3 failed attempts → report `blocked` with what you tried.

**3. Confirm it's real, not flaky**
Run the failing test 3×. Mixed results → mark it flaky, capture timing and order dependence, and treat flakiness as the bug.

**4. "It used to work"?** → read `references/bisect.md` (git bisect in an isolated worktree).

**5. Optional runtime trace** → only when the failing path is unclear after reading. Use the language's tracer (`node --cpu-prof`, `py-spy record`, `go test -cpuprofile`). Report observed samples. A sampled profile can miss short calls.

**6. Fix**
Anything newly red in the full suite → fix it or revert your change. Don't edit the regression test to make it pass.

## Done when
- The regression test is committed in the repo's suite.
- Evidence shows **the same test** failing before (output or commit) and passing after.
- The full suite is no worse than baseline. Hand off to `/proof` for the recorded run.
- Or: `blocked` with the inputs tried and the reason.
