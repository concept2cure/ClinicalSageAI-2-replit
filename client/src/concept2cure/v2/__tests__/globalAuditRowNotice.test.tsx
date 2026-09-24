// @vitest-environment jsdom
/**
 * The visible half of client/src/lib/__tests__/audit-row-not-persisted.test.ts.
 *
 * The transport raises `c2c:audit-row-not-persisted` when a write committed and
 * its §11.10(e) audit row did not. Raising an event nobody renders is the same
 * defect one layer further up, so this holds the shell's global notice to it:
 * the notice appears, says the change WAS saved (it was — telling the user it
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

describe('GlobalMutationErrors — a saved change with no audit row', () => {
  it('shows a notice that says the change was saved and the audit entry was not written', () => {
    render(<GlobalMutationErrors />);
    expect(screen.queryByTestId('global-audit-row-notice')).toBeNull();

    raise(DETAIL);

    const notice = screen.getByTestId('global-audit-row-notice');
    expect(notice.textContent).toMatch(/saved/i);
    expect(notice.textContent).toMatch(/audit trail/i);
    expect(notice.textContent).not.toMatch(/was not saved/i);
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
