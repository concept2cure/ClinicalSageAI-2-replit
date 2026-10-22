import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const gate = 'scripts/ci/check-writerless-stores.mjs';
const recognizer = 'scripts/ci/lib/recorded-register-inserts.mjs';
const helperPath = 'server/services/cmc/register-audit.ts';
const helper = fs.readFileSync(path.join(repo, helperPath), 'utf8');
const schema = "export const recordedRows = pgTable('recorded_rows', {});\n";
const caller = `
import { recordedRows } from '../../../shared/schema';
import { insertRegisterRow } from './register-audit';
export async function createRow() {
  const row = await insertRegisterRow(1, { userId: 2 }, 'fixture', recordedRows, {});
  return row;
}
`;

function replace(source, before, after) {
  assert.ok(source.includes(before), `mutation anchor missing: ${before}`);
  return source.replace(before, after);
}

function run({ helperSource = helper, callerSource = caller, extra = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'writerless-recorded-insert-'));
  const files = {
    [gate]: fs.readFileSync(path.join(repo, gate), 'utf8'),
    [helperPath]: helperSource,
    'shared/schema.ts': schema,
    'server/services/cmc/register-writes.ts': callerSource,
    'server/reader.ts': "import { recordedRows } from '../shared/schema'; db.select().from(recordedRows);\n",
    'scripts/ci/writerless-stores-baseline.json': '{"stores":{}}',
    ...extra,
  };
  if (fs.existsSync(path.join(repo, recognizer))) files[recognizer] = fs.readFileSync(path.join(repo, recognizer), 'utf8');
  try {
    for (const [name, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      fs.writeFileSync(path.join(root, name), content);
    }
    fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
    const require = createRequire(import.meta.url);
    fs.symlinkSync(path.dirname(require.resolve('typescript/package.json')), path.join(root, 'node_modules/typescript'), 'dir');
    return spawnSync(process.execPath, [path.join(root, gate)], { encoding: 'utf8' });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function expectStatus(result, expected) {
  assert.equal(result.status, expected, `${result.stdout}\n${result.stderr}`);
  if (expected === 1) assert.match(result.stderr, /recordedRows is READ/);
}

test('the real transaction helper and an awaited schema-backed call create a row', () => {
  expectStatus(run(), 0);
});

test('an imported helper alias still identifies the canonical writer', () => {
  expectStatus(run({ callerSource: caller.replace("{ insertRegisterRow }", '{ insertRegisterRow as recordedInsert }')
    .replace('await insertRegisterRow(', 'await recordedInsert(') }), 0);
});

test('an actual registered Express create callback counts as a caller', () => {
  expectStatus(run({ callerSource: '', extra: { 'server/api/cmc/routes.ts': `
import express from 'express';
import { recordedRows } from '../../../shared/schema';
import { insertRegisterRow } from '../../services/cmc/register-audit';
const router = express.Router();
router.post('/fixture', async (req, res) => {
  try {
    const row = await insertRegisterRow(1, { userId: 2 }, 'fixture', recordedRows, {});
    res.json(row);
  } catch (error) { res.status(500).json({ error: String(error) }); }
});
` } }), 0);
});

const negative = [
  ['a no-op canonical helper', { helperSource: 'export async function insertRegisterRow(org, actor, register, table, values) { return values; }' }],
  ['a same-named helper from another module', { callerSource: caller.replace("from './register-audit'", "from './not-the-writer'") }],
  ['an import without any call', { callerSource: caller.replace('const row = await insertRegisterRow(1, { userId: 2 }, \'fixture\', recordedRows, {});', 'const row = {};') }],
  ['a mapping that is never passed to the helper', { callerSource: "import { recordedRows } from '../../../shared/schema'; const mapping = { recordedRows: 'insertRegisterRow' };" }],
  ['a table handle from a module without its pgTable definition', { callerSource: caller.replace("from '../../../shared/schema'", "from '../../../shared/not-the-schema'") }],
  ['a local object with the same name as a real schema table', { callerSource: caller.replace("import { recordedRows } from '../../../shared/schema';", 'const recordedRows = {};') }],
  ['a shadowed helper import', { callerSource: caller.replace('function createRow()', 'function createRow(insertRegisterRow)') }],
  ['a shadowed schema table', { callerSource: caller.replace('function createRow()', 'function createRow(recordedRows)') }],
  ['a detached helper call', { callerSource: caller.replace('await insertRegisterRow(', 'insertRegisterRow(') }],
  ['a helper call hidden inside an uncalled nested function', { callerSource: caller.replace('const row = await insertRegisterRow(1, { userId: 2 }, \'fixture\', recordedRows, {});', "async function neverCalled() { return await insertRegisterRow(1, { userId: 2 }, 'fixture', recordedRows, {}); } const row = {};") }],
  ['a helper call guarded by false', { callerSource: caller.replace('const row = await insertRegisterRow(1, { userId: 2 }, \'fixture\', recordedRows, {});', "let row; if (false) { row = await insertRegisterRow(1, { userId: 2 }, 'fixture', recordedRows, {}); }") }],
  ['an unreachable helper call after a return', { callerSource: caller.replace('const row = await insertRegisterRow(', 'return {}; const row = await insertRegisterRow(') }],
  ['an update-only generic helper', { helperSource: replace(helper, 'tx.insert(table)', 'tx.update(table)') }],
  ['an insert into the wrong generic argument', { helperSource: replace(helper, 'tx.insert(table)', 'tx.insert(values)') }],
  ['a detached insert inside the helper', { helperSource: replace(helper, '(await tx.insert(table).values(values as never).returning())', '(tx.insert(table).values(values as never).returning())') }],
  ['an insert nested inside an uncalled transaction function', { helperSource: replace(helper, "const [row] = (await tx.insert(table).values(values as never).returning()) as Array<T['$inferSelect']>;", "async function neverCalled() { await tx.insert(table).values(values as never).returning(); } const row = {};") }],
  ['a transaction on an untrusted db import', { helperSource: replace(helper, "import { db } from '../../db';", "import { db } from '../../not-the-db';") }],
];

for (const [name, options] of negative) {
  test(`${name} leaves the table writerless`, () => expectStatus(run(options), 1));
}

test('a literal UPDATE remains an update-only finding', () => {
  const result = run({ callerSource: "db.update(recordedRows).set({ status: 'new' });" });
  expectStatus(result, 1);
});

test('the existing literal INSERT path still counts without a generic helper', () => {
  expectStatus(run({ helperSource: '', callerSource: 'await db.insert(recordedRows).values({});' }), 0);
});
