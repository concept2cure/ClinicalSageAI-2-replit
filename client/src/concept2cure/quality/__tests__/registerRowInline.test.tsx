// @vitest-environment jsdom
/**
 * P-122 (2026-11-10): a register row shows the governed actions that fit its state, inline, as ghost buttons, and
 * Ask AnA as a quiet icon button; "More" keeps the rest. Since 606a9a302 / ea1d59957 / 33682ac65 a row showed one
 * next step and every other action (Approve, Revise, Retire, Controlled copy, Record review, Ask AnA) one click deeper,
 * where a demo read them as missing. The handlers are the register's own, unchanged.
 */
import * as React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, cleanup, fireEvent } from '@testing-library/react';
import { REGISTER_COLUMNS, RegisterTable, SopRegisterRow, type RegisterRowActions } from '../SopRegisterRow';
import type { QmsDoc } from '../data';

afterEach(cleanup);

const doc = (over: Partial<QmsDoc>): QmsDoc => ({
  id: 7, docNumber: 'QS-SOP-007', title: 'Handling of customer complaints', docType: 'sop', category: null, version: '2.0',
  status: 'effective', effectiveDate: '2026-01-10', nextReviewDate: '2027-01-10', updatedAt: null, authorId: 1, ...over,
});
const handlers = (meId = 2) => {
  const calls: string[] = [];
  const rec = (name: string) => (...a: unknown[]) => { calls.push(`${name}:${typeof a[0] === 'object' && a[0] ? (a[0] as QmsDoc).docNumber ?? '' : String(a[0])}`); };
  const actions: RegisterRowActions = {
    meId, canRead: () => true, open: rec('open'), read: rec('read'), assign: rec('assign'), sendForReview: rec('send'),
    showRoute: rec('route'), approve: rec('approve'), revise: rec('revise'), recordReview: rec('review'), retire: rec('retire'),
    controlledCopy: rec('copy'), history: rec('history'), ask: (q: string) => calls.push(`ask:${q}`),
  };
  return { actions, calls };
};
const mount = (d: QmsDoc, meId = 2) => {
  const h = handlers(meId);
  render(<RegisterTable columns={REGISTER_COLUMNS}><SopRegisterRow doc={d} actions={h.actions} /></RegisterTable>);
  const row = screen.getByText(d.title, { selector: '.qms-title' }).closest('tbody') as HTMLElement;
  return { row, calls: h.calls };
};
/** The buttons a person sees on the row before opening More: the number, the inline actions, Ask AnA and More. */
const inline = (row: HTMLElement) => within(row.querySelector('tr') as HTMLElement).getAllByRole('button')
  .map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim());
const behindMore = (row: HTMLElement, name: string) => {
  fireEvent.click(within(row).getByRole('button', { name: `More actions for ${name}` }));
  return within(within(row).getByRole('group', { name: `Actions for ${name}` })).getAllByRole('button')
    .map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim());
};

describe('a controlled document row shows the actions that fit its state', () => {
  it('a draft: Send for review and Open inline; Ask AnA inline; the rest under More', () => {
    const { row } = mount(doc({ status: 'draft', effectiveDate: null }));
    expect(inline(row)).toEqual(['QS-SOP-007', 'Send for review', 'Open', 'Ask AnA about this document', 'More actions for QS-SOP-007']);
    expect(behindMore(row, 'QS-SOP-007')).toEqual(['Training', 'View version history of QS-SOP-007']);
  });

  it('under review, for its approver: Approve and Review route inline', () => {
    const { row, calls } = mount(doc({ status: 'in_review' }), 2);
    expect(inline(row)).toEqual(['QS-SOP-007', 'Approve', 'Review route', 'Ask AnA about this document', 'More actions for QS-SOP-007']);
    fireEvent.click(within(row).getByRole('button', { name: 'Approve' }));
    expect(calls).toEqual(['approve:QS-SOP-007']);
    expect(behindMore(row, 'QS-SOP-007')).toEqual(['Open', 'Training', 'Revise', 'View version history of QS-SOP-007']);
  });

  it('under review, for its author: no Approve the server refuses; Review route and Open inline', () => {
    const { row } = mount(doc({ status: 'in_review' }), 1);
    expect(inline(row)).toEqual(['QS-SOP-007', 'Review route', 'Open', 'Ask AnA about this document', 'More actions for QS-SOP-007']);
  });

  it('in force, with training: Read and acknowledge and Revise inline; Controlled copy, Record review and Retire under More', () => {
    const { row, calls } = mount(doc({}));
    expect(inline(row)).toEqual(['QS-SOP-007', 'Read and acknowledge', 'Revise', 'Ask AnA about this document', 'More actions for QS-SOP-007']);
    expect(behindMore(row, 'QS-SOP-007')).toEqual([
      'Open', 'Training', 'Record review: QS-SOP-007 Handling of customer complaints', 'Retire', 'Download a controlled copy of QS-SOP-007',
      'View version history of QS-SOP-007',
    ]);
    fireEvent.click(within(row).getByRole('button', { name: 'Ask AnA about this document' }));
    expect(calls).toEqual(['ask:Summarize QS-SOP-007 Handling of customer complaints and tell me what it needs next.']);
  });

  it('in force, with no training: Revise and Controlled copy inline', () => {
    const { row } = mount(doc({ docType: 'form' }));
    expect(inline(row)).toEqual(['QS-SOP-007', 'Revise', 'Download a controlled copy of QS-SOP-007', 'Ask AnA about this document', 'More actions for QS-SOP-007']);
  });

  it('in force and overdue for periodic review: Record review leads', () => {
    const { row } = mount(doc({ nextReviewDate: '2025-01-10' }));
    expect(inline(row)).toEqual(['QS-SOP-007', 'Record review: QS-SOP-007 Handling of customer complaints', 'Read and acknowledge',
      'Ask AnA about this document', 'More actions for QS-SOP-007']);
  });

  it('retired: History and Revise inline, nothing else to do', () => {
    const { row } = mount(doc({ status: 'retired' }));
    expect(inline(row)).toEqual(['QS-SOP-007', 'View version history of QS-SOP-007', 'Revise', 'Ask AnA about this document', 'More actions for QS-SOP-007']);
    expect(behindMore(row, 'QS-SOP-007')).toEqual(['Open']);
  });

  it('every inline action is a ghost button, and Ask AnA is an icon with its name for assistive technology', () => {
    const { row } = mount(doc({}));
    const acts = row.querySelector('.qms-rowacts') as HTMLElement;
    for (const b of within(acts).getAllByRole('button')) expect(b.className).toBe('btn ghost small');
    const ask = within(acts).getByRole('button', { name: 'Ask AnA about this document' });
    expect(ask.textContent).toBe('');
    expect(ask.querySelector('svg')).toBeTruthy();
  });
});
