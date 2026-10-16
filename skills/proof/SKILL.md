---
name: proof
description: Use when validating a change, measuring a performance claim, verifying a user interface, or claiming local work is done.
---
# Proof

- If checking code behavior → assertion: select the repository's existing relevant checks and observe their execution.
- If claiming performance → perf: record a baseline and changed run under the same inputs/environment; check correctness and an explicit threshold, not elapsed time alone.
- If checking a web UI → read `references/visual-web.md`; browser readiness and a user journey are mandatory.
- If checking a desktop UI → read `references/visual-desktop.md`; use one named CUA session and deterministic state verification.
- Before any selected branch → probe its sidecar prerequisites; missing tools block only that branch with the known install recipe. Availability does not establish service/browser readiness.
- Before adding checks → apply Delete → Repo → Stdlib → Minimal to unnecessary implementation additions; keep existing test conventions.
- If checks are declared → save a JSON manifest with `checks` and nonempty `required_checks`. Each check has `id`, literal `argv`, optional project-relative `cwd`, and optional `timeout_ms` (default 120000, maximum 3600000).
- If evidence artifacts are needed → include project-relative file paths in `artifacts`; keep generated logs/artifacts under the configured state directory so verification does not change source inputs.
- Execute this skill's `scripts/run.mjs checks.json --run-id <unique-id> --session <session-id> --branch <branch>` with Node from the project cwd. Use an absolute script path for installed skills.
- If the input digest changes during checks → treat the run as blocked, stabilize inputs and rerun. Never reuse another revision's pass.
- If execution fails, times out, or a command is missing → retain result/logs and report failed/blocked with a reason.
- If checks passed → run `node scripts/check.mjs <run-id>` against the current project before claiming done; exit 0 passes, exit 2 is blocked.
- If using Windows command shims → use a tested native executable or `node <tool-cli.js>` argv. The runner never enables a shell to execute a `.cmd` fallback.

Example manifest:
```json
{"checks":[{"id":"unit","argv":["node","--test"]}],"required_checks":["unit"],"artifacts":[]}
```
The runner writes `STATE_DIR/runs/<run-id>/result.json`; `STATE_DIR` comes from the installed config module and can be overridden by `RAMOS_STATE_DIR`. It never overwrites an existing run ID. Session registry entries are keyed by session ID. Without `--session` or `RAMOS_SESSION_ID`/`CLAUDE_SESSION_ID`, use the manual check; no hook is armed for an inferred session.

Done: all declared required checks passed on stable current inputs and evidence was validated locally. CI independently re-runs, reviews and challenges that result. A generated receipt alone is not independent proof, deployment evidence, or customer acceptance.
