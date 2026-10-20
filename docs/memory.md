# Memory

Two layers, kept deliberately separate.

| Layer | Holds | Lives in |
|---|---|---|
| Checkpoint | Task state for one handoff: objective, scope, next actions, workspace fingerprint | `<state>/runs/<run>/<pane>/handoff.json` (`.ramos/` by default; override with `RAMOS_STATE_DIR`) |
| Durable memory | Accepted and rejected decisions worth keeping across sessions | [mnemosyne](https://pypi.org/project/mnemosyne-memory/) |

## How relay uses mnemosyne
- `relay.mjs sync <handoff.json>` stores each `accepted`/`rejected` decision (max 5 per checkpoint) in a mnemosyne **bank** named for the repo (`--repo-id owner/repo`). `proposed` decisions stay in the checkpoint only.
- Recall is keyword-only. Always pass the bank explicitly; the Python API is `remember` / `recall`.
- Set `MNEMOSYNE_DATA_DIR` to isolate storage (tests and installs do).
- If mnemosyne is missing, the checkpoint is still written and the transfer is reported `blocked`.
- Verified command contract: [`skills/relay/references/mnemosyne.md`](../skills/relay/references/mnemosyne.md).

## Entities
There is no entity management layer. Decisions are flat records in a per-repo bank; to inspect or prune them use mnemosyne's own tools. A dashboard is out of scope for now.

## Never stored
Secrets, transcripts and source code.
