# Provider evidence and installation

The catalog is `scripts/_lib/providers.json` in each installed skill. `verified: true`
means the recipe was checked against the linked publisher/package-manager documentation,
and both the installed CLI's `--help` and configured probe were observed on macOS on
2026-10-15. It does **not** mean installation was executed, authentication works,
browsers are downloaded, an index is fresh, or a desktop daemon has permission.

`probe(ids, {cwd, timeoutMs, maxOutput, catalog})` performs a fresh subprocess check
with literal argv, `shell:false`, closed stdin, a 5-second timeout and a combined
16-KiB stdout/stderr limit. Timeout and overflow fail closed and kill the child.
Results contain `id`, `ok`, `version`, `missing_install`, and optional `diagnostic`.
Help-only checks deliberately return `version:null`. Install commands are displayed,
never executed. `installCommand(id, platform)` returns `null` when no recipe is known.

## Observed checks

All rows marked observed were run using both `<bin> --help` and the listed probe;
all returned exit 0. Versions below are observations, not compatibility constraints.

| Provider | Probe argv | Observation | Recipe evidence |
| --- | --- | --- | --- |
| git | `git --version` | 2.50.1 Apple Git-155 | [macOS](https://git-scm.com/install/mac), [Debian/Ubuntu](https://git-scm.com/install/linux) |
| node | `node --version` | 26.0.0 | [Homebrew](https://formulae.brew.sh/formula/node) |
| jq | `jq --version` | 1.7.1-apple | [Publisher downloads](https://jqlang.org/download/) |
| rg | `rg --version` | 15.1.0 | [Publisher installation](https://github.com/BurntSushi/ripgrep#installation) |
| ast-grep | `ast-grep --version` | ast-grep 0.51.0 | [Quick start](https://ast-grep.github.io/guide/quick-start.html) |
| gitnexus | `gitnexus --version` | 1.6.4 | [Publisher README](https://github.com/abhigyanpatwari/GitNexus) |
| herdr | `herdr --version` | 0.7.1 | [Publisher installation](https://github.com/herdrdev/herdr#install) |
| claude | `claude --version` | 2.1.263 | [Setup](https://code.claude.com/docs/en/setup) |
| codex | `codex --version` | 0.153.4 | [Publisher README](https://github.com/openai/codex) |
| agy | `agy --help` | help observed; chair reports 3.15.1; no advertised version flag; recipe unverified | No confirmed public installer; ask the tool owner |
| gemini | `gemini --version` | 0.42.0 | [Publisher README](https://github.com/google-gemini/gemini-cli) |
| opencode | `opencode --version` | 1.16.2 | [Install](https://opencode.ai/docs/) |
| mnemosyne | `mnemosyne --help` | help observed; chair reports 3.15.1; no advertised version flag; recipe unverified | No confirmed installer for this local memory CLI; do not substitute similarly named packages |
| osv-scanner | `osv-scanner --version` | 2.7.0 | [Installation](https://google.github.io/osv-scanner/installation/) |
| semgrep | `semgrep --version` | not installed; flag unverified | [Homebrew recipe](https://formulae.brew.sh/formula/semgrep) |
| gh | `gh --version` | 2.92.0 | [GitHub CLI installation](https://cli.github.com/) |
| playwright | `node_modules/.bin/playwright --version` | local binary absent; flag unverified | [Project initialization](https://playwright.dev/docs/intro) |
| odiff | `odiff --help` | not installed; flag unverified locally | [Publisher README](https://github.com/dmtrKovalenko/odiff); global npm recipe unverified |
| cua-driver | `cua-driver --help` | help identifies 0.28.2; recipe unverified | Installed help only; ask the tool owner for the canonical installer |

## Selection boundaries

- Linux `git`/`jq` install strings target Debian/Ubuntu; use the linked publisher's
  instructions for other distributions. Homebrew recipes require Homebrew first.
- Invoke `ast-grep` directly: the installed `sg` alias is deprecated and can also
  collide with Linux setgroups. The probe additionally checks the output identity.
- Playwright resolves the local binary against the selected project `cwd`; it never
  invokes `npx` or fetches a package. Its installer initializes project files and is
  a suggestion requiring the user's normal installation decision.
- Windows `.cmd` wrappers and Unix-only scripts may fail under `shell:false`.
  That is a blocked probe, not proof that the tool is absent. Use a native executable
  or a separately validated argv adapter; this catalog does not invoke a shell fallback.
- Mnemosyne help verifies the executable only. Memory content and database statistics
  are not queried. No invented installation command, memory store, or repair runs.
- Cua-driver help verifies the executable only. For actual desktop readiness, the
  installed help documents `cua-driver permissions status` as a read-only probe,
  with `unknown` if the daemon is not running. This extra command was not executed.
