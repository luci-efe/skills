# Seating council members in Herdr

Verified 2026-10-15 with herdr 0.7, Codex CLI 0.153, Antigravity `agy` 1.3, Claude Code 2.1.

## Layout (chair on the left, two seats stacked on the right)
```sh
herdr pane split --current --direction right --cwd "$PWD" --no-focus          # → result.pane.pane_id = P1
herdr pane split --pane <P1> --direction down --cwd "$PWD" --no-focus          # → P2
herdr pane rename <P1> <mission>-codex-1 ; herdr pane rename <P2> <mission>-gemini-1
```
IDs come from the JSON output. Never construct them.

## Starting a seat (flags at spawn time)
| Family | Command | Notes |
|---|---|---|
| OpenAI | `codex -m <model>` | List models with `codex debug models`. The models available depend on how you're signed in; some API models aren't offered to ChatGPT-login accounts. |
| Google | `agy --model gemini-4-argon-high` | `agy models` lists the IDs. `gemini -m <model>` is the alternative CLI. |
| Anthropic | `claude --model <model>` | |
| Other | `opencode` | |

`herdr pane run <pane> "<command>"`. Some environments require human approval to launch autonomous agents. If the launch is refused, give the human the exact `! herdr pane run …` line and wait.

## Talking to seats
```sh
herdr pane send-text <pane> 'Please read the file <dir>/round1.prompt.md and follow it exactly. You are seat codex.'
herdr pane send-keys <pane> Enter
herdr pane read <pane> --source recent-unwrapped --lines 20   # confirm it submitted
```
Codex garbles text that starts with "Read /abs/path" (leading words dropped); "Please read the file <abs path> ..." works. Codex's TUI often swallows the first Enter after pasted text. If the text is still in its input box, send `Enter` again. While Codex is busy, new text shows `tab to queue`, so send `Tab` to queue it.
Seat files aren't authenticated: any pane could write another seat's file. The council assumes cooperative seats, so the chair checks attribution when synthesizing.
To clear a seat's input line, `send-keys <pane> ctrl+u` (lowercase; `C-u`/`Ctrl-U` are rejected; one press clears one line, so repeat per line). Council scripts take no `--state-dir`; set `RAMOS_STATE_DIR`.
Check status with `herdr pane get <pane>` → `agent_status` (`idle|working|blocked|done`; Codex reports `done` after finishing). Use `idle` or `done` plus the marker in the seat file as the completion signal, never idle alone.
