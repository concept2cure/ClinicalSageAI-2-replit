// @vitest-environment jsdom
/**
 * The Vault says each refusal as what it is, not as a failed read and not as one another (S6 V1, 2026-11-05;
 * docs/evidence/SPINE/S6/2026-11-05-v1-refusals/).
 *
 * The founder: "A feature can be not licensed, not relevant to this project, blocked by missing evidence, or
 * unavailable to this user. Those are different conditions and should not be collapsed into a generic failure."
 *
 * Before: the project vault's read worded every 403 as "You don't have access … Ask an administrator", so a plan
 * that does not include the Vault (the module gate's 403 MODULE_NOT_LICENSED) read as a permission the person lacked,
 * and AnA was told the store had failed. The library search said "could not be verified" for every refusal. An upload
 * refused by the module gate said "Module access denied". The one read classifier (`readFailureFor`,
 * `mdx/hooks/useFetchJson.ts`) already told these apart; the 2026-10-29 refusal record handed the Vault on to it.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
type Published = { summary?: string; availableActions?: string[] };
const published = vi.hoisted(() => ({ current: null as null | Published }));
vi.mock('../surfaceContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../surfaceContext')>()),
  usePublishSurfaceContext: (_id: string, ctx: Published) => { published.current = ctx; },
}));

import { ApiRequestError, extractApiError } from '@/lib/queryClient';
import { Vault } from '../surfaces/Vault';
import { useVaultUpload } from '../useVaultUpload';
import { PID, ok, vaultPayload, props } from './_vault-surface-fixtures';
import { stubIngestXhr } from './_ingest-xhr-fake';

/* The bodies the server sends, verbatim in shape. */
const NOT_LICENSED = { error: 'Module access denied', code: 'MODULE_NOT_LICENSED', module: 'vault', modules: ['vault'], reason: 'vault: Not included in this plan' };
const OUT_OF_RELEASE = { error: { code: 'LAUNCH_SCOPE', message: 'This part of the product is not in this release.' } };
const ROLE = { error: 'Insufficient permissions' };
const FAILED = { error: { code: 'INTERNAL', message: 'Something went wrong' } };

const refuse = (status: number, body: unknown) => {
  const { message, code } = extractApiError(body, status);
  throw new ApiRequestError(message, status, body, code);
};

let onVault: () => Response;
let onLibrary: () => Response;
let onProjectSearch: () => Response;

beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' };
  published.current = null;
  onVault = () => ok(vaultPayload());
  onLibrary = () => ok({ success: true, data: { scope: 'verified-accessible-programs', query: 'x', total: 0, limit: 50, offset: 0, results: [] } });
  onProjectSearch = () => ok({ success: true, data: { query: 'x', total: 0, limit: 100, offset: 0, results: [] } });
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === `/api/c2c/project-vault/${PID}`) return onVault();
    if (url.startsWith('/api/c2c/project-vault/search?')) return onLibrary();
    if (url.startsWith(`/api/c2c/project-vault/${PID}/search`)) return onProjectSearch();
    return ok({ success: true, data: null });
  });
});
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; vi.unstubAllGlobals(); });

const text = () => document.body.textContent ?? '';

describe('S6 V1: the project vault read words each refusal as itself', () => {
  it('a plan without the Vault says it is not enabled, not that the person lacks access, and offers no retry', async () => {
    onVault = () => refuse(403, NOT_LICENSED);
    render(<Vault {...props()} />);
    expect(await screen.findByText('Not enabled for your organization')).toBeTruthy();
    expect(text()).toContain('This feature is not enabled for your organization, so the project vault was not read.');
    expect(text()).not.toMatch(/don.t have access|Ask an administrator/);
    expect(text()).not.toContain('Not included in this plan');
    expect(screen.queryByRole('button', { name: /try again|retry/i })).toBeNull();
    expect(published.current?.summary).toMatch(/not enabled for your organization/i);
    expect(published.current?.summary).not.toMatch(/because of a failure/);
    expect(published.current?.availableActions ?? []).not.toContain('Retry the vault read');
  });

  it('a part outside this release says so', async () => {
    onVault = () => refuse(403, OUT_OF_RELEASE);
    render(<Vault {...props()} />);
    expect(await screen.findByText('Not in this release')).toBeTruthy();
    expect(text()).not.toMatch(/don.t have access/);
    expect(screen.queryByRole('button', { name: /try again|retry/i })).toBeNull();
  });

  it('an uncoded 403 is the person’s role', async () => {
    onVault = () => refuse(403, ROLE);
    render(<Vault {...props()} />);
    expect(await screen.findByText('Your role cannot do this')).toBeTruthy();
    expect(published.current?.summary).toMatch(/your role/i);
  });

  it('a project not in this organization is still said as not found, and a failure still offers a retry', async () => {
    onVault = () => refuse(404, { error: 'Project not found' });
    const { unmount } = render(<Vault {...props()} />);
    expect(await screen.findByText(/wasn’t found in your organization/)).toBeTruthy();
    unmount();
    onVault = () => refuse(500, FAILED);
    render(<Vault {...props()} />);
    expect(await screen.findByText('Couldn\'t load the project vault')).toBeTruthy();
    expect(screen.getByRole('button', { name: /try again|retry/i })).toBeTruthy();
    expect(published.current?.availableActions).toContain('Retry the vault read');
  });
});

describe('S6 V1: the searches word a refusal as itself, never as an unverified result', () => {
  it('the library search across projects', async () => {
    onLibrary = () => refuse(403, NOT_LICENSED);
    render(<Vault {...props()} />);
    fireEvent.click(await screen.findByLabelText('All my projects'));
    fireEvent.change(screen.getByLabelText('Search this vault'), { target: { value: 'stability' } });
    const list = await screen.findByTestId('vault-library-results');
    const alert = await within(list).findByRole('alert');
    expect(alert.textContent).toContain('This feature is not enabled for your organization, so the library was not read.');
    expect(alert.textContent).not.toContain('could not be verified');
  });

  it('the project search', async () => {
    onProjectSearch = () => refuse(403, OUT_OF_RELEASE);
    render(<Vault {...props()} />);
    fireEvent.change(await screen.findByLabelText('Search this vault'), { target: { value: 'stability' } });
    expect(await screen.findByText(/This part of the product is not in this release, so the vault was not read\./)).toBeTruthy();
    expect(text()).not.toContain('could not be verified');
  });

  it('a failed search is still an unverified result', async () => {
    onLibrary = () => refuse(500, FAILED);
    render(<Vault {...props()} />);
    fireEvent.click(await screen.findByLabelText('All my projects'));
    fireEvent.change(screen.getByLabelText('Search this vault'), { target: { value: 'stability' } });
    const list = await screen.findByTestId('vault-library-results');
    expect((await within(list).findByRole('alert')).textContent).toContain('The library search could not be verified. This is not a result of zero matches.');
  });
});

describe('S6 V1: an upload the module gate refuses says the Vault is not enabled', () => {
  it('reads the gate’s top-level code, and never shows its module id', async () => {
    stubIngestXhr(vi.fn(async () => ({ status: 403, json: async () => NOT_LICENSED })));
    const { result } = renderHook(() => useVaultUpload(PID));
    await act(async () => {
      const outcome = await result.current.upload([new File(['x'], 'cover.pdf')]);
      expect(outcome.failed).toEqual([{ name: 'cover.pdf', reason: 'the Vault is not enabled for your organization' }]);
    });
    expect(result.current.note?.text).toMatch(/Not filed/);
    expect(result.current.note?.text).not.toMatch(/Module access denied|vault: Not included/);
  });

  it('a role refusal with its own sentence keeps it', async () => {
    stubIngestXhr(vi.fn(async () => ({ status: 403, json: async () => ({ error: { code: 'VAULT_WRITE_ROLE_REQUIRED', message: 'Filing into the Vault needs an author role.' } }) })));
    const { result } = renderHook(() => useVaultUpload(PID));
    await act(async () => {
      expect((await result.current.upload([new File(['x'], 'cover.pdf')])).failed).toEqual([{ name: 'cover.pdf', reason: 'Filing into the Vault needs an author role.' }]);
    });
  });
});
