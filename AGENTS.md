# Contributing as (or with) an agent

Read `docs/CONTRACTS.md` before changing code. It defines the layout, `skill.json`, the evidence and handoff formats, hooks, and packaging.

## Rules
- Each skill is self-contained: `skills/<name>/{SKILL.md,skill.json,references/,scripts/}`. Never import from outside the skill directory at runtime. Shared code lives in `lib/` and is vendored with `npm run build:vendor`.
- `SKILL.md` frontmatter has exactly `name` and `description` (trigger-first, "Use when…"). The body is a decision tree under 150 lines. Cut any line a model already knows.
- Third-party CLI facts (flags, output, exit codes) must be verified with the real tool and cited in a reference file. Never invent a flag.
- Write a failing test first, then make it pass. Before calling work done, run:
  ```sh
  npm test && npm run check:vendor && npm run lint:skills && npm run test:e2e
  ```
- One writer per branch or worktree. Review someone else's change by reproducing its checks, not by trusting the description.
- Never commit `.ramos/` state, secrets, or transcripts.
