# /compass

Routes a task to the right skill and probes its prerequisites.

**When:** Use when unsure which skill applies. Optional: it never forces a pipeline.

## Example
```sh
node skills/compass/scripts/compass.mjs route "check dependencies for CVE"
node skills/compass/scripts/compass.mjs index
node skills/compass/scripts/compass.mjs nudge "<prompt>"   # one advisory line or nothing
```

## Writes
Session registry and the discovery index in the state dir.

## Notes
Routing is keyword-based; name the skill (`/red-team`) to skip it. Third-party skills with extra frontmatter keys are indexed fine.

Full procedure: [`skills/compass/SKILL.md`](../skills/compass/SKILL.md).
