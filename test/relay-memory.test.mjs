import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { available, bankName, remember, recall } from '../skills/relay/scripts/memory.mjs'

const env = { ...process.env, MNEMOSYNE_DATA_DIR: mkdtempSync(join(tmpdir(), 'mnemo-')) }

test('bankName sanitizes repo ids into a valid mnemosyne bank', () => {
  assert.equal(bankName('luci-efe/skills'), 'ramos-luci-efe-skills')
  assert.equal(bankName('a b/../c'), 'ramos-a-b-c')
  assert.match(bankName('x'.repeat(200)), /^ramos-[A-Za-z0-9_-]{1,64}$/)
})

test('available reports install command when mnemosyne is missing', () => {
  const r = available({ env: { ...env, PATH: '/nonexistent' } })
  assert.equal(r.ok, false)
  assert.match(r.install, /uv tool install .*mnemosyne-memory/)
})

test('remember then recall round-trips within one bank and isolates others', { skip: !available({ env }).ok && 'mnemosyne not installed' }, () => {
  const id = remember({ bank: 'ramos-test-a', content: 'Invariant: ownership transfers only after receiver acknowledgement', source: 'relay:r1:invariant', importance: 0.9, metadata: { run_id: 'r1' } }, { env })
  assert.match(id, /^[0-9a-f]{16}$/)
  const hits = recall({ bank: 'ramos-test-a', query: 'receiver acknowledgement', top_k: 3 }, { env })
  assert.equal(hits[0].content, 'Invariant: ownership transfers only after receiver acknowledgement')
  assert.equal(hits[0].source, 'relay:r1:invariant')
  assert.equal(recall({ bank: 'ramos-test-b', query: 'receiver acknowledgement', top_k: 3 }, { env }).length, 0)
})

test('recall rejects a missing bank instead of silently using the default', () => {
  assert.throws(() => recall({ query: 'anything here' }, { env }), /bank is required/)
})

test('RAMOS_MNEMOSYNE_PYTHON overrides discovery and is validated', { skip: !available({ env }).ok && 'mnemosyne not installed' }, () => {
  const py = available({ env }).python
  assert.equal(available({ env: { ...env, RAMOS_MNEMOSYNE_PYTHON: py } }).python, py)
  assert.equal(available({ env: { ...env, RAMOS_MNEMOSYNE_PYTHON: '/nonexistent/python' } }).ok, false)
})

test('the not-found error mentions the interpreter override', () => {
  assert.throws(() => recall({ bank: 'ramos-x', query: 'two words' }, { env: { ...env, PATH: '/nonexistent' } }), /RAMOS_MNEMOSYNE_PYTHON/)
})
