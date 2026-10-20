---
name: proof
description: Use when validating a change, measuring a performance claim, verifying a user interface, or claiming local work is done.
---
# Proof

`<this skill dir>` is the absolute directory containing this installed SKILL.md.

- If checking code behavior → assertion: select the repository's existing relevant checks and observe their execution.
- If claiming performance → perf (`--branch perf`): the manifest must add `"perf":{"baseline_check":"<id>","changed_check":"<id>","max_ratio":1.2}`; both ids are required checks, run the same workload on baseline and changed code. The runner records `result.perf` (wall-clock ratio changed/baseline) and fails above `max_ratio` (must be ≤100). A baseline under 50ms is `blocked` as inconclusive (ratio is noise): lengthen the workload; `check.mjs` recomputes baseline/changed time and ratio from the logged check timestamps (never trusting the stored values) and rejects a result whose recorded perf numbers differ or whose ratio exceeds `max_ratio`. Wall time of one run is coarse: make each check do enough work to dwarf noise, and keep correctness as a separate required check.
- If checking a web UI → read `references/visual-web.md`; browser readiness and a user journey are mandatory.
- If checking a desktop UI → read `references/visual-desktop.md`; use one named CUA session and deterministic state verification.
- Before any selected branch → probe its sidecar prerequisites; missing tools block only that branch with the known install recipe. Availability does not establish service/browser readiness.
- Before adding checks → apply Delete → Repo → Stdlib → Minimal to unnecessary implementation additions; keep existing test conventions.
- If checks are declared → save a JSON manifest with `checks` and nonempty `required_checks`. Each check has `id`, literal `argv`, optional project-relative `cwd`, and optional `timeout_ms` (default 120000, maximum 3600000).
- If evidence artifacts are needed → include project-relative file paths in `artifacts`; keep generated logs/artifacts under the configured state directory so verification does not change source inputs.
- Execute `node <this skill dir>/scripts/run.mjs checks.json --run-id <unique-id> --session <session-id> --branch <branch>` from the project cwd. Use an absolute script path for installed skills.
- If the input digest changes during checks → treat the run as blocked, stabilize inputs and rerun. Never reuse another revision's pass.
- If execution fails, times out, or a command is missing → retain result/logs and report failed/blocked with a reason.
- If checks passed → run `node <this skill dir>/scripts/check.mjs <run-id>` against the current project before claiming done; exit 0 passes, exit 2 is blocked.
- If using Windows command shims → use a tested native executable or `node <tool-cli.js>` argv. The runner never enables a shell to execute a `.cmd` fallback.

Example manifest:
```json
{"checks":[{"id":"unit","argv":["node","--test","test/**/*.test.mjs"]}],"required_checks":["unit"],"artifacts":[]}
```
The runner writes `STATE_DIR/runs/<run-id>/result.json`; `STATE_DIR` comes from the installed config module and can be overridden by `RAMOS_STATE_DIR`. It never overwrites an existing run ID (a rerun exits 2 with `run id already exists`; pick a new `--run-id`). A missing binary still leaves `checks/<id>.log` containing the error. Session registry entries are keyed by session ID. Without `--session` or `RAMOS_SESSION_ID`/`CLAUDE_CODE_SESSION_ID`/`CLAUDE_SESSION_ID`, use the manual check; no hook is armed for an inferred session.

Claude Code supplies `CLAUDE_CODE_SESSION_ID` in its tool environment. `--session` overrides the environment; the Stop hook prefers `session_id` in its JSON input. State is anchored at the Git root (otherwise `CLAUDE_PROJECT_DIR` when it contains cwd, falling back to cwd), so package-level runs and root hooks share evidence. Check output streams to disk without a size cap; each log has a verified SHA-256. Rerun older receipts that lack `log_sha256`.

The local gate prevents accidental false “done” claims, not fabricated evidence: a hand-written result and matching hashes can pass. CI re-execution plus independent review earns “verified.”

Done: all declared required checks passed on stable current inputs and evidence was validated locally. CI independently re-runs, reviews and challenges that result. A generated receipt alone is not independent proof, deployment evidence, or customer acceptance.
