/**
 * A regulated document is not generated from defaults.
 *
 * ── THE DEFECT THIS PINS ─────────────────────────────────────────────────────
 * All ten handlers in server/routes/biotech-artifacts.ts filled missing input
 * with a default — 78 sites — and the defaults were not neutral. Every field
 * carrying a judgement defaulted to the FAVOURABLE answer:
 *
 *   pv/icsr             seriousness || 'non_serious'   causality || 'possible'
 *                       reporterType || 'physician'
 *   pv/psur             benefitRiskConclusion || 'The benefit-risk profile
 *                                                 remains favorable.'
 *                       totalCases / seriousCases / fatalCases ?? 0
 *   clinical/deviation  severity || 'Minor'
 *                       impactAssessment || 'No impact on subject safety or
 *                                            data integrity.'
 *   clinical/monitoring overallAssessment || 'Site is performing within
 *                                            acceptable parameters.'
 *   ectd/cover-letter   applicationNumber || 'IND-000000'
 *
 * The ICSR one is the sharpest. biotech-artifact-generator.ts writes the E2B
 * element as `seriousness === 'non_serious' ? '2' : '1'`, and in E2B(R3) code 2
 * IS non-serious. So POSTing `{}` produced a valid-looking ICSR XML addressed to
 * EudraVigilance (`messagereceiveridentifier` is literally 'EudraVigilance')
 * with `<serious>2</serious>` — and seriousness is the field that decides
 * whether a 15-day expedited report is owed.
 *
 * The router also had no authentication of any kind, and was the one mount in
 * register-document-routes.ts without `authenticateToken`.
 *
 * These tests exercise the router directly, so they pin the handler contract
 * rather than the mount. The auth gap is fixed at the mount site.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

import artifactsRouter from '../biotech-artifacts';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/biotech-artifacts', artifactsRouter);
  return a;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/** Every generator endpoint, with a body that omits everything. */
const ENDPOINTS = [
  '/pv/icsr',
  '/pv/psur',
  '/pv/cioms',
  '/pv/expedited-report',
  '/ectd/cover-letter',
  '/ectd/validation-report',
  '/clinical/protocol-synopsis',
  '/clinical/monitoring-report',
  '/clinical/deviation-report',
  '/clinical/enrollment-report',
];

describe('an empty body produces no document, on any endpoint', () => {
  it.each(ENDPOINTS)('POST %s answers 400 and names the missing fields', async path => {
    const res = await request(app()).post(`/api/biotech-artifacts${path}`).send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_REQUIRED_FIELDS');
    expect(res.body.error.missingFields.length).toBeGreaterThan(0);
    // No document bytes.
    expect(res.headers['content-disposition']).toBeUndefined();
  });

  it('lists EVERY missing field at once, not the first', async () => {
    // A caller fixing a ten-field form should not need ten round-trips.
    const res = await request(app())
      .post('/api/biotech-artifacts/pv/icsr')
      .send({ product: 'Acme-1' });

    expect(res.body.error.missingFields).toEqual(
      expect.arrayContaining([
        'safetyReportId',
        'event',
        'seriousness',
        'outcome',
        'causality',
        'reporterType',
        'country',
        'narrativeText',
      ]),
    );
    expect(res.body.error.missingFields).not.toContain('product');
  });
});

describe('the fields that decide regulatory consequence are never supplied by us', () => {
  it('an ICSR without seriousness is refused, not filed as non-serious', async () => {
    const res = await request(app())
      .post('/api/biotech-artifacts/pv/icsr')
      .send({
        safetyReportId: 'ICSR-1',
        product: 'Acme-1',
        event: 'Anaphylaxis',
        outcome: 'recovered',
        causality: 'probable',
        reporterType: 'physician',
        country: 'US',
        narrativeText: 'Patient developed anaphylaxis 20 minutes after infusion.',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.missingFields).toEqual(['seriousness']);
    // The old behaviour, spelled out: this must never appear.
    expect(res.text).not.toContain('<serious>2</serious>');
  });

  it('rejects a seriousness value the generator would silently read as serious', async () => {
    // `seriousness === 'non_serious' ? '2' : '1'` means any typo is "serious".
    const res = await request(app())
      .post('/api/biotech-artifacts/pv/icsr')
      .send({
        safetyReportId: 'ICSR-1',
        product: 'Acme-1',
        event: 'Anaphylaxis',
        seriousness: 'nonserious', // missing underscore
        outcome: 'recovered',
        causality: 'probable',
        reporterType: 'physician',
        country: 'US',
        narrativeText: 'Narrative.',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_SERIOUSNESS');
  });

  it('a PSUR will not write its own benefit-risk conclusion', async () => {
    const res = await request(app())
      .post('/api/biotech-artifacts/pv/psur')
      .send({
        product: 'Acme-1',
        reportingPeriod: '2025 – 2026',
        sponsor: 'Acme Therapeutics',
        totalCases: 12,
        seriousCases: 3,
        fatalCases: 0,
        signalsSummary: [],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.missingFields).toEqual(['benefitRiskConclusion']);
    expect(res.text).not.toContain('remains favorable');
  });

  it('a deviation report will not decide its own severity or impact', async () => {
    const res = await request(app())
      .post('/api/biotech-artifacts/clinical/deviation-report')
      .send({
        protocolId: 'P-1',
        category: 'Procedural',
        description: 'Visit 3 conducted outside the protocol window.',
        rootCause: 'Scheduling error.',
        correctiveAction: 'Re-trained site staff.',
        preventiveAction: 'Added a calendar guard.',
        reportedBy: 'J. Rivera',
        reportedDate: '2026-09-01',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.missingFields).toEqual(
      expect.arrayContaining(['severity', 'impactAssessment']),
    );
    expect(res.text).not.toContain('No impact on subject safety');
  });

  it('a monitoring report will not write the monitor conclusion', async () => {
    const res = await request(app())
      .post('/api/biotech-artifacts/clinical/monitoring-report')
      .send({
        protocolId: 'P-1',
        siteId: 'S-1',
        siteName: 'Mercy Research',
        visitType: 'Interim Monitoring Visit',
        visitDate: '2026-09-01',
        monitorName: 'A. Okafor',
        findings: [],
        enrollmentStatus: { enrolled: 4, target: 20, screenFailures: 1 },
      });

    expect(res.status).toBe(400);
    expect(res.body.error.missingFields).toEqual(['overallAssessment']);
    expect(res.text).not.toContain('performing within acceptable parameters');
  });

  it('a cover letter will not invent an application number', async () => {
    const res = await request(app())
      .post('/api/biotech-artifacts/ectd/cover-letter')
      .send({
        applicant: 'Acme Therapeutics',
        product: 'Acme-1',
        submissionType: 'Initial',
        sequence: '0001',
        region: 'us',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.missingFields).toEqual(['applicationNumber']);
    expect(res.text).not.toContain('IND-000000');
  });
});

describe('a complete body still produces the document', () => {
  it('generates ICSR XML when every field is supplied', async () => {
    // The fix must remove fabrication, not capability.
    const res = await request(app())
      .post('/api/biotech-artifacts/pv/icsr')
      .send({
        safetyReportId: 'ICSR-2026-0001',
        product: 'Acme-1',
        event: 'Anaphylaxis',
        seriousness: 'life_threatening',
        outcome: 'recovering',
        causality: 'probable',
        reporterType: 'physician',
        country: 'US',
        narrativeText: 'Patient developed anaphylaxis 20 minutes after infusion.',
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('ICSR_E2B_R3_ICSR-2026-0001.xml');
    // life_threatening is serious -> E2B code 1.
    expect(res.text).toContain('<serious>1</serious>');
    expect(res.text).toContain('ICSR-2026-0001');
  });

  it('honours an explicit non-serious classification', async () => {
    // The point is not that everything is serious — it is that a human said so.
    const res = await request(app())
      .post('/api/biotech-artifacts/pv/icsr')
      .send({
        safetyReportId: 'ICSR-2026-0002',
        product: 'Acme-1',
        event: 'Headache',
        seriousness: 'non_serious',
        outcome: 'recovered',
        causality: 'unlikely',
        reporterType: 'consumer',
        country: 'US',
        narrativeText: 'Mild headache, resolved without treatment.',
      });

    expect(res.status).toBe(200);
    expect(res.text).toContain('<serious>2</serious>');
  });

  it('accepts zero as a real count rather than treating it as absent', async () => {
    // `fatalCases: 0` is an answer. requireFields must not read 0 as missing.
    const res = await request(app())
      .post('/api/biotech-artifacts/pv/psur')
      .send({
        product: 'Acme-1',
        reportingPeriod: '2025 – 2026',
        sponsor: 'Acme Therapeutics',
        totalCases: 12,
        seriousCases: 3,
        fatalCases: 0,
        signalsSummary: [],
        benefitRiskConclusion: 'Benefit-risk remains favourable on the evidence reviewed.',
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('PSUR_PBRER_Acme-1');
  });
});
