/**
 * Support requests (P-127, S13): server/routes/support.ts over the real support tables
 * (migrations/0007_support_admin.sql, applied twice, as every deploy replays it) in PGlite.
 *
 * A person opens a request and follows it; another member does not see it, an administrator does; another
 * organisation's request is a 404; internal notes are never read; a reply reopens a resolved request; a closed one
 * refuses a reply; only the opener rates, and only once resolved; a failed audit row leaves nothing behind.
 * And the migration's amendment: an existing database's messages take their ticket's organisation, a message with no
 * ticket stops the deploy, and the same-organisation key refuses a message filed under another organisation.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';

const h = vi.hoisted(() => ({
  pg: null as unknown as import('@electric-sql/pglite').PGlite,
  failAudit: false,
  audits: [] as Array<{ action: string; resourceId: string }>,
}));

vi.mock('../../db/requestDb', async (original) => {
  const client = {
    query: async (text: string, params?: unknown[]) => h.pg.query(text, params as unknown[]),
  };
  return {
    ...(await original<object>()),
    requestConnectable: () => ({ query: client.query, connect: async () => ({ query: client.query, release: () => {} }) }),
  };
});
vi.mock('../../services/auditService', () => ({
  writeChainedAuditRow: async (client: { query: (s: string, p?: unknown[]) => Promise<unknown> }, e: { action: string; resourceId: string; tenantId: number }) => {
    await client.query('INSERT INTO audit_stub (action, target, tenant_id) VALUES ($1, $2, $3)', [e.action, e.resourceId, e.tenantId]);
    if (h.failAudit) throw new Error('audit_logs: connection reset');
    h.audits.push({ action: e.action, resourceId: e.resourceId });
  },
}));

import supportRouter from '../support';

const MIGRATION = readFileSync(resolve(__dirname, '../../../migrations/0007_support_admin.sql'), 'utf8');
const ORG = 11;
const OTHER = 22;
const ANN = 101; // member
const BEN = 102; // member
const ADA = 103; // admin
const ZED = 201; // the other organisation's member
const STAFF = 900; // Concept2Cure support: in no organisation

let who = { id: ANN, organizationId: ORG };
const app = express();
app.use(express.json());
app.use((req, _res, next) => { (req as unknown as { user: unknown }).user = { ...who }; next(); });
app.use('/api/support', supportRouter);
const as = (id: number, organizationId = ORG) => { who = { id, organizationId }; return request(app); };

async function base(pg: PGlite) {
  await pg.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL);
    CREATE TABLE organization_users (organization_id INTEGER NOT NULL, user_id INTEGER NOT NULL, role TEXT NOT NULL);
    CREATE TABLE audit_stub (id SERIAL PRIMARY KEY, action TEXT, target TEXT, tenant_id INTEGER);
  `);
}

beforeAll(async () => {
  h.pg = new PGlite();
  await base(h.pg);
  await h.pg.exec(MIGRATION);
  await h.pg.exec(MIGRATION); // every deploy replays it
  await h.pg.exec(`
    INSERT INTO users VALUES (101, 'Ann Lee', 'ann@a.test'), (102, 'Ben Ito', 'ben@a.test'), (103, 'Ada Cole', 'ada@a.test'),
                             (201, 'Zed Roe', 'zed@b.test'), (900, 'Sam Support', 'sam@c2c.test');
    INSERT INTO organization_users VALUES (11, 101, 'member'), (11, 102, 'member'), (11, 103, 'admin'), (22, 201, 'admin');
  `);
});
afterAll(async () => { await h.pg.close(); });
beforeEach(async () => {
  h.failAudit = false;
  h.audits = [];
  await h.pg.exec('TRUNCATE support_ticket_messages, support_tickets, audit_stub RESTART IDENTITY CASCADE');
});

const open = (id = ANN, org = ORG, subject = 'Cannot find the Assign button') =>
  as(id, org).post('/api/support/tickets').send({ subject, description: 'On the Plan step I do not see Assign next to a document.', category: 'technical',
    context: { surface: 'project-home', via: 'help_center', articles: ['assign-work'] } });

describe('support requests', () => {
  it('opens a request with its number and audit row, and lists it for the person who opened it', async () => {
    const r = await open();
    expect(r.status).toBe(201);
    const t = r.body.data.ticket;
    expect(t.number).toMatch(/^SUP-\d{6}$/);
    expect(t).toMatchObject({ status: 'open', category: 'technical', openedBy: { name: 'Ann Lee', you: true }, replies: 0 });
    expect(t.context).toMatchObject({ surface: 'project-home', articles: ['assign-work'] });
    expect(h.audits).toEqual([{ action: 'support.ticket.opened', resourceId: t.number }]);
    const list = await as(ANN).get('/api/support/tickets');
    expect(list.body.data).toMatchObject({ scope: 'yours', tickets: [{ number: t.number }] });
  });

  it('another member does not see it; an administrator sees the organisation\'s; another organisation gets a 404', async () => {
    const t = (await open()).body.data.ticket;
    expect((await as(BEN).get('/api/support/tickets')).body.data.tickets).toEqual([]);
    expect((await as(BEN).get(`/api/support/tickets/${t.number}`)).status).toBe(404);
    const admin = await as(ADA).get('/api/support/tickets');
    expect(admin.body.data.scope).toBe('organisation');
    expect(admin.body.data.tickets.map((x: { number: string }) => x.number)).toEqual([t.number]);
    expect((await as(ZED, OTHER).get(`/api/support/tickets/${t.number}`)).status).toBe(404);
    expect((await as(ZED, OTHER).get('/api/support/tickets')).body.data.tickets).toEqual([]);
    expect((await as(ZED, OTHER).post(`/api/support/tickets/${t.number}/messages`).send({ content: 'hi' })).status).toBe(404);
  });

  it('reads the public thread, names support as Concept2Cure support, and never reads an internal note', async () => {
    const t = (await open()).body.data.ticket;
    const { rows } = await h.pg.query<{ id: number }>('SELECT id FROM support_tickets WHERE ticket_number = $1', [t.number]);
    await h.pg.query(`INSERT INTO support_ticket_messages (organization_id, ticket_id, user_id, is_internal, content) VALUES
      ($1, $2, $3, false, 'Assign is on the document row once the document has a template.'),
      ($1, $2, $3, true, 'INTERNAL: customer on an old build')`, [ORG, rows[0].id, STAFF]);
    const r = await as(ANN).get(`/api/support/tickets/${t.number}`);
    expect(r.status).toBe(200);
    expect(r.body.data.messages).toEqual([expect.objectContaining({ from: 'support', author: 'Concept2Cure support', you: false })]);
    expect(JSON.stringify(r.body)).not.toContain('INTERNAL');
    expect(r.body.data.ticket.replies).toBe(1);
  });

  it('a reply reopens a resolved request; a closed one refuses a reply', async () => {
    const t = (await open()).body.data.ticket;
    const res = await as(ANN).post(`/api/support/tickets/${t.number}/resolve`).send({ note: 'Found it, thanks.' });
    expect(res.body.data.ticket).toMatchObject({ status: 'resolved', replies: 1 });
    expect((await as(ANN).post(`/api/support/tickets/${t.number}/resolve`).send({})).status).toBe(409);
    const reply = await as(ANN).post(`/api/support/tickets/${t.number}/messages`).send({ content: 'It is back again today.' });
    expect(reply.status).toBe(201);
    expect(reply.body.data.ticket).toMatchObject({ status: 'open', resolvedAt: null, replies: 2 });
    await h.pg.query(`UPDATE support_tickets SET status = 'closed' WHERE ticket_number = $1`, [t.number]);
    const closed = await as(ANN).post(`/api/support/tickets/${t.number}/messages`).send({ content: 'One more thing' });
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe('TICKET_CLOSED');
  });

  it('only the opener rates, and only a resolved request', async () => {
    const t = (await open()).body.data.ticket;
    expect((await as(ANN).post(`/api/support/tickets/${t.number}/rating`).send({ rating: 5 })).status).toBe(409);
    await as(ANN).post(`/api/support/tickets/${t.number}/resolve`).send({});
    expect((await as(ADA).post(`/api/support/tickets/${t.number}/rating`).send({ rating: 2 })).status).toBe(403);
    expect((await as(ANN).post(`/api/support/tickets/${t.number}/rating`).send({ rating: 9 })).status).toBe(400);
    const r = await as(ANN).post(`/api/support/tickets/${t.number}/rating`).send({ rating: 5, feedback: 'Quick and clear.' });
    expect(r.body.data.ticket.rating).toBe(5);
  });

  it('a failed audit row leaves no request behind and says nothing was saved', async () => {
    h.failAudit = true;
    const r = await open();
    expect(r.status).toBe(503);
    expect(r.body.error.message).toMatch(/Nothing was saved/);
    expect((await h.pg.query('SELECT count(*)::int AS n FROM support_tickets')).rows[0]).toEqual({ n: 0 });
    expect((await h.pg.query('SELECT count(*)::int AS n FROM audit_stub')).rows[0]).toEqual({ n: 0 });
  });

  it('refuses an unknown field, a short subject, and a tenant key in the body', async () => {
    expect((await as(ANN).post('/api/support/tickets').send({ subject: 'Hi', description: 'too short' })).status).toBe(400);
    const r = await as(ANN).post('/api/support/tickets').send({ subject: 'A real subject', description: 'A real description here.', organizationId: OTHER });
    expect(r.status).toBe(400);
    expect((await h.pg.query('SELECT count(*)::int AS n FROM support_tickets')).rows[0]).toEqual({ n: 0 });
  });
});

describe('the migration amendment (RULE 1)', () => {
  const OLD_MESSAGES = `CREATE TABLE support_ticket_messages (id SERIAL PRIMARY KEY, ticket_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
    is_internal BOOLEAN NOT NULL DEFAULT false, content TEXT NOT NULL, attachments JSON DEFAULT '[]', created_at TIMESTAMP NOT NULL DEFAULT NOW());`;
  const OLD_TICKETS = MIGRATION.slice(MIGRATION.indexOf('CREATE SEQUENCE'), MIGRATION.indexOf('-- Support Ticket Messages'));

  it('an existing database\'s messages take their ticket\'s organisation and the column becomes NOT NULL', async () => {
    const pg = new PGlite();
    await pg.exec(MIGRATION.slice(0, MIGRATION.indexOf('CREATE SEQUENCE')) + OLD_TICKETS + OLD_MESSAGES);
    await pg.exec(`INSERT INTO support_tickets (organization_id, created_by_id, ticket_number, subject, description) VALUES (11, 1, 'SUP-000001', 's', 'd');
      INSERT INTO support_ticket_messages (ticket_id, user_id, content) VALUES (1, 1, 'old reply');`);
    await pg.exec(MIGRATION);
    expect((await pg.query('SELECT organization_id FROM support_ticket_messages')).rows).toEqual([{ organization_id: 11 }]);
    const col = await pg.query(`SELECT is_nullable FROM information_schema.columns WHERE table_name = 'support_ticket_messages' AND column_name = 'organization_id'`);
    expect(col.rows).toEqual([{ is_nullable: 'NO' }]);
    await expect(pg.exec(`INSERT INTO support_ticket_messages (organization_id, ticket_id, user_id, content) VALUES (22, 1, 1, 'filed under another organisation')`))
      .rejects.toThrow(/support_ticket_messages_ticket_same_org/);
    await pg.close();
  });

  it('a message whose ticket is gone stops the deploy rather than being left readable or deleted', async () => {
    const pg = new PGlite();
    await pg.exec(MIGRATION.slice(0, MIGRATION.indexOf('CREATE SEQUENCE')) + OLD_TICKETS + OLD_MESSAGES);
    await pg.exec(`INSERT INTO support_ticket_messages (ticket_id, user_id, content) VALUES (999, 1, 'orphan')`);
    await expect(pg.exec(MIGRATION)).rejects.toThrow(/have no ticket to take an organisation from/);
    await pg.close();
  });
});
