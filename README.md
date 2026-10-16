# luci-efe/skills

**Agentic engineering skills by [Fernando Ramos](https://ferramos.com).** Agents are not chat windows: they should be observable, talk to each other directly, prove they're done, carry context forward, mix models, and act with bounded ownership.

[Español abajo](#español) · Site: [ferramos.com/skills](https://ferramos.com/skills)

## Install
```sh
npx skills@latest add luci-efe/skills                      # all skills, any supported agent
npx skills@latest add luci-efe/skills -s proof -s relay    # pick skills
```
Claude Code plugin:
```sh
claude plugin marketplace add luci-efe/skills
claude plugin install ramos-skills@ramos
```
Then run `/doctor` in your repo. It lists missing tools with the exact install command, and can wire the optional Claude Code hooks.

## The skills
| Stage | Skill | Use when | Rule |
|---|---|---|---|
| Orient | `/doctor` | Setting up, or a skill reports a missing tool | 06 |
| Orient | `/compass` | You aren't sure which skill fits. It routes, and checks tools first | 06 |
| Orient | `/cartographer` | You need one domain or flow mapped to real code | 04 · 01 |
| Decide | `/crucible` | A change is underspecified. It reads code first and asks only the open questions | 06 |
| Decide | `/council` | A big decision deserves review by several model families in Herdr | 02 · 05 |
| Build | `/reproduce` | Something is broken. It turns the bug into a failing test first | 03 · 01 |
| Prove | `/proof` | You're about to say "done". It records checks against the exact code state | 03 |
| Prove | `/red-team` | Dependencies changed or an advisory landed | 03 |
| Continue | `/relay` | A session hands work to another session, agent, or machine | 04 · 02 |

Rules: **01** Observable · **02** Not a clipboard · **03** Evidence of done · **04** Context continues · **05** Many models, many harnesses · **06** Autonomy with ownership.

## How it behaves
- **Fails fast on missing tools.** Each skill branch declares its tools in `skill.json`. A missing tool blocks only that branch and prints the install command. Nothing silently degrades.
- **One hard gate.** With hooks installed, Claude Code can't end a turn that claims "done" unless `/proof` holds a passing, non-stale evidence record (or the work is honestly marked blocked or failed). Every other hook is advisory. In other harnesses the same scripts run as manual checks.
- **State lives in `.ramos/`** (override with `RAMOS_STATE_DIR`). Add it to `.gitignore` unless you want evidence committed.
- **"Done" vs. "verified".** The local gate prevents accidental false completion claims; hand-written evidence can still pass it. CI re-execution plus independent review earns `verified`.

## Tools
| Tool | Needed by | Install (macOS) |
|---|---|---|
| node ≥22, git | all scripts | `brew install node git` |
| ripgrep, ast-grep | cartographer, crucible, red-team | `brew install ripgrep ast-grep` |
| mnemosyne | relay (required) | `uv tool install --python 3.12 mnemosyne-memory` |
| herdr | council, relay launch | `brew install herdr` ([herdr.dev](https://herdr.dev)) |
| osv-scanner | red-team | `brew install osv-scanner` |
| gitnexus | cartographer (optional) | `npm i -g gitnexus`. **License: PolyForm Noncommercial.** Check it before commercial use. |
| playwright, odiff | proof visual-web | per repo: `npm i -D @playwright/test` |
| cua-driver | proof visual-desktop | CuaDriver.app from [cua.ai](https://cua.ai) (macOS) |

## Develop
```sh
npm test                 # node --test
npm run lint:skills      # frontmatter, size, skill.json schema
npm run check:vendor     # shared lib copies match lib/
```
Contracts: [`docs/CONTRACTS.md`](docs/CONTRACTS.md).

---

## Español

**Skills de ingeniería agéntica por [Fernando Ramos](https://ferramos.com).** Los agentes no son ventanas de chat: deben ser observables, hablar entre sí directamente, demostrar que terminaron, conservar el contexto, combinar modelos y actuar con autonomía acotada.

### Instalación
```sh
npx skills@latest add luci-efe/skills
npx skills@latest add luci-efe/skills -s proof -s relay
```
Plugin de Claude Code: `claude plugin marketplace add luci-efe/skills` y luego `claude plugin install ramos-skills@ramos`. Después ejecuta `/doctor` en tu repositorio.

### Cómo se comporta
- **Falla rápido si falta una herramienta.** Muestra el comando exacto de instalación y nunca degrada en silencio.
- **Una sola compuerta obligatoria.** Con los hooks instalados, Claude Code no puede declarar "terminado" sin una evidencia vigente de `/proof`. Los demás hooks solo sugieren.
- **El estado vive en `.ramos/`.**
- **"Terminado" vs. "verificado".** La compuerta local evita declaraciones accidentales de finalización; una evidencia escrita a mano aún puede pasarla. La reejecución en CI y una revisión independiente permiten llamarlo verificado.

Los comandos y nombres de archivo se mantienen en inglés.

## License
MIT © Fernando Ramos
