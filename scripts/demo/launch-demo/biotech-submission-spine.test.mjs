/**
 * The biotech pack finds its program's submission by the program's own id, never by a product name shared with
 * another program (2026-11-09: on a database where other projects named their product "C2C-101", the fallback
 * picked submission #29, anchored to another program, and placing the IB leaf answered 409 CROSS_PROJECT).
 *
 * It mirrors the server's spine rule (server/services/cmc/submission-spine.ts findProgramSubmission): a submission
 * anchored to this program first; otherwise an unanchored one whose product name or title matches the program;
 * never one anchored to another program.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalSubmissionFor } from './packs/biotech-submission.mjs';

const PROGRAM = { id: '6065271c-d4b0-4936-aad1-02855423a738', productName: 'C2C-101', title: '[Demo · Biotech] C2C-101 (IND)', code: 'C2C-101' };

test('a submission anchored to another program is never chosen, whatever its product name', () => {
  const list = [
    { id: 29, title: 'Sweep API eu_biosimilar_maa', productName: 'C2C-101', programId: '312c459d-564c-4c62-9f70-fdaa02c977d2' },
    { id: 1, title: PROGRAM.title, productName: 'C2C-101 (fictional)', programId: PROGRAM.id },
  ];
  assert.equal(canonicalSubmissionFor(list, PROGRAM)?.id, 1);
});

test('only another program\'s submission matches by name: none is chosen', () => {
  const list = [{ id: 29, title: 'Sweep', productName: 'C2C-101', programId: '312c459d-564c-4c62-9f70-fdaa02c977d2' }];
  assert.equal(canonicalSubmissionFor(list, PROGRAM), null);
});

test('an unanchored submission matching the program\'s identity is still found', () => {
  const list = [{ id: 7, title: 'Something', productName: 'c2c-101', programId: null }];
  assert.equal(canonicalSubmissionFor(list, PROGRAM)?.id, 7);
});

test('the program\'s own anchored submission wins over an unanchored name match', () => {
  const list = [
    { id: 7, title: 'Something', productName: 'C2C-101', programId: null },
    { id: 1, title: 'Other title', productName: 'Other', programId: PROGRAM.id },
  ];
  assert.equal(canonicalSubmissionFor(list, PROGRAM)?.id, 1);
});
