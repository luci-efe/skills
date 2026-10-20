# /relay: example run

Hand a PR-versus-issue review from pane `p1` to `p2`. Run in a checkout at `~/project` with `RAMOS_STATE_DIR` and `MNEMOSYNE_DATA_DIR` set; nothing was pushed or commented. The draft is a small JSON file with `task`, `decisions` (one `proposed`, one `rejected`, two `accepted`), `next_actions`, `unknowns` and `evidence` objects `{kind,path,outcome}`; required fields are listed in `skills/relay/SKILL.md`.

```sh
R=$SKILLS/relay/scripts/relay.mjs
node $R checkpoint --from draft.json --run r1 --pane p1 --repo-id owner/repo
node $R sync  $RAMOS_STATE_DIR/runs/r1/p1/checkpoints/1/handoff.json
node $R offer $RAMOS_STATE_DIR/runs/r1/p1/checkpoints/1/handoff.json --to p2
```
```
checkpoint -> {"path":".../checkpoints/1/handoff.json","sha256":"44e774e4...","sequence":1}
sync       -> {"stored":3,"receipt":".../memory-sync.json"}     # accepted + rejected stored; the "proposed" decision is not
sync again -> {"stored":0,...}                                   # idempotent
offer      -> checkpoint 2, offer.json, transfer_id 38e73177-...
```

## The receiver
`offer` assigns the pane, so `inject` already works before `ack`:
```
$ RAMOS_PANE=p2 node $R inject .../checkpoints/2/offer.json
[relay] r1/p1#2 state=active
objective: Review PRs #282-#286 against issues #265-#267 ...
next: p2: Review PR #283 diff vs #266: confirm subagent turn filter and max_turns check
memory: Rejected: Reject treating #285/#286 as follow-ups of #265-#267 ...
memory: PR #284 deliberately skips the .env.example item of #267 ...
```
Then an empty local commit moves HEAD:
```
read              -> STALE: workspace changed since checkpoint, verify before acting
ack --receiver p3 -> relay: transfer is intended for p2, not p3                          # exit 2
ack --receiver p2 -> {"path":".../ack.json","stale":true,"warning":"STALE: workspace changed since checkpoint; ..."}
ack --receiver p2 -> relay: transfer 38e73177-... already acknowledged by p2             # exit 2
inject            -> [relay] r1/p1#2 state=active STALE: workspace changed since checkpoint, verify before acting
```

## Tamper checks (on copies of the state)
```
edit HANDOFF.md      -> read: HANDOFF.md does not match handoff.json digest; trust handoff.json     # exit 2
edit handoff.json    -> ack:  checkpoint digest mismatch: the offered checkpoint changed after the offer
write checkpoint #3  -> ack:  offer 38e7... was superseded by a newer checkpoint in this lane
```

## Memory recall
Recall via the mnemosyne API with the explicit bank (`ramos-<owner>-<repo>-<hash>`): a query for "env.example" returns the accepted `relay:r1:decision`; "follow-ups 285" returns the `relay:r1:rejected` entry; "schema version bump" returns nothing, because that decision was only `proposed` and lives in the checkpoint. A recall without `bank=` returns 0 hits.

## What it caught
STALE on a moved HEAD, wrong-receiver and double-ack refusal, digest mismatch after tampering, supersession, idempotent memory sync, and the accepted/rejected versus proposed split in durable memory.

## Caveats
- `ack` succeeds on a stale workspace and only records `stale:true`; acting on it is the receiver's job.
- `read` checks `HANDOFF.md` against `handoff.json` only. Editing both passes `read`; only `ack`, which compares against the offer's sha256, catches a changed `handoff.json`.
- The two panes were simulated by passing pane ids; no second live session read the checkpoint.
- A bad draft fails with a one-line error and exit 2 (field names are in `SKILL.md` and `docs/CONTRACTS.md`).
