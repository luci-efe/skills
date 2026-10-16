---
name: red-team
description: Use when checking whether a repository is exposed to known vulnerabilities — after dependency or lockfile changes, before a release, when an advisory or CVE is reported, or when asked to prove or disprove an exploit locally.
---

# /red-team

Separate four findings that are easy to conflate: **affected version**, **suspected path**, **confirmed exploit**, **unknown**. A tool name is not proof of unreachability.

## Preflight (hard)
- `osv-scanner` ≥2 on PATH, else stop and print `brew install osv-scanner` or `go install github.com/google/osv-scanner/v2/cmd/osv-scanner@latest`.
- Exploit reproduction only against a local checkout or a test environment you own. Never against production, third-party hosts, or real credentials. If the target is unclear → ask.

Scope: known-vulnerable dependencies only. Secrets, workflow, and authz review are separate work; say so in the report. For large scans see the rollup notes in `references/triage.md`.

## Decision tree

**1. Scan** (always first)
`mkdir -p .ramos/red-team && osv-scanner scan source -r --format json --output-file .ramos/red-team/osv.json .` (use `$RAMOS_STATE_DIR/red-team` if set; exit `127` means the scanner itself failed, e.g. missing output dir, not "clean")
- Exit `0` → no known vulns in the lockfiles found. Report `not found within stated coverage` and name the lockfiles scanned. Done.
- Exit `1` → vulns found. Go to 2.
- Exit `128` → no scannable package sources (no lockfiles, or lockfiles with zero packages). Report `unknown: no scannable package sources` and list the files the scanner says it found. Don't claim the repo is clean.
- Other exits → tool error. That's `unknown`, never a clean bill.
Offline: add `--offline-vulnerabilities --download-offline-databases`. Go/Rust call analysis: `--call-analysis=go|rust` (Rust runs build scripts, so ask first).

**2. Triage each advisory** (read `references/triage.md` for the table format)
- Is the vulnerable version actually resolved in the lockfile? No → `not affected (version)`.
- Find usage: `rg -n "<package>"` and `ast-grep run -p '<import or call pattern>' -l <lang>` for the vulnerable API named in the advisory.
  - No import/call found → `not found within stated coverage`, with the patterns you tried. Dynamic loading, plugins, and reflection mean this is not proof.
  - Call found from reachable code → `suspected`. Go to 3 if the advisory has a reproducible trigger, else recommend the upgrade.
- `gh` available and the repo is on GitHub? You may enrich with `gh api /repos/<owner>/<repo>/dependabot/alerts` (read-only).

**3. Reproduce (local, authorized)**
1. Write a failing test that triggers the vulnerable behavior through *your* code path, in the repo's existing test framework. No standalone exploit scripts.
2. It fails (the exploit works) on HEAD → `confirmed`. Fix by upgrading or patching, then re-run. The test must now pass.
3. You can't trigger it → stay `suspected` and record what blocked you.

**4. Fix**
Prefer the minimal version bump from `osv-scanner fix -M <manifest> -L <lockfile>` (non-interactive). `fix` can bump past pinned versions (pass `--upgrade-config` to limit it) and may leave advisories behind: always re-run step 1 and the repo's tests, and trust the rescan, not the fix summary. Hand the result to `/proof`.

## Done when
`.ramos/red-team/report.md` lists every advisory as `confirmed | suspected | not affected (version) | not found within stated coverage | unknown` with evidence (lockfile, pattern, test path), and the final scan exit code is recorded.
