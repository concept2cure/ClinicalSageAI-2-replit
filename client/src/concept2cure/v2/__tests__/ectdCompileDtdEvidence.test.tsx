// @vitest-environment jsdom
/** Package DTD evidence belongs to the exact compiled bytes and current actor/project. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const { apiRequest, auth } = vi.hoisted(() => ({ apiRequest: vi.fn(), auth: { revision: 1, actor: 7 } }));
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', () => ({ authService: {
  getUser: () => ({ id: auth.actor, organizationId: 4 }),
  captureSessionReadGuard: () => { const revision = auth.revision; return { sameRevision: () => revision === auth.revision }; },
  on: () => () => {},
} }));

import { EctdCompile } from '../surfaces/EctdCompile';
import { publishShellProject } from '../shellProject';
import { stashNavParamsForTarget } from '../navParams';
import { ok, props, SPINE_STATUS, SPINE_COMPILE } from './ectdCompile.fixtures';

const A = '9a7f0b10-0000-4000-8000-0000000000aa';
const B = '9a7f0b10-0000-4000-8000-0000000000bb';
const PATHS = ['index.xml', 'm1/us/us-regional.xml', 'm5/stf-study-101.xml'];
const DTDS = ['ich-ectd-3-2.dtd', 'us-regional-v3-3.dtd', 'ich-stf-v2-2.dtd'];
const STYLESHEETS = ['ectd-2-0.xsl', 'us-regional.xsl', 'ich-stf-stylesheet.xsl'];
const lint = (mode: 'well-formed' | 'dtd', valid = true, ran = true, errors: string[] = []) => ({ mode, valid, ran, errors });
const EVIDENCE = {
  version: 1, expectedFiles: PATHS,
  files: PATHS.map(relPath => ({ relPath, wellFormed: lint('well-formed'), doctype: { valid: true, errors: [] }, dtd: lint('dtd') })),
  integrity: { verified: [...DTDS, ...STYLESHEETS], mismatched: [], missingFiles: [], unlistedFiles: [], ok: true },
  passed: true,
};
const DTD = { required: DTDS, present: DTDS, missing: [], requiredStylesheets: STYLESHEETS, presentStylesheets: STYLESHEETS, missingStylesheets: [], selfContained: true, validation: EVIDENCE };
const COMPILE = { ...SPINE_COMPILE, package: { ...SPINE_COMPILE.package, dtdStatus: DTD } };
const ROW = { id: 3, compilation_name: 'Earlier package', compilation_type: 'initial', status: 'completed', version: '1', compiled_at: null, created_at: null, sequence_number: '0000', has_manifest: true };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function setup(compile: unknown = COMPILE, history: unknown[] = []) {
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'GET' && path.includes('/status')) return ok(SPINE_STATUS);
    if (method === 'GET' && path.endsWith('/history')) return ok({ compilations: history });
    if (method === 'POST' && path.endsWith('/compile')) return ok(compile);
    return ok({});
  });
}
async function compile() {
  await screen.findByRole('button', { name: /Compile eCTD/ });
  fireEvent.click(screen.getByRole('button', { name: /Compile eCTD/ }));
  return screen.findByRole('region', { name: 'Package DTD validation' });
}
beforeEach(() => {
  apiRequest.mockReset(); auth.revision = 1; auth.actor = 7;
  publishShellProject({ id: A, title: 'Program A' });
});
afterEach(() => { cleanup(); delete window.C2C_PROJECT; delete window.C2C_NAV_PARAMS; });

describe('existing compiled-package DTD evidence', () => {
  it('shows actual index, regional and STF execution, validity and integrity', async () => {
    setup(); render(<EctdCompile {...props()} />);
    const proof = await compile();
    expect(within(proof).getByText('DTD validation passed')).toBeTruthy();
    for (const path of PATHS) expect(within(proof).getByText(path)).toBeTruthy();
    expect(within(proof).getAllByText('Ran · valid')).toHaveLength(3);
    expect(within(proof).getByText(/Supportive-file integrity verified/)).toBeTruthy();
  });

  it('shows invalid STF diagnostics and integrity gaps despite an aggregate pass claim', async () => {
    const evidence = { ...EVIDENCE, files: EVIDENCE.files.map(file => file.relPath.includes('/stf-') ? { ...file, dtd: lint('dtd', false, true, ['STF study-identifier content is invalid']) } : file), integrity: { ...EVIDENCE.integrity, ok: false, missingFiles: ['util/dtd/ich-stf-v2-2.dtd'] } };
    setup({ ...COMPILE, package: { ...COMPILE.package, dtdStatus: { ...DTD, validation: evidence } } });
    render(<EctdCompile {...props()} />); const proof = await compile();
    expect(within(proof).queryByText('DTD validation passed')).toBeNull();
    expect(within(proof).getByText('STF study-identifier content is invalid')).toBeTruthy();
    expect(within(proof).getByText(/util\/dtd\/ich-stf-v2-2.dtd/)).toBeTruthy();
  });

  it.each([
    undefined,
    { ...DTD, validation: undefined },
    { ...DTD, validation: { ...EVIDENCE, expectedFiles: [], files: [] } },
    { ...DTD, validation: { ...EVIDENCE, files: EVIDENCE.files.slice(0, 2) } },
    { ...DTD, validation: { ...EVIDENCE, files: EVIDENCE.files.map(file => ({ ...file, dtd: lint('dtd', true, false, ['xmllint not available']) })) } },
    { ...DTD, validation: { ...EVIDENCE, files: EVIDENCE.files.map(file => ({ ...file, dtd: lint('well-formed') })) } },
    { ...DTD, validation: { ...EVIDENCE, files: 'malformed' } },
    { ...DTD, requiredStylesheets: undefined, presentStylesheets: undefined },
    { ...DTD, validation: { ...EVIDENCE, integrity: { ...EVIDENCE.integrity, verified: [] } } },
  ])('never reports legacy, absent, incomplete or unexecuted evidence as a pass: %j', async dtdStatus => {
    setup({ ...COMPILE, package: { ...COMPILE.package, dtdStatus } });
    render(<EctdCompile {...props()} />); const proof = await compile();
    expect(within(proof).queryByText('DTD validation passed')).toBeNull();
    expect(proof.textContent).toMatch(/unverified|not recorded|did not run|incomplete/i);
  });

  it('keeps historical absence unverified and labels recorded proof with its package hash', async () => {
    setup(COMPILE, [ROW, { ...ROW, id: 4, compilation_name: 'Recorded package', packageDtdValidation: { packageSha256: 'a'.repeat(64), dtdStatus: DTD } }]);
    render(<EctdCompile {...props()} />);
    const legacy = await screen.findByRole('region', { name: 'DTD validation for Earlier package' });
    expect(legacy.textContent).toMatch(/not recorded|unverified/i);
    const recorded = screen.getByRole('region', { name: 'DTD validation for Recorded package' });
    expect(recorded.textContent).toContain('a'.repeat(64));
    expect(within(recorded).getByText('DTD validation passed')).toBeTruthy();
  });

  it.each([
    { regionalStatus: undefined, dtdStatus: DTD, expected: /Regional backbone: unverified/ },
    { regionalStatus: { region: 'fda', file: 'm1/us/us-regional.xml', regionConformant: true }, dtdStatus: undefined, expected: /Regional backbone: unverified/ },
    { regionalStatus: { region: 'fda', file: 'm1/us/us-regional.xml', regionConformant: false, conformanceGap: 'Applicant contact is not recorded.' }, dtdStatus: DTD, expected: /Applicant contact is not recorded/ },
    { regionalStatus: { region: 'kr', file: 'm1/kr/kr-regional.xml', regionConformant: false, placeholderOf: 'ema' }, dtdStatus: DTD, expected: /placeholder using ema/ },
    { regionalStatus: { region: 'fda', file: 'm1/us/us-regional.xml', regionConformant: true }, dtdStatus: DTD, expected: /Regional backbone: conformant/ },
  ])('renders the recorded regional fact with DTD proof rather than inferring it from region: %j', async ({ regionalStatus, dtdStatus, expected }) => {
    setup({ ...COMPILE, package: { ...COMPILE.package, regionalStatus, dtdStatus } });
    render(<EctdCompile {...props()} />); await compile();
    expect(screen.getByText(expected)).toBeTruthy();
  });
});

describe('compile DTD proof ownership', () => {
  it.each(['success', 'refusal'])('drops a delayed compile %s across project A → B → A', async outcome => {
    const late = deferred<Response>(); setup();
    const original = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, path: string, body: unknown) => method === 'POST' && path.endsWith('/compile') ? late.promise : original(method, path, body));
    render(<EctdCompile {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Compile eCTD/ }));
    await act(async () => { publishShellProject({ id: B }); });
    await act(async () => { publishShellProject({ id: A }); });
    await act(async () => { late.resolve(outcome === 'success' ? ok(COMPILE) : ok({ error: { message: 'Former project refusal' } }, 403)); await late.promise; });
    expect(screen.queryByRole('region', { name: 'Package DTD validation' })).toBeNull();
    expect(screen.queryByText('Compilation complete')).toBeNull();
    expect(screen.queryByText(/Former project refusal/)).toBeNull();
  });

  it('drops delayed history after actor revision even when the same project returns', async () => {
    const late = deferred<Response>(); setup();
    const original = apiRequest.getMockImplementation()!;
    let first = true;
    apiRequest.mockImplementation((method: string, path: string, body: unknown) => {
      if (path.endsWith('/history') && first) { first = false; return late.promise; }
      return original(method, path, body);
    });
    const view = render(<EctdCompile {...props()} />);
    await waitFor(() => expect(first).toBe(false));
    auth.revision += 1; auth.actor = 8;
    view.rerender(<EctdCompile {...props()} />);
    await act(async () => { late.resolve(ok({ compilations: [{ ...ROW, compilation_name: 'Former actor private proof' }] })); await late.promise; });
    expect(screen.queryByText('Former actor private proof')).toBeNull();
  });

  it('consumes the opened sequence once and does not carry it into another project visit', async () => {
    setup(); stashNavParamsForTarget('ectd-compile', { sequenceId: '21' });
    render(<EctdCompile {...props()} />);
    await waitFor(() => expect(apiRequest.mock.calls.some(call => String(call[1]).endsWith('/status?sequenceId=21'))).toBe(true));
    await act(async () => { publishShellProject({ id: B }); });
    await waitFor(() => expect(apiRequest.mock.calls.some(call => call[1] === `/api/ectd-compile/${B}/status`)).toBe(true));
    expect(apiRequest.mock.calls.some(call => call[1] === `/api/ectd-compile/${B}/status?sequenceId=21`)).toBe(false);
  });

  it('keeps the newer post-compile history when an earlier read settles last', async () => {
    const late = deferred<Response>(); setup(COMPILE, [{ ...ROW, compilation_name: 'Current compilation proof' }]);
    const original = apiRequest.getMockImplementation()!;
    let first = true;
    apiRequest.mockImplementation((method: string, path: string, body: unknown) => {
      if (path.endsWith('/history') && first) { first = false; return late.promise; }
      return original(method, path, body);
    });
    render(<EctdCompile {...props()} />); await compile();
    expect(await screen.findByText('Current compilation proof')).toBeTruthy();
    await act(async () => { late.resolve(ok({ compilations: [{ ...ROW, compilation_name: 'Obsolete earlier history' }] })); await late.promise; });
    expect(screen.queryByText('Obsolete earlier history')).toBeNull();
    expect(screen.getByText('Current compilation proof')).toBeTruthy();
  });
});
