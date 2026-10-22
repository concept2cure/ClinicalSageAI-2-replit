/**
 * POST /api/grdhe/adverse-events records a sender and a receiver, as the
 * safety exports read them, and refuses a block they could not write as
 * recorded (GRDHE follow-up 2, 2026-10-15).
 *
 * What the code used to do: intake took no sender or receiver. The request's
 * blocks were dropped without a word and the case was stored with the column
 * default {}, so every case created through the API failed E2B validation on
 * sender.sender_type, and its receiver was never recorded. A block the exports
 * cannot read (a key they do not read, a number where they write text) would
 * have been stored and silently not exported, or crashed the export.
 *
 * The router, the service and the generators are real and run on PGlite
 * through drizzle, over db/migrations/081_grdhe_regulatory_mapping_layer.sql.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { drizzle } from 'drizzle-orm/pglite';
import { generateE2BR3XML } from '../../services/grdhe/exportGenerators';
import type { ExportJob } from '../../services/grdhe/types';

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../db', () => ({
  get db() {
    return holder.db;
  },
}));

const SQL = fs.readFileSync(path.join(process.cwd(), 'db/migrations/081_grdhe_regulatory_mapping_layer.sql'), 'utf8');
const TENANT = '3f2a8c1e-7b4d-4e9a-9c2f-1a2b3c4d5e6f';
const USER = { id: 42, email: 'qa.lead@sponsor.example', organizationUuid: TENANT };
const LOCKED = {
  MEDDRA: { version_id: 'tv-meddra', version_code: '26.1', display_name: 'MedDRA 26.1', locked_at: '2026-10-15T00:00:00Z' },
};

const SENDER = { sender_type: '1', sender_identifier: 'EXAMPLEPHARMA-DE', sender_organization: 'Example Pharma GmbH', sender_country: 'DE' };
const RECEIVER = { receiver_identifier: 'EVHUMAN', receiver_type: '2', receiver_organization: 'European Medicines Agency' };

let pg: PGlite;
let app: express.Express;
let service: typeof import('../../services/grdhe/grdheService').grdheService;

const intake = (caseNumber: string, blocks: Record<string, unknown>) => ({
  tenantId: TENANT, caseNumber, caseType: 'spontaneous', reportType: 'initial',
  eventDate: '2026-03-10', receiveDate: '2026-03-15', isSerious: false,
  patient: { sex: 'F' },
  reactions: [{ term: 'Headache', term_code: '10019211', term_system: 'MEDDRA', outcome: 'recovered' }],
  suspectProducts: [{ name: 'Examplamab' }],
  reporter: { qualification_code: '1', country_code: 'DE' },
  ...blocks,
});

const stored = async (caseNumber: string) =>
  (
    await pg.query<{ id: string; sender: unknown; receiver: unknown }>(
      'SELECT id, sender, receiver FROM regulatory_harmonization.canonical_adverse_events WHERE case_number = $1',
      [caseNumber]
    )
  ).rows;

beforeAll(async () => {
  pg = new PGlite({ extensions: { pgcrypto, pg_trgm, uuid_ossp } });
  await pg.exec(SQL);
  holder.db = drizzle(pg);
  // Imported after the handle exists: the service captures `db` when it loads.
  service = (await import('../../services/grdhe/grdheService')).grdheService;
  const router = (await import('../grdheRoutes')).default;
  app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = USER;
    next();
  });
  app.use('/api/grdhe', router);
}, 120_000);

afterAll(async () => {
  await pg?.close();
});

describe('intake records the sender and receiver the exports read', () => {
  it('stores both blocks as recorded, and the E2B export reads them', async () => {
    const r = await request(app).post('/api/grdhe/adverse-events').send(intake('CASE-PARTIES', { sender: SENDER, receiver: RECEIVER }));
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const [row] = await stored('CASE-PARTIES');
    expect(row).toMatchObject({ sender: SENDER, receiver: RECEIVER });

    const validation = await request(app)
      .post(`/api/grdhe/adverse-events/${row.id}/validate`)
      .send({ targetFormat: 'EMA_AE_E2B_R3' });
    const failed = (validation.body.data.errors as Array<{ field: string }>).map(e => e.field);
    expect(failed, 'an API-created case fails E2B on a sender it recorded').not.toContain('sender.sender_type');

    const xml = generateE2BR3XML(await service.getCanonicalAdverseEventById(TENANT, row.id), {} as ExportJob, LOCKED).content ?? '';
    expect(xml).toContain('<sendertype>1</sendertype>');
    expect(xml).toContain('<senderorganization>Example Pharma GmbH</senderorganization>');
    expect(xml).toContain('<messagereceiveridentifier>EVHUMAN</messagereceiveridentifier>');
    expect(xml).toContain('<receiverorganization>European Medicines Agency</receiverorganization>');
  });

  it('records a case with neither block, as before: the E2B export then names the missing sender type', async () => {
    const r = await request(app).post('/api/grdhe/adverse-events').send(intake('CASE-NO-PARTIES', {}));
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const [row] = await stored('CASE-NO-PARTIES');
    expect(row).toMatchObject({ sender: {}, receiver: {} });
    const validation = await request(app)
      .post(`/api/grdhe/adverse-events/${row.id}/validate`)
      .send({ targetFormat: 'EMA_AE_E2B_R3' });
    expect((validation.body.data.errors as Array<{ field: string }>).map(e => e.field)).toContain('sender.sender_type');
  });

  it.each([
    ['a key the exports do not read', { sender: { ...SENDER, organization: 'Example Pharma GmbH' } }, 'sender.organization'],
    ['a value that is not text', { sender: { ...SENDER, sender_postcode: 12345 } }, 'sender.sender_postcode'],
    ['a sender type that is not an E2B code', { sender: { ...SENDER, sender_type: 'pharmaceutical company' } }, 'sender.sender_type'],
    ['a receiver that is not a block', { receiver: 'EVHUMAN' }, 'receiver'],
    ['an empty receiver field', { receiver: { ...RECEIVER, receiver_organization: ' ' } }, 'receiver.receiver_organization'],
  ])('refuses %s, naming the field, and stores nothing', async (_name, blocks, field) => {
    const caseNumber = `CASE-BAD-${field}`;
    const r = await request(app).post('/api/grdhe/adverse-events').send(intake(caseNumber, blocks));
    expect(r.status, JSON.stringify(r.body)).toBe(400);
    expect(r.body.error.code).toBe('INVALID_SENDER_OR_RECEIVER');
    expect(r.body.error.message).toContain(field);
    expect(await stored(caseNumber)).toEqual([]);
  });
});
