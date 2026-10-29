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
    render(<TrainingExpiry />);
    expect(screen.getByText('Member 1')).toBeTruthy();
    expect(screen.getByText(/SOP-001 Controlled procedure · v1\.0 · lapses .* \(in 10 days\)/)).toBeTruthy();
    expect(screen.getByText('Member 2')).toBeTruthy();
    expect(screen.getByText(/SOP-001 Controlled procedure · v1\.0 · lapsed /)).toBeTruthy();
  });

  it('says a failed read failed, and never that no one lapses', () => {
    H.reads[PATH] = { data: null, loading: false, error: 'HTTP 500' };
    render(<TrainingExpiry />);
    expect(screen.getByText('Training expiry could not be read')).toBeTruthy();
    expect(screen.queryByText(/No one's training has lapsed/)).toBeNull();
  });
});
