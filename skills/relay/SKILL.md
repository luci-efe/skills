---
name: relay
description: Use when a session must hand work to a fresh session, another agent, or another machine — context is past ~60% full, you are stopping mid-task, or a peer is taking over — or when starting work that a previous session handed off.
---

# /relay

A handoff is a transfer of ownership, not a summary. The JSON checkpoint is the source of truth; `HANDOFF.md` is generated from it; lasting decisions go to mnemosyne.

Script: `node <this skill dir>/scripts/relay.mjs` (run with the repo root as cwd; `<this skill dir>` is where this SKILL.md is installed, e.g. `.claude/skills/relay`). State lives under `<state dir>/runs/<run>/<pane>/checkpoints/<n>/`, where the state dir is `.ramos/` unless `RAMOS_STATE_DIR` is set. Set `RAMOS_PANE=<your-pane>` so the SessionStart hook can find your assignment.

## Preflight (hard)
- `mnemosyne` must be on PATH for a **transfer**. If it's missing → still write the checkpoint (steps 2–3 below, so recovery state is never lost), print `uv tool install --python 3.12 mnemosyne-memory`, report `blocked`, and don't offer.
- Never write to another pane's checkpoint directory.

## Decision tree

**Receiving work?** (SessionStart showed a `[relay]` line, or you were told to take over)
1. Run `relay.mjs read <checkpoint>` and read it. (After an offer, `inject` already works: the offer assigns you.)
2. If `read` or `inject` prints `STALE` → compare `git status` / `git log` against the checkpoint's `workspace` before acting. Record what changed.
3. If an `offer.json` names you and no `ack.json` exists → `relay.mjs ack <offer.json> --receiver <your-pane>`. Only after ack may you write.
   `ack` still succeeds on a STALE workspace: it records `stale:true` and prints a STALE warning. Verifying is your job.
4. If ack fails (`already acknowledged`, `intended for`, `digest mismatch`) → stop and report `blocked` with the exact error. Never work around it.

**Handing off?**
1. Stop editing. Commit or note the dirty state; the checkpoint digests it.
2. Write a draft JSON with only: `task{objective,scope,constraints,acceptance_refs}`, `work_state`, `decisions` (≤5, each `accepted|proposed|rejected` with `source_ref`), `next_actions` (≤3, each with owner and expected artifact), `blockers`, `unknowns` (≤3 each), `evidence` (≤6 pointers, never pasted logs). Strings ≤240 chars. Required fields: `decisions[]{id,summary,source_ref,status}`, `next_actions[]{owner,action,artifact}`, `evidence[]` as objects `{kind,path,outcome}` (+ optional `digest`), `task{objective,scope}`. Need more? Put it in a file and point to it.
3. `relay.mjs checkpoint --from draft.json --run <run-id> --pane <your-pane> --repo-id <owner/repo>`.
4. `relay.mjs sync <handoff.json>` → stores accepted/rejected decisions in mnemosyne. If it fails, the checkpoint still stands: report `blocked: mnemosyne unavailable`.
5. Receiver known? → `relay.mjs offer <handoff.json> --to <pane>`. This writes the next checkpoint with `phase: offered`, `offer.json`, and `assigned/<pane>.json` (so the receiver's inject works before ack), keeping the original workspace fingerprint so the receiver sees STALE if the code moved since. `offer` refuses (one-line error) if the receiver already has a live acknowledged assignment, or a pending one from another lane. Then stop writing. Need a fresh pane? → read `references/herdr-launch.md`.

**Checkpointing without transfer?** (long task, protecting against a crash) → steps 2–4 only, `work_state: active`.

## Rules
- Checkpoints are immutable. Correct one by writing the next sequence.
- Never invent memory commands; the verified contract is `references/mnemosyne.md`.
- Never launch a successor from a Stop hook.
- Secrets, transcripts, and source code never go into checkpoints or memory.

## Done when
- `handoff.json` exists and validates, `HANDOFF.md` is beside it, `memory-sync.json` shows the checkpoint digest (or the transfer is reported `blocked`), and — for transfers — `ack.json` is written by the receiver.
