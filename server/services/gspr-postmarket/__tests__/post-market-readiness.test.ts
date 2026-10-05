/**
 * Post-Market Documentation Status — honest aggregation. Required-vs-optional is
 * driven by the regulation AND the device class (EU_POSTMARKET_OBLIGATIONS);
 * presence/status/gate are factual; missing required documents are reported as
 * such; and the report never claims everything is approved unless every
 * required document is actually approved AND passes the existing completeness
 * gate.
 *
 * The obligations pinned here (2026-10-05, g-eu-postmarket-obligations):
 *   - IVDR A/B owe a PMS report (Art 80), not a PSUR; only C/D owe a PSUR (Art 81).
 *   - IVDR C/D owe an SSP (Art 29); IVDR follow-up is PMPF (Annex XIII Part B).
 *   - Every MDR Class I (incl. Is/Im/Ir) owes a PMS report (Art 85).
 *   - The SSCP (MDR Art 32) covers every implantable and every Class III device
 *     other than custom-made ones — implantable is a stated fact, never sniffed
 *     out of the class string.
 *   - An unrecognised class fails closed: no required set, never "ready".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// The documentation-status route is exercised against a mocked DB: the program
// check reads regulatory_programs on the pool, and listProgramDocuments ends in
// orderBy(). Nothing else in this file touches the DB.
const h = vi.hoisted(() => ({ programRows: [] as any[], docRows: [] as any[] }));

vi.mock('../../../db', () => {
  const chain: any = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => Promise.resolve(h.docRows),
    limit: () => Promise.resolve(h.programRows),
  };
  const query = (sql: string) =>
    Promise.resolve(
      /FROM regulatory_programs/.test(sql)
        ? { rows: h.programRows, rowCount: h.programRows.length }
        : { rows: [], rowCount: 0 }
    );
  return { db: chain, pool: { query }, getPool: () => ({ query }) };
});

vi.mock('../../../middleware/auth', () => ({
  authenticateToken: (_req: any, _res: any, next: any) => next(),
}));
import {
  computeDocStatus,
  EU_POSTMARKET_OBLIGATIONS,
  normaliseEuDeviceClass,
} from '../post-market-readiness';
import { buildPmcfPlanContent } from '../pmcf-plan-generator';
import {
  buildPmsPlanContent,
  buildPmcfEvaluationContent,
  buildSspContent,
  buildPmpfPlanContent,
  buildPmpfEvaluationContent,
  AUTHORABLE_DOCUMENT_TYPES,
  authorPostMarketDocument,
} from '../post-market-authoring';
import { validateDocument } from '../post-market.service';
import {
  POST_MARKET_DOCUMENT_TYPES,
  type PostMarketDocument,
  type PostMarketDocumentType,
} from '../../../../shared/schema/gspr-postmarket';
import { basisProblems } from '../../../../shared/regulatory/regulatory-basis';

function doc(
  documentType: PostMarketDocumentType,
  overrides: Partial<PostMarketDocument> = {}
): PostMarketDocument {
  return {
    id: `doc-${documentType}`,
    documentType,
    version: 1,
    status: 'draft',
    locked: false,
    content: {},
    reportingPeriodStart: null,
    reportingPeriodEnd: null,
    ...overrides,
  } as unknown as PostMarketDocument;
}

const ctx = { deviceName: 'Acme Pump', deviceClass: 'IIb', regulation: 'MDR' as const };

/**
 * A sponsor-specialised version of generated content: same keys, but every field
 * replaced with real content that no longer carries the DRAFT scaffold sentinel.
 * Raw generator output is unspecialised scaffold and (correctly) fails the gate,
 * so a fixture that needs a genuinely gate-passing document must specialise it.
 */
function specialised(content: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.keys(content).map(k => [k, `Sponsor-specialised final content for ${k}.`])
  );
}

function requiredSet(r: ReturnType<typeof computeDocStatus>): Set<PostMarketDocumentType> {
  return new Set(r.documents.filter(d => d.required).map(d => d.documentType));
}

function row(r: ReturnType<typeof computeDocStatus>, t: PostMarketDocumentType) {
  const found = r.documents.find(d => d.documentType === t);
  if (!found) throw new Error(`no ${t} row in the report`);
  return found;
}

const approvedPmsReport = (): PostMarketDocument =>
  doc('pms_report', {
    status: 'approved',
    content: {
      summaryOfFindings: 'x',
      correctivePreventiveActions: 'y',
      concludingAssessment: 'z',
    },
    reportingPeriodStart: new Date('2025-01-01') as any,
    reportingPeriodEnd: new Date('2025-12-31') as any,
  });

describe('computeDocStatus — MDR', () => {
  it('reports the six MDR types, flagging required ones for a non-implantable Class IIb device', () => {
    const r = computeDocStatus([], 'IIb', 'MDR', 'p1', { implantable: false });
    expect(r.status).toBe('assessed');
    expect(r.documents.map(d => d.documentType).sort()).toEqual(
      ['pmcf_evaluation', 'pmcf_plan', 'pms_plan', 'pms_report', 'psur', 'sscp'].sort()
    );
    const required = requiredSet(r);
    expect(required).toContain('pms_plan');
    expect(required).toContain('psur');
    expect(required).toContain('pmcf_plan');
    expect(required).toContain('pmcf_evaluation');
    expect(required.has('sscp')).toBe(false);
    expect(required.has('pms_report')).toBe(false);
    expect(row(r, 'psur').cadence).toMatch(/at least annually/i);
  });

  it('marks absent required documents as missing and not approved', () => {
    const r = computeDocStatus([], 'IIb', 'MDR', 'p1', { implantable: false });
    const pms = row(r, 'pms_plan');
    expect(pms.present).toBe(false);
    expect(pms.status).toBe('missing');
    expect(r.requiredPresent).toBe(0);
    expect(r.allRequiredApproved).toBe(false);
  });

  it('uses the latest version per type and runs the real validation gate', () => {
    const docs = [
      doc('pms_plan', { version: 1, content: {} }),
      doc('pms_plan', { version: 2, content: specialised(buildPmsPlanContent(ctx)), status: 'approved' }),
    ];
    const r = computeDocStatus(docs, 'IIb', 'MDR', 'p1');
    const pms = row(r, 'pms_plan');
    expect(pms.present).toBe(true);
    expect(pms.latestVersion).toBe(2);
    expect(pms.status).toBe('approved');
    expect(pms.gatePasses).toBe(true); // complete content → gate passes
  });

  it('an approved-but-incomplete document does NOT count as gate-passing', () => {
    const docs = [doc('pms_plan', { status: 'approved', content: {} })];
    const r = computeDocStatus(docs, 'IIb', 'MDR', 'p1');
    const pms = row(r, 'pms_plan');
    expect(pms.status).toBe('approved');
    expect(pms.gatePasses).toBe(false); // empty content fails the completeness gate
  });

  it('Class I owes a PMS plan and PMS report, and PMCF plan + evaluation unless justified', () => {
    const r = computeDocStatus([], 'I', 'MDR', 'p1', { implantable: false });
    expect([...requiredSet(r)].sort()).toEqual(
      ['pmcf_evaluation', 'pmcf_plan', 'pms_plan', 'pms_report'].sort()
    );
    expect(row(r, 'pmcf_plan').obligation).toBe('required-or-justified');
    expect(row(r, 'pms_report').obligation).toBe('required');
    expect(row(r, 'psur').required).toBe(false);
  });

  it('allRequiredApproved is true only when every required doc is approved AND passes the gate', () => {
    const approvedPlan = doc('pms_plan', {
      status: 'approved',
      content: specialised(buildPmsPlanContent({ ...ctx, deviceClass: 'I' })),
    });
    const withoutPmcf = computeDocStatus([approvedPlan, approvedPmsReport()], 'I', 'MDR', 'p1', {
      implantable: false,
    });
    expect(withoutPmcf.requiredTotal).toBe(4);
    expect(withoutPmcf.allRequiredApproved).toBe(false);

    const period = {
      reportingPeriodStart: new Date('2025-01-01') as any,
      reportingPeriodEnd: new Date('2025-12-31') as any,
    };
    const all = computeDocStatus(
      [
        approvedPlan,
        approvedPmsReport(),
        doc('pmcf_plan', { status: 'approved', content: specialised(buildPmcfPlanContent({ ...ctx, deviceClass: 'I' }) as any) }),
        doc('pmcf_evaluation', {
          status: 'approved',
          content: specialised(buildPmcfEvaluationContent({ ...ctx, deviceClass: 'I' })),
          ...period,
        }),
      ],
      'I',
      'MDR',
      'p1',
      { implantable: false }
    );
    expect(all.requiredApprovedCount).toBe(4);
    expect(all.allRequiredApproved).toBe(true);
  });

});

describe('computeDocStatus — MDR class I variants, SSCP and implantable', () => {
  it.each(['Is', 'Im', 'Ir', 'Class Is', 'class im'])(
    'MDR %s is a Class I device and owes a PMS report under Art 85',
    cls => {
      const r = computeDocStatus([], cls, 'MDR', 'p1', { implantable: false });
      expect(r.status).toBe('assessed');
      const pmsr = row(r, 'pms_report');
      expect(pmsr.required).toBe(true);
      expect(pmsr.basis[0].ref).toBe('MDR Art 85');
      expect(row(r, 'psur').required).toBe(false);
    }
  );

  it('requires an SSCP for an implantable Class IIa device (Art 32 covers every implantable)', () => {
    const r = computeDocStatus([], 'IIa', 'MDR', 'p1', { implantable: true });
    const sscp = row(r, 'sscp');
    expect(sscp.required).toBe(true);
    expect(sscp.basis[0].ref).toBe('MDR Art 32');
    // An implantable device's PSUR goes to the notified body through EUDAMED.
    expect(row(r, 'psur').recipient).toMatch(/EUDAMED/);
    expect(row(r, 'psur').cadence).toMatch(/every two years/i);
  });

  it('requires an SSCP for Class III and none for a custom-made Class III device', () => {
    expect(row(computeDocStatus([], 'III', 'MDR', 'p1', { implantable: false }), 'sscp').required).toBe(true);
    expect(
      row(computeDocStatus([], 'III', 'MDR', 'p1', { implantable: true, customMade: true }), 'sscp').required
    ).toBe(false);
  });

  it('does not read "implantable" out of the class string', () => {
    const r = computeDocStatus([], 'IIb implantable', 'MDR', 'p1');
    expect(r.status).toBe('class_unrecognised');
  });

  it('leaves the SSCP undetermined, and the set not approved, when implantable is not stated', () => {
    const r = computeDocStatus([], 'IIb', 'MDR', 'p1');
    const sscp = row(r, 'sscp');
    expect(sscp.obligation).toBe('undetermined');
    expect(sscp.required).toBe(false);
    expect(r.undeterminedTotal).toBe(1);
    expect(r.allRequiredApproved).toBe(false);
  });
});

describe('computeDocStatus — IVDR', () => {
  it('reports the six IVDR types: PMPF and SSP, not PMCF and SSCP', () => {
    const r = computeDocStatus([], 'C', 'IVDR', 'p1');
    expect(r.documents.map(d => d.documentType).sort()).toEqual(
      ['pmpf_evaluation', 'pmpf_plan', 'pms_plan', 'pms_report', 'psur', 'ssp'].sort()
    );
  });

  it.each(['A', 'B', 'Class B'])('IVDR Class %s owes a PMS report under Art 80 and no PSUR', cls => {
    const r = computeDocStatus([], cls, 'IVDR', 'p');
    expect(r.status).toBe('assessed');
    expect(row(r, 'psur').required).toBe(false);
    const pmsr = row(r, 'pms_report');
    expect(pmsr.required).toBe(true);
    expect(pmsr.citation).toContain('IVDR Art 80');
    expect(pmsr.citation).not.toContain('MDR');
    expect(row(r, 'ssp').required).toBe(false);
  });

  it.each(['C', 'D'])('IVDR Class %s owes a PSUR (Art 81) and an SSP (Art 29), PMPF under Annex XIII Part B', cls => {
    const r = computeDocStatus([], cls, 'IVDR', 'p');
    const ssp = row(r, 'ssp');
    expect(ssp.required).toBe(true);
    expect(ssp.citation).toContain('IVDR Art 29');
    const psur = row(r, 'psur');
    expect(psur.required).toBe(true);
    expect(psur.basis[0].ref).toBe('IVDR Art 81');
    expect(psur.cadence).toMatch(/at least annually/i);
    expect(row(r, 'pms_report').required).toBe(false);
    const pmpf = row(r, 'pmpf_plan');
    expect(pmpf.required).toBe(true);
    expect(pmpf.obligation).toBe('required-or-justified');
    expect(pmpf.citation).toContain('IVDR Annex XIII Part B');
    expect(r.documents.every(d => !d.citation.includes('MDR'))).toBe(true);
  });

  it('IVDR Class D PSURs go to the notified body through EUDAMED; Class C PSURs are made available', () => {
    expect(row(computeDocStatus([], 'D', 'IVDR', 'p'), 'psur').recipient).toMatch(/EUDAMED/);
    expect(row(computeDocStatus([], 'C', 'IVDR', 'p'), 'psur').recipient).toMatch(/made available/i);
  });
});

describe('computeDocStatus — fail closed on an unrecognised class', () => {
  it.each([
    ['X', 'MDR'],
    ['B', 'MDR'],
    ['IIa', 'IVDR'],
    [null, 'MDR'],
    ['', 'IVDR'],
  ] as const)('class %j under %s → class_unrecognised, class-dependent rows undetermined, never approved', (cls, reg) => {
    const r = computeDocStatus([approvedPmsReport()], cls, reg, 'p');
    expect(r.status).toBe('class_unrecognised');
    expect(r.normalisedClass).toBeNull();
    expect(r.classProblem).toBeTruthy();
    // pms_report and psur depend on the class: they cannot be decided.
    for (const t of ['pms_report', 'psur'] as const) {
      expect(row(r, t).obligation, t).toBe('undetermined');
      expect(row(r, t).required, t).toBe(false);
      expect(row(r, t).note, t).toBe(r.classProblem);
    }
    expect(r.allRequiredApproved).toBe(false);
    // Presence is still reported factually.
    expect(row(r, 'pms_report').present).toBe(true);
  });

  // Every MDR device owes a PMS plan whatever its class; an unrecognised class
  // must not turn it into "optional" (PmsPmcfTab renders !required as optional).
  it('a US class under MDR keeps the class-independent obligations and leaves the rest undetermined', () => {
    const r = computeDocStatus([], 'II', 'MDR', 'p');
    expect(r.status).toBe('class_unrecognised');
    expect(row(r, 'pms_plan').obligation).toBe('required');
    expect(row(r, 'pms_plan').required).toBe(true);
    expect(row(r, 'pmcf_plan').obligation).toBe('required-or-justified');
    expect(row(r, 'pmcf_evaluation').obligation).toBe('required-or-justified');
    for (const t of ['psur', 'pms_report', 'sscp'] as const) {
      expect(row(r, t).obligation, t).toBe('undetermined');
    }
    expect(r.requiredTotal).toBe(3);
    expect(r.undeterminedTotal).toBe(3);
  });

  it('an unset class under IVDR still owes the PMS plan and the PMPF plan/evaluation', () => {
    const r = computeDocStatus([], null, 'IVDR', 'p');
    expect(r.status).toBe('class_unrecognised');
    expect(row(r, 'pms_plan').obligation).toBe('required');
    expect(row(r, 'pmpf_plan').obligation).toBe('required-or-justified');
    expect(row(r, 'pmpf_evaluation').obligation).toBe('required-or-justified');
    for (const t of ['psur', 'pms_report', 'ssp'] as const) {
      expect(row(r, t).obligation, t).toBe('undetermined');
    }
    expect(r.requiredTotal).toBe(3);
  });

  it('an unrecognised class is never all-approved, even with every class-independent document approved', () => {
    const period = {
      reportingPeriodStart: new Date('2025-01-01') as any,
      reportingPeriodEnd: new Date('2025-12-31') as any,
    };
    const docs = [
      doc('pms_plan', { status: 'approved', content: specialised(buildPmsPlanContent(ctx)) }),
      doc('pmcf_plan', { status: 'approved', content: specialised(buildPmcfPlanContent(ctx) as any) }),
      doc('pmcf_evaluation', {
        status: 'approved',
        content: specialised(buildPmcfEvaluationContent(ctx)),
        ...period,
      }),
    ];
    const r = computeDocStatus(docs, 'II', 'MDR', 'p');
    expect(r.requiredApprovedCount).toBe(3);
    expect(r.requiredTotal).toBe(3);
    expect(r.allRequiredApproved).toBe(false);
  });
});

describe('MDR SSCP and the implantable fact', () => {
  // MDR Annex VIII Rule 8 (recall): an implantable device is Class IIa (teeth) or
  // higher, so a Class I device is never implantable and never owes an SSCP.
  it.each(['I', 'Is', 'Im', 'Ir'])('Class %s does not owe an SSCP and is not left undetermined', cls => {
    const r = computeDocStatus([], cls, 'MDR', 'p');
    expect(row(r, 'sscp').obligation).toBe('not-required');
    expect(r.undeterminedTotal).toBe(0);
  });
});

describe('validateDocument fails closed on a type with no validator', () => {
  it('an unknown document type does not pass the gate and carries PM-098', () => {
    const v = validateDocument(doc('unknown_type' as PostMarketDocumentType, { content: { anything: 'x' } }));
    expect(v.passesGate).toBe(false);
    expect(v.findings.map(f => f.code)).toContain('PM-098');
  });
});

describe('authoring refuses the other regulation’s instrument', () => {
  const base = { organizationId: 99, programId: 'p', createdBy: 'u', deviceName: 'Acme' };

  it.each([
    ['sscp', { regulation: 'IVDR' as const }, /ssp/],
    ['pmcf_plan', { regulation: 'IVDR' as const }, /pmpf_plan/],
    ['pmcf_evaluation', { regulation: 'IVDR' as const }, /pmpf_evaluation/],
    ['ssp', { regulation: 'MDR' as const }, /sscp/],
    ['pmpf_plan', { regulation: 'MDR' as const }, /pmcf_plan/],
    ['pmpf_evaluation', { regulation: 'MDR' as const }, /pmcf_evaluation/],
    // No regulation given: the IVD hint in the class decides it, before the type does.
    ['pmcf_plan', { deviceClass: 'IVD Class C' }, /pmpf_plan/],
    ['sscp', { deviceClass: 'IVD Class D' }, /ssp/],
  ] as const)('%s with %j is refused with PM_BAD_TYPE', async (documentType, extra, instead) => {
    await expect(
      authorPostMarketDocument({ ...base, documentType, ...extra })
    ).rejects.toMatchObject({ code: 'PM_BAD_TYPE', message: expect.stringMatching(instead) });
  });
});

describe('POST /api/post-market/programs/:id/documents/:type/generate', () => {
  const PROGRAM = 'aaaaaaaa-0000-4000-8000-000000000001';

  beforeEach(() => {
    h.programRows = [{ id: PROGRAM }];
    h.docRows = [];
  });

  it('refuses a PMCF plan for an IVD class with 422 naming the PMPF plan', async () => {
    const { postMarketRouter } = await import('../../../routes/gspr-postmarket');
    const a = express();
    a.use(express.json());
    a.use((req, _res, next) => {
      (req as any).user = { id: 7, organizationId: 99 };
      next();
    });
    a.use('/api/post-market', postMarketRouter);
    const res = await request(a)
      .post(`/api/post-market/programs/${PROGRAM}/documents/pmcf_plan/generate`)
      .send({ deviceName: 'Acme HbA1c Assay', deviceClass: 'IVD Class C' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/pmpf_plan/);
  });
});

describe('EU_POSTMARKET_OBLIGATIONS', () => {
  it('normalises the class vocabulary per regulation', () => {
    expect(normaliseEuDeviceClass('Class IIb', 'MDR')).toBe('IIb');
    expect(normaliseEuDeviceClass('iii', 'MDR')).toBe('III');
    expect(normaliseEuDeviceClass('IS', 'MDR')).toBe('Is');
    expect(normaliseEuDeviceClass('class d', 'IVDR')).toBe('D');
    expect(normaliseEuDeviceClass('D', 'MDR')).toBeNull();
    expect(normaliseEuDeviceClass('IIb implantable', 'MDR')).toBeNull();
  });

  it('every row carries a well-formed basis, an article, a cadence and a recipient', () => {
    expect(EU_POSTMARKET_OBLIGATIONS.length).toBeGreaterThan(0);
    for (const o of EU_POSTMARKET_OBLIGATIONS) {
      expect(basisProblems(o.basis), o.id).toEqual([]);
      expect(o.basis.url, o.id).toMatch(/^https:\/\/eur-lex\.europa\.eu\//);
      // Nothing in this table was re-read against EUR-Lex: it must say so.
      expect(o.basis.confidence, o.id).toBe('recall');
      expect(o.article.trim(), o.id).not.toBe('');
      expect(o.cadence.trim(), o.id).not.toBe('');
      expect(o.recipient.trim(), o.id).not.toBe('');
    }
  });

  it('at most one row decides each document type for any class and implantable state', () => {
    const mdr = ['I', 'Is', 'Im', 'Ir', 'IIa', 'IIb', 'III'];
    const ivdr = ['A', 'B', 'C', 'D'];
    for (const [reg, classes] of [['MDR', mdr], ['IVDR', ivdr]] as const) {
      for (const cls of classes) {
        for (const implantable of [true, false]) {
          const r = computeDocStatus([], cls, reg, 'p', { implantable, customMade: false });
          expect(r.status).toBe('assessed');
          expect(new Set(r.documents.map(d => d.documentType)).size).toBe(r.documents.length);
          expect(r.documents.every(d => d.obligation !== 'undetermined')).toBe(true);
        }
      }
    }
  });
});

describe('IVDR document types are first-class post-market documents', () => {
  it('the type vocabulary and the authoring registry include ssp, pmpf_plan and pmpf_evaluation', () => {
    for (const t of ['ssp', 'pmpf_plan', 'pmpf_evaluation'] as const) {
      expect(POST_MARKET_DOCUMENT_TYPES).toContain(t);
      expect(AUTHORABLE_DOCUMENT_TYPES).toContain(t);
    }
    expect([...AUTHORABLE_DOCUMENT_TYPES].sort()).toEqual([...POST_MARKET_DOCUMENT_TYPES].sort());
  });

  const ivdCtx = { deviceName: 'Acme HbA1c Assay', deviceClass: 'C', regulation: 'IVDR' as const };
  const cases = [
    ['ssp', () => buildSspContent(ivdCtx), false],
    ['pmpf_plan', () => buildPmpfPlanContent(ivdCtx), false],
    ['pmpf_evaluation', () => buildPmpfEvaluationContent(ivdCtx), true],
  ] as const;

  for (const [type, build, withPeriod] of cases) {
    const period = withPeriod
      ? { reportingPeriodStart: new Date('2025-01-01') as any, reportingPeriodEnd: new Date('2025-12-31') as any }
      : {};
    it(`${type}: an empty document fails the gate`, () => {
      const v = validateDocument(doc(type, { content: {}, ...period }));
      expect(v.passesGate).toBe(false);
      expect(v.findings.every(f => !/\bMDR\b/.test(f.citation))).toBe(true);
    });
    it(`${type}: raw DRAFT scaffold fails the gate, the specialised document passes`, () => {
      const content = build();
      expect(validateDocument(doc(type, { content, ...period })).passesGate).toBe(false);
      expect(validateDocument(doc(type, { content: specialised(content), ...period })).passesGate).toBe(true);
    });
  }

  it('pmpf_evaluation must declare a reporting period', () => {
    const v = validateDocument(doc('pmpf_evaluation', { content: specialised(buildPmpfEvaluationContent(ivdCtx)) }));
    expect(v.passesGate).toBe(false);
  });
});

describe('GET /api/post-market/programs/:id/documentation-status', () => {
  const PROGRAM = 'aaaaaaaa-0000-4000-8000-000000000001';
  const url = (q: string) => `/api/post-market/programs/${PROGRAM}/documentation-status?${q}`;

  async function app() {
    const { postMarketRouter } = await import('../../../routes/gspr-postmarket');
    const a = express();
    a.use((req, _res, next) => {
      (req as any).user = { id: 7, organizationId: 99 };
      next();
    });
    a.use('/api/post-market', postMarketRouter);
    return a;
  }

  beforeEach(() => {
    h.programRows = [{ id: PROGRAM }];
    h.docRows = [];
  });

  it('passes implantable through: an implantable Class IIa device owes an SSCP', async () => {
    const res = await request(await app()).get(url('regulation=MDR&deviceClass=IIa&implantable=true'));
    expect(res.status).toBe(200);
    expect(res.body.implantable).toBe(true);
    expect(res.body.documents.find((d: any) => d.documentType === 'sscp').required).toBe(true);
  });

  it('an unstated implantable fact stays unknown, not false', async () => {
    const res = await request(await app()).get(url('regulation=MDR&deviceClass=IIb'));
    expect(res.status).toBe(200);
    expect(res.body.implantable).toBeNull();
    expect(res.body.documents.find((d: any) => d.documentType === 'sscp').obligation).toBe('undetermined');
  });

  it('customMade=true removes the SSCP for Class III', async () => {
    const res = await request(await app()).get(url('regulation=MDR&deviceClass=III&implantable=true&customMade=true'));
    expect(res.status).toBe(200);
    expect(res.body.documents.find((d: any) => d.documentType === 'sscp').required).toBe(false);
  });

  it('answers IVDR Class B with a PMS report and no PSUR', async () => {
    const res = await request(await app()).get(url('regulation=IVDR&deviceClass=B'));
    expect(res.status).toBe(200);
    const byType = Object.fromEntries(res.body.documents.map((d: any) => [d.documentType, d]));
    expect(byType.pms_report.required).toBe(true);
    expect(byType.psur.required).toBe(false);
  });

  it.each(['implantable=yes', 'customMade=1', 'regulation=FDA'])('refuses %s with 422', async q => {
    const res = await request(await app()).get(url(`deviceClass=IIa&${q}`));
    expect(res.status).toBe(422);
  });
});
