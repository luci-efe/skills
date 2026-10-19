# Baseline Structural Navigation (`rg` + `ast-grep` 0.51)

When `gitnexus` is absent or unindexed, `/cartographer` maps flows directly from the working tree using `rg` (ripgrep) and `ast-grep` (`0.51`).

> **Binary Name:** Always invoke `ast-grep` (not `sg`, which is deprecated and collides with the Linux `sg` setgroups binary).
> **Install:** `brew install ripgrep ast-grep` (macOS) or `npm i -g @ast-grep/cli`.

## 1. Core `ast-grep` CLI Invocation
```sh
ast-grep run -p '<pattern>' -l <lang> --json=compact [path...]
```
- `-p, --pattern <PATTERN>` — AST pattern where `$META` matches a single AST node and `$$$` matches zero or more nodes (arguments, statements, parameters).
- `-l, --lang <LANG>` — Language (`ts`, `tsx`, `js`, `py`, `go`, `rs`).
- `--json` — Emit structured JSON array of matches with `file`, `text`, and `range.start.line` (0-indexed in `ast-grep` JSON; add `1` for 1-indexed `path:line` citations).

## 2. Structural Patterns by Language

### TypeScript / JavaScript (`-l ts` or `-l tsx`)
- **Function / method definitions:**
  - `ast-grep run -p 'export function $NAME($$$) { $$$ }' -l ts`
  - `ast-grep run -p 'export async function $NAME($$$) { $$$ }' -l ts`
  - `ast-grep run -p 'const $NAME = ($$$) => $_' -l ts`
- **Call sites of a target symbol (`targetFn`):**
  - `ast-grep run -p 'targetFn($$$)' -l ts`
  - `ast-grep run -p '$OBJ.targetFn($$$)' -l ts`
- **Imports of a module or symbol:**
  - `ast-grep run -p 'import { $$$ } from "$MOD"' -l ts`

### Python (`-l py`)
- **Function / method definitions:**
  - `ast-grep run -p 'def $NAME($$$): $$$' -l py`
  - `ast-grep run -p 'async def $NAME($$$): $$$' -l py`
- **Class definitions:**
  - `ast-grep run -p 'class $NAME($$$): $$$' -l py`
- **Call sites of a target symbol (`refund_order`):**
  - `ast-grep run -p 'refund_order($$$)' -l py`
  - `ast-grep run -p '$OBJ.refund_order($$$)' -l py`

### Go (`-l go`)
- **Functions and receiver methods:**
  - `ast-grep run -p 'func $NAME($$$) $$$ { $$$ }' -l go`
  - `ast-grep run -p 'func ($RECV $TYPE) $NAME($$$) $$$ { $$$ }' -l go`
- **Call sites:**
  - `ast-grep run -p '$F($$$)' -l go`

## 3. Combining `rg -n` and `ast-grep`
1. **Locate entrypoints and exact line numbers (1-indexed):**
   `rg -n -F --no-heading -- "<symbol_or_route>"`
2. **Verify AST call edges (eliminating comments and string literals):**
   `ast-grep run -p '<symbol>($$$)' --json`
3. **Locate covering tests:**
   `rg -n "<symbol>" test/ tests/ src/ __tests__/ 2>/dev/null`

## 4. `cartographer.mjs query` baseline behaviour
- `--limit N` caps `rg_matches` and `ast_matches` each (max 100); `truncated:true` whenever more matches existed than returned.
- `ast_matches` only search files the query's `rg` search hit (`ast_scope:"rg_files"`); no rg hits means no AST results. Use `ast-grep run` directly for repo-wide structural search.
- A malformed `--pattern` makes `ast-grep` exit 0 with a stderr warning ("Pattern contains an ERROR node", verified on 0.51); the script reports it in `errors` and returns `status:"blocked"` (exit 2).
- Successful baseline output has `status:"ok"`.
