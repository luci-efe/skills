# Worked examples

One real run per skill, trimmed. Each page shows the command, the real output, what it caught, and the caveats. Target repo for most runs: [ultimate-harness](https://github.com/Agentic-Engineering-Agency/ultimate-harness), a public TypeScript/Python project. Paths are generalised: `~/project` is the checkout, `$RAMOS_STATE_DIR` the state directory, `$SKILLS` this repo's `skills/` directory.

Where a first run predated a later fix, the page shows the re-run on the shipped code instead.

| Skill | Example |
|---|---|
| /doctor | [Provider matrix, hook install, malformed settings](doctor.md) |
| /compass | [Routing prompts to skills, blocked on missing tools](compass.md) |
| /cartographer | [Mapping the `mission cancel` flow](cartographer.md) |
| /crucible | [Pressure-testing "add a rule" and finding it already exists](crucible.md) |
| /council | [Two model families review a rollout plan](council.md) |
| /reproduce | [Bisecting a fix, then a regression test that fails first](reproduce.md) |
| /proof | [Pass, stale block, and the perf gate](proof.md) |
| /red-team | [OSV scan with honest triage](red-team.md) |
| /relay | [Handoff with stale, tamper and double-ack detection](relay.md) |
