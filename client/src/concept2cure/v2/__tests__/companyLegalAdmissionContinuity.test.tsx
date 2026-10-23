// @vitest-environment jsdom
/** Presented legal-form credentials have their own admission visit. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { authService } from '@/services/portal/authService';
import { getAuthToken } from '@/utils/authToken';
import { DEFAULT_TEMPLATE_SPEC } from '@shared/templates/template-spec';
import { endCompanySession, seedCompanySession } from './_company-session-fixture';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { useCompanyLegalAction } from '../surfaces/company-documents/useCompanyLegalResource';

const onSaved = vi.fn();
let token: string;
let action: ReturnType<typeof useCompanyLegalAction>;
function Host({ bearer }: { bearer: string }) { action = useCompanyLegalAction(bearer, 'same-legal-source', onSaved); return null; }
function receipt() { return new Response(JSON.stringify({ canManage: true, data: {
  version: 1, revision: 4, companyName: 'Current company', address: '', contact: '', registrationDetails: '',
  letterhead: DEFAULT_TEMPLATE_SPEC, importedFrom: null, applyToReports: false, applyToSubmissionCorrespondence: false, legalDocuments: [],
} }), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
const save = (run: typeof action.run) => run('POST', '/api/client-branding/company-documents/legal-workflows/requirements', {
  expectedRevision: 3, reason: 'Record the explicitly reviewed legal requirement.',
});
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); token = seedCompanySession();
  apiRequest.mockReset().mockImplementation(async () => receipt()); onSaved.mockReset();
});
afterEach(() => { cleanup(); endCompanySession(); });

describe('legal action admission does not revive across invalid presented credentials', () => {
  it('retires an A callback across blank then valid A props while allowing a newly admitted action', async () => {
    const view = render(<Host bearer={token} />); const oldRun = action.run;
    const account = authService.getUser(), session = authService.captureSessionReadGuard();
    view.rerender(<Host bearer="" />);
    let refused: boolean | undefined;
    await act(async () => { refused = await save(oldRun); });
    expect(refused).toBe(false); expect(apiRequest).not.toHaveBeenCalled();
    view.rerender(<Host bearer={token} />);
    await act(async () => { refused = await save(oldRun); });
    expect(refused).toBe(false); expect(apiRequest).not.toHaveBeenCalled();
    await act(async () => { expect(await save(action.run)).toBe(true); });
    expect(apiRequest).toHaveBeenCalledOnce(); expect(onSaved).toHaveBeenCalledOnce();
    expect(authService.getUser()).toBe(account); expect(session.sameRevision()).toBe(true); expect(getAuthToken()).toBe(token);
  });

  it('drops a pending A receipt after mismatched then valid A props without changing the canonical account', async () => {
    let resolve!: (response: Response) => void;
    apiRequest.mockImplementation(() => new Promise<Response>(done => { resolve = done; }));
    const view = render(<Host bearer={token} />); const session = authService.captureSessionReadGuard();
    let completion!: Promise<boolean>;
    act(() => { completion = save(action.run); });
    await waitFor(() => expect(apiRequest).toHaveBeenCalledOnce());
    view.rerender(<Host bearer="mismatched-presented-bearer" />);
    view.rerender(<Host bearer={token} />);
    let recorded: boolean | undefined;
    await act(async () => { resolve(receipt()); recorded = await completion; });
    expect(recorded).toBe(false); expect(onSaved).not.toHaveBeenCalled();
    expect(apiRequest).toHaveBeenCalledOnce(); expect(session.sameRevision()).toBe(true); expect(getAuthToken()).toBe(token);
  });
});
