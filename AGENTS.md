# Agent guide for luci-efe/skills

Read `docs/CONTRACTS.md` before writing code.

## Mission and seats
Mission `skills-council`. Chair/integrator: `skills-council-chair-1` (pane w1H:p1).

| Seat | Pane | Worktree | Branch | Owns |
|---|---|---|---|---|
| chair (Claude Opus 5.5) | w1H:p1 | `/Users/fr/code/skills_repo` | `main` | integration, merges, `skills/{relay,council,crucible,reproduce,red-team}` |
| codex (GPT-6 Astra) | w1H:p2 | `/Users/fr/code/skills_repo/.worktrees/codex` | `feat/core` | `lib/`, `scripts/`, `skills/{compass,doctor,proof}`, `hooks/`, `test/`, `package.json`, `.github/` |
| argon (Gemini 4 Argon) | w1H:p3 | `/Users/fr/code/skills_repo/.worktrees/argon` | `feat/cartographer` | `skills/cartographer` |
| argon (site) | w1H:p3 | `/Users/fr/code/skills_repo/.worktrees/site` (worktree of `~/code/fr/site`) | `feat/skills-route` | `/skills` route in ferramos-site |

Rules: write only inside your worktree and your owned paths. Never reset, clean, rebase, force, or delete anything. Never push or publish (the chair asks Fernando first). Commit to your own branch with a clear message.

## Reporting (STATUS v1)
Send to the chair pane with `herdr pane send-text w1H:p1 '<envelope>'` followed by `herdr pane send-keys w1H:p1 Enter`. Alternatively, append the envelope to `.council/inbox/<seat>.md`, which the chair reads.
```
STATUS v1
status: working | blocked | review | done | failed
mission: skills-council
correlation_id: skills-council/chair/<n>
from: <pane-name>
to: skills-council-chair-1
worktree: <abs path>
branch: <branch>
summary: <one sentence>
artifact: <path@commit | none>
commit: <full sha | none>
check: <exact command and observed result | none>
blocker: <owner/action | none>
next: <owner and action>
```
`done` requires a commit SHA plus a green `npm test` that you observed.
