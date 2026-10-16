# /cartographer

Maps one domain or flow to verified symbols, invariants and tests.

**When:** Use before changing code whose callers or blast radius you do not know.

## Example
```sh
node skills/cartographer/scripts/cartographer.mjs status
node skills/cartographer/scripts/cartographer.mjs query "refund webhook"
```

## Writes
Nothing. Read-only; never runs `gitnexus analyze` for you.

## Notes
Baseline mode is `rg` + `ast-grep`; a fresh GitNexus index upgrades it. AST hits are repo-wide pattern hits, not filtered by the query.

Full procedure: [`skills/cartographer/SKILL.md`](../skills/cartographer/SKILL.md).
