// @vitest-environment jsdom
/** Library writes retain uncertain attempts until a current read and deliberate review. */
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return { ...actual, useAuthUser: () => actual.authService.getUser() };
});
import { authService } from '@/services/portal/authService';
import { BUNDLES, SUBS, ok, openTab, renderCanvas, requestCalls, route } from './_insights-library-fixture';
import { createBundle, createSubscription, setSubscriptionEnabled, type CreateSubscriptionBody } from '../surfaces/insightsLibraryModel';
import { publishShellProject } from '../shellProject';

const ACTOR = { id: '7', organizationId: '1', displayName: 'Reporting Reader', email: 'reader@example.test', permissions: ['governed:write', 'report:finalize'], mfaEnabled: false };
const BODY: CreateSubscriptionBody = { reportTypeId: SUBS[0].reportTypeId, scopeType: 'project', scopeId: '11', schedule: { cadence: 'weekly', hour: 8, minute: 0, dayOfWeek: 1, timeZone: 'UTC' }, format: 'in_app', channel: 'platform' };
const scheduleReceipt = (body: CreateSubscriptionBody = BODY) => ({ ...SUBS[0], ...body, enabled: body.enabled ?? true, recipients: body.recipients ?? [] });
const response = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const calls = (method: string, prefix: string) => requestCalls(apiRequest, method, prefix);
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
async function prepareSchedule() {
  await renderCanvas(); await openTab(/Schedules/);
  fireEvent.click(await screen.findByRole('button', { name: /New schedule/ }));
  fireEvent.change(screen.getByLabelText('Report'), { target: { value: BODY.reportTypeId } });
  fireEvent.change(screen.getByLabelText('Timezone'), { target: { value: 'UTC' } });
}
async function prepareBundle() {
  await renderCanvas(); await openTab(/Run history/);
  fireEvent.click((await screen.findAllByRole('checkbox'))[0]);
  fireEvent.click(await screen.findByRole('button', { name: /Bundle 1 report/ }));
  fireEvent.change(await screen.findByLabelText('Bundle name'), { target: { value: 'Reviewed pack' } });
}
beforeEach(() => {
  apiRequest.mockReset().mockImplementation(async (_method: string, url: string) => route(url));
  authService.setToken('fixture-session', ACTOR, 'fixture-refresh', 3600);
  delete window.C2C_PROJECT;
});
afterEach(() => { cleanup(); authService.endSession(null); vi.unstubAllGlobals(); delete window.C2C_PROJECT; });

describe('reporting library mutation receipts', () => {
  it.each([
    ['missing row', {}], ['list in place of row', { data: SUBS }],
    ['wrong scope', { data: { ...scheduleReceipt(), scopeId: '22' } }],
    ['wrong recurrence', { data: { ...scheduleReceipt(), schedule: { ...BODY.schedule, hour: 12 } } }],
    ['contradictory envelope', { success: false, error: 'Rejected', data: scheduleReceipt() }],
  ])('does not confirm a schedule with %s', async (_label, body) => {
    apiRequest.mockResolvedValue(response(201, body));
    expect(await createSubscription(BODY)).toMatchObject({ ok: false, unconfirmed: true });
  });
  it('accepts the actual schedule identity and recurrence receipt', async () => {
    const row = scheduleReceipt(); apiRequest.mockResolvedValue(response(201, { data: row }));
    expect(await createSubscription(BODY)).toMatchObject({ ok: true, data: row });
  });
  it.each([{ id: 8, enabled: false }, { id: 7, enabled: true }])('does not confirm mismatched enablement %j', async patch => {
    apiRequest.mockResolvedValue(ok({ data: { ...SUBS[0], ...patch } }));
    expect(await setSubscriptionEnabled(7, false)).toMatchObject({ ok: false, unconfirmed: true });
  });
  it('accepts a matching pause receipt', async () => {
    apiRequest.mockResolvedValue(ok({ data: { ...SUBS[0], enabled: false } }));
    expect(await setSubscriptionEnabled(7, false)).toMatchObject({ ok: true, data: { id: 7, enabled: false } });
  });
  it('does not accept a bundle containing other selected runs', async () => {
    apiRequest.mockResolvedValue(response(201, { data: { ...BUNDLES[0], runIds: [42] } }));
    expect(await createBundle(BUNDLES[0].name, [41])).toMatchObject({ ok: false, unconfirmed: true });
  });
  it('accepts a matching canonical bundle receipt', async () => {
    apiRequest.mockResolvedValue(response(201, { data: BUNDLES[0] }));
    expect(await createBundle(BUNDLES[0].name, [41])).toMatchObject({ ok: true, data: BUNDLES[0] });
  });
  it('matches the server-normalized trimmed bundle name', async () => {
    apiRequest.mockResolvedValue(response(201, { data: BUNDLES[0] }));
    expect(await createBundle(`  ${BUNDLES[0].name}  `, [41])).toMatchObject({ ok: true });
  });
  it.each([
    { ...BUNDLES[0], bundleId: 'not-a-canonical-id' },
    { ...BUNDLES[0], projectIds: [11, 11] },
    { ...BUNDLES[0], runIds: [41, 41], items: [BUNDLES[0].items[0], BUNDLES[0].items[0]] },
    { ...BUNDLES[0], runIds: [41, 42], items: [BUNDLES[0].items[0], { ...BUNDLES[0].items[0], runId: 42 }] },
  ])('rejects malformed or conflicting bundle identities %#', async row => {
    apiRequest.mockResolvedValue(response(201, { data: row }));
    expect(await createBundle(BUNDLES[0].name, row.runIds)).toMatchObject({ ok: false, unconfirmed: true });
  });
  it('uses neutral uncertainty for lost responses', async () => {
    apiRequest.mockRejectedValue(new TypeError('connection lost'));
    const result = await createSubscription(BODY);
    expect(result).toMatchObject({ ok: false, unconfirmed: true, status: 0 });
    expect(result.message).toMatch(/may have (completed|been saved)/i);
    expect(result.message).not.toMatch(/didn't reach|not saved|not created/i);
  });
  it.each([
    [503, { success: false, error: { code: 'REPORT_BUNDLE_NOT_RECORDED', message: 'Not recorded' } }],
    [503, { success: false, error: { code: 'REPORT_BUNDLE_NOT_RECORDED', message: 'Not recorded' }, recordingOutcome: 'not-recorded', retryAllowed: false }],
    [503, { success: false, error: { code: 'REPORT_BUNDLE_NOT_RECORDED', message: 'Not recorded' }, recordingOutcome: 'not-recorded', retryAllowed: true, data: BUNDLES[0] }],
    [500, { error: 'Server error' }],
  ])('does not infer absence from status %s and an unproven envelope', async (status, body) => {
    apiRequest.mockResolvedValue(response(status, body));
    expect(await createBundle('Reviewed pack', [41])).toMatchObject({ ok: false, unconfirmed: true });
  });
  it('allows a deliberate retry after the new acknowledged rollback receipt', async () => {
    apiRequest.mockResolvedValue(response(503, { success: false, error: { code: 'REPORT_BUNDLE_NOT_RECORDED', message: 'Bundle was not recorded.' }, recordingOutcome: 'not-recorded', retryAllowed: true }));
    expect(await createBundle('Reviewed pack', [41])).toMatchObject({ ok: false, unconfirmed: false, code: 'REPORT_BUNDLE_NOT_RECORDED' });
  });
  it.each([[403, 'Editor role required', undefined], [413, 'Choose fewer reports.', 'REPORT_BUNDLE_TOO_LARGE']])('retains the precise %s refusal', async (status, message, code) => {
    apiRequest.mockResolvedValue(response(status as number, { error: message, ...(code ? { code } : {}) }));
    expect(await createBundle('Reviewed pack', [41])).toMatchObject({ ok: false, unconfirmed: false, message });
  });
});

describe('reporting library recovery in the existing canvas', () => {
  it('retains an uncertain schedule across tabs and requires fresh read plus review', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => method === 'POST' ? response(201, {}) : route(url));
    await prepareSchedule(); fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    await screen.findByRole('button', { name: 'Check schedules' });
    expect(screen.queryByText('Schedule saved.')).toBeNull();
    await openTab(/Bundles/); await openTab(/Schedules/);
    expect((screen.getByRole('button', { name: 'Save schedule' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Report') as HTMLSelectElement).value).toBe(BODY.reportTypeId);
    fireEvent.click(screen.getByRole('button', { name: 'Check schedules' }));
    const reviewed = await screen.findByRole('button', { name: /Reviewed schedules.*allow another request/i });
    expect((screen.getByRole('button', { name: 'Save schedule' }) as HTMLButtonElement).disabled).toBe(true);
    expect(calls('POST', '/api/insights/subscriptions')).toHaveLength(1);
    fireEvent.click(reviewed);
    expect((screen.getByRole('button', { name: 'Save schedule' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('keeps a pending schedule draft and same-frame dispatch guard across tabs', async () => {
    const pending = deferred<Response>();
    apiRequest.mockImplementation(async (method: string, url: string) => method === 'POST' ? pending.promise : route(url));
    await prepareSchedule(); const button = screen.getByRole('button', { name: 'Save schedule' });
    act(() => { button.click(); button.click(); });
    await openTab(/Bundles/); await openTab(/Schedules/);
    expect((screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement).disabled).toBe(true);
    expect(calls('POST', '/api/insights/subscriptions')).toHaveLength(1);
    await act(async () => pending.resolve(response(201, {})));
    await screen.findByRole('button', { name: 'Check schedules' });
  });
  it('holds uncertain bundle picks/name across tabs and never announces success', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => method === 'POST' ? response(500, { error: 'Server error' }) : route(url));
    await prepareBundle(); fireEvent.click(screen.getByRole('button', { name: 'Create bundle' }));
    await screen.findByRole('button', { name: 'Check bundles' });
    await openTab(/Schedules/); await openTab(/Bundles/);
    expect((screen.getByLabelText('Bundle name') as HTMLInputElement).value).toBe('Reviewed pack');
    expect((screen.getByRole('button', { name: 'Create bundle' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Clear selection' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('Bundle created.')).toBeNull();
    expect(calls('POST', '/api/report-os/bundles')).toHaveLength(1);
  });
  it('serializes per-row pause attempts and retains an uncertain pause for review', async () => {
    const pending = deferred<Response>();
    apiRequest.mockImplementation(async (method: string, url: string) => method === 'PATCH' ? pending.promise : route(url));
    await renderCanvas(); await openTab(/Schedules/);
    const button = await screen.findByRole('button', { name: /Pause/ });
    act(() => { button.click(); button.click(); });
    expect(calls('PATCH', '/api/insights/subscriptions/7')).toHaveLength(1);
    await act(async () => pending.resolve(response(500, {})));
    await screen.findByRole('button', { name: 'Check schedules' });
    expect((screen.getByRole('button', { name: /Pause/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('reporting confirmed receipts across library tab remounts', () => {
  it.each([true, false])('consumes a matched schedule confirmation with return-before-response=%s', async returnBefore => {
    const pending = deferred<Response>(); let submitted = BODY; let stored = false;
    apiRequest.mockImplementation(async (method: string, url: string, body?: CreateSubscriptionBody) => {
      if (method === 'POST') { submitted = body!; return pending.promise; }
      if (stored && url === '/api/insights/subscriptions') return ok({ data: [scheduleReceipt(submitted)] });
      return route(url);
    });
    await prepareSchedule(); const save = screen.getByRole('button', { name: 'Save schedule' });
    act(() => { save.click(); save.click(); });
    await openTab(/Bundles/);
    if (returnBefore) await openTab(/Schedules/);
    stored = true;
    await act(async () => pending.resolve(response(201, { data: scheduleReceipt(submitted) })));
    if (!returnBefore) await openTab(/Schedules/);
    await screen.findByText('Schedule saved.');
    await screen.findByRole('table');
    expect(screen.queryByTestId('rl-schedule-form')).toBeNull();
    expect(calls('POST', '/api/insights/subscriptions')).toHaveLength(1);
  });
  it.each([true, false])('consumes a matched bundle confirmation with return-before-response=%s', async returnBefore => {
    const pending = deferred<Response>(); let stored = false;
    const bundle = { ...BUNDLES[0], name: 'Reviewed pack' };
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'POST') return pending.promise;
      if (stored && url === '/api/report-os/bundles') return ok({ data: [bundle] });
      return route(url);
    });
    await prepareBundle(); const save = screen.getByRole('button', { name: 'Create bundle' });
    act(() => { save.click(); save.click(); });
    await openTab(/Schedules/);
    if (returnBefore) await openTab(/Bundles/);
    stored = true;
    await act(async () => pending.resolve(response(201, { data: bundle })));
    if (!returnBefore) await openTab(/Bundles/);
    await screen.findByText('Bundle created.'); await screen.findByText('Reviewed pack');
    expect(screen.queryByTestId('rl-bundle-form')).toBeNull();
    expect(calls('POST', '/api/report-os/bundles')).toHaveLength(1);
  });
});

describe('reporting library current reads and ownership', () => {
  it.each([
    { data: null }, { data: {} }, { data: [{ id: 7 }] },
    { data: [SUBS[0], { ...SUBS[0], enabled: false }] },
    { success: false, error: 'Store unavailable', data: SUBS },
    { data: SUBS, meta: { pendingStore: true } },
  ])('does not release a schedule hold after a malformed or contradictory read %#', async envelope => {
    let checking = false;
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'POST') return response(500, {});
      if (checking && url === '/api/insights/subscriptions') return ok(envelope);
      return route(url);
    });
    await prepareSchedule(); fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    const check = await screen.findByRole('button', { name: 'Check schedules' }); checking = true; fireEvent.click(check);
    await screen.findByText(/Current schedules could not be checked/);
    expect(screen.queryByRole('button', { name: /Reviewed schedules/ })).toBeNull();
    expect((screen.getByRole('button', { name: 'Save schedule' }) as HTMLButtonElement).disabled).toBe(true);
    expect(calls('POST', '/api/insights/subscriptions')).toHaveLength(1);
  });
  it('a failed check revokes earlier review eligibility', async () => {
    let failCheck = false;
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'POST') return response(500, {});
      if (failCheck && url === '/api/insights/subscriptions') return response(503, {});
      return route(url);
    });
    await prepareSchedule(); fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Check schedules' }));
    await screen.findByRole('button', { name: /Reviewed schedules/ });
    failCheck = true; fireEvent.click(screen.getByRole('button', { name: 'Check schedules' }));
    await screen.findByText(/Current schedules could not be checked/);
    expect(screen.queryByRole('button', { name: /Reviewed schedules/ })).toBeNull();
  });
  it('invalidates earlier review synchronously when a fresh check starts', async () => {
    const pending = deferred<Response>(); let deferCheck = false;
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'POST') return response(500, {});
      if (deferCheck && url === '/api/insights/subscriptions') return pending.promise;
      return route(url);
    });
    await prepareSchedule(); fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Check schedules' }));
    const review = await screen.findByRole('button', { name: /Reviewed schedules/ });
    const check = screen.getByRole('button', { name: 'Check schedules' }); deferCheck = true;
    act(() => { check.click(); review.click(); });
    await act(async () => pending.resolve(response(503, {})));
    expect((screen.getByRole('button', { name: 'Save schedule' }) as HTMLButtonElement).disabled).toBe(true);
    expect(calls('POST', '/api/insights/subscriptions')).toHaveLength(1);
  });
  it('an absent record in a bounded bundle register still requires deliberate review', async () => {
    let checking = false;
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'POST') return response(503, { error: { code: 'REPORT_BUNDLE_OUTCOME_UNKNOWN', message: 'Unconfirmed' } });
      if (checking && url === '/api/report-os/bundles') return ok({ data: [], meta: { truncated: true, limit: 200, projectLimit: 100 } });
      return route(url);
    });
    await prepareBundle(); fireEvent.click(screen.getByRole('button', { name: 'Create bundle' }));
    const check = await screen.findByRole('button', { name: 'Check bundles' }); checking = true; fireEvent.click(check);
    const reviewed = await screen.findByRole('button', { name: /Reviewed bundles/ });
    expect((screen.getByRole('button', { name: 'Create bundle' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('rl-bundles-recovery').textContent).toMatch(/does not prove/);
    expect(calls('POST', '/api/report-os/bundles')).toHaveLength(1);
    fireEvent.click(reviewed);
    expect((screen.getByRole('button', { name: 'Create bundle' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('reporting library late completions and current account', () => {
  it('a late confirmed schedule cannot toast or populate a replacement program', async () => {
    const pending = deferred<Response>(); let submitted: CreateSubscriptionBody = BODY;
    apiRequest.mockImplementation(async (method: string, url: string, body?: CreateSubscriptionBody) => {
      if (method === 'POST') { submitted = body!; return pending.promise; }
      return route(url);
    });
    await prepareSchedule(); fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    await act(async () => publishShellProject({ id: '22222222-2222-4222-8222-222222222222', code: 'NEW-PROGRAM' }));
    await act(async () => pending.resolve(response(201, { data: scheduleReceipt(submitted) })));
    expect(screen.queryByText('Schedule saved.')).toBeNull();
    expect(screen.queryByTestId('rl-schedule-form')).toBeNull();
  });
  it('a late bundle completion does not clear selections made for a replacement program', async () => {
    const pending = deferred<Response>();
    apiRequest.mockImplementation(async (method: string, url: string) => method === 'POST' ? pending.promise : route(url));
    await prepareBundle(); fireEvent.click(screen.getByRole('button', { name: 'Create bundle' }));
    await act(async () => publishShellProject({ id: '22222222-2222-4222-8222-222222222222', code: 'NEW-PROGRAM' }));
    await openTab(/Run history/); fireEvent.click((await screen.findAllByRole('checkbox'))[1]);
    fireEvent.click(await screen.findByRole('button', { name: /Bundle 1 report/ }));
    fireEvent.change(await screen.findByLabelText('Bundle name'), { target: { value: 'Replacement program pack' } });
    await act(async () => pending.resolve(response(201, { data: { ...BUNDLES[0], name: 'Reviewed pack' } })));
    expect((screen.getByLabelText('Bundle name') as HTMLInputElement).value).toBe('Replacement program pack');
    expect(screen.getByTestId('rl-bundle-form').textContent).toMatch(/1 report chosen/);
    expect(screen.queryByText('Bundle created.')).toBeNull();
  });
  it('does not reveal an old account attempt in a replacement account', async () => {
    const pending = deferred<Response>();
    apiRequest.mockImplementation(async (method: string, url: string) => method === 'POST' ? pending.promise : route(url));
    await prepareBundle(); fireEvent.click(screen.getByRole('button', { name: 'Create bundle' }));
    await act(async () => authService.setToken('fixture-replacement', { ...ACTOR, id: '8', displayName: 'Replacement Reader' }, 'fixture-replacement-refresh', 3600));
    await act(async () => pending.resolve(response(500, {})));
    await openTab(/Bundles/);
    expect(screen.queryByDisplayValue('Reviewed pack')).toBeNull();
    expect(screen.queryByTestId('rl-bundles-recovery')).toBeNull();
    expect(screen.queryByText('Bundle created.')).toBeNull();
  });
  it('accepts a matching schedule receipt after ordinary same-session bearer refresh', async () => {
    const pending = deferred<Response>(); let submitted = BODY;
    apiRequest.mockImplementation(async (method: string, url: string, body?: CreateSubscriptionBody) => {
      if (method === 'POST') { submitted = body!; return pending.promise; }
      return route(url);
    });
    await prepareSchedule(); fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ accessToken: 'fixture-rotated', refreshToken: 'fixture-rotated-refresh', expiresIn: 3600 }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    await act(async () => { expect(await authService.refreshToken()).toBe(true); });
    await act(async () => pending.resolve(response(201, { data: scheduleReceipt(submitted) })));
    await screen.findByText('Schedule saved.');
    expect(screen.queryByTestId('rl-schedule-form')).toBeNull();
    expect(calls('POST', '/api/insights/subscriptions')).toHaveLength(1);
  });
  it('allows a second explicit bundle attempt after a definite refusal, with no automatic retry', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => method === 'POST' ? response(503, { success: false, error: { code: 'REPORT_BUNDLE_NOT_RECORDED', message: 'Bundle was not recorded.' }, recordingOutcome: 'not-recorded', retryAllowed: true }) : route(url));
    await prepareBundle(); fireEvent.click(screen.getByRole('button', { name: 'Create bundle' }));
    await screen.findByRole('alert');
    expect(calls('POST', '/api/report-os/bundles')).toHaveLength(1);
    expect((screen.getByRole('button', { name: 'Create bundle' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Create bundle' }));
    await waitFor(() => expect(calls('POST', '/api/report-os/bundles')).toHaveLength(2));
  });

});
