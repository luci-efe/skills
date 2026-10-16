# Desktop verification with cua-driver

Verified schema source: installed `cua-driver 0.28.2`, `cua-driver --help`, `cua-driver describe get_window_state`, and `cua-driver describe verify_state`, inspected 2026-10-15. The describe calls needed access to macOS pasteboard services outside the sandbox; no app actions were performed. Re-read describe output if the installed version changes.

- If prerequisites are missing → stop with the provider diagnostic. `cua-driver permissions status --json` is the help-documented read-only permission check; an absent daemon may return unknown. Do not assume `--help` establishes capture permission.
- Discover the target PID/window through the driver's supported inventory; do not guess IDs. Assign a short public session label such as `ramos-proof-login` and repeat `session` on every supported call. This is a label, not a permission grant.
- Before an element-indexed action → call `get_window_state` for that exact `pid` and `window_id`. Read structured elements and screenshot together; indices are replaced by the next snapshot. Do not reuse another pane's snapshot.
- Perform only the authorized user journey, then call `get_window_state` again with the same session/PID/window. A before/after capture alone is insufficient.
- Call `verify_state` with one to eight explicit predicates; require satisfied outcomes. Unknown/unsatisfied is not success. `stable_samples` is 1–5 (default 2); `timeout_ms` is 0–10000 (default 5000). Screenshot output is uninterpreted evidence for the caller to inspect.

Observed tool argument shapes (send via the installed driver's supported tool transport):
```json
{"session":"ramos-proof-login","pid":123,"window_id":456,"max_elements":200,"max_depth":12,"include_screenshot":true}
```
```json
{"session":"ramos-proof-login","pid":123,"window_id":456,"expect":[{"element":{"selector":{"role":"AXTextField","label_contains":"Email"},"value_equals":"fixture@example.com"}}],"stable_samples":2,"timeout_ms":5000,"include_screenshot":true}
```
Replace fixture IDs/selectors with observed values. Element `exists:false` is rejected by this version; absence cannot be inferred from an incomplete accessibility walk. Do not manufacture a negative predicate.

Save the observed session/window identity, before/after state, predicate output, screenshots and the user-journey outcome under the proof run's artifacts. A checked input value is not proof that Save persisted it: verify the promised downstream state separately. Report unavailable permissions, invalidated windows or unknown predicates as blockers with a reason.
