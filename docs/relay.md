# /relay

Hands work to a fresh session or another agent as an immutable checkpoint plus durable decisions.

**When:** Use when context is ~60% full, you stop mid-task, or a peer takes over.

## Example
```sh
node skills/relay/scripts/relay.mjs checkpoint --from draft.json --run r1 --pane p1 --repo-id owner/repo
node skills/relay/scripts/relay.mjs sync handoff.json
node skills/relay/scripts/relay.mjs offer handoff.json --to p2
```

## Writes
`<state>/runs/<run>/<pane>/`: `handoff.json`, generated `HANDOFF.md`, `memory-sync.json`, `offer.json`/`ack.json`. Decisions go to mnemosyne (see [memory.md](memory.md)).

## Notes
Checkpoints are immutable; correct by writing the next sequence. No secrets, transcripts or source in checkpoints.

Example run: [`examples/relay.md`](../examples/relay.md)

Full procedure: [`skills/relay/SKILL.md`](../skills/relay/SKILL.md).
