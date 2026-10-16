# Triage report format

`.ramos/red-team/report.md`:

```markdown
# Red-team report: <repo> @ <short sha>
Scan: osv-scanner 2.x `scan source -r` → exit <code>; lockfiles: <paths>

| Advisory | Package@version | Finding | Evidence | Action |
|---|---|---|---|---|
| GHSA-xxxx | pkg@1.2.3 | suspected | src/api/upload.ts:42 calls vulnerable `parse()`; patterns tried: `parse($A)` | bump to 1.2.4 |
| GHSA-yyyy | other@0.9 | not found within stated coverage | rg "other" → only devDependency in build script | none |
```

Findings vocabulary (exact):
- `confirmed`: a test in the repo triggers it on HEAD.
- `suspected`: the vulnerable API is called from reachable code, but there's no reproduction.
- `not affected (version)`: the resolved version is outside the affected range.
- `not found within stated coverage`: no usage found by the listed patterns. Say what wasn't covered (dynamic imports, generated code, other languages).
- `unknown`: a tool error, no lockfile, or unsupported ecosystem.

Verified 2026-10-15 with osv-scanner 2.7.0: JSON has `results[].source.path` and `results[].packages[].package.{name,version,ecosystem}` and `vulnerabilities[].id`. Exit 0 means clean, 1 means vulns found, 128 means no lockfiles.
