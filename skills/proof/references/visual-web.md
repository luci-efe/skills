# Web verification

If Playwright is missing → stop this branch and show the catalog recipe; never let `npx` download an undeclared runner during verification. The local binary must work, the selected browser must be installed, and the app must be reachable in the configured test environment.

1. Run the existing Playwright user journey with explicit assertions on the promised outcome. Include keyboard access, the relevant error state, and reload persistence when applicable. A screenshot is not a behavior assertion.
2. Check layout/overflow and accessibility semantics: bounded viewport, expected roles/names, usable focus, occlusion/actionability, page errors, and relevant element bounds. A nonzero bounding box is not proof of usability. Use the installed version's supported accessibility/locator APIs; do not assume a removed AX snapshot API exists.
3. Use existing `toHaveScreenshot` assertions (preferred) or an explicitly selected `odiff` installation against a reviewed baseline. Record browser, viewport, fonts, test data and source identity. Never silently update a baseline to make a check pass.
4. If rendering changed → review cropped before/after evidence plus enough surrounding context to catch displaced content; use a full-frame review when the crop is inconclusive. Reserve CUA interaction for surfaces the browser checks cannot drive.
5. Attach the journey assertion results, trace and relevant screenshots to the proof manifest. Any failed/unknown required outcome blocks completion. Zero pixel delta means unchanged rendering in that capture, not a working feature.

Desktop 1440×900 and mobile 390×844 are useful initial fixtures; use the product's actual support matrix. Verify both EN and ES flows if localized UI is part of the change.

API references: [Playwright assertions](https://playwright.dev/docs/test-assertions), [visual comparisons](https://playwright.dev/docs/test-snapshots), [trace viewer](https://playwright.dev/docs/trace-viewer). CLI presence is catalogued separately from executing this journey.
