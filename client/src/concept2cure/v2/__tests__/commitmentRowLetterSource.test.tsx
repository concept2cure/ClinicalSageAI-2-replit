// @vitest-environment jsdom
/**
 * A commitment row says where the commitment came from and when it is due, in
 * words: one recorded from a letter's own text names the letter (S10, the
 * demo walk of 2026-11-01, defect 4); one made in an answer names the question
 * and its letter; the due day reads "Jun 30, 2030", not the register's
 * yyyy-mm-dd.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { CommitmentRowView, type CommitmentRow } from '../surfaces/CommitmentRow';

afterEach(() => cleanup());

const base: CommitmentRow = {
  id: 1, commitment_type: 'prea', description: 'Conduct the pediatric study.', regulatory_basis: 'PREA (FDCA 505B) · 4710-3',
  due_date: '2030-06-30', status: 'open', fulfilled_date: null, effectiveStatus: 'open', project_id: 42,
  source_communication_event_id: 'ace_9', source_question_id: null, source_communication_type: 'Approval letter',
  source_question_ref: null,
  fulfilment: { rule: { signatureRequired: true, evidenceRequired: true, dateRequired: true }, state: 'not-fulfilled',
    recordedBy: null, recordedAt: null, sequence: null, vaultVersion: null, signature: null },
} as CommitmentRow;
const line = (c: CommitmentRow) => {
  const { container } = render(<CommitmentRowView c={c} onFulfil={vi.fn()} onNav={vi.fn()} onAsk={vi.fn()} />);
  return container.querySelector('.cc-row-s')?.textContent ?? '';
};

describe('where a commitment came from, and when it is due', () => {
  it('names the letter it was recorded from, with its basis and due day in words', () => {
    expect(line(base)).toBe('PREA (FDCA 505B) · 4710-3 · due Jun 30, 2030 · recorded from Approval letter');
  });

  it('names the question and its letter when it was made in an answer', () => {
    expect(line({ ...base, source_question_id: 7, source_question_ref: 'Q2', source_communication_type: 'Information request' }))
      .toContain('made in the answer to Q2 of Information request');
  });

  it('says nothing of a source for a commitment recorded on its own', () => {
    expect(line({ ...base, source_communication_event_id: null, source_communication_type: null })).toBe('PREA (FDCA 505B) · 4710-3 · due Jun 30, 2030');
  });
});
