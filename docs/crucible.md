# /crucible

Pressure-tests an underspecified change: read the code first, ask only what it cannot answer.

**When:** Use before building anything touching data shape, security boundaries, public interfaces or many files.

## Example
```sh
/crucible add rate limiting to the export endpoint
```

## Writes
`.ramos/decisions/<topic>.md` with facts (`path:line`), the ladder outcome, and the five axes.

## Notes
No scripts; pure procedure. Needs `rg`.

Full procedure: [`skills/crucible/SKILL.md`](../skills/crucible/SKILL.md).
