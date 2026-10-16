#!/usr/bin/env node
// /council run bookkeeping: an artifact under review, bounded rounds, per-seat files with completion markers.
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const MAX_ROUNDS = 2
const stateDirOf = (o) => o.stateDir ?? join(o.cwd ?? process.cwd(), process.env.RAMOS_STATE_DIR ?? '.ramos')
const marker = (run, seat, round) => `<!-- council:done run=${run} seat=${seat} round=${round} -->`

const prompt = (run, round, artifact, seats) => {
  const lens = round === 1
    ? 'Review the artifact independently. Do not read other seats\' files. Report defects with file/line or section evidence, risks, and a recommendation.'
    : 'Read every other seat\'s round 1 file. Attack positions with cited evidence, concede explicitly where they are right, and list questions only the human can answer.'
  return `# Council ${run.run_id}, round ${round}

Artifact under review: \`${artifact}\`
Seats: ${seats.join(', ')}

${lens}

Write only your own file:
${seats.map((s) => `- ${s}: \`${run.outputs[round][s]}\``).join('\n')}

End your file with this exact line (substitute your seat):
${marker(run.run_id, '<seat>', round)}
`
}

export const init = (o) => {
  const artifact = resolve(o.cwd ?? process.cwd(), o.artifact ?? '')
  if (!o.artifact || !existsSync(artifact)) throw new Error('council needs an existing artifact under review (plan, spec, diff, or problem statement file)')
  const seats = [...new Set(o.seats ?? [])]
  if (seats.length < 2) throw new Error('council needs at least 2 seats from different model families')
  const run_id = o.runId ?? `c-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomUUID().slice(0, 4)}`
  const dir = join(stateDirOf(o), 'council', run_id)
  mkdirSync(dir, { recursive: true })
  const outputs = {}
  for (let r = 1; r <= MAX_ROUNDS; r++) outputs[r] = Object.fromEntries(seats.map((s) => [s, join(dir, `round${r}.${s}.md`)]))
  const run = { schema_version: 1, run_id, artifact, seats, max_rounds: MAX_ROUNDS, outputs, missing: {}, created_at: new Date().toISOString() }
  writeFileSync(join(dir, 'council.json'), `${JSON.stringify(run, null, 2)}\n`)
  for (let r = 1; r <= MAX_ROUNDS; r++) writeFileSync(join(dir, `round${r}.prompt.md`), prompt(run, r, artifact, seats))
  return { run_id, dir }
}

export const markMissing = ({ dir, round, seat, reason }) => {
  const p = join(dir, 'council.json')
  const run = JSON.parse(readFileSync(p, 'utf8'))
  run.missing[`${round}:${seat}`] = reason
  writeFileSync(p, `${JSON.stringify(run, null, 2)}\n`)
}

export const status = ({ dir }) => {
  const run = JSON.parse(readFileSync(join(dir, 'council.json'), 'utf8'))
  const rounds = {}
  const round_closed = {}
  for (const [r, bySeat] of Object.entries(run.outputs)) {
    rounds[r] = {}
    for (const [seat, path] of Object.entries(bySeat)) {
      const miss = run.missing[`${r}:${seat}`]
      rounds[r][seat] = miss ? `missing: ${miss}`
        : existsSync(path) && readFileSync(path, 'utf8').includes(marker(run.run_id, seat, r)) ? 'done' : 'incomplete'
    }
    round_closed[r] = Object.values(rounds[r]).every((v) => v !== 'incomplete')
  }
  const synthesis = join(dir, 'SYNTHESIS.md')
  return { run_id: run.run_id, rounds, round_closed, synthesis: existsSync(synthesis), complete: Object.values(round_closed).every(Boolean) && existsSync(synthesis) }
}

const main = (argv) => {
  const [cmd, ...rest] = argv
  const flag = (n) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : undefined }
  if (cmd === 'init') console.log(JSON.stringify(init({ artifact: flag('artifact'), seats: (flag('seats') ?? '').split(',').filter(Boolean) })))
  else if (cmd === 'status') console.log(JSON.stringify(status({ dir: flag('dir') }), null, 2))
  else if (cmd === 'missing') { markMissing({ dir: flag('dir'), round: flag('round'), seat: flag('seat'), reason: flag('reason') }); console.log('recorded') }
  else { console.log('council.mjs init --artifact <file> --seats a,b[,c] | status --dir <run> | missing --dir <run> --round <n> --seat <s> --reason <text>'); process.exitCode = cmd ? 2 : 0 }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) { try { main(process.argv.slice(2)) } catch (e) { console.error(`council: ${e.message}`); process.exitCode = 2 } }
