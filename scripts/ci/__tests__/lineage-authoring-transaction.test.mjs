/** Real authoring sources must prove their delegated transaction and lineage. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OWNER = 'server/services/authoring/authoring-documents.ts';
const SEED = 'server/services/authoring/authoring-section-seed.ts';
const LIFECYCLE = 'server/services/authoring/authoring-create-outcome.ts';
const LINEAGE = 'server/services/clinical-regulatory-evidence/lineage-gate.ts';
const GATE = process.env.LINEAGE_SAVE_GATE_UNDER_TEST || path.join(ROOT, 'scripts/ci/check-lineage-save-gate.mjs');
const ACTUAL = new Map([OWNER, SEED, LIFECYCLE, LINEAGE].map(file => [file, fs.readFileSync(path.join(ROOT, file), 'utf8')]));

function runGuard(change) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lineage-authoring-owner-'));
  try {
    for (const [name, actual] of ACTUAL) {
      let body = actual;
      if (change?.file === name) {
        assert.ok(body.includes(change.from), `actual source fixture changed: ${change.from}`);
        body = change.all ? body.replaceAll(change.from, change.to) : body.replace(change.from, change.to);
      }
      fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      fs.writeFileSync(path.join(root, name), body);
    }
    const result = spawnSync(process.execPath, [GATE], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 1, 'Other guarded files are deliberately absent; inspect this exact owner verdict.');
    return `${result.stdout}${result.stderr}`;
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('the guard accepts actual delegated authoring transactions without removing the owner', () => {
  const output = runGuard();
  assert.ok(output.includes(`[ci:lineage-save-gate] ok  ${OWNER}`), output);
  assert.ok(!output.includes(`[ci:lineage-save-gate] FAIL ${OWNER}`), output);
});

const MUTATIONS = [
  ['missing section BEGIN', OWNER, "await client.query('BEGIN');", "await client.query('SELECT 1');"],
  ['missing serializable document BEGIN', OWNER, "'BEGIN ISOLATION LEVEL SERIALIZABLE' : 'BEGIN'", "'SELECT 1' : 'BEGIN'"],
  ['missing COMMIT', OWNER, "await client.query('COMMIT');", "await client.query('SELECT 1');"],
  ['missing COMMIT-attempt fence', OWNER, 'transaction.commitAttempted = true;', 'transaction.commitAttempted = false;'],
  ['unawaited document seed', OWNER, 'await insertSectionSeedTx(ctx, client, spec.docId,', 'insertSectionSeedTx(ctx, client, spec.docId,'],
  ['different document seed client', OWNER, 'await insertSectionSeedTx(ctx, client, spec.docId,', 'await insertSectionSeedTx(ctx, otherClient, spec.docId,'],
  ['different section seed client', OWNER, 'await insertSectionSeedTx(ctx, client, String(doc_id),', 'await insertSectionSeedTx(ctx, otherClient, String(doc_id),'],
  ['unawaited section seed', OWNER, 'await insertSectionSeedTx(ctx, client, String(doc_id),', 'insertSectionSeedTx(ctx, client, String(doc_id),'],
  ['missing section lineage request', OWNER, 'lineage: { machineDraft: null },', 'lineage: null,'],
  ['different failure settlement client', OWNER, 'settleAuthoringTransactionFailure(client, transaction, caught,', 'settleAuthoringTransactionFailure(otherClient, transaction, caught,'],
  ['missing document failure await', OWNER, 'return await rejectAuthoringCreateTransaction(client,', 'return rejectAuthoringCreateTransaction(client,'],
  ['missing uncertain-client discard', OWNER, 'client.release(transaction.discardConnection)', 'client.release()'],
  ['conditional skipped release', OWNER, 'client.release(transaction.discardConnection)', 'if (false) client.release(transaction.discardConnection)'],
  ['discarded settled section error', OWNER, 'const err = await settleAuthoringTransactionFailure(client, transaction, caught, new AuthoringSectionWriteOutcomeError(\'section-create\', recovery));', 'await settleAuthoringTransactionFailure(client, transaction, caught, new AuthoringSectionWriteOutcomeError(\'section-create\', recovery)); const err = caught;'],
  ['missing typed section recovery', OWNER, "new AuthoringSectionWriteOutcomeError('section-create', recovery)", 'caught'],
  ['disabled typed section recovery throw', OWNER, 'if (err instanceof AuthoringSectionWriteOutcomeError) throw err;', 'if (false) throw err;'],
  ['missing duplicate rollback', OWNER, 'await rollbackAuthoringTransaction(client, transaction);', 'void transaction;'],
  ['rebound transaction state', OWNER, 'await insertSectionSeedTx(ctx, client, spec.docId,', 'transaction = otherState; await insertSectionSeedTx(ctx, client, spec.docId,'],
  ['noncanonical seed import', OWNER, "from './authoring-section-seed'", "from './alternate-section-seed'"],
  ['missing seed lineage', SEED, 'await enforceAuthorLineage(client,', 'await skippedLineage(client,'],
  ['different seed lineage client', SEED, 'await enforceAuthorLineage(client,', 'await enforceAuthorLineage(otherClient,'],
  ['unawaited seed lineage', SEED, 'await enforceAuthorLineage(client,', 'enforceAuthorLineage(client,'],
  ['lineage checks empty text', SEED, 'ref, seed.content, ctx.actor.id,', "ref, '', ctx.actor.id,"],
  ['disabled seed lineage branch', SEED, 'if (seed.lineage)', 'if (false)'],
  ['detached seed transaction', SEED, 'if (seed.lineage)', "await client.query('COMMIT'); if (seed.lineage)"],
  ['rebound seed client', SEED, 'if (seed.lineage)', 'client = otherClient; if (seed.lineage)'],
  ['different content-write client', SEED, 'const result = await client.query(', 'const result = await otherClient.query('],
  ['missing actual helper ROLLBACK', LIFECYCLE, "client.query('ROLLBACK')", "client.query('SELECT 1')"],
  ['different rollback state', LIFECYCLE, 'await rollbackAuthoringTransaction(client, state)', 'await rollbackAuthoringTransaction(client, otherState)'],
  ['missing settlement rollback await', LIFECYCLE, 'await rollbackAuthoringTransaction(client, state)', 'rollbackAuthoringTransaction(client, state)'],
  ['missing unknown-COMMIT discard', LIFECYCLE, 'state.discardConnection = unconfirmed;', 'void unconfirmed;'],
  ['comparison instead of unknown-COMMIT discard', LIFECYCLE, 'state.discardConnection = unconfirmed;', 'state.discardConnection === unconfirmed;'],
  ['missing typed document recovery', LIFECYCLE, "new AuthoringCreateOutcomeError('unconfirmed', recovery)", 'error'],
  ['disabled rollback-failure discard', LIFECYCLE, "state.discardConnection = new Error('Authoring transaction rollback failed');", "if (false) state.discardConnection = new Error('Authoring transaction rollback failed');"],
  ['rollback after attempted COMMIT', LIFECYCLE, 'return unconfirmed;', 'await rollbackAuthoringTransaction(client, state); return unconfirmed;'],
  ['hollowed canonical author-span gate', LINEAGE, 'await replaceAuthorSpans(', 'await skippedAuthorSpans(', true],
  ['hollowed canonical coverage assertion', LINEAGE, 'await assertLineageCoversContent(', 'await skippedCoverage(', true],
];

for (const [name, file, from, to, all] of MUTATIONS) {
  test(`the real guard refuses ${name}`, () => {
    const output = runGuard({ file, from, to, all });
    assert.ok(output.includes(`[ci:lineage-save-gate] FAIL ${OWNER}`), output);
  });
}
