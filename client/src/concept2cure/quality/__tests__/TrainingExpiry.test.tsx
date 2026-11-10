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
      userId: 10, userName: 'Member 1', documentId: 3, docNumber: 'SOP-001', title: 'Controlled procedure',
      documentVersion: '1.0', expiresAt: '2026-10-24T12:00:00.000Z', daysLeft: 10, lapsed: false,
    }, {
      userId: 11, userName: 'Member 2', documentId: 3, docNumber: 'SOP-001', title: 'Controlled procedure',
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
    expect(screen.queryByText(/No one's training has lapsed/)).toBeNull();
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
    expect(say({ assigned: 2, noActiveAssignees: 0 })).toMatch(/No one's training has lapsed, and none lapses in the next 60 days/);
    expect(say({ assigned: 0, noActiveAssignees: 0 })).toMatch(/No document is assigned for training yet\./);
    expect(say({ assigned: 0, noActiveAssignees: 1 })).toMatch(/No one assigned to train is an active member\./);
    const reading = say('reading');
    expect(reading).toMatch(/Reading who is assigned to train/);
    expect(reading).not.toMatch(/could not be read|has lapsed|No document is assigned/);
    expect(say(null)).toMatch(/could not be read, so no all-clear is given/);
  });
});
