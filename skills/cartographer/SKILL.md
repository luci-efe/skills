---
name: cartographer
description: Use when understanding an unfamiliar domain or flow, onboarding to a repository, or before changing code whose callers, invariants, or blast radius you do not know.
---

# /cartographer

Map **one requested domain or execution flow** to verified symbols, invariants, and tests. Never generate a repo-wide static `DOMAIN_MAP.md`.

Script: `node <this skill dir>/scripts/cartographer.mjs` (`<this skill dir>` = where this `SKILL.md` is installed).

## Preflight (hard)
- `git` is required. Baseline requires `rg` and `ast-grep`; overlays require `ast-grep`. Missing tools return `status: "blocked"`, install commands, and exit 2.
- Never auto-run `gitnexus analyze`, `setup`, `clean`, `remove`, or `publish`. Index refreshes require explicit user approval.
- Bound the request to a single domain or flow (`<flow>` slug, e.g. `auth-session`, `refund-webhook`). If the user asks to "map the whole repo", ask which flow goes first.

## Decision tree

**1. Check index and working-tree freshness**
Run `node <this skill dir>/scripts/cartographer.mjs status` from the repo root.
- `gitnexus: "absent"` or `"unindexed"` → **2C (Stateless baseline branch)**, regardless of dirty files.
- `gitnexus: "fresh"` with a clean tree → **2A (GitNexus branch)**.
- `gitnexus: "stale"`, or a fresh index with dirty files → **2B (Stale-overlay branch)**. The script verifies returned symbols when dirty paths intersect.
- `status: "blocked"` → resolve the reported tool error before continuing; a failed query is never an empty baseline result.

**2A. GitNexus branch (fresh index, clean tree)**
Read `references/gitnexus.md` for verified CLI flags and JSON shapes.
1. Run `node <this skill dir>/scripts/cartographer.mjs query "<concept>" [--limit N]` (limit: default 5 here, 50 for baseline `rg`/`ast` matches; max 100).
2. Inspect returned `processes` and `process_symbols` for step-by-step call order.
3. For key symbols on the path, run `gitnexus context <symbol>` or `gitnexus impact <symbol> --direction upstream --include-tests` to find callers and tests. Raw `context`/`impact` line numbers are zero-based: add 1 to `startLine` and `endLine` before citing them.
4. Go to **3**.

**2B. Stale-overlay branch (`indexed != current` or dirty files)**
`gitnexus query` does **not** warn when its index is behind `HEAD`.
1. Run `node <this skill dir>/scripts/cartographer.mjs query "<concept>"` — the script runs kind-aware `ast-grep` verification in each indexed file, within ±3–20 lines of the normalized indexed line, and stamps `"stale_overlay": true` with `verified_symbols` and `live_line`.
2. Only a unique definition inside the line window is verified; method matches require the indexed class. Comments, strings, calls, ambiguous matches, and missing files never verify. Automatic rules cover Python and JS/TS declaration kinds; unsupported kinds remain unverified.
3. If `verified: false`, locate moved/renamed symbols using **2C**. `definition_found` can be true outside the window without verifying identity. No automatic cross-file move inference is made.
4. Go to **3**.

**2C. Stateless baseline branch (`rg` + `ast-grep`)**
Read `references/baseline.md` for language patterns (`ast-grep` 0.51; binary is `ast-grep`, not deprecated `sg`).
1. Run `node <this skill dir>/scripts/cartographer.mjs query "<entry_symbol_or_term>" --pattern '<ast-pattern>' [--lang <lang>]`.
2. Search is literal by default (`--regex` opts in). `--pattern` explicitly selects the baseline, even with an existing index, and enables structural search; without it only textual matches are returned. `truncated: true` means refine the query before claiming exhaustive coverage.
3. Trace 1–3 hops from entry route/handler → domain service/state mutation → persistence/external sink → existing tests.
4. If dynamic dispatch, reflection, or event buses hide an edge, record it under **Unknowns / not covered** instead of guessing.

**3. Write the bounded flow slice**
Write `.ramos/maps/<flow>.md` (or `$RAMOS_STATE_DIR/maps/<flow>.md`), strictly **≤120 lines**:
- **Header:** Flow name, `HEAD` SHA, index status (`fresh | stale_overlay | baseline`), and timestamp.
- **Entrypoints & Call Chain:** Ordered steps where every symbol claim cites an exact `path:line` verified in the current working tree.
- **State & Invariants:** Data mutations, preconditions, and error states observed in code (`path:line`).
- **Tests:** Existing test files and test cases covering this flow (`path:line`).
- **Unknowns / not covered:** Unresolved dynamic edges, unindexed external services, or untested branches.

## Done when
- `.ramos/maps/<flow>.md` exists, is ≤120 lines, every symbol and invariant cites a verified `path:line` in the live checkout, and an explicit `## Unknowns / not covered` section is present.
