// @vitest-environment jsdom
/**
 * G10: Quality lists the person whose training lapses soon, with the document
 * and the date, and a failed read is a failure, never "no one".
 */
import * as React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const H = vi.hoisted(() => ({ reads: {} as Record<string, { data: unknown; loading: boolean; error: string | null }> }));
vi.mock('../../mdx/hooks/useFetchJson', () => ({
  useFetchJson: (url: string) => ({ ...(H.reads[url] ?? { data: null, loading: true, error: null }), refresh: vi.fn() }),
}));

import { TrainingExpiry } from '../TrainingExpiry';

const PATH = '/api/mdx/qms/training/expiring?within=60';
afterEach(() => { cleanup(); H.reads = {}; });

describe('Training lapsing soon', () => {
  it('names the person, the document and when their training lapses', () => {
    H.reads[PATH] = { data: { data: [{
      kind: 'lapsing', userId: 10, userName: 'Member 1', documentId: 3, docNumber: 'SOP-001', title: 'Controlled procedure',
      documentVersion: '1.0', expiresAt: '2026-10-24T12:00:00.000Z', daysLeft: 10, lapsed: false,
    }, {
      kind: 'lapsing', userId: 11, userName: 'Member 2', documentId: 3, docNumber: 'SOP-001', title: 'Controlled procedure',
      documentVersion: '1.0', expiresAt: '2026-10-09T12:00:00.000Z', daysLeft: -5, lapsed: true,
    }] }, loading: false, error: null };
    render(<TrainingExpiry assignment={{ assigned: 1, noActiveAssignees: 0 }} />);
    expect(screen.getByText('Member 1')).toBeTruthy();
    expect(screen.getByText(/SOP-001 Controlled procedure · v1\.0 · lapses .* \(in 10 days\)/)).toBeTruthy();
    expect(screen.getByText('Member 2')).toBeTruthy();
    expect(screen.getByText(/SOP-001 Controlled procedure · v1\.0 · lapsed /)).toBeTruthy();
  });

  it('says a failed read failed, and never that no one lapses', () => {
    H.reads[PATH] = { data: null, loading: false, error: 'HTTP 500' };
    render(<TrainingExpiry assignment={{ assigned: 1, noActiveAssignees: 0 }} />);
    expect(screen.getByText('Training expiry could not be read')).toBeTruthy();
    expect(screen.queryByText(/No one assigned has training/)).toBeNull();
  });

  // C2 (finding 112), and the review's repairs: an all-clear is said only where training is assigned to someone active;
  // a read in flight claims nothing; a coverage read that failed gives no all-clear.
  it('says each assignment state as it is, and an all-clear only where training is assigned', () => {
    H.reads[PATH] = { data: { data: [] }, loading: false, error: null };
    const say = (assignment: Parameters<typeof TrainingExpiry>[0]['assignment']) => {
      const view = render(<TrainingExpiry assignment={assignment} />);
      const text = view.container.textContent ?? '';
      view.unmount();
      return text;
    };
    expect(say({ assigned: 2, noActiveAssignees: 0 })).toMatch(/No one assigned has training overdue, due or lapsing in the next 60 days\./);
    expect(say({ assigned: 0, noActiveAssignees: 0 })).toMatch(/No document is assigned for training yet\./);
    expect(say({ assigned: 0, noActiveAssignees: 1 })).toMatch(/No one assigned to train is an active member\./);
    const reading = say('reading');
    expect(reading).toMatch(/Reading who is assigned to train/);
    expect(reading).not.toMatch(/could not be read|No one assigned has|No document is assigned/);
    expect(say(null)).toMatch(/could not be read, so no all-clear is given/);
  });

  /* G10 slice 5 (MR-12 Stage 4): the same view lists who has not yet acknowledged the version they train on next, as
     the task resolver states it: overdue first, then due, then the lapses, each with its day. A row of an unknown
     kind, or without its day, makes the read a failure, never a row. */
  it('lists overdue, then due training, before the lapses, each with its day', () => {
    const base = { documentId: 3, docNumber: 'SOP-001', title: 'Controlled procedure', documentVersion: '1.0' };
    H.reads[PATH] = { data: { data: [
      { ...base, kind: 'overdue', userId: 12, userName: 'Untrained', dueDate: '2026-10-01', daysLeft: -13, lateAssignment: false },
      { ...base, kind: 'due', userId: 13, userName: 'New hire', dueDate: '2026-10-24', daysLeft: 10, lateAssignment: true },
      { ...base, kind: 'lapsing', userId: 10, userName: 'Member 1', expiresAt: '2026-10-24T12:00:00.000Z', daysLeft: 10, lapsed: false },
    ], meta: { truncated: false } }, loading: false, error: null };
    render(<TrainingExpiry assignment={{ assigned: 1, noActiveAssignees: 0 }} />);
    expect(screen.getByRole('heading', { name: 'Training overdue, due or lapsing' })).toBeTruthy();
    expect(screen.getAllByTestId('training-expiry-row').map((r) => r.textContent)).toEqual([
      'Untrained OverdueSOP-001 Controlled procedure · v1.0 · overdue since 2026-10-01',
      'New hireSOP-001 Controlled procedure · v1.0 · due 2026-10-24 (in 10 days), 14 days after they were assigned',
      'Member 1SOP-001 Controlled procedure · v1.0 · lapses 2026-10-24 (in 10 days)',
    ]);
    expect(screen.queryByTestId('training-expiry-truncated')).toBeNull();
  });

  it('says when the list stopped at its cap, and treats a row of an unknown kind as a failed read', () => {
    const row = { kind: 'overdue', userId: 12, userName: 'Untrained', documentId: 3, docNumber: 'SOP-001', title: 'Controlled procedure',
      documentVersion: '1.0', dueDate: '2026-10-01', daysLeft: -13, lateAssignment: false };
    H.reads[PATH] = { data: { data: [row], meta: { truncated: true } }, loading: false, error: null };
    const { unmount } = render(<TrainingExpiry assignment={{ assigned: 1, noActiveAssignees: 0 }} />);
    expect(screen.getByTestId('training-expiry-truncated').textContent).toBe('The first 500 rows: there are more than the list shows.');
    unmount();
    H.reads[PATH] = { data: { data: [{ ...row, kind: 'late' }] }, loading: false, error: null };
    render(<TrainingExpiry assignment={{ assigned: 1, noActiveAssignees: 0 }} />);
    expect(screen.getByText('Training expiry could not be read')).toBeTruthy();
  });

  /* Quality review, 2026-11-10: a member who sees only their own rows was told "No one assigned has…"; a document the
     server could not assess, or the document cap, still allowed the all-clear. */
  it('speaks for the reader alone when the read was their own rows', () => {
    H.reads[PATH] = { data: { data: [], meta: { scope: 'own', unassessed: 0, documentsCapped: false } }, loading: false, error: null };
    const { container } = render(<TrainingExpiry assignment={{ assigned: 1, noActiveAssignees: 0 }} />);
    expect(container.textContent).toContain('You have no training overdue, due or lapsing in the next 60 days.');
    expect(container.textContent).toContain('Your training: overdue, or due or lapsing in the next 60 days');
    expect(container.textContent).not.toContain('No one assigned');
  });

  it('gives no all-clear over documents it could not assess, and says so', () => {
    H.reads[PATH] = { data: { data: [], meta: { scope: 'everyone', unassessed: 2, documentsCapped: true } }, loading: false, error: null };
    const { container } = render(<TrainingExpiry assignment={{ assigned: 3, noActiveAssignees: 0 }} />);
    expect(screen.getByTestId('training-expiry-unassessed').textContent)
      .toBe('2 assigned documents were not assessed: their released text cannot be read.');
    expect(screen.getByTestId('training-expiry-capped').textContent).toBe('Only the first 200 trainable documents were read.');
    expect(container.textContent).not.toMatch(/No one assigned has training/);
  });
});

