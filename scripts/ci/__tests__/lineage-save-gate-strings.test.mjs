/**
 * check-lineage-save-gate discovers content writers in CODE, past string
 * literals that look like comment openers, and not in comments.
 *
 * Its discovery pass strips comments before matching `UPDATE … SET content =`.
 * It used to do that with /\/\*[\s\S]*?\*\//, which opens at a `/*` inside a
 * string ('/api/advisory/*') and deletes everything up to the next real
 * comment close, so a content write between the two was never seen and a new
 * unguarded prose writer passed the gate. The gate now uses the shared
 * scripts/ci/lib/strip-comments.mjs.
 *
 * The gate's root is process.cwd(), so this runs the real gate against a
 * fixture tree. Every GUARDED path is missing there, so the gate exits 1
 * regardless; the assertions read the per-file discovery verdicts.
 *
 * LINEAGE_SAVE_GATE_UNDER_TEST points this at another copy of the gate (for
 * instance one with the old regex restored) to show these cases fail on it.
 *
 * The fixture SQL and comment delimiters are assembled at runtime so that no
 * gate scanning scripts/ reads this file as a content write or a comment.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GATE = process.env.LINEAGE_SAVE_GATE_UNDER_TEST
  ? path.resolve(process.env.LINEAGE_SAVE_GATE_UNDER_TEST)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'check-lineage-save-gate.mjs');

const OPEN = '/' + '*';
const CLOSE = '*' + '/';
const LINE = '/' + '/';
const UPDATE = 'UPD' + 'ATE';
const write = (table) => `await db.execute(sql\`${UPDATE} ${table} SET content = \${content} WHERE id = \${id}\`);`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const FILES = {
  // A content write AFTER a string holding the comment opener, with a real
  // block comment further down for the old regex to run to.
  'server/routes/advisory-notes.ts': [
    `const ADVISORY_ROUTES = '/api/advisory${OPEN}';`,
    'export async function saveNote(db, sql, id, content) {',
    `  ${write('advisory_notes')}`,
    '}',
    `${OPEN} Advisory routes end here. ${CLOSE}`,
    '',
  ].join('\n'),

  // A content write on the same line as, and after, an https:// string: a
  // naive `//`-to-end-of-line rule would blank it.
  'server/routes/linked-notes.ts': [
    'export async function saveLinked(db, sql, id, content) {',
    `  const DOCS = 'https:${LINE}docs.example.com/notes'; ${write('linked_notes')}`,
    '}',
    '',
  ].join('\n'),

  // Control: the write appears only inside real comments, after the same kind
  // of string. Not a writer.
  'server/routes/retired-notes.ts': [
    `const ADVISORY_ROUTES = '/api/advisory${OPEN}';`,
    `${OPEN} Retired: ${UPDATE} retired_notes SET content = $1 moved behind the lineage gate. ${CLOSE}`,
    `${LINE} ${write('retired_notes')}`,
    'export const retired = true;',
    '',
  ].join('\n'),

  // Control: the write is named only in a trailing line comment after code.
  'server/routes/trailing-note.ts': [
    `export const notesTable = 'trailing_notes'; ${LINE} was: ${UPDATE} trailing_notes SET content = $1`,
    '',
  ].join('\n'),

  'server/services/review-predicate.ts': `await q.query('${UPDATE} csr_section_outputs SET review_status=$1 WHERE id=$2 AND content=$3');`,
  'server/services/return-predicate.ts': `await q.query('${UPDATE} notes SET reviewed=true RETURNING content=$1 AS same');`,
  'server/services/quoted-content.ts': `await q.query(\`${UPDATE} notes SET reason='content = not a write' WHERE id=$1\`);`,
  'server/services/sql-comment.ts': `await q.query(\`${UPDATE} notes SET status=$1 ${OPEN} content = not a write ${CLOSE} WHERE id=$2\`);`,
  'server/services/content-after-keywords.ts': `await q.query(\`${UPDATE} notes SET reason='WHERE and RETURNING', content=$1 WHERE id=$2\`);`,
  'server/services/content-after-dollar-text.ts': `await q.query(\`${UPDATE} notes SET reason=$note$ WHERE content = not a write $note$, content=$1 WHERE id=$2\`);`,
  'server/services/content-after-sql-comment.ts': `await q.query(\`${UPDATE} notes SET reason=$1 ${OPEN} WHERE ${CLOSE}, content=$2 WHERE id=$3\`);`,
  'server/services/quoted-column.ts': `await q.query('${UPDATE} notes SET "content"=$1 WHERE id=$2');`,
};

let cached;
function runFiles(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lineage-save-gate-'));
  try {
    for (const [rel, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), body);
    }
    const r = spawnSync(process.execPath, [GATE], { cwd: root, encoding: 'utf8' });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
function runGate() {
  cached ??= runFiles(FILES);
  return cached;
}

const reported = (out, file) =>
  // nosemgrep: detect-non-literal-regexp -- a test: the file name is a fixture constant and its dots are escaped
  new RegExp(`\\[ci:lineage-save-gate\\] FAIL ${file.replace(/[.]/g, '\\.')}\\n {2}✗ unguarded-writer`).test(out);

test('the gate ran against the fixture tree, not the repository', () => {
  const r = runGate();
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /MISSING FILE server\//);
});

test('a content write after a string holding /* is discovered', () => {
  const r = runGate();
  assert.ok(reported(r.out, 'server/routes/advisory-notes.ts'), r.out);
});

test('a content write after an https:// string on the same line is discovered', () => {
  const r = runGate();
  assert.ok(reported(r.out, 'server/routes/linked-notes.ts'), r.out);
});

test('a content write only inside real comments is not a writer', () => {
  const r = runGate();
  assert.ok(!r.out.includes('FAIL server/routes/retired-notes.ts'), r.out);
});

test('a content write named only in a trailing line comment is not a writer', () => {
  const r = runGate();
  assert.ok(!r.out.includes('FAIL server/routes/trailing-note.ts'), r.out);
});

for (const name of ['review-predicate', 'return-predicate', 'quoted-content', 'sql-comment']) {
  test(`${name} does not mistake a predicate or quoted/comment text for an assignment`, () => {
    assert.ok(!runGate().out.includes(`FAIL server/services/${name}.ts`), runGate().out);
  });
}
for (const name of ['content-after-keywords', 'content-after-dollar-text', 'content-after-sql-comment', 'quoted-column']) {
  test(`${name} still discovers the actual prose assignment`, () => {
    assert.ok(reported(runGate().out, `server/services/${name}.ts`), runGate().out);
  });
}

const CSR = 'server/services/authoring/csr-import-into-document.ts';
const CHARTER = 'server/services/c2c/charter-objectives.ts';
const REVIEW = 'server/services/csr/csr-section-review.ts';
const HELPER = 'server/services/clinical-regulatory-evidence/lineage-gate.ts';
const source = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const csrSource = source(CSR);
const charterSource = source(CHARTER);
const lineageSource = source(HELPER);
function replaceOnce(input, before, after) {
  assert.ok(input.includes(before), `mutation anchor is absent: ${before}`);
  return input.replace(before, after);
}
function csrVerdict(body = csrSource, helper = lineageSource) {
  return runFiles({ [CSR]: body, [HELPER]: helper }).out;
}
const failure = (out, file) => out.includes(`[ci:lineage-save-gate] FAIL ${file}`);

test('the actual CSR review updates review metadata, with content used only as its concurrency predicate', () => {
  const out = runFiles({ [REVIEW]: source(REVIEW) }).out;
  assert.ok(!failure(out, REVIEW), out);
});

test('the actual CSR import keeps the canonical lineage helper on its SERIALIZABLE callback transaction', () => {
  const out = csrVerdict();
  assert.ok(out.includes(`[ci:lineage-save-gate] ok  ${CSR}`), out);
});

const csrMutations = [
  ['missing lineage', text => replaceOnce(text, 'await enforceAuthorLineage(q,', 'await missingLineage(q,')],
  ['lineage on the pool', text => replaceOnce(text, 'await enforceAuthorLineage(q,', 'await enforceAuthorLineage(ctx.pool,')],
  ['content on the pool', text => replaceOnce(text, "await q.query('UPDATE authoring_sections SET content", "await ctx.pool.query('UPDATE authoring_sections SET content")],
  ['shadowed q', text => replaceOnce(text, 'const { doc, materialized } = admitted;', 'const { doc, materialized } = admitted; const q = ctx.pool;')],
  ['reassigned q', text => replaceOnce(text, 'const { doc, materialized } = admitted;', 'const { doc, materialized } = admitted; q = ctx.pool;')],
  ['unawaited lineage', text => replaceOnce(text, 'await enforceAuthorLineage(q,', 'void enforceAuthorLineage(q,')],
  ['unawaited section write', text => replaceOnce(text, 'await writeSection(scope,', 'void writeSection(scope,')],
  ['unawaited transaction work', text => replaceOnce(text, 'const result = await work(client);', 'const result = work(client);')],
  ['wrong callback client', text => replaceOnce(text, 'await work(client)', 'await work(ctx.pool)')],
  ['early commit', text => replaceOnce(text, "const result = await work(client);\n    await client.query('COMMIT');", "await client.query('COMMIT');\n    const result = await work(client);")],
  ['missing rollback', text => replaceOnce(text, "await client.query('ROLLBACK')", "await client.query('SELECT 1')")],
  ['weakened write isolation', text => replaceOnce(text, "inTransaction(ctx, 'SERIALIZABLE',", "inTransaction(ctx, 'REPEATABLE READ',")],
  ['changed BEGIN map', text => replaceOnce(text, "SERIALIZABLE: 'BEGIN ISOLATION LEVEL SERIALIZABLE'", "SERIALIZABLE: 'BEGIN'")],
  ['mutated BEGIN map', text => `${text}\nBEGIN_AT.SERIALIZABLE = 'BEGIN';\n`],
  ['additional prose writer', text => `${text}\nexport async function extra(q, content) { await q.query('${UPDATE} authoring_sections SET content=$1', [content]); }\n`],
];
for (const [name, mutate] of csrMutations) {
  test(`CSR import refuses ${name}`, () => {
    const out = csrVerdict(mutate(csrSource));
    assert.ok(failure(out, CSR), out);
  });
}
test('CSR import still refuses a hollowed shared lineage helper', () => {
  const out = csrVerdict(csrSource, lineageSource.replaceAll('replaceAuthorSpans(', 'missingAuthorSpans('));
  assert.ok(failure(out, CSR), out);
});

test('the reviewed charter objective is its sourced structured project-intent record', () => {
  const out = runFiles({ [CHARTER]: charterSource }).out;
  assert.ok(!failure(out, CHARTER), out);
});
const charterMutations = [
  ['changed serialization', text => replaceOnce(text, 'content: text, version, contentHash, previousVersionHash:', 'content: input.body.objective, version, contentHash, previousVersionHash:')],
  ['missing same-transaction audit', text => replaceOnce(text, 'await tx.insert(charterAuditEvents)', 'await other.insert(charterAuditEvents)')],
  ['missing actor attribution', text => replaceOnce(text, 'actorUserId: input.userId', 'actorUserId: 0')],
  ['missing version chain', text => replaceOnce(text, 'const version = section ? section.version + 1 : 1;', 'const version = 1;')],
  ['additional prose writer', text => `${text}\nexport async function extra(q, content) { await q.query('${UPDATE} authoring_sections SET content=$1', [content]); }\n`],
];
for (const [name, mutate] of charterMutations) {
  test(`charter metadata registration refuses ${name}`, () => {
    const out = runFiles({ [CHARTER]: mutate(charterSource) }).out;
    assert.ok(failure(out, CHARTER), out);
  });
}

// Independent review controls added after the original 37-case RED. Keep the
// actual runtime writer unchanged: these are mutations of its fixture copy.
const csrReviewedMutations = [
  ['an unreachable gate', text => replaceOnce(text, "  if (updated.rows.length !== 1)", "  return;\n  if (updated.rows.length !== 1)")],
  ['a rebound transaction wrapper', text => `${text}\ninTransaction = async (_ctx, _isolation, work) => work(_ctx.pool as never);\n`],
  ['changed content after UPDATE', text => replaceOnce(replaceOnce(text, 'const content = section.stored!;', 'let content = section.stored!;'),
    '  await enforceAuthorLineage(q,', "  content = '';\n  await enforceAuthorLineage(q,")],
  ['changed section id after UPDATE', text => replaceOnce(replaceOnce(text, 'const sectionId = section.sectionId!;', 'let sectionId = section.sectionId!;'),
    '  await enforceAuthorLineage(q,', "  sectionId = 'another-section';\n  await enforceAuthorLineage(q,")],
  ['a foreign lineage tenant', text => replaceOnce(text, 'await enforceAuthorLineage(q, ctx.tenantId,', 'await enforceAuthorLineage(q, 999,')],
  ['a foreign lineage actor', text => replaceOnce(text, '}, content, ctx.actor.id,', '}, content, 999,')],
  ['a foreign UPDATE tenant', text => replaceOnce(text, '[content, sectionId, ctx.tenantId, doc.id]', '[content, sectionId, 999, doc.id]')],
  ['a foreign UPDATE document', text => replaceOnce(text, '[content, sectionId, ctx.tenantId, doc.id]', "[content, sectionId, ctx.tenantId, 'another-document']")],
  ['a changed context between UPDATE and lineage', text => replaceOnce(text, '  await enforceAuthorLineage(q,', '  ctx.tenantId = 999;\n  await enforceAuthorLineage(q,')],
];
for (const [name, mutate] of csrReviewedMutations) {
  test(`CSR import additionally refuses ${name}`, () => {
    const out = csrVerdict(mutate(csrSource));
    assert.ok(failure(out, CSR), out);
  });
}

const csrObjectOverrides = [
  ['target', text => replaceOnce(text, "{ documentTable: 'authoring_sections', documentId: sectionId }",
    "{ documentTable: 'authoring_sections', documentId: sectionId, ...{ documentId: 'another-section' } }")],
  ['filing client', text => replaceOnce(text, 'client: q as never, sectionId, content,',
    'client: q as never, ...{ client: ctx.pool }, sectionId, content,')],
  ['audit executor', text => replaceOnce(text, 'changeReason: input.reason, executor: q, metadata: {',
    'changeReason: input.reason, executor: q, ...{ executor: ctx.pool }, metadata: {')],
];
for (const [name, mutate] of csrObjectOverrides) {
  test(`CSR import refuses an overriding ${name} object shape`, () => {
    const out = csrVerdict(mutate(csrSource));
    assert.ok(failure(out, CSR), out);
  });
}
