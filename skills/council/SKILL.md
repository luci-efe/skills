---
name: council
description: Use when a consequential decision or artifact (architecture plan, spec, risky diff, security design) deserves independent review by models from different families, and the user wants the models to debate directly instead of copy-pasting between chats.
---

# /council

Several model families review **one artifact** in bounded rounds, talking through files and Herdr panes, never through the human's clipboard.

Script: `node <this skill dir>/scripts/council.mjs` (`<this skill dir>` = where this SKILL.md is installed). Seat transport: `references/herdr-seats.md`.

## Preflight (hard)
- An artifact file exists: a plan, spec, diff (`git diff > .ramos/council/review.diff`), or a one-page problem statement. No artifact → write the problem statement first, or stop. A council without an artifact doesn't start.
- `herdr` is available and `HERDR_ENV=1`, plus at least 2 harness binaries from different families (`claude`, `codex`, `agy` or `gemini`, `opencode`). Missing → print the install for each and stop.
- The user asked for a council, or `/crucible` flagged an architectural fork. Don't convene one for routine work.

## Decision tree
1. `council.mjs init --artifact <file> --seats claude,codex,agy` → prints `run_id` and the run dir with `round1.prompt.md` and `round2.prompt.md`.
2. Seats: are the panes already running? → reuse them. Otherwise → start them per `references/herdr-seats.md`. You (the chair) are a seat too. Write your round 1 file before reading anyone else's.
3. Send each seat: `Read <dir>/round1.prompt.md and follow it exactly.` (send-text, then Enter, then re-read the pane to confirm it submitted).
4. Poll `council.mjs status --dir <dir>`. Only files ending with the exact completion marker count.
   - A seat is rate-limited, crashed, or silent past a deadline you set → `council.mjs missing --dir <dir> --round 1 --seat <s> --reason "<why>"`. Continue with the others. Never wait forever, and never pretend it answered.
   - Each round needs **at least 2 completed reviews**. If fewer can finish, seat a replacement from another family, or stop and report `blocked`. Recording missing seats alone never completes a council.
5. Round 1 closed → send `round2.prompt.md` (cross-examination). Assign lenses that make seats disagree productively: one attacks complexity and brittleness, one attacks cost and verification, one defends usability.
6. Round 2 closed → the chair writes `<dir>/SYNTHESIS.md`:
   - **Agreed** (all seats, after concessions)
   - **Disagreed** (each position, its strongest evidence, the real trade-off)
   - **Decisions for the human** (≤5, each with a recommended answer)
   - **Decision owner** for each item
7. Present the synthesis to the human. Keep the panes alive for follow-ups. Two rounds is the cap. A third round only for a new, narrower question.

## Rules
- Seats write only their own files. Each seat ends its file with its marker.
- The chair doesn't edit seat files and attributes every claim to a seat.
- Numbers a seat can't back with a measurement are labeled unverified in the synthesis.

## Done when
`council.mjs status` reports `complete: true` (every round closed with at least 2 completed reviews, `SYNTHESIS.md` exists, `problems` is empty), and the human has the decisions list. Otherwise report `blocked` with the `problems` list.
