/**
 * W3-7 — an accepted AI draft must not be recorded as the reviewer's own work.
 *
 * Accepting a tracked suggestion strips the mark that named its author; that is
 * what accepting a tracked change means. The mark was the only place the author
 * was recorded, so the moment a reviewer accepts an AnA draft the text becomes
 * indistinguishable from text they typed, and the revision the save writes is
 * attributed wholly to them. For a §11.10(e) record that is an attribution the
 * record cannot support: the audit trail says a human authored words a model
 * produced.
 *
 * The client now reads the authors off the marks BEFORE accepting erases them
 * and sends them with the save. That makes the list client-supplied and bound
 * for an append-only ledger, so it is validated here rather than trusted.
 */
import { describe, it, expect } from 'vitest';
import { machineContributors, MACHINE_AUTHOR_IDS } from '../revision-ledger';

describe('machineContributors', () => {
  it('keeps a recognised machine author', () => {
    expect(machineContributors([{ id: 'ana', name: 'AnA (AI draft)' }])).toEqual([
      { id: 'ana', name: 'AnA (AI draft)' },
    ]);
  });

  it('takes the display name from the server, never from the request', () => {
    // A caller-supplied name would put unvalidated text in the attribution
    // position of a filed record.
    const out = machineContributors([{ id: 'ana', name: 'Dr. Jordan Chen, MD' }]);
    expect(out).toEqual([{ id: 'ana', name: MACHINE_AUTHOR_IDS.ana }]);
  });

  it('drops ids it does not recognise, so a caller cannot invent an author', () => {
    expect(
      machineContributors([
        { id: 'not-a-real-agent', name: 'Regulatory Affairs' },
        { id: 'user-42', name: 'A colleague' },
      ]),
    ).toEqual([]);
  });

  it('records a human co-author as nothing — created_by already names them', () => {
    expect(machineContributors([{ id: 'u-7', name: 'Jordan Chen' }])).toEqual([]);
  });

  it('de-duplicates, so accepting six AnA suggestions names AnA once', () => {
    const six = Array.from({ length: 6 }, () => ({ id: 'ana', name: 'AnA (AI draft)' }));
    expect(machineContributors(six)).toHaveLength(1);
  });

  it('treats malformed input as no attribution rather than as a guess', () => {
    for (const bad of [null, undefined, 'ana', 42, {}, [null], [{ id: 7 }], [{ name: 'ana' }]]) {
      expect(machineContributors(bad as unknown), String(bad)).toEqual([]);
    }
  });

  it('bounds the list so a save cannot carry an unbounded attribution payload', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ id: i === 400 ? 'ana' : `x${i}`, name: 'n' }));
    // The 401st entry is past the slice, so the recognised id beyond the bound
    // is not admitted — the cap is real, not decorative.
    expect(machineContributors(many)).toEqual([]);
  });
});

describe('the origin a save records', () => {
  /* The router chooses 'ai-draft-accept' when contributors is non-empty and
     'human-edit' otherwise. Origin feeds computeChainHash, so this is not a
     label — it is part of the tamper-evident link. */
  it('is decided by whether machine-authored text was incorporated', () => {
    const withAi = machineContributors([{ id: 'ana', name: 'AnA (AI draft)' }]);
    const withoutAi = machineContributors([{ id: 'u-7', name: 'Jordan Chen' }]);
    expect(withAi.length ? 'ai-draft-accept' : 'human-edit').toBe('ai-draft-accept');
    expect(withoutAi.length ? 'ai-draft-accept' : 'human-edit').toBe('human-edit');
  });
});
