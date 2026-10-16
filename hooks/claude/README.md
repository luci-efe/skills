# Claude hook adapter

Schema source: [Claude Code hooks reference](https://code.claude.com/docs/en/hooks), inspected 2026-10-15. Hooks read JSON stdin; successful handlers write one JSON object and exit 0. `UserPromptSubmit` and `SessionStart` inject `hookSpecificOutput: {hookEventName, additionalContext}`. Only Stop emits top-level `decision:"block"` with `reason`; allow by omitting decision. No transcript keyword scanning.

Install through the installed doctor's `scripts/doctor.mjs --install-hooks claude --dry-run`, then without dry-run. Unrelated settings and hook groups are preserved. The registered command points to the doctor's vendored `hook-adapter.mjs`, so selective skill installs do not depend on the suite checkout. Reinstall after relocating that directory. Root wrappers here support repository development.

`STATE_DIR/active.json` contains `{"sessions":{"<session_id>":{"run_id":"<id>","claimed_done":true}}}`. A legacy single record carrying matching `session_id` is also read. Never borrow another session's active run. Proof's runner registers its supplied session and marks completion only after all checks pass.

Stop honors `stop_hook_active` first. Otherwise, a claimed-done run requires valid current `status:passed` evidence; terminal blocked/failed/cancelled results with a nonempty reason may stop without claiming success. Missing/malformed evidence blocks an active completion claim. Stop reads state and hashes source inputs, but executes no checks, network operations or launches. Git commands used by the digest are read-only metadata operations.

SessionStart calls the installed relay script's `inject` entrypoint with `RAMOS_SESSION_ID`; no relay means no-op. The adapter bounds injection bytes again. Provider readiness and code-index freshness belong to doctor/cartographer; they never cause a SessionStart block. The prompt nudge is advisory and has no model call.

Hooks are not a security sandbox. Local evidence can reach done; CI independently re-executes the checks. Codex and Antigravity use manual proof scripts until their own event adapters are tested. Windows shell quoting is handled at installation, but tool `.cmd` wrappers are not executed through an implicit shell fallback.

Installed hooks also discover sibling skills in the installed skill collection, including plugin caches. Doctor records that collection path in each hook command; the adapter can infer it for older registrations.
