/**
 * IND submission overview aggregator — pure sequence summary. No DB.
 */

import { describe, it, expect } from 'vitest';
import { summarizeSequences, type SequenceLike } from '../ind-submission-overview';

const sequences: SequenceLike[] = [
  { sequenceNumber: '0000', type: 'original', status: 'dispatched', validationStatus: 'passed', dispatchStatus: 'acknowledged' },
  { sequenceNumber: '0001', type: 'amendment', status: 'frozen', validationStatus: 'passed', dispatchStatus: 'sent' },
  { sequenceNumber: '0002', type: 'amendment', status: 'draft', validationStatus: 'failed', dispatchStatus: 'pending' },
  { sequenceNumber: '0003', type: 'annual', status: 'assembling', validationStatus: null, dispatchStatus: null },
];

describe('summarizeSequences', () => {
  it('counts by type and status', () => {
    const s = summarizeSequences(sequences);
    expect(s.total).toBe(4);
    expect(s.byType).toEqual({ original: 1, amendment: 2, annual: 1 });
    expect(s.byStatus).toEqual({ dispatched: 1, frozen: 1, draft: 1, assembling: 1 });
  });

  it('finds the latest sequence number', () => {
    expect(summarizeSequences(sequences).latestSequenceNumber).toBe('0003');
  });

  it('rolls up dispatch and validation', () => {
    const s = summarizeSequences(sequences);
    expect(s.dispatched).toBe(2); // sent + acknowledged
    expect(s.validated).toBe(2);
    expect(s.validationFailures).toBe(1);
  });

  it('handles an empty submission', () => {
    const s = summarizeSequences([]);
    expect(s.total).toBe(0);
    expect(s.latestSequenceNumber).toBeNull();
    expect(s.byType).toEqual({});
  });

  it('is order-independent for the latest number', () => {
    const reversed = [...sequences].reverse();
    expect(summarizeSequences(reversed).latestSequenceNumber).toBe('0003');
  });
});
