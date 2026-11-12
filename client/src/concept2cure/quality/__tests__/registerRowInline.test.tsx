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
/** The buttons a person sees on the record before opening More: the number in its facts, then, on the line under
 *  them, the inline actions, Ask AnA and More. */
const inline = (row: HTMLElement) => [...row.querySelectorAll<HTMLElement>(':scope > tr:not(.qms-row-more-tr):not(.qcc-detail-tr) button')]
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

  it('scrolls a wide register inside its own box, never the page', () => {
    const { row } = mount(doc({}));
    const table = row.closest('table') as HTMLElement;
    expect(table.parentElement?.className).toBe('qms-reg-scroll');
  });

  /* Walked 2026-11-11 (w37): the content column is 1040px and the register with its actions in the row needs 1083,
     so the actions, pinned at the right edge, covered the last columns on every monitor: the Next review header at
     1440, the Effective and Next review dates of every document at 1280, the Status at 1024. A record's actions are
     on their own line under its facts, and the table has no actions column. */
  it("puts a record's actions on their own line under its facts, so they cover none of them", () => {
    const { row } = mount(doc({}));
    const table = row.closest('table') as HTMLElement;
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([...REGISTER_COLUMNS]);
    const [facts, acts] = [...row.querySelectorAll<HTMLElement>(':scope > tr')];
    expect(facts.children).toHaveLength(REGISTER_COLUMNS.length);
    expect(facts.querySelector('.qms-rowacts')).toBeNull();
    expect(acts.className).toBe('qms-row-acts-tr');
    expect(acts.children).toHaveLength(1);
    expect((acts.firstElementChild as HTMLTableCellElement).colSpan).toBe(REGISTER_COLUMNS.length);
    expect(within(acts).getByRole('button', { name: 'More actions for QS-SOP-007' })).toBeTruthy();
    fireEvent.click(within(acts).getByRole('button', { name: 'More actions for QS-SOP-007' }));
    const more = row.querySelector(':scope > tr.qms-row-more-tr > td') as HTMLTableCellElement;
    expect(more.colSpan).toBe(REGISTER_COLUMNS.length);
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
