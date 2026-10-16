# luci-efe/skills — Build Contracts (v0)

Source of decisions: council synthesis (private). Every seat builds against this file. Change it only via the chair.

## 1. Repo layout
```
skills/<name>/SKILL.md        # frontmatter: exactly `name`, `description` (trigger-first, "Use when…")
skills/<name>/skill.json      # suite metadata (schema below); never repeats name/description
skills/<name>/references/*.md # Tier 3, loaded only by a decision-tree branch
skills/<name>/scripts/*.mjs   # Node ≥22 stdlib only, no npm deps at runtime
lib/                          # shared runtime, vendored into skills by scripts/build (see §7)
hooks/claude/                 # Claude Code hook adapter (optional install)
test/                         # node --test; fixtures under test/fixtures/
docs/                         # contracts, provider catalog
```
Skills: `doctor compass cartographer crucible council reproduce proof red-team relay` (9).

## 2. Constants
`lib/config.mjs` exports `STATE_DIR = process.env.RAMOS_STATE_DIR ?? '.ramos'` and `stateDirectory(cwd)`. State is anchored at the git toplevel. Outside git it uses `CLAUDE_PROJECT_DIR` (when it contains cwd), else cwd. Parent folders are never searched, so a stray `~/.ramos` can't capture unrelated projects. The path is realpath-canonicalized. Every script resolves state via `stateDirectory()`. No other file may hardcode `.ramos`.

## 3. `skill.json` schema (v1)
```json
{
  "schema_version": 1,
  "stage": "orient|decide|build|prove|continue",
  "rule_ids": ["03"],
  "branches": [
    { "id": "default", "entrypoint": "SKILL.md", "requires": ["git"], "artifact_schema": null }
  ]
}
```
- `requires` holds provider IDs from `lib/providers.json`, never shell strings.
- `lib/providers.json`: `{ "<id>": { "bin": "rg", "probe": ["rg","--version"], "install": { "darwin": "brew install ripgrep", "linux": "…", "any": "…" }, "docs": "url" } }`.
- Readiness is probed when a branch is selected (argv array, `shell:false`, 5s timeout). Discovery metadata may be cached; readiness may not.

## 4. Run evidence: `STATE_DIR/runs/<run-id>/result.json`
```json
{ "schema_version":1, "run_id":"…", "skill":"proof", "branch":"assertion",
  "status":"passed|failed|blocked|cancelled",
  "source": { "head":"<sha|null>", "input_digest":"sha256:…", "dirty":true },
  "checks":[{ "id":"unit", "argv":["npm","test"], "cwd":".", "exit":0, "started_at":"…", "ended_at":"…", "log":"checks/unit.log", "log_sha256":"…" }],
  "required_checks":["unit"], "artifacts":["…"], "reason":null }
```
`input_digest` = sha256 over sorted (path, content-sha256, kind) of tracked-modified + untracked non-ignored files, plus HEAD. Submodules and nested repos contribute their HEAD plus a recursive dirty digest. All git reads use `--no-optional-locks`. It is recomputed at validation, and a mismatch or a changed `log_sha256` means the evidence is stale. **Limitation:** a hand-written passing record can satisfy the local gate. Only CI re-execution plus independent review earns "verified".

## 5. Handoff checkpoint: `STATE_DIR/runs/<run-id>/<pane>/checkpoints/<seq>/handoff.json`
Fields: `schema_version, run_id, pane, sequence, created_at, parent_checkpoint{path,sha256}|null, task{objective,scope,constraints[],acceptance_refs[]}, workspace{repo_id,branch,head,input_digest}, ownership{owner,intended_receiver,transfer_id,phase:"working|offered"}, work_state:"active|done|blocked|failed|cancelled", decisions[≤5]{id,summary,source_ref,status}, next_actions[≤3]{owner,action,artifact}, blockers[≤3], unknowns[≤3], evidence[≤6]{kind,path,digest,outcome}, memory_refs[≤5]`.
JSON ≤ 8 KiB, strings ≤ 240 chars. The checkpoint is immutable, written via temp file + rename. `HANDOFF.md` is generated next to it by `relay render` and is never hand-edited. Receiver writes `ack.json {transfer_id, checkpoint_sha256, receiver, at}`.
SessionStart injection ≤ 400 tokens (≤1600 bytes): status, STALE flag, objective, next action, ≤3 memory hits, then a read pointer.

## 6. Hooks (Claude Code adapter, advisory)
- Only the `/proof` Stop gate blocks. It blocks when the active run (`STATE_DIR/active.json` for this session) says `claimed_done:true` and no valid, non-stale `result.json` has `status:passed`. It allows `blocked|failed|cancelled` with a reason, honours `stop_hook_active`. It may run bounded, read-only git metadata commands (`git rev-parse`, `git status --porcelain`, `git ls-files`, `git hash-object`) to recompute the §4 digest, with a timeout. It never runs checks or tests, never touches the network, never mutates, and never launches agents or sessions.
- `UserPromptSubmit`: `/compass` emits at most 1 line, `compass: consider /<skill> — <reason>`. Silent below threshold.
- `SessionStart`: `/relay` injects the assigned checkpoint per §5. `/doctor` warns when the index is stale.
- Other harnesses: the same scripts run as manual gates (`node skills/proof/scripts/check.mjs`).

## 7. Packaging
`npx skills add luci-efe/skills` copies each `skills/<name>/` independently, so a skill must not import from `../../lib`. `npm run build:vendor` copies `lib/*` into `skills/<name>/scripts/_lib/` **only for skills whose scripts import `./_lib/`**, and removes stale copies elsewhere. CI fails if the vendored copies drift (`npm run check:vendor`).

## 8. Quality bar for every seat
- RED → GREEN: a failing `node --test` before implementation. `npm test` must be green before claiming done.
- SKILL.md < 150 lines, decision-tree form (If X → do Y / read references/Z.md), with explicit completion criteria. Delete any line an LLM already knows (the No-Op test).
- No invented CLI flags for third-party tools: verify with `--help` and cite it in the reference file.
- Report with a STATUS v1 envelope (see AGENTS.md) to the chair pane w1H:p1.
