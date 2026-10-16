---
name: compass
description: Use when choosing the next engineering skill, discovering installed workflows, or checking prerequisites before a branch.
---
# Compass

- If the user names a skill → select that skill; do not replace their intent with a keyword match.
- If no skill is named → run `node scripts/compass.mjs route "<task>"` from this skill's directory, with the project as the command's working directory (use the script's absolute path).
- If installation is broken → doctor; if behavior fails → reproduce; if a domain/flow is unknown → cartographer.
- If requirements have unresolved forks → crucible; if an artifact needs independent review → council.
- If evidence is needed → proof; if security exposure is suspected → red-team; if a session must continue → relay.
- If no route fits → continue ordinary work. Do not invent a mandatory pipeline.
- If multiple routes match → inspect at most three metadata candidates, select one, and load only its body. Duplicate names need an explicit installed path.
- If a branch is selected → probe its declared dependencies before reading its entrypoint; pass the branch ID as the final route argument.
- If a prerequisite fails → show the exact known install command or explicitly say no verified recipe is available. Block that branch; never auto-install or silently switch providers.
- If a third-party skill has no sidecar → report `undeclared`, then read its own preflight; do not claim dependency readiness.
- If the receipt is ready → read its entrypoint, follow one reference at a time, and check artifact preconditions before advancing.
- If traversal revisits a skill or exceeds three transitions → return control to the task owner; do not loop.

`node scripts/compass.mjs index` refreshes installed metadata. Configured roots include project/user Claude and Agents roots, user Codex, and paths in `RAMOS_SKILL_ROOTS` separated by the platform path delimiter.
`node scripts/compass.mjs nudge "<prompt>"` emits at most one advisory line; it never probes or calls a model.

Done: a receipt identifies one selected skill/branch, reason, entrypoint, fresh prerequisite results and expected artifact schema, or explicitly records no match/ambiguity/blocker. Routing alone is not task completion.
