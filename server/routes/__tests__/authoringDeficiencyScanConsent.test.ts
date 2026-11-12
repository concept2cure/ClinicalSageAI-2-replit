/**
 * P-102: the editor's Check, on an informed-consent document, carries the
 * 21 CFR 50.25 required elements and which the document satisfies. Before
 * this the response had no such field for any document.
 */
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock('../../db', () => {
  const api = {
    query: (...a: unknown[]) => mockQuery(...a),
    connect: async () => ({ query: (...a: unknown[]) => mockQuery(...a), release: () => {} }),
  };
  return { pool: api, getPool: () => api, query: (...a: unknown[]) => mockQuery(...a), db: {} };
});
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-deficiency-scan-consent';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import router from '../authoring.router';
import { CONSENT_TEMPLATE_IDS } from '../../services/protocol-consent/protocol-consent-logic';

const html = (t: string) => `<p>${t}</p>`;
const SECTIONS = [
  { code: '1', title: 'Study Purpose and Background', content: html('This study involves research. Its purpose is to test the drug for 12 weeks.') },
  { code: '6', title: 'Confidentiality of Records', content: html('Your records will be kept confidential.') },
];

function wire(templateId: string | null, list: 'ok' | 'fail' = 'ok') {
  mockQuery.mockImplementation(async (sql: unknown) => {
    const q = String(sql);
    if (q.includes('JOIN authoring_documents')) {
      return { rowCount: 1, rows: [{ id: 'S1', doc_id: 'D1', code: '6', title: 'Confidentiality of Records', content: SECTIONS[1].content, module: 'M5', template_id: templateId }] };
    }
    if (q.includes('FROM authoring_sections')) {
      if (list === 'fail') throw new Error('read failed');
      return { rowCount: SECTIONS.length, rows: SECTIONS };
    }
    return { rowCount: 0, rows: [] };
  });
}

async function scan() {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({ sub: 'u1', organizationId: 7, email: 'ra@test.co' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('5m').sign(secret);
  const app = express();
  app.use(express.json());
  app.use('/api/authoring', router);
  return (await request(app).post('/api/authoring/sections/S1/ai/deficiency-scan').set('Authorization', `Bearer ${token}`).send({})).body.scan_results;
}

beforeEach(() => mockQuery.mockReset());

describe('the check on an informed-consent document', () => {
  it('carries the required elements, the gate\'s count and why each is incomplete', async () => {
    wire(CONSENT_TEMPLATE_IDS[0]);
    const c = (await scan()).consent_elements;
    expect(c).toBeTruthy();
    expect(c.basis).toMatch(/21 CFR 50\.25/);
    expect(c.required_total).toBe(11);
    // Section 1 carries the research statement and the purpose; section 6 lacks the FDA wording.
    expect(c.required_complete).toBe(2);
    expect(c.ready).toBe(false);
    expect(c.elements.find((e: { key: string }) => e.key === 'confidentiality')).toMatchObject({ complete: false, section: '6' });
    expect(c.findings.join(' ')).toMatch(/Food and Drug Administration may inspect/);
    expect(c.applicable_clinical_trial_note).toMatch(/applicable clinical trial/);
  });

  it('is absent on a document of another type', async () => {
    wire('4331e7e3-7777-5c21-8c9b-0e2f56194e7e');
    expect((await scan()).consent_elements).toBeUndefined();
    wire(null);
    expect((await scan()).consent_elements).toBeUndefined();
  });

  it('is absent, not empty, when the document\'s sections could not be read', async () => {
    wire(CONSENT_TEMPLATE_IDS[0], 'fail');
    const s = await scan();
    expect(s).toBeTruthy();
    expect(s.consent_elements).toBeUndefined();
  });
});
