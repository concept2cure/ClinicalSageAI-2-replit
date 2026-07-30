/**
 * eCTD v4.0 + controlled-vocabulary API route.
 *
 * Mounts the router behind a stub auth principal and exercises each endpoint
 * with supertest — locking the tenant gate (401/403), the CV serving, RPS
 * validation, and the v3.2.2 → v4.0 forward-compat preview.
 */

import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createEctdV4Router } from '../ectd-v4';
import { submissionUnitId, contextOfUseId, documentId } from '../../services/ectd/ectd4';
import { oidForV4List } from '../../services/ectd/controlled-vocab';

function appWith(principal: Record<string, unknown> | null) {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use((req, _res, next) => {
    if (principal) (req as any).user = principal;
    next();
  });
  app.use('/api/ectd', createEctdV4Router());
  return app;
}

const tenant = { id: 'u1', organizationId: 7 };

describe('eCTD v4.0 API — tenant gate', () => {
  it('401s without a principal', async () => {
    await request(appWith(null)).get('/api/ectd/controlled-vocab').expect(401);
  });
  it('403s with a principal but no organization', async () => {
    await request(appWith({ id: 'u1' })).get('/api/ectd/controlled-vocab').expect(403);
  });
});

describe('controlled vocabulary', () => {
  it('lists all v3 + v4 code lists with the regional IG OID', async () => {
    const res = await request(appWith(tenant)).get('/api/ectd/controlled-vocab').expect(200);
    expect(res.body.regionalIgOid).toContain('18.8');
    expect(res.body.v4.find((l: any) => l.id === 'applicationType').oid).toContain('1.1.4');
    expect(res.body.v3.some((l: any) => l.id === 'applicationType')).toBe(true);
  });

  it('serves a single v4 list and 404s an unknown one', async () => {
    const ok = await request(appWith(tenant)).get('/api/ectd/controlled-vocab/contextOfUse').expect(200);
    expect(ok.body.codes.length).toBe(124);
    await request(appWith(tenant)).get('/api/ectd/controlled-vocab/nope').expect(404);
  });
});

describe('RPS validation endpoint', () => {
  const app = '123456';
  const validMessage = () => {
    const docId = documentId(app, '1.2|c.pdf');
    return {
      submissionUnit: {
        id: submissionUnitId(app, '0000'),
        unitTypeCode: 'us_submission_unit_type_1',
        title: 'Original',
        sequenceNumber: '0000',
        status: 'active',
      },
      submission: { typeCode: 'us_submission_type_1' },
      application: { number: app, typeCode: 'us_application_type_1', center: 'cder' },
      contextsOfUse: [{
        id: contextOfUseId(app, 'us_1.2', '1.2|c.pdf|0000'),
        code: 'us_1.2',
        codeSystem: oidForV4List('contextOfUse'),
        priorityNumber: 1,
        status: 'active',
        documentId: docId,
      }],
      documents: [{ id: docId, title: 'Cover', href: '1-2/c.pdf', mediaType: 'application/pdf', checksum: 'x', checksumType: 'SHA256' }],
    };
  };

  it('validates a good message', async () => {
    const res = await request(appWith(tenant))
      .post('/api/ectd/v4/validate')
      .send({ message: validMessage(), expectedSequenceNumber: '0000' })
      .expect(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.errorCount).toBe(0);
  });

  it('reports errors for a bad message', async () => {
    const bad = validMessage();
    bad.submissionUnit.id = 'not-a-uuid';
    const res = await request(appWith(tenant)).post('/api/ectd/v4/validate').send({ message: bad }).expect(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.findings.some((f: any) => f.code === 'RPS-SU-ID-UUID')).toBe(true);
  });

  it('400s a structurally invalid body', async () => {
    await request(appWith(tenant)).post('/api/ectd/v4/validate').send({ message: { junk: true } }).expect(400);
  });
});

describe('forward-compat preview', () => {
  it('converts v3.2.2 leaves into a validated v4.0 message + XML', async () => {
    const res = await request(appWith(tenant))
      .post('/api/ectd/v4/forward-compat')
      .send({
        application: { number: '123456', typeCode: 'us_application_type_1', center: 'cder' },
        submission: { typeCode: 'us_submission_type_1' },
        submissionUnit: {
          id: submissionUnitId('123456', '0000'),
          unitTypeCode: 'us_submission_unit_type_1',
          title: 'Original',
          sequenceNumber: '0000',
          status: 'active',
        },
        leaves: [
          { ctdSection: '1.2', operation: 'new', fileName: 'cover.pdf', title: 'Cover' },
          { ctdSection: '3.2.p.1', operation: 'new', fileName: 'desc.pdf', title: 'Desc' },
        ],
      })
      .expect(200);
    expect(res.body.message.contextsOfUse.length).toBe(2);
    expect(res.body.submissionUnitXml).toContain('<PORP_IN000001UV');
    expect(res.body.validation.valid).toBe(true);
    expect(res.body.notes.length).toBeGreaterThan(0); // Module 3 → ICH-governed note
  });
});

describe('qualification spec versions', () => {
  it('serves the exact spec versions we qualify against', async () => {
    const res = await request(appWith(tenant)).get('/api/ectd/qualification/spec-versions').expect(200);
    expect(res.body['v3.2.2'].validationCriteria).toContain('v4.5');
    expect(res.body['v4.0'].controlledVocab).toContain('v1.1');
  });
});
