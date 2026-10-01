/**
 * The deployment's own workspace integrations serve one named organisation
 * (2026-10-01, D6; AnA local-safe-AI plan WS5, the mailbox half; open decision
 * 10, decided in docs/LAUNCH_DEFINITION_OF_DONE.md P-8).
 *
 * The regulatory mailbox (GMAIL_OAUTH_JSON), the team calendar
 * (GOOGLE_CALENDAR_ID) and the HubSpot CRM (HUBSPOT_ACCESS_TOKEN) are each one
 * account, configured for the whole deployment. AnA's tools used them for
 * whichever organisation asked: any tenant could read the operator's mailbox
 * and CRM, and write the operator's calendar (audit finding ANA-03). They now
 * serve only the organisation PLATFORM_INTEGRATIONS_ORGANIZATION_ID names,
 * read from the running request's tenant scope; every other organisation, an
 * unscoped call and the estate-wide system scope are told none is connected
 * for them, and the account is never reached.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { runWithTenantScope } from '../../../db/tenantStore';
import { searchRegulatoryCorrespondence } from '../correspondence-search';
import { createCalendarEvent } from '../calendar-event';
import { searchHubSpotCrm } from '../hubspot-client';
import { getIntegrationStatuses } from '../integration-status';

const OWNER = '7';
const OTHER = '8';
const inScope = <T>(tenantId: string, fn: () => Promise<T>) =>
  runWithTenantScope({ tenantId, role: 'admin', source: 'test', caller: 'platform-integration-owner-test' }, fn);

const mailbox = () => {
  const fetchRecent = vi.fn().mockResolvedValue([{ id: 'm1', threadId: 't1', subject: 'FDA IR', from: 'fda.gov' }]);
  return { deps: { isConfigured: () => true, fetchRecent }, fetchRecent };
};
const calendar = () => {
  const insertAllDayEvent = vi.fn().mockResolvedValue({ id: 'e1', htmlLink: 'https://calendar/e1' });
  return { deps: { isEnabled: () => true, insertAllDayEvent }, insertAllDayEvent };
};
const EVENT = { summary: 'IND 30-day review ends', date: '2026-11-02' };

afterEach(() => {
  delete process.env.PLATFORM_INTEGRATIONS_ORGANIZATION_ID;
  delete process.env.HUBSPOT_ACCESS_TOKEN;
  vi.restoreAllMocks();
});

describe('another organisation never reaches the deployment’s mailbox, calendar or CRM', () => {
  it.each([
    ['another organisation', () => (fn: () => Promise<unknown>) => inScope(OTHER, fn)],
    ['the estate-wide system scope', () => (fn: () => Promise<unknown>) => inScope('0', fn)],
    ['an unscoped call', () => (fn: () => Promise<unknown>) => fn()],
  ])('%s: told none is connected, and the account is not reached', async (_label, scope) => {
    process.env.PLATFORM_INTEGRATIONS_ORGANIZATION_ID = OWNER;
    process.env.HUBSPOT_ACCESS_TOKEN = 'pat-test';
    const run = scope();
    const m = mailbox();
    const c = calendar();
    // Stubbed, never the network: on trunk this records the CRM being reached.
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ total: 1, results: [{ id: '1', properties: {} }] }), { status: 200 }));

    const mail = (await run(() => searchRegulatoryCorrespondence({ query: 'fda' }, m.deps))) as any;
    const cal = (await run(() => createCalendarEvent(EVENT, c.deps))) as any;
    const crm = (await run(() => searchHubSpotCrm({ query: 'acme', object: 'contacts' }))) as any;

    expect(mail).toMatchObject({ configured: false, messages: [] });
    expect(mail.note).toMatch(/not connected for your organisation/i);
    expect(m.fetchRecent).not.toHaveBeenCalled();
    expect(cal).toMatchObject({ configured: false, created: false });
    expect(cal.note).toMatch(/not connected for your organisation/i);
    expect(c.insertAllDayEvent).not.toHaveBeenCalled();
    expect(crm).toMatchObject({ configured: false, records: [] });
    expect(crm.note).toMatch(/not connected for your organisation/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('with no owner named, no organisation reaches them', async () => {
    const m = mailbox();
    const c = calendar();
    const mail = await inScope(OWNER, () => searchRegulatoryCorrespondence({}, m.deps));
    const cal = await inScope(OWNER, () => createCalendarEvent(EVENT, c.deps));
    expect(mail.configured).toBe(false);
    expect(cal.configured).toBe(false);
    expect(m.fetchRecent).not.toHaveBeenCalled();
    expect(c.insertAllDayEvent).not.toHaveBeenCalled();
  });
});

describe('the named organisation keeps them', () => {
  it('reads its mailbox and writes its calendar', async () => {
    process.env.PLATFORM_INTEGRATIONS_ORGANIZATION_ID = OWNER;
    const m = mailbox();
    const c = calendar();

    const mail = await inScope(OWNER, () => searchRegulatoryCorrespondence({ query: 'fda' }, m.deps));
    const cal = await inScope(OWNER, () => createCalendarEvent(EVENT, c.deps));

    expect(mail).toMatchObject({ configured: true, resultCount: 1 });
    expect(m.fetchRecent).toHaveBeenCalled();
    expect(cal).toMatchObject({ configured: true, created: true });
    expect(c.insertAllDayEvent).toHaveBeenCalled();
  });
});

describe('AnA’s account of what it can do here says the same', () => {
  const env = {
    GMAIL_OAUTH_JSON: '{}',
    GOOGLE_CALENDAR_ID: 'team@calendar',
    GOOGLE_SERVICE_ACCOUNT: '{}',
    HUBSPOT_ACCESS_TOKEN: 'pat-test',
    PLATFORM_INTEGRATIONS_ORGANIZATION_ID: OWNER,
  };
  const byId = (s: Awaited<ReturnType<typeof getIntegrationStatuses>>, id: string) => s.find((x) => x.id === id)!;

  it('reports them live for the named organisation only', async () => {
    const mine = await getIntegrationStatuses(Number(OWNER), { env });
    const theirs = await getIntegrationStatuses(Number(OTHER), { env });

    for (const id of ['gmail', 'google_calendar', 'hubspot']) {
      expect(byId(mine, id).configured, `${id} for its owner`).toBe(true);
      expect(byId(theirs, id).configured, `${id} for another organisation`).toBe(false);
      expect(byId(theirs, id).requires).toMatch(/PLATFORM_INTEGRATIONS_ORGANIZATION_ID/);
    }
  });
});
