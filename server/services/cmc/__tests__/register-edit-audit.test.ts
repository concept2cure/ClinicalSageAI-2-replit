/**
 * The diff a register edit is recorded as.
 *
 * `writeChainedAuditRow` hard-codes `old_values` NULL for every caller (DP-13),
 * so the before state lives in the row's `details` as a field-by-field diff.
 * The diff is what an inspector reads for a changed record, so its edge cases
 * are the ones that matter: a json column that is equal but not `===`, a Date
 * that is the same instant, a field the UPDATE did not touch, and an edit that
 * moved nothing at all.
 */
import { describe, it, expect } from 'vitest';
import { diffRows, CMC_REGISTER_UPDATE } from '../register-edit-audit';

describe('diffRows', () => {
  it('names only the fields that moved, with their before and after', () => {
    const changed = diffRows(
      { id: 7, title: 'RP-HPLC Assay', status: 'development', analyte: 'BX-701' },
      { id: 7, title: 'RP-HPLC Assay (rev 2)', status: 'validation', analyte: 'BX-701' },
    );
    expect(Object.keys(changed).sort()).toEqual(['status', 'title']);
    expect(changed.status).toEqual({ from: 'development', to: 'validation' });
    expect(changed.title.to).toBe('RP-HPLC Assay (rev 2)');
  });

  it('does not report a json column that is equal but not identical', () => {
    /* A register's json columns come back as fresh objects on every read, so
       `!==` would report every one of them as changed on every edit and bury
       the field that actually moved. */
    const before = { ichQ2Parameters: { characteristics: ['Specificity', 'Accuracy'] } };
    const after = { ichQ2Parameters: { characteristics: ['Specificity', 'Accuracy'] } };
    expect(diffRows(before, after)).toEqual({});
  });

  it('reports a json column whose contents did move', () => {
    const changed = diffRows(
      { ichQ2Parameters: { characteristics: ['Specificity'] } },
      { ichQ2Parameters: { characteristics: ['Specificity', 'Precision'] } },
    );
    expect(Object.keys(changed)).toEqual(['ichQ2Parameters']);
  });

  it('does not report a Date that is the same instant', () => {
    const t = '2026-05-04T00:00:00.000Z';
    expect(diffRows({ validationDate: new Date(t) }, { validationDate: new Date(t) })).toEqual({});
  });

  it('records a Date as its instant, not as an object', () => {
    const changed = diffRows(
      { validationDate: null },
      { validationDate: new Date('2026-05-04T00:00:00.000Z') },
    );
    expect(changed.validationDate).toEqual({ from: null, to: '2026-05-04T00:00:00.000Z' });
  });

  it('treats null and undefined as the same absence', () => {
    expect(diffRows({ notes: null }, { notes: undefined })).toEqual({});
    expect(diffRows({ notes: undefined }, { notes: null })).toEqual({});
  });

  it('ignores a field the UPDATE did not write', () => {
    /* An UPDATE writes the columns it was given; a column absent from `after`
       is not a change. */
    expect(diffRows({ id: 1, title: 'a', status: 'draft' }, { id: 1, title: 'a' })).toEqual({});
  });

  it('never reports updated_at, in either case convention', () => {
    /* It moves on every edit by definition: recording it would put one
       meaningless entry in every diff. */
    expect(diffRows(
      { updatedAt: new Date('2026-01-01'), updated_at: '2026-01-01' },
      { updatedAt: new Date('2026-06-01'), updated_at: '2026-06-01' },
    )).toEqual({});
  });

  it('reports a value cleared to null, which is a change an inspector reads', () => {
    const changed = diffRows({ notes: 'Superseded by AM-022' }, { notes: null });
    expect(changed.notes).toEqual({ from: 'Superseded by AM-022', to: null });
  });

  it('is empty for an edit that moved nothing — no row is written for one', () => {
    const row = { id: 3, title: 'a', status: 'draft', ichQ2Parameters: { x: 1 } };
    expect(diffRows(row, { ...row })).toEqual({});
  });
});

describe('the action name', () => {
  it('is one name, so the trail can be read by it', () => {
    expect(CMC_REGISTER_UPDATE).toBe('cmc.register.update');
  });
});
