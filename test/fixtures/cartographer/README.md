# Capture provenance

Captured on 2026-10-16 with GitNexus 1.6.4, ast-grep 0.51.0 and ripgrep on macOS.
Only `/private/tmp/carto-capture-n7to4dvu/repo` was indexed, with isolated
`HOME=/private/tmp/carto-capture-n7to4dvu/home`. `flow.py` is its exact source.

- `status-fresh.txt`: real `gitnexus status` after
  `gitnexus analyze --force --skip-agents-md /private/tmp/carto-capture-n7to4dvu/repo`.
- `query-result.json`: real `gitnexus query -l 2 -- 'refund order save'`.
  The FTS extension download returned HTTP 404; this empty, degraded result is
  retained verbatim, including its warning. It is not evidence of working FTS.
- `context-result.json`: real `gitnexus context refund_order`; startLine 8 maps
  to source line 9. Both startLine and endLine are zero-based.
- `method-match.jsonl`: real `ast-grep scan --inline-rules <rule> --json=stream -- flow.py`.
  Rule: Python function_definition with name `^save$`, inside class_definition
  with name `^Second$` and `stopBy: end`.
- `rg-match.jsonl`: real `rg --json --max-count 100 --fixed-strings -- save .`.
- `status-stale.txt`: inherited real capture, documented by independent review
  at commit be8aadd (indexed ce7ce15, current 1bc2d72).
- `status-unindexed.txt`: inherited status response; provenance not independently
  established, used only to test parsing the documented unindexed message.

Tests explicitly construct synthetic GitNexus symbol arrays from the captured
source positions to exercise stale, duplicate, failure, and dirty-file cases.
No synthetic query is labeled as real CLI output.
