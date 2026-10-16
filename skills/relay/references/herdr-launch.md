# Launching a fresh receiver in Herdr

Verified against herdr 0.7 on 2026-10-15. Treat every ID Herdr returns as opaque; never construct one.

1. `test "${HERDR_ENV:-}" = 1` must hold. Otherwise ask the human to open the receiver themselves and stop here.
2. Create the pane: `herdr pane split --current --direction right --cwd "$PWD" --no-focus` and read `result.pane.pane_id` from the JSON.
3. Name it `<mission>-<role>-<n>`: `herdr pane rename <pane_id> <name>`.
4. Start the harness with its flags at spawn time: `herdr pane run <pane_id> "<harness> <flags>"` (for example `claude`, `codex -m <model>`, `agy --model <model>`). Never type CLI flags into a running app.
5. Wait until it's idle: `herdr agent wait <pane_id> --status idle --timeout 120000`.
6. Deliver one instruction, then submit: `herdr pane send-text <pane_id> 'Take over via /relay: read <checkpoint>, then ack <offer.json> as <name>.'` followed by `herdr pane send-keys <pane_id> Enter`. Some TUIs (Codex) swallow the first Enter after a paste, so re-read the pane and send `Enter` again if the text is still in the input box.
7. Confirm with `herdr pane read <pane_id> --source recent-unwrapped --lines 40`. Ownership has moved only once `ack.json` exists.

Policy: launching an autonomous agent may need human approval in some harnesses. If the launch is refused, report `blocked` with the exact command for the human to run.
