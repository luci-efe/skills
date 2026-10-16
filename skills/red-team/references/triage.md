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

Verified 2026-10-15 with osv-scanner 2.7.0: JSON has `results[].source.path` and `results[].packages[].package.{name,version,ecosystem}` and `vulnerabilities[].id`. Exit 0 means clean, 1 means vulns found, 128 means no scannable package sources (also seen with a lockfile that has zero packages).

## Large scans (dozens of advisories) and coverage notes
- Roll up by package first: one row per `package@version` listing its advisory ids, then triage reachability once per package. List scanned lockfiles with `jq -r '.results[].source.path' osv.json | sort -u`; list advisories with `jq -r '.results[].packages[]|.package as $p|.vulnerabilities[]|"\($p.name)@\($p.version) \(.id)"' osv.json | sort -u`.
- Direct vs transitive: `pnpm why <pkg>` / `npm explain <pkg>` / `bun pm why <pkg>` before searching for usage; a transitive-only package has no import to grep.
- Scanning a throwaway clone: write `osv.json` outside the repo (`--output-file /tmp/...`).
- Record in the report's coverage section anything not checked: GitHub Dependabot/code-scanning/secret-scanning disabled or unreadable, shallow clone history, non-dependency issues (secrets, workflows, authz), which this skill does not cover.
