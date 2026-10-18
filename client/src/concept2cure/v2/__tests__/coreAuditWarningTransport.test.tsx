// @vitest-environment jsdom
/** The actual shared transport and shell warning consume every repaired core API response shape. */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { apiRequest } from '@/lib/queryClient';
import { GlobalMutationErrors } from '../GlobalMutationErrors';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('completed core/collaboration requests disclose missing history without inviting duplicate saves', () => {
  it.each([
    ['/api/concept2cure/projects', { success: true, data: { id: 'proj_6', name: 'Saved project' } }, false],
    ['/api/inline-annotations/12', { id: 41, documentId: 12, content: 'Saved note' }, true],
    ['/api/cmc-changes', { data: { title: 'Saved CMC change' }, id: 'saved-id', meta: { module3WriteThrough: 'recorded' } }, false],
    ['/api/reg-change', { data: { title: 'Saved tracked change' }, id: 'saved-id' }, false],
  ] as const)('%s uses the canonical notice and preserves its response body through failure and recovery', async (path, body, headersOnly) => {
    render(<GlobalMutationErrors />);
    const lost = { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED', message: 'Canonical audit persistence warning.' };
    const failedBody = headersOnly ? body : { ...body, meta: { ...('meta' in body ? body.meta : {}), auditTrail: lost } };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(failedBody), {
      status: 201, headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'core-audit-reference',
        ...(headersOnly ? { 'X-Audit-Row-Persisted': 'false', 'X-Audit-Row-Code': lost.code } : {}) },
    })));
    await act(async () => {
      const response = await apiRequest('POST', path, { synthetic: true });
      expect(response.status).toBe(201); expect(await response.json()).toEqual(failedBody);
    });
    const notice = screen.getByTestId('global-audit-row-notice');
    expect(notice.textContent).toContain('could not confirm a readable audit-trail entry');
    expect(notice.textContent).toContain('core-audit-reference');
    expect(screen.queryByTestId('global-mutation-error')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    const healthyBody = headersOnly ? body : { ...body, meta: { ...('meta' in body ? body.meta : {}), auditTrail: { persisted: true, chained: true } } };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(healthyBody), {
      status: 201, headers: { 'Content-Type': 'application/json', 'X-Audit-Row-Persisted': 'true' },
    })));
    await act(async () => { expect(await (await apiRequest('POST', path, { synthetic: true })).json()).toEqual(healthyBody); });
    expect(screen.queryByTestId('global-audit-row-notice')).toBeNull();
    expect(screen.queryByTestId('global-mutation-error')).toBeNull();
  });
});
