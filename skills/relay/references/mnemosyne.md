# mnemosyne: verified contract for /relay

Verified 2026-10-15 against **mnemosyne-memory 3.15.1** (PyPI, MIT, https://github.com/mnemosyne-oss/mnemosyne) on macOS arm64, Python 3.12. Anything not listed here is unverified. Do not use it.

## Install
```sh
uv tool install --python 3.12 mnemosyne-memory   # recommended: isolated
# or: pipx install mnemosyne-memory  |  pip install mnemosyne-memory   (Python >= 3.10)
```
- `mnemosyne-memory[all]` **failed** to install: it builds `llama-cpp-python`. Don't recommend it.
- The base install has no embedding backend. Recall is keyword/FTS (`dense_score: 0.0`), and nothing leaves the machine (`embedding_api_url: ''`, `embeddings_via_api: false` in `config.yaml`). Dense vectors are optional and out of scope for v1.

## Data location
- `MNEMOSYNE_DATA_DIR` (default `~/.hermes/mnemosyne/data`) holds `mnemosyne.db` (SQLite, WAL), `config.yaml`, and `banks/<name>/`.
- Tests **must** set `MNEMOSYNE_DATA_DIR` to a temp directory.

## CLI (human output, used only for doctor and diagnostics)
| Command | Verified behavior |
|---|---|
| `mnemosyne store <content> [source] [importance]` | prints `Stored: <16-hex id>`, exit 0 |
| `mnemosyne recall <query> [top_k]` | **human text only, no JSON flag.** Never parse it. |
| `mnemosyne stats` | human text: totals per tier, banks, DB path |
| `mnemosyne sleep` | `Consolidation complete: {...}` (prints `no_op` when nothing to consolidate), exit 0 |
| `mnemosyne export <file.json>` | JSON `{mnemosyne_export:{version:"1.3",…}, working_memory:[…], …}` |
| `mnemosyne doctor --format json` | read-only JSON health report (`execution.read_only: true`) |
| `mnemosyne bank list\|create <name>` | manage banks |
| CLI bank selection | `MNEMOSYNE_BANK=<name>` env, or `--bank` on `doctor`/`migrate`/`repair` only |

## Python API (the machine interface /relay uses)
Resolve the interpreter from the `mnemosyne` executable's shebang. This works for uv, pipx, and pip installs.
```
remember(content, source='conversation', importance=0.5, metadata=None, scope='session',
         valid_until=None, extract_entities=False, extract=False, bank=None,
         trust_tier=None, veracity='unknown') -> str   # 16-hex id
recall(query, top_k=5, *, from_date=None, to_date=None, source=None, topic=None,
       temporal_weight=0.0, ..., bank=None) -> List[Dict]
       # dict keys include: id, content, source, timestamp, tier, score, importance, valid_until, superseded_by
```

## Verified gotchas, and the rules /relay follows
1. **Always pass `bank=` explicitly.** `MNEMOSYNE_BANK` is honored by the CLI but **ignored by the Python API**.
2. **One process per call.** Within one process, a `recall()` without `bank=` after a banked call returned the banked memory. Across processes, `bank=` isolates correctly (bank-a: 1 hit, bank-b: 0).
3. Bank names must match `[A-Za-z0-9_-]+`, otherwise `ValueError`. A bank is auto-created on first `remember`. /relay uses `ramos-<slug>-<12 hex of sha256(repo_id)>`, so distinct repos never share a bank.
4. Single-character queries returned 0 hits. Queries should be ≥2 meaningful words.
5. `sleep` consolidates only *old* working memories. Running it immediately after `store` returns `no_op`, which is fine.

## What /relay stores (and never stores)
Records: accepted invariants and decisions, rejected approaches with the reason, and episodic outcomes (including failed attempts). Each has `source = "relay:<run_id>:<kind>"` (kind is `decision` or `rejected`) and `metadata = {repo_id, run_id, kind, decision_id, source_ref, source_digest, status}`. Superseding isn't tracked in v1: a changed decision is stored as a new memory, and the checkpoint stays authoritative.
Never: secrets, raw transcripts, source code, generated HANDOFF.md, or ownership/status. Ownership and status live only in `handoff.json` (CONTRACTS §5).
Order: write the checkpoint **first**, then sync memory. The checkpoint digest is the idempotency key, and a sync receipt is written to `…/memory-sync.json`. If mnemosyne fails, the checkpoint stands and the transfer is reported `blocked: mnemosyne unavailable`.
