# Capture provenance

Captured with GitNexus 1.6.4, ast-grep 0.51.0 and ripgrep on macOS.
`flow.py` is the exact synthetic source used for the fresh capture.

Sanitization: repository paths in both status fixtures are replaced with
`/fixture/repo`. The stale fixture's timestamp is redacted and commit IDs replaced
with `1111111` and `2222222`; its stale status message is preserved. These are
sanitized captures, not byte-for-byte copies of the original status output.

## Reproduce the synthetic capture

From the suite root, create an isolated temporary repository and tool HOME:

```sh
fixture_root="$(mktemp -d)"
mkdir "$fixture_root/repo" "$fixture_root/home"
cp test/fixtures/cartographer/flow.py "$fixture_root/repo/flow.py"
git -C "$fixture_root/repo" init
git -C "$fixture_root/repo" config user.name Fixture
git -C "$fixture_root/repo" config user.email fixture@example.invalid
git -C "$fixture_root/repo" add flow.py
git -C "$fixture_root/repo" -c commit.gpgsign=false commit -m fixture
env HOME="$fixture_root/home" gitnexus analyze --skip-agents-md "$fixture_root/repo"
cd "$fixture_root/repo"
env HOME="$fixture_root/home" gitnexus status
env HOME="$fixture_root/home" gitnexus query -l 2 -- 'refund order save'
env HOME="$fixture_root/home" gitnexus context refund_order
```

Indexing can attempt extension downloads; run it only in this disposable repo.
To capture stale status, commit a change to `flow.py` after indexing, then run
`gitnexus status` again with the same isolated HOME. Normalize paths/identifiers
before committing captured output. Dates and commits will differ between runs.

## Fixture contents

- `status-fresh.txt`: sanitized fresh status from the synthetic repository.
- `status-stale.txt`: sanitized stale status; reproduce as described above.
- `query-result.json`: real query response. The FTS extension download returned
  HTTP 404, so this empty, degraded result includes its warning. It is not
  evidence of working FTS; a working extension may produce a nonempty capture.
- `context-result.json`: real `gitnexus context refund_order`; startLine 8 maps
  to source line 9. Both startLine and endLine are zero-based.
- `method-match.jsonl`: real `ast-grep scan --inline-rules <rule> --json=stream -- flow.py`.
  Rule: Python function_definition with name `^save$`, inside class_definition
  with name `^Second$` and `stopBy: end`.
- `rg-match.jsonl`: real `rg --json --max-count 100 --fixed-strings -- save .`.
- `status-unindexed.txt`: inherited response used to parse the unindexed message;
  reproduce with `gitnexus status` in an unindexed disposable git repository.

Tests explicitly construct synthetic GitNexus symbol arrays from captured source
positions for stale, duplicate, failure and dirty-file cases. The N1 regression
also executes real ast-grep against a fresh fixture; it must not be skipped.
