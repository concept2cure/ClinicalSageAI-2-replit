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

function wire(templateId: string | null, list: 'ok' | 'fail' = 'ok', productCode: string | null = null) {
  mockQuery.mockImplementation(async (sql: unknown) => {
    const q = String(sql);
    if (q.includes('JOIN authoring_documents')) {
      return { rowCount: 1, rows: [{ id: 'S1', doc_id: 'D1', code: '6', title: 'Confidentiality of Records', content: SECTIONS[1].content, module: 'M5', template_id: templateId, product_code: productCode }] };
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

/*
 * 2026-11-12 (F1, found walking slice 1): three of the Check's heuristics are
 * written for CTD sections. On a consent section they told the author that a
 * one-sentence confidentiality statement "appears insufficient", that it had
 * "no data tables or figures", and that it "lacks proper structure". A consent
 * form is meant to be short, plain language, with no tables. On a consent
 * document those three are skipped, saying why; the placeholder check still
 * runs, and the 50.25 elements are the check that applies.
 */
describe('the CTD heuristics on a consent section', () => {
  const ids = (s: { deficiencies: Array<{ type: string }> }) => s.deficiencies.map((d) => d.type);

  it('are skipped with a reason, and the placeholder check still runs', async () => {
    wire(CONSENT_TEMPLATE_IDS[0]);
    const s = await scan();
    expect(ids(s)).not.toContain('content_length');
    expect(ids(s)).not.toContain('missing_data');
    expect(ids(s)).not.toContain('structure');
    const skipped = (s.checks_skipped ?? []).filter((c: { id: string }) => ['content_length', 'data_presence', 'structure'].includes(c.id));
    expect(skipped.map((c: { id: string }) => c.id).sort()).toEqual(['content_length', 'data_presence', 'structure']);
    expect(skipped[0].reason).toMatch(/informed consent form[\s\S]*21 CFR 50\.25/);
    expect(s.checks_run).toBeGreaterThan(0);
  });

  it('still run on a document of another type (control)', async () => {
    wire('4331e7e3-7777-5c21-8c9b-0e2f56194e7e');
    const s = await scan();
    expect(ids(s)).toContain('content_length');
    expect(ids(s)).toContain('missing_data');
  });
});

describe('what a consent section is told it must contain', () => {
  it('points at the 50.25 elements, not at a CTD guidance entry, and names no empty module', async () => {
    wire(CONSENT_TEMPLATE_IDS[0]);
    const s = await scan();
    expect(s.record_requirements.indexed).toBe(false);
    expect(s.record_requirements.reason).toMatch(/informed consent form[\s\S]*21 CFR 50\.25 elements/);
    expect(s.record_requirements.reason).not.toMatch(/CTD section entry/);
    const kw = (s.checks_skipped ?? []).find((c: { id: string }) => c.id === 'module_keywords');
    expect(kw.reason).not.toContain('""');
  });
});

describe('a consent form AnA drafted (P-130)', () => {
  it('has no template, records its type, and gets the same check', async () => {
    wire(null, 'ok', 'informed_consent');
    const s = await scan();
    expect(s.consent_elements?.required_total).toBe(11);
    expect((s.checks_skipped ?? []).map((c: { id: string }) => c.id)).toContain('data_presence');
  });
});
