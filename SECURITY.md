# Security policy

## Reporting a vulnerability
Please report it privately through GitHub: [Report a vulnerability](https://github.com/luci-efe/skills/security/advisories/new). Do not open a public issue for security problems. You can also email fernando@agenticengineering.agency.

Include the skill, the version or commit, and the steps to reproduce. You will get a first reply within 7 days.

## Scope
The skills here run scripts with your agent's permissions (see `scripts/` and `hooks/` in each skill). Reports about unsafe shell execution, path traversal, state-directory (`.ramos/`) tampering, or secrets leaking into saved evidence are in scope. Behavior of third-party tools the skills call (ripgrep, ast-grep, osv-scanner, mnemosyne, herdr, playwright) is out of scope; report it upstream.

## Supported versions
Only the latest commit on `main`.
