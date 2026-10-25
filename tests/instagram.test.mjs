// Run: node --test tests/instagram.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// This Node build cannot strip types, so transpile the two dependency-free modules with the project's TypeScript.
const ts = createRequire(import.meta.url)('typescript')
const out = mkdtempSync(join(tmpdir(), 'ig-test-'))
async function load(name) {
  const src = readFileSync(new URL(`../lib/instagram/${name}.ts`, import.meta.url), 'utf8')
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  const file = join(out, `${name}.mjs`)
  writeFileSync(file, js)
  return import(pathToFileURL(file).href)
}
const { resolveColumns, rowToItem, canPublish, publishItem, validateCaption, validateRowNumber, missingPublishColumns } = await load('core')
const { createSessionToken, verifySessionToken, verifyPassword } = await load('session')

const headers = ['Product Name', 'Description', 'Image URL', 'Caption', 'Caption Date', 'Publish Status', 'Published At', 'Publish Error']
const cols = resolveColumns(headers)
const readyRow = ['RO 8L', 'desc', 'https://cdn.example.com/a.jpg', 'Fresh water', '2026-10-26', '', '', '']
const cfg = { webhookConfigured: true, missingColumns: [] }

function deps(row, overrides = {}) {
  const state = { item: rowToItem(row, cols, 2), calls: [], webhook: 0 }
  return {
    state,
    deps: {
      getItem: async () => state.item,
      setStatus: async (_n, patch) => { state.calls.push(patch.status); state.item = { ...state.item, status: patch.status } },
      callWebhook: async () => { state.webhook++; return { success: true, postId: '1' } },
      config: cfg, inFlight: new Set(), ...overrides,
    },
  }
}

test('columns resolve by header name; missing publish columns are reported', () => {
  assert.equal(cols.caption, 3)
  assert.deepEqual(missingPublishColumns(cols), [])
  assert.ok(missingPublishColumns(resolveColumns(['Name', 'Caption'])).includes('status'))
})
test('status derives: empty caption -> pending, caption -> caption_ready, unknown value ignored', () => {
  assert.equal(rowToItem(['x', '', '', '', '', '', '', ''], cols, 2).status, 'pending')
  assert.equal(rowToItem(readyRow, cols, 2).status, 'caption_ready')
  assert.equal(rowToItem(['x', '', '', 'c', '', 'garbage', '', ''], cols, 2).status, 'caption_ready')
})
test('publishing requires explicit confirm === true (manual only)', async () => {
  for (const c of [undefined, false, 'true', 1]) {
    const { deps: d, state } = deps(readyRow)
    const r = await publishItem(2, c, d)
    assert.equal(r.httpStatus, 400); assert.equal(state.webhook, 0)
  }
})
test('confirmed publish sets publishing then published, calls webhook once', async () => {
  const { deps: d, state } = deps(readyRow)
  const r = await publishItem(2, true, d)
  assert.equal(r.ok, true); assert.deepEqual(state.calls, ['publishing', 'published']); assert.equal(state.webhook, 1)
})
test('duplicate publish is blocked (already published, publishing, or in-flight)', async () => {
  for (const status of ['published', 'publishing']) {
    const { deps: d, state } = deps([...readyRow.slice(0, 5), status, '', ''])
    const r = await publishItem(2, true, d)
    assert.equal(r.httpStatus, 409); assert.equal(state.webhook, 0)
  }
  const { deps: d, state } = deps(readyRow)
  d.inFlight.add(2)
  assert.equal((await publishItem(2, true, d)).httpStatus, 409); assert.equal(state.webhook, 0)
})
test('two concurrent publishes call the webhook only once', async () => {
  const { deps: d, state } = deps(readyRow, { callWebhook: async () => { state_wait(); await new Promise(r => setTimeout(r, 20)); return { success: true } } })
  let n = 0; function state_wait() { n++ }
  const [a, b] = await Promise.all([publishItem(2, true, d), publishItem(2, true, d)])
  assert.equal(n, 1); assert.deepEqual([a.httpStatus, b.httpStatus].sort(), [200, 409]); void state
})
test('webhook failure or throw marks failed and allows retry', async () => {
  const f = deps(readyRow, { callWebhook: async () => ({ success: false, error: 'boom' }) })
  assert.equal((await publishItem(2, true, f.deps)).status, 'failed')
  assert.equal(canPublish(f.state.item, cfg).ok, true)
  const t = deps(readyRow, { callWebhook: async () => { throw new Error('net') } })
  assert.equal((await publishItem(2, true, t.deps)).status, 'failed')
})
test('publishing disabled when webhook or sheet columns are missing, or image is not public https', () => {
  const item = rowToItem(readyRow, cols, 2)
  assert.equal(canPublish(item, { webhookConfigured: false, missingColumns: [] }).ok, false)
  assert.equal(canPublish(item, { webhookConfigured: true, missingColumns: ['status'] }).ok, false)
  assert.equal(canPublish({ ...item, image: 'http://localhost/a.jpg' }, cfg).ok, false)
  assert.equal(canPublish({ ...item, image: '' }, cfg).ok, false)
})
test('input validation', () => {
  assert.equal(validateCaption('  hi ').caption, 'hi')
  assert.equal(validateCaption('').ok, false); assert.equal(validateCaption(5).ok, false); assert.equal(validateCaption('x'.repeat(2201)).ok, false)
  assert.equal(validateRowNumber(1), null); assert.equal(validateRowNumber('2'), null); assert.equal(validateRowNumber(2.5), null); assert.equal(validateRowNumber(5), 5)
})
test('sessions: valid, tampered, expired, wrong secret, unconfigured all fail closed', () => {
  const secret = 'a'.repeat(32); const now = 1_000_000_000_000
  const tok = createSessionToken(secret, now)
  assert.equal(verifySessionToken(secret, tok, now + 1000), true)
  assert.equal(verifySessionToken(secret, tok, now + 9 * 3600 * 1000), false)
  assert.equal(verifySessionToken('b'.repeat(32), tok, now), false)
  assert.equal(verifySessionToken(secret, tok.slice(0, -2) + 'xx', now), false)
  assert.equal(verifySessionToken(secret, undefined, now), false)
  assert.equal(verifySessionToken(undefined, tok, now), false)
  assert.equal(verifySessionToken('short', createSessionToken('short', now), now), false)
})
test('password check fails closed when unconfigured or short', () => {
  assert.equal(verifyPassword(undefined, 'x'), false)
  assert.equal(verifyPassword('short', 'short'), false)
  assert.equal(verifyPassword('correct-horse-battery', 'wrong'), false)
  assert.equal(verifyPassword('correct-horse-battery', 'correct-horse-battery'), true)
})
