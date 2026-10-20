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
Baseline mode is `rg` + `ast-grep`; a fresh GitNexus index upgrades it. `--limit` caps rg and AST matches (default 50, max 100; `truncated` reports overflow). AST hits are scoped to files the query's rg search hit, or the whole repo (`ast_scope:"repo"`) when `--pattern` is given and rg found nothing. A malformed `--pattern` returns `status:"blocked"`; success returns `status:"ok"`.

Example run: [`examples/cartographer.md`](../examples/cartographer.md)

Full procedure: [`skills/cartographer/SKILL.md`](../skills/cartographer/SKILL.md).
