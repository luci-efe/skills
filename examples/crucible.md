# /crucible: example run

Request: "add a guard rule for chained shell commands" in a TypeScript harness. The only public description of the issue was a one-line summary, so the request was genuinely underspecified.

```
/crucible add a guard rule for chained shell commands
```

## Step 1: read first (facts, with `path:line`)
Read at: a feature-branch commit (the record carries the ref, since line numbers are only valid there).
- A chain splitter already exists: `splitSegments`, `src/harness/tool-guard.ts:38-56`, and three of the four shell analyses are built on it.
- Existing tests cover chained forms: `tests/tool-guard-containment.test.ts:27,44,59`, `tests/tool-guard.test.ts:48,55`.
- Baseline: 127 tests in the two guard test files pass.

## Step 2: the ladder
1. Skip or delete? No, the gaps are reproducible.
2. **Already in the repo? Yes: the chain splitter already exists, so reuse it.** Extend `splitSegments`; do not add a parallel parser.
3. Dependency or stdlib? A real shell parser would be a heavy new dependency; rejected.
4. New code: the minimum change to the existing splitter.

So the answer to "add a rule" was "it is not a new rule; the remaining gap is narrower".

## Step 3: five axes
| axis | status | decision |
|---|---|---|
| Scope | assumed | extend the existing splitter; separate issue bullets stay out of scope |
| Data and state invariants | settled | pure function of the command string; existing decision classes unchanged |
| Failure modes | assumed | fail closed on unparsable input; over-splitting risks false denies only |
| Security and trust boundary | open (low) | findings concern unreleased code, so the record stays local until maintainers confirm |
| Verification proof | settled | add failing cases as table rows first (red), then fix; the two guard test files must stay green |

A scratch prototype of the obvious change broke one of the 127 baseline tests, which exposed a design constraint no stakeholder question would have surfaced. The prototype was not committed.

## What it caught
That the requested "new rule" mostly already existed, where the real gap was, and a design trap, using the code and a baseline test run rather than questions. No question to the human was needed beyond the open security axis.

## Caveats
- The skill writes `<state dir>/decisions/<topic>.md` (`$RAMOS_STATE_DIR` or `.ramos/`); git-ignore `.ramos/`, because in this checkout it was untracked and `git add -A` would have committed it.
- "Proof" for a not-yet-built change is a baseline command that passes today plus a check that should change; the template has one slot for both.
- Nothing was implemented, per the skill ("don't start coding").
- Specifics of the findings are deliberately omitted here: they concern unreleased code.
