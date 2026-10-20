# /council: example run

Artifact: a generic problem statement ("ship four dependency bumps as one PR or four, and which gates?"), reviewed by Claude (Herdr pane `p1`) and Codex (pane `p2`). Gemini/agy was recorded missing (out of quota). A separate Claude session chaired and wrote `SYNTHESIS.md`.

```sh
export RAMOS_STATE_DIR=~/project/.ramos       # council takes no --state-dir flag
node $SKILLS/council/scripts/council.mjs init --artifact artifact.md --seats claude,codex,agy
# {"run_id":"c-20261019224755-e7c6","dir":"$RAMOS_STATE_DIR/council/c-20261019224755-e7c6"}
node $SKILLS/council/scripts/council.mjs missing --dir $D --round 1 --seat agy --reason "Gemini/agy out of quota"   # and --round 2
herdr pane send-text <pane> "Please read the file $D/round1.prompt.md and follow it exactly. You are seat claude."
herdr pane send-keys <pane> Enter           # Codex needed a second Enter
node $SKILLS/council/scripts/council.mjs status --dir $D     # poll until each seat file ends with its marker
# round 2 the same way, with lenses (cost/verification; complexity/brittleness), then write $D/SYNTHESIS.md
node $SKILLS/council/scripts/council.mjs status --dir $D
```
Recording the missing seat rewrites the prompts, which now say: `Missing this round (no file will exist, do not wait for them): agy (Gemini/agy out of quota)`. Status after `missing`, before the reviews:
```
"1": {"claude":"incomplete","codex":"incomplete","agy":"missing: Gemini/agy out of quota"}
```
Final status: claude done/done, codex done/done, agy missing/missing, `round_closed {1:true,2:true}`, `synthesis:true`, `problems:[]`, `complete:true`.

## What it caught
- Round 1, independently from both seats: version deltas unknown; "rollback in minutes" conflicts with stateful auth; "slow-burn" regressions have no metric; the undici transitive blast radius.
- Round 2, correcting each other: Claude retracted an unjustified ">=24h canary"; Codex retracted an oversized revocation test matrix. They disagreed usefully on `pnpm why` dedup as proof, semver-based canary triggers, and forward-fix versus rollback.
- Synthesis: four serial PRs with provisional order, one real-path revoke/replay test first, one full e2e on the final SHA, a named canary owner. Four decisions are left for the human, each with a recommended answer.

## Caveats
- Only two model families took part; the Google seat was absent. A council needs at least 2 completed reviews per round or it reports `blocked`.
- Reviews were artifact-only: no seat ran code, so every number in the synthesis is unverified.
- The chair did not write its own round 1 (its pane was the Claude seat), so the "chair is a seat" rule was not exercised.
- Both seats were same-directory sessions with repo context, not isolated.
- Codex quirks, now documented in `skills/council/references/herdr-seats.md`: it garbles text starting "Read /abs/path" (use "Please read the file ..."), and swallows the first Enter. Neither is visible from `agent_status`; re-read the pane. `herdr` `send-keys` wants lowercase `ctrl+u`.
