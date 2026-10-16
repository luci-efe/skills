# /red-team

Checks known-vulnerability exposure and separates affected, suspected, confirmed and unknown.

**When:** Use after dependency changes, before a release, or on a reported CVE.

## Example
```sh
mkdir -p .ramos/red-team && osv-scanner scan source -r --format json --output-file .ramos/red-team/osv.json .
```

## Writes
`.ramos/red-team/osv.json` and `report.md`.

## Notes
Needs `osv-scanner` ≥2; `rg`/`ast-grep` for triage, `gh` for Dependabot enrichment. Exit 128 means "nothing scannable", never "clean". Local checkouts only.

Full procedure: [`skills/red-team/SKILL.md`](../skills/red-team/SKILL.md).
