---
name: doctor
description: Use when installing this suite, checking missing tools, repairing discovery, or configuring the Claude hook adapter.
---
# Doctor

- If inspecting readiness → run this skill's `scripts/doctor.mjs` with Node from the target project cwd. Use an absolute script path when installed elsewhere.
- If only one branch matters → pass its provider IDs as positional arguments; do not require every integration for unrelated work.
- If automation needs the matrix → pass `--json`; any missing/failed probe yields exit 2.
- If a provider is missing → display its known platform install recipe; if no verified recipe exists, say so and consult `references/providers.md`. Do not guess a similarly named package.
- If a binary is available → separately verify the branch's auth, service, browser or desktop readiness before work. `--help` does not establish those capabilities.
- If explicitly wiring Claude hooks → run `node scripts/doctor.mjs --install-hooks claude --dry-run`, inspect the settings merge, then run without `--dry-run` under the user's existing authorization.
- If settings are malformed → report the error; preserve the file rather than overwriting it.
- If using Codex or Antigravity → use manual scripts; do not label Claude hooks active there.
- If an index is stale → refresh discovery through compass. Code index freshness remains the selected cartographer provider's responsibility.

Hook installation preserves unrelated settings and registers SessionStart, UserPromptSubmit and Stop once at the resolved installed runtime path. Only Stop blocks claimed proof completion. Moving/removing the installed doctor directory requires reinstallation of these hook commands.
Read `references/providers.md` for observed versions, recipes, unsupported platforms and probe limits.

Done: the selected provider matrix is reported, missing prerequisites have actionable diagnostics, and requested hook changes have been read back. Never claim every provider is operational from a binary probe.
