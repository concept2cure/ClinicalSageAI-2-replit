// @vitest-environment jsdom
/** The existing authoring filer must confirm its own receipt and retain uncertain writes. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { ApiRequestError } from '@/lib/queryClient';
import { authService } from '@/services/portal/authService';
import { FileToVaultDialog, type FileToVaultDialogProps } from '../editor/FileToVaultDialog';
import { publishShellProject } from '../shellProject';
import { DOC_ID, PID } from './_vault-surface-fixtures';
import { deferred } from './_submission-deliverables-fixture';

const SOURCE = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const receipt = (changes: Record<string, unknown> = {}) => ({ success: true, data: {
  vaultDocumentId: DOC_ID, programId: PID, sha256: 'a'.repeat(64), format: 'pdf', folder: 'module-3', ...changes,
} });
const response = (body: unknown, status = 201) => new Response(JSON.stringify(body), { status });
const props = (): FileToVaultDialogProps => ({
  docId: SOURCE, docTitle: 'Stability summary', docStatus: 'APPROVED', programId: PID,
  programName: 'BX-301', onClose: vi.fn(), onFiled: vi.fn(), onNav: vi.fn(), fireToast: vi.fn(),
});
const submit = () => fireEvent.click(screen.getByTestId('ftv-submit'));

beforeEach(() => {
  authService.setToken('fixture-vault-author-a', { id: '7', organizationId: '1' }, 'fixture-vault-refresh', 3600);
  publishShellProject({ id: PID, title: 'BX-301' });
  apiRequest.mockReset().mockImplementation(async () => response(receipt()));
});
afterEach(() => {
  cleanup(); authService.endSession(null);
  delete window.C2C_PROJECT; delete window.C2C_VAULT_TARGET;
  vi.unstubAllGlobals();
});

describe('File to vault receipt confirmation', () => {
  it.each([
    ['non-UUID Vault identity', receipt({ vaultDocumentId: 'another-record' })],
    ['empty Vault identity', receipt({ vaultDocumentId: '' })],
    ['missing project', receipt({ programId: undefined })],
    ['another project', receipt({ programId: OTHER })],
    ['non-UUID project', receipt({ programId: 'project-1' })],
    ['missing content hash', receipt({ sha256: undefined })],
    ['short content hash', receipt({ sha256: 'a'.repeat(63) })],
    ['non-hex content hash', receipt({ sha256: 'g'.repeat(64) })],
    ['missing format', receipt({ format: undefined })],
    ['another requested format', receipt({ format: 'docx' })],
    ['unsupported format', receipt({ format: 'txt' })],
    ['explicit false success', { ...receipt(), success: false }],
    ['contradictory error envelope', { ...receipt(), error: { message: 'The recording failed.' } }],
    ['missing record', { success: true, data: {} }],
  ])('holds a successful HTTP answer with %s for review without replay', async (_name, body) => {
    const p = props(); apiRequest.mockImplementation(async () => response(body));
    render(<FileToVaultDialog {...p} />); submit();
    const error = await screen.findByTestId('ftv-error');
    expect(error.textContent).toMatch(/cannot confirm.*filed/i);
    expect(error.textContent).toMatch(/check.*vault.*before retrying/i);
    expect(error.textContent).not.toContain('Nothing was written');
    expect(screen.queryByTestId('ftv-result')).toBeNull();
    expect(screen.queryByTestId('ftv-open-vault')).toBeNull();
    expect((screen.getByTestId('ftv-submit') as HTMLButtonElement).disabled).toBe(true);
    submit(); expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(p.onFiled).not.toHaveBeenCalled(); expect(p.fireToast).not.toHaveBeenCalled();
  });

  it.each(['lost reply', 'unreadable body', 'bodyless 204', 'null body', 'HTTP 500', 'outcome unknown', 'existing version'] as const)(
    'holds %s through ordinary close and reopen', async kind => {
      apiRequest.mockImplementation(async () => {
        if (kind === 'lost reply') throw new Error('Failed to fetch');
        if (kind === 'unreadable body') return new Response('{', { status: 201 });
        if (kind === 'bodyless 204') return new Response(null, { status: 204 });
        if (kind === 'null body') return response(null);
        if (kind === 'HTTP 500') return response({ error: { message: 'The export did not finish.' } }, 500);
        const code = kind === 'existing version' ? 'VAULT_VERSION_ALREADY_RECORDED' : 'OUTCOME_UNKNOWN';
        throw new ApiRequestError('Check the existing Vault record before retrying.', 409, { error: { code } }, code);
      });
      const p = props(); const view = render(<FileToVaultDialog {...p} open />); submit();
      const error = await screen.findByTestId('ftv-error');
      expect(error.textContent).toMatch(/cannot confirm.*filed|existing.*vault/i);
      expect(error.textContent).not.toContain('Nothing was written');
      view.rerender(<FileToVaultDialog {...p} open={false} />);
      expect(screen.queryByTestId('file-to-vault-dialog')).toBeNull();
      view.rerender(<FileToVaultDialog {...p} open />);
      expect(screen.getByTestId('ftv-error').textContent).toBe(error.textContent);
      expect((screen.getByTestId('ftv-submit') as HTMLButtonElement).disabled).toBe(true);
      submit(); expect(apiRequest).toHaveBeenCalledTimes(1);
      expect(p.onFiled).not.toHaveBeenCalled(); expect(p.fireToast).not.toHaveBeenCalled();
    },
  );

  it.each([401, 403, 409, 422, 429])('retains a definite HTTP %s refusal and allows a deliberate retry', async status => {
    apiRequest.mockImplementationOnce(async () => response({ error: { message: 'This document cannot be filed in its current state.', code: 'FILING_REFUSED' } }, status));
    const p = props(); render(<FileToVaultDialog {...p} />); submit();
    expect((await screen.findByTestId('ftv-error')).textContent).toContain('This document cannot be filed');
    expect((screen.getByTestId('ftv-submit') as HTMLButtonElement).disabled).toBe(false);
    submit(); await screen.findByTestId('ftv-result');
    expect(apiRequest).toHaveBeenCalledTimes(2); expect(p.onFiled).toHaveBeenCalledTimes(1);
  });

});

describe('File to vault definite converter refusals', () => {
  it.each([
    ['PDF_RENDERER_UNAVAILABLE', 'response'], ['PDF_RENDERER_UNAVAILABLE', 'throw'],
    ['CONVERTER_BUSY', 'response'], ['CONVERTER_BUSY', 'throw'],
  ] as const)('keeps a definite %s %s refusal retryable and permits an explicit Word filing', async (code, carrier) => {
    const message = code === 'CONVERTER_BUSY' ? 'The document converter is busy. Try again in about 30 seconds.'
      : 'The formatted PDF could not be completed. Nothing was delivered or filed. Download Word or contact an administrator.';
    const body = code === 'CONVERTER_BUSY' ? { error: code, message, retryAfterSeconds: 30 }
      : { success: false, error: { code, message } };
    apiRequest.mockImplementationOnce(async () => {
      if (carrier === 'throw') throw new ApiRequestError(message, 503, body, code);
      return response(body, 503);
    });
    const p = props(); render(<FileToVaultDialog {...p} />); submit();
    expect((await screen.findByTestId('ftv-error')).textContent).toContain(message);
    expect((screen.getByTestId('ftv-submit') as HTMLButtonElement).disabled).toBe(false);
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(p.onFiled).not.toHaveBeenCalled();
    apiRequest.mockImplementationOnce(async () => response(receipt({ format: 'docx' })));
    fireEvent.click(screen.getByRole('radio', { name: /Word/ })); submit();
    await screen.findByTestId('ftv-result');
    expect(apiRequest.mock.calls[1][2]).toEqual({ format: 'docx' });
    expect(p.onFiled).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a missing body', undefined, 503],
    ['an uncertain nested code', { code: 'PDF_RENDERER_UNAVAILABLE', error: { code: 'OUTCOME_UNKNOWN', message: 'Check the current record.' } }, 503],
    ['a returned record', { code: 'PDF_RENDERER_UNAVAILABLE', error: 'PDF unavailable', message: 'No PDF was completed.', data: receipt().data }, 503],
    ['contradictory success', { success: true, code: 'PDF_RENDERER_UNAVAILABLE', error: 'PDF unavailable', message: 'No PDF was completed.' }, 503],
    ['another failure status', { code: 'PDF_RENDERER_UNAVAILABLE', error: 'PDF unavailable', message: 'No PDF was completed.' }, 502],
  ] as const)('retains uncertainty for a PDF code with %s', async (_name, body, status) => {
    apiRequest.mockImplementationOnce(async () => { throw new ApiRequestError('No PDF was completed.', status, body, 'PDF_RENDERER_UNAVAILABLE'); });
    const p = props(); render(<FileToVaultDialog {...p} />); submit();
    expect((await screen.findByTestId('ftv-error')).textContent).toMatch(/cannot confirm.*filed/i);
    expect((screen.getByTestId('ftv-submit') as HTMLButtonElement).disabled).toBe(true);
    submit(); expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(p.onFiled).not.toHaveBeenCalled();
  });

});

describe('File to vault retained result identity', () => {
  it('keeps the request project and UUID for navigation and never invents missing approval', async () => {
    const p = props(); render(<FileToVaultDialog {...p} />); submit();
    await screen.findByTestId('ftv-result');
    expect(apiRequest).toHaveBeenCalledWith('POST', `/api/authoring/docs/${SOURCE}/file-to-vault`, { format: 'pdf' });
    expect(screen.getByTestId('ftv-approval').textContent).toContain('did not report whether the approval carried');
    fireEvent.click(screen.getByTestId('ftv-open-vault'));
    expect(window.C2C_VAULT_TARGET).toEqual({ documentId: DOC_ID, programId: PID });
    expect(p.onNav).toHaveBeenCalledWith('vault');
  });

  it('keeps older data-envelope compatibility without inventing approval', async () => {
    apiRequest.mockImplementation(async () => response({ data: receipt().data, error: null }));
    const p = props(); render(<FileToVaultDialog {...p} />); submit();
    await screen.findByTestId('ftv-result');
    expect(screen.getByTestId('ftv-approval').textContent).toContain('did not report whether the approval carried');
    expect(p.onFiled).toHaveBeenCalledTimes(1);
  });
});

describe('File to vault current request ownership', () => {
  it('does not file a retained document from another existing shell project', () => {
    publishShellProject({ id: OTHER, title: 'Another program' });
    const p = props(); render(<FileToVaultDialog {...p} />);
    expect((screen.getByTestId('ftv-submit') as HTMLButtonElement).disabled).toBe(true);
    submit(); expect(apiRequest).not.toHaveBeenCalled();
  });

  it('keeps the standalone dialog usable when no shell project is selected', async () => {
    delete window.C2C_PROJECT;
    const p = props(); render(<FileToVaultDialog {...p} />); submit();
    await screen.findByTestId('ftv-result');
    fireEvent.click(screen.getByTestId('ftv-open-vault'));
    expect(window.C2C_VAULT_TARGET).toEqual({ documentId: DOC_ID, programId: PID });
    expect(p.onNav).toHaveBeenCalledWith('vault');
  });

  it('does not toast in a context retired by the synchronous filing callback', async () => {
    const p = props(); p.onFiled = vi.fn(() => publishShellProject({ id: OTHER }));
    render(<FileToVaultDialog {...p} />); submit();
    await act(async () => {});
    expect(p.onFiled).toHaveBeenCalledTimes(1);
    expect(p.fireToast).not.toHaveBeenCalled();
  });

  it('accepts a pending result across a genuine same-account bearer refresh', async () => {
    const pending = deferred<Response>(); apiRequest.mockImplementation(() => pending.promise);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).endsWith('/api/v1/auth/refresh')) return response({ accessToken: 'fixture-vault-refreshed', refreshToken: 'fixture-vault-refreshed-again', expiresIn: 3600 }, 200);
      throw new Error('Unexpected fixture route');
    }));
    const guard = authService.captureSessionReadGuard();
    const p = props(); render(<FileToVaultDialog {...p} />); submit();
    await act(async () => { expect(await authService.refreshToken()).toBe(true); });
    expect(guard.sameRevision()).toBe(true); expect(guard.credentialsCurrent()).toBe(false);
    await act(async () => { pending.resolve(response(receipt())); await pending.promise; });
    expect(screen.getByTestId('ftv-result')).toBeTruthy();
    expect(p.onFiled).toHaveBeenCalledTimes(1); expect(p.fireToast).toHaveBeenCalledTimes(1);
  });

  it.each(['document', 'document project', 'shell project', 'shell round trip', 'account', 'organization', 'logout'] as const)(
    'does not publish an old result after changing %s', async transition => {
      const pending = deferred<Response>(); apiRequest.mockImplementation(() => pending.promise);
      const p = props(); const view = render(<FileToVaultDialog {...p} />); submit();
      if (transition === 'document') view.rerender(<FileToVaultDialog {...p} docId={OTHER} />);
      else if (transition === 'document project') view.rerender(<FileToVaultDialog {...p} programId={OTHER} />);
      else act(() => {
        if (transition === 'shell project' || transition === 'shell round trip') {
          publishShellProject({ id: OTHER });
          if (transition === 'shell round trip') publishShellProject({ id: PID });
        } else if (transition === 'logout') authService.endSession(null);
        else authService.setToken('fixture-vault-author-b', { id: transition === 'account' ? '8' : '7', organizationId: transition === 'organization' ? '2' : '1' }, 'fixture-refresh-b', 3600);
      });
      await act(async () => { pending.resolve(response(receipt())); await pending.promise; });
      expect(screen.queryByTestId('ftv-result')).toBeNull();
      expect(screen.queryByTestId('ftv-error')).toBeNull();
      expect(p.onFiled).not.toHaveBeenCalled(); expect(p.fireToast).not.toHaveBeenCalled();
      expect(window.C2C_VAULT_TARGET).toBeUndefined();
    },
  );

  it('does not publish an old rejection after changing the source document', async () => {
    const pending = deferred<Response>(); apiRequest.mockImplementation(() => pending.promise);
    const p = props(); const view = render(<FileToVaultDialog {...p} />); submit();
    view.rerender(<FileToVaultDialog {...p} docId={OTHER} />);
    await act(async () => { pending.reject(new Error('lost reply')); await pending.promise.catch(() => {}); });
    expect(screen.queryByTestId('ftv-error')).toBeNull(); expect(p.fireToast).not.toHaveBeenCalled();
  });

  it('retires a confirmed navigation after leaving and returning to the shell project', async () => {
    const p = props(); render(<FileToVaultDialog {...p} />); submit();
    await screen.findByTestId('ftv-result');
    const oldControl = screen.getByTestId('ftv-open-vault');
    act(() => { publishShellProject({ id: OTHER }); publishShellProject({ id: PID }); });
    fireEvent.click(oldControl);
    expect(p.onNav).not.toHaveBeenCalled(); expect(window.C2C_VAULT_TARGET).toBeUndefined();
  });

  it('posts once when the submit action is activated twice before the reply', async () => {
    const pending = deferred<Response>(); apiRequest.mockImplementation(() => pending.promise);
    const p = props(); render(<FileToVaultDialog {...p} />);
    act(() => { submit(); submit(); });
    expect(apiRequest).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(response(receipt())); await pending.promise; });
    expect(p.onFiled).toHaveBeenCalledTimes(1);
  });
});
