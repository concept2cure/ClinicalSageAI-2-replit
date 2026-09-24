// @vitest-environment jsdom
/**
 * The visible half of client/src/lib/__tests__/audit-row-not-persisted.test.ts.
 *
 * The transport raises `c2c:audit-row-not-persisted` when a write committed and
 * its §11.10(e) audit row did not. Raising an event nobody renders is the same
 * defect one layer further up, so this holds the shell's global notice to it:
 * the notice appears, says the request completed (it did — telling the user it
 * failed would be its own lie), names the request id, is not doubled by a
 * retry, and goes away when dismissed.
 */

import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { GlobalMutationErrors } from '../GlobalMutationErrors';
import { AUDIT_ROW_NOT_PERSISTED_EVENT, type AuditRowNotPersistedDetail } from '@/lib/queryClient';

function raise(detail: AuditRowNotPersistedDetail) {
  act(() => {
    window.dispatchEvent(new CustomEvent(AUDIT_ROW_NOT_PERSISTED_EVENT, { detail }));
  });
}

const DETAIL: AuditRowNotPersistedDetail = {
  method: 'PATCH',
  path: '/api/organizations/7/profile',
  code: 'AUDIT_ROW_NOT_PERSISTED',
  correlationId: 'req-123',
};

afterEach(cleanup);

describe('GlobalMutationErrors — a completed request with no audit row', () => {
  it('shows a notice that says the request completed and its audit entry was not written', () => {
    render(<GlobalMutationErrors />);
    expect(screen.queryByTestId('global-audit-row-notice')).toBeNull();

    raise(DETAIL);

    const notice = screen.getByTestId('global-audit-row-notice');
    expect(notice.textContent).toMatch(/audit trail did not record it/i);
    // The body sentence itself, not just the title: ErrorState filters its
    // message, and a filtered-out sentence would leave the title alone.
    expect(notice.textContent).toContain('could not write the audit-trail entry');
    // True of every 2xx. Not "saved" — a 2xx can answer a refusal (a refused
    // eCTD compile) — and never "not saved", which would deny a change that stands.
    expect(notice.textContent).toMatch(/completed/i);
    expect(notice.textContent).not.toMatch(/saved/i);
    expect(notice.textContent).toContain('req-123');
  });

  it('shows one notice for a repeated request, and removes it on dismiss', () => {
    render(<GlobalMutationErrors />);
    raise(DETAIL);
    raise(DETAIL);
    expect(screen.getAllByTestId('global-audit-row-notice')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByTestId('global-audit-row-notice')).toBeNull();
  });
});
