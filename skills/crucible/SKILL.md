---
name: crucible
description: Use when a feature, refactor, or design is underspecified or has competing approaches — before writing code for work that touches data shape, security boundaries, public interfaces, or more than a few files. Not for typo-sized fixes.
---

# /crucible

Read first, ask last. The human answers only what the code can't.

## Step 1: Read (no questions yet)
Search with `rg`, then write what the code already decides as facts with `path:line`. Every later question must be one these facts couldn't answer.

## Step 2: The ladder (before proposing anything new)
For each piece of the requested change, stop at the first "yes":
1. **Can we skip or delete it?** Is the requirement already met, or not needed? → say so.
2. **Is it already in the repo?** An existing helper, component, or pattern → reuse it (cite `path:line`).
3. **Is it in the stdlib or an existing dependency?** → use it.
4. **Only then:** the minimal new code, with no speculative options or abstractions.

## Step 3: Five axes
For each axis, mark it **settled** (cite the code or the request) or **open**:
1. **Scope**: what's in, and explicitly what's out.
2. **Data and state invariants**: what must always be true. Migrations?
3. **Failure modes**: what happens on bad input, timeout, partial failure, retry.
4. **Security and trust boundaries**: who can call this, with what data, and where validation lives.
5. **Verification proof**: which check will prove it's done (feeds `/proof`).

## Step 4: Ask only what's open
- Is an axis open, and does the answer change the design? → ask. Max **3 questions per batch**. Each gives your recommended answer and its trade-off, so the human can just say "yes".
- Is it open but low-stakes? → decide, and record it as `assumed`.
- Is everything settled? → don't ask anything. Go to step 5.
- Is a genuine architectural fork worth other models' views? → `/council` with this record as the artifact.

## Step 5: Record
Write `<state dir>/decisions/<topic>.md`, where the state dir is `$RAMOS_STATE_DIR` or `.ramos/` (git-ignore it; never commit it):
```markdown
# <topic> (<date>)
Read at: <commit or branch the facts and line numbers are valid for>
## Facts (from code)        - … (path:line)
## Ladder outcome           - reuse X / stdlib Y / new Z (why)
## Axes                     | axis | settled/assumed/answered | decision | source |
## Out of scope             - …
## Proof                    - exact command(s) /proof will run
```

## Done when
Every axis is settled, assumed, or answered, the record exists, and the proof command is named. Unanswered design-changing questions → stop and report `blocked` on the human. Don't start coding.
