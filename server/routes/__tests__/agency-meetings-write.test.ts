/**
 * POST /api/agency-meetings — agency-meetings write contract.
 *
 * The v2 AgencyMeetings surface POSTs a new meeting request here once its read
 * has adopted the store. Locks: 403 without org, an org-scoped INSERT that
 * returns the created row in the surface's display shape (briefing_book →
 * briefingBook) with a 201 { data, meta:{created} } envelope, and 42P01 →
 * 503 PENDING_STORE so the client falls back to local-only behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

/**
 * One mocked connection. The route takes a client and writes the meeting row
 * and its chained `audit_logs` row in ONE transaction, so the mock has to be a
 * client: BEGIN / INSERT / the audit chain's own reads and write / COMMIT all
 * land on the same `query` spy, and the assertions below pick out the call
 * they mean rather than assuming an ordinal.
 */
const query = vi.fn();
const release = vi.fn();
vi.mock('../../db', () => ({
  pool: {
    query: (...a: unknown[]) => query(...a),
    connect: async () => ({ query: (...a: unknown[]) => query(...a), release }),
  },
}));

/** The INSERT that creates the meeting, wherever it fell in the transaction. */
const meetingInsert = () =>
  query.mock.calls.find((c) => /INSERT INTO c2c_agency_meetings/.test(String(c[0])));
/** The chained audit row written alongside it. */
const auditInsert = () =>
  query.mock.calls.find((c) => /INSERT INTO audit_logs/.test(String(c[0])));

/**
 * Answer the transaction: BEGIN/COMMIT/ROLLBACK and the audit chain's reads are
 * uninteresting; the meeting INSERT returns the given row.
 */
function wireInsert(row: Record<string, unknown> | Error) {
  query.mockImplementation(async (sql: string) => {
    if (/INSERT INTO c2c_agency_meetings/.test(String(sql))) {
      if (row instanceof Error) throw row;
      return { rows: [row] };
    }
    return { rows: [] };
  });
}

import agencyMeetingsRouter from '../agency-meetings.routes';

function appWith(org: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/agency-meetings', agencyMeetingsRouter);
  return app;
}

const validBody = {
  type: 'Pre-IND',
  agency: 'FDA · CDER',
  program: 'BX-204 · IND',
  format: 'Teleconference',
  requested: '2026-08-01',
  goal: 'Align on the nonclinical package before IND.',
};

beforeEach(() => {
  query.mockReset();
  release.mockReset();
  query.mockResolvedValue({ rows: [] });
});

describe('POST /api/agency-meetings', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).post('/api/agency-meetings').send(validBody);
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('400 when a required field is missing', async () => {
    const res = await request(appWith(7)).post('/api/agency-meetings').send({ agency: 'FDA · CDER' });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('inserts org-scoped and returns the created row in display shape', async () => {
    wireInsert({
      id: 'mtg-123', type: 'Pre-IND', agency: 'FDA · CDER', cat: 'Pre-IND',
      program: 'BX-204 · IND', status: 'requested', requested: '2026-08-01',
      granted: null, meets: null, clock: 'FDA grant/deny pending',
      format: 'Teleconference', goal: 'Align on the nonclinical package before IND.',
      briefing_book: null, minutes: null,
    });

    const res = await request(appWith(7)).post('/api/agency-meetings').send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.meta.created).toBe(true);

    // INSERT was called; params carry the org id and generated id + fields.
    const call = meetingInsert();
    expect(call).toBeTruthy();
    const params = call![1] as unknown[];
    expect(params[0]).toMatch(/^mtg-/); // id
    expect(params[1]).toBe(7); // organization_id
    expect(params).toContain('Pre-IND');
    expect(params).toContain('FDA · CDER');
    expect(params).toContain('BX-204 · IND');
    expect(params).toContain('requested'); // status default

    // Response is the created row mapped to the display shape.
    const data = res.body.data;
    for (const k of ['id', 'type', 'agency', 'cat', 'program', 'status', 'requested', 'granted', 'meets', 'clock', 'format', 'goal']) {
      expect(data).toHaveProperty(k);
    }
    expect(data.id).toBe('mtg-123');
    expect(data.status).toBe('requested');
    expect(data.briefingBook).toBeNull();
    expect(data.minutes).toBeNull();
  });

  it('defaults cat to type and format to Teleconference when omitted', async () => {
    wireInsert({ id: 'mtg-1', type: 'Type B', cat: 'Type B', status: 'requested', clock: 'FDA grant/deny pending', format: 'Teleconference' });
    await request(appWith(3)).post('/api/agency-meetings').send({
      type: 'Type B', agency: 'FDA · CDER', program: 'BX-204 · NDA', goal: 'Discuss pivotal design.',
    });
    const params = meetingInsert()![1] as unknown[];
    expect(params).toContain('Type B'); // cat fell back to type
    expect(params).toContain('Teleconference'); // format default
  });

  it('42P01 → 503 PENDING_STORE (store not provisioned)', async () => {
    wireInsert(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).post('/api/agency-meetings').send(validBody);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('PENDING_STORE');
  });
});

/**
 * The dialog on the AgencyMeetings surface says, of this exact POST: "a meeting
 * request is a governed interaction — the request ... recorded with an audit
 * entry". No audit row was written anywhere. A regulated surface claiming an
 * audit trail it does not have is the defect; the entry now commits with the
 * meeting or neither exists.
 */
describe('POST /api/agency-meetings — the audit entry the dialog promises', () => {
  const ran = (verb: string) => query.mock.calls.some((c) => String(c[0]).trim() === verb);

  it('writes a chained audit row on the same client, inside the transaction', async () => {
    wireInsert({ id: 'mtg-9', type: 'Type B', agency: 'FDA · CDER', status: 'requested' });
    const res = await request(appWith(7)).post('/api/agency-meetings').send(validBody);
    expect(res.status).toBe(201);

    expect(ran('BEGIN')).toBe(true);
    expect(ran('COMMIT')).toBe(true);
    const audit = auditInsert();
    expect(audit).toBeTruthy();
    const p = audit![1] as unknown[];
    // The entry names the action and the row it records, org-scoped.
    expect(p).toContain('agency_meeting.requested');
    expect(p).toContain('c2c_agency_meetings');
    expect(p).toContain('mtg-9');
    expect(p).toContain(7);
    // Written BEFORE the commit — not fired off afterwards to fail unseen.
    const order = query.mock.calls.map((c) => String(c[0]).trim());
    expect(order.findIndex((t) => /INSERT INTO audit_logs/.test(t)))
      .toBeLessThan(order.lastIndexOf('COMMIT'));
    expect(release).toHaveBeenCalled();
  });

  it('refuses the request and rolls back when the audit row cannot be written', async () => {
    query.mockImplementation(async (sql: string) => {
      const t = String(sql);
      if (/INSERT INTO audit_logs/.test(t)) throw new Error('audit store unavailable');
      if (/INSERT INTO c2c_agency_meetings/.test(t)) {
        return { rows: [{ id: 'mtg-9', type: 'Type B', status: 'requested' }] };
      }
      return { rows: [] };
    });

    const res = await request(appWith(7)).post('/api/agency-meetings').send(validBody);
    // No half-record: the sponsor was told the request is audited, so an
    // unauditable request is not a saved request.
    expect(res.status).toBe(500);
    expect(ran('ROLLBACK')).toBe(true);
    expect(ran('COMMIT')).toBe(false);
    expect(release).toHaveBeenCalled();
  });
});

/**
 * The clock column named the FDA on every row, including EMA, PMDA, Health
 * Canada and MHRA requests — agencies the form offers and this string does not
 * describe. It names the agency that actually holds the request, and states no
 * PDUFA day count, because those differ by meeting type and do not apply
 * outside the FDA at all.
 */
describe('POST /api/agency-meetings — the pending clock names the right agency', () => {
  const clockFor = async (agency: string) => {
    wireInsert({ id: 'mtg-1', type: 'Scientific Advice', agency, status: 'requested' });
    await request(appWith(7)).post('/api/agency-meetings').send({ ...validBody, agency });
    return (meetingInsert()![1] as unknown[])[8] as string;
  };

  it('says FDA grant/deny for an FDA request', async () => {
    expect(await clockFor('FDA · CDER')).toBe('FDA grant/deny pending');
  });

  it('does not tell an EMA applicant they are waiting on the FDA', async () => {
    const clock = await clockFor('EMA · CHMP/SAWP');
    expect(clock).toMatch(/^EMA /);
    expect(clock).not.toMatch(/FDA/);
  });

  it('names PMDA for a PMDA consultation', async () => {
    expect(await clockFor('PMDA')).toMatch(/^PMDA /);
  });
});

describe('POST /api/agency-meetings — ids do not collide', () => {
  it('two requests in the same millisecond get different ids', async () => {
    const spy = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    try {
      const ids: string[] = [];
      for (let i = 0; i < 2; i += 1) {
        query.mockReset();
        release.mockReset();
        wireInsert({ id: 'x', type: 'Type B', status: 'requested' });
        await request(appWith(7)).post('/api/agency-meetings').send(validBody);
        ids.push((meetingInsert()![1] as unknown[])[0] as string);
      }
      expect(ids[0]).not.toBe(ids[1]);
      expect(ids[0]).toMatch(/^mtg-1800000000000-/);
    } finally {
      spy.mockRestore();
    }
  });
});
