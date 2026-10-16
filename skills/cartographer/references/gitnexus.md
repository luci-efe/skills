# GitNexus Reference (Verified v1.6.4)

Verified against `/opt/homebrew/bin/gitnexus` (`1.6.4`, darwin/arm64, LadybugDB + ONNX local embeddings).

## 1. Operational Constraints & License Warning
- **License (`PolyForm-Noncommercial-1.0.0`):** GitNexus `1.6.4` is licensed under `PolyForm-Noncommercial-1.0.0`. Check the license before using GitNexus in commercial repositories or organizations.
- **Install Weight & Telemetry (~1.0 GB):** `npm install -g gitnexus` installs ~1.0 GB (`onnxruntime-node`, `@huggingface/transformers`, `@ladybugdb/core`, 12 `tree-sitter-*` grammars) and includes `@scarf/scarf` install telemetry plus an opt-in `publish` command.
- **Read-Only Policy:** `/cartographer` never runs `gitnexus analyze`, `setup`, `clean`, `remove`, or `publish` automatically. If an index is missing or stale, use the `cartographer.mjs` live overlay (`rg` + `ast-grep`) or ask the user before running `gitnexus analyze` manually.
- **Silent Staleness Hazard:** When `HEAD` advances past the indexed commit (`gitnexus status` prints `Status: ⚠️ stale (re-run gitnexus analyze)`), `gitnexus query`, `context`, and `impact` **still return cached JSON with zero staleness warning**. Always run `cartographer.mjs status` or `cartographer.mjs query` so stale symbols are re-verified against live files.

## 2. Verified Read-Only CLI Commands (`gitnexus --help`)

### `gitnexus status`
Checks the index status of the current git repository (takes no `-r` flag; run with repo root as `cwd`):
```text
Repository: /path/to/repo
Indexed: 10/1/2026, 7:13:41 PM
Indexed commit: ce7ce15
Current commit: 1bc2d72
Status: ⚠️ stale (re-run gitnexus analyze)
```
When up to date, prints `Status: ✅ up-to-date`. When unindexed, prints `Repository not indexed.`.

### `gitnexus list`
Lists all registered repositories in `~/.gitnexus/` with `Path`, `Indexed`, `Commit`, `Stats` (`files`, `symbols`, `edges`), `Clusters`, and `Processes`.

### `gitnexus query [options] <search_query>`
Searches the knowledge graph for execution flows (`processes`) and symbol definitions. Outputs JSON to `stdout` (fd 1):
- `-r, --repo <name>` — Target repository name (optional if inside the repo or only one repo is indexed).
- `-c, --context <text>` — Task context to improve ranking.
- `-g, --goal <text>` — What you want to find.
- `-l, --limit <n>` — Max processes to return (default: `5`).
- `--content` — Include full symbol source code.

**Verified JSON output shape:**
```json
{
  "processes": [
    { "id": "proc_34_revert_action_log_fr", "name": "revert_action_log_from_missions", "step_count": 2 }
  ],
  "process_symbols": [
    {
      "id": "Function:app/green_iteso/campaigns/services.py:revert_action_log_from_missions",
      "name": "revert_action_log_from_missions",
      "filePath": "app/green_iteso/campaigns/services.py",
      "startLine": 327,
      "endLine": 340,
      "module": "Tests",
      "process_id": "proc_34_revert_action_log_fr",
      "step_index": 1
    }
  ],
  "definitions": [
    {
      "id": "Function:app/green_iteso/actions/selectors.py:list_active_actions",
      "name": "list_active_actions",
      "filePath": "app/green_iteso/actions/selectors.py",
      "startLine": 14,
      "endLine": 16,
      "module": "Actions"
    }
  ],
  "timing": { "vector": 18.4, "bm25": 157.6, "merge": 0.1, "symbol_lookup": 427.5, "ranking": 0.1, "formatting": 0.1, "wall": 585.8 }
}
```

### `gitnexus context [options] [name]`
360-degree view of a code symbol (incoming callers, outgoing callees, participating processes):
- `-r, --repo <name>` — Target repository.
- `-u, --uid <uid>` — Direct symbol UID (`Function:path:name`) for zero-ambiguity lookup.
- `-f, --file <path>` — File path to disambiguate common names.
- `--content` — Include full symbol source code.

### `gitnexus impact [options] <target>`
Blast-radius analysis showing what breaks if a symbol changes:
- `-d, --direction <dir>` — `upstream` (dependants, default) or `downstream` (dependencies).
- `-r, --repo <name>` — Target repository.
- `--depth <n>` — Max relationship depth (default: `3`).
- `--include-tests` — Include test files in results.

## 3. User-Approved Index Refresh
Only when the user explicitly approves building or refreshing a local index:
```sh
gitnexus analyze
```
