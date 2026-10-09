/**
 * Technical-file `ready`: the ZIP, the response and the audit row agree, and a
 * leaf outside the Annex II/III tree does not make a complete file not ready.
 *
 * 2026-09-23 (W5/D7, round-2 skeptic). Two defects in one number:
 *   1. `ready` became `manifest.ready && plan.skipped.length === 0`, and
 *      plan.skipped also holds the leaves NO Annex slot claims ('unmapped').
 *      The eu-mdr outline marks IV.1 / IV.3 / IV.5 (declaration of
 *      conformity, EUDAMED registration, PRRC) mandatory and no technical-doc
 *      slot takes them, so every fully authored MDR program reported
 *      ready: false. Those leaves are now `unmappedLeaves`, reported in the
 *      result, the ZIP manifest and the audit row, and not folded into ready.
 *   2. The ZIP's manifest.json was the manifest from before the plan resolved
 *      any leaf: a ZIP without the CER said ready: true and listed the CER
 *      'present'. It is now the reconciled manifest, with the post-plan ready.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { promises as fs } from 'fs';
import JSZip from 'jszip';
import { createIndPgliteDb, type IndPgliteDb } from '../../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any, pool: null as any, audit: [] as any[] }));
vi.mock('../../../../db', () => ({
  get db() { return holder.db; },
  get pool() { return holder.pool; },
}));
vi.mock('../../../auditService', () => ({
  default: {
    logAction: vi.fn(async (row: any) => {
      holder.audit.push(row);
      return { persisted: true };
    }),
  },
}));

import {
  assembleTechnicalFileFromProgram,
  assembleTechnicalFileFromCore,
} from '../assemble-technical-file-from-core';

let h: IndPgliteDb;
const ORG = 8;
const USER = 4;
const MDR_PROG = '5b0f2f0e-9a7d-4a2e-8c3f-2d1e6f7a8b9c';

const sec = (doc: string, key: string, label: string, order: number) =>
  `('${doc}', '${key}', NULL, '${label}', ${order}, true, 'approved', '{"text":"Authored body for ${key}."}'::jsonb)`;

/** One authored section per required MDR Annex II/III slot. */
const MDR_REQUIRED: Array<[string, string]> = [
  ['II.1.a', 'Product name and intended purpose'],
  ['II.2.b', 'Instructions for use'],
  ['II.3.b', 'Manufacturing processes'],
  ['II.4.a', 'GSPR checklist'],
  ['II.5.a', 'Risk management plan and file'],
  ['II.6.1.a', 'Biocompatibility'],
  ['II.6.1.g', 'Clinical evaluation report — Annex XIV Part A'],
  ['III.1', 'Post-market surveillance plan (Article 84)'],
];
/** Mandatory in migrations/20260810b_eu_mdr_ivdr_outlines.sql; no technical-doc slot claims them. */
const MDR_IV: Array<[string, string]> = [
  ['IV.1', 'EU declaration of conformity — Annex IV'],
  ['IV.3', 'EUDAMED registration — actor, device and UDI data'],
  ['IV.5', 'Person responsible for regulatory compliance — Article 15'],
];

/*
 * 2026-09-23 (W5/D7, round-2 skeptic, second pass): the IVDR outline marks the
 * II.6.3 stability group mandatory and no IVDR slot took it (IVDR_SECTIONS in
 * tech-doc-assembler.ts). It was Annex II technical documentation the ZIP did
 * not hold, so it counted against ready — unlike IV.*.
 * 2026-09-23 (W5/D7, residual repair): IVDR_SECTIONS now has the stability
 * slot (Annex II 6.3, required), so II.6.3.a is placed and a complete IVDR
 * program is ready; one WITHOUT the stability group is not.
 */
const IVDR_PROG = '6b0f2f0e-9a7d-4a2e-8c3f-2d1e6f7a8b9c';
const IVDR_NO_STABILITY_PROG = '8b0f2f0e-9a7d-4a2e-8c3f-2d1e6f7a8b9c';
const IVDR_REQUIRED: Array<[string, string]> = [
  ['II.1.a', 'Product name and intended purpose'],
  ['II.2.b', 'Instructions for use'],
  ['II.3.b', 'Manufacturing processes'],
  ['II.4.a', 'GSPR checklist'],
  ['II.5.a', 'Risk management plan and file'],
  ['II.6.1.a', 'Analytical sensitivity'],
  ['II.6.2.b', 'Clinical performance'],
  ['II.6.2.c', 'Performance evaluation plan and report'],
  ['III.1', 'Post-market surveillance plan (Article 79)'],
];
const IVDR_STABILITY: [string, string] = ['II.6.3.a', 'Claimed shelf life and real-time stability'];
/** Optional in the eu-ivdr outline; authored here, so they must reach the ZIP. */
const IVDR_OPTIONAL: Array<[string, string]> = [
  ['II.6.4.a', 'Software verification and validation — EN 62304'],
  ['II.6.5', 'Usability and human factors — EN 62366-1'],
];

async function zipManifest(bytes: Buffer): Promise<any> {
  const zip = await JSZip.loadAsync(bytes);
  return { zip, manifest: JSON.parse(await zip.file('manifest.json')!.async('string')) };
}

function lastAudit(): any {
  const row = holder.audit[holder.audit.length - 1];
  expect(row.action).toBe('DEVICE_TECHNICAL_FILE_ASSEMBLED');
  return row.details;
}

beforeAll(async () => {
  h = await createIndPgliteDb({ submissionCore: true, leafSources: true, governedSections: true });
  holder.db = h.db;
  holder.pool = h.pglite;
  const nonCer = MDR_REQUIRED.filter(([k]) => k !== 'II.6.1.g');
  await h.pglite.exec(`
    INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title) VALUES
      ('doc_mdr', ${ORG}, '${MDR_PROG}', 'mdr', 'ema', 'eu-mdr', 'MDR TF');
    INSERT INTO c2c_document_sections (document_id, section_key, parent_key, label, path_order, mandatory, status, content) VALUES
      ${[...MDR_REQUIRED, ...MDR_IV].map(([k, l], i) => sec('doc_mdr', k, l, i + 1)).join(',\n      ')};

    -- Sequence: every required slot is filled; the CER leaf points at a
    -- coauthor document that does not exist, so the ZIP cannot hold it.
    INSERT INTO coauthor_documents (id, organization_id, title, content, status, module_number) VALUES
      ${nonCer.map(([k, l], i) => `(${300 + i}, ${ORG}, '${l}', '<p>${k} body</p>', 'approved', '${k}')`).join(',\n      ')};
    INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by)
      VALUES (1, 'MDR TF', 'mdr', 'medtech', 'eu', ${ORG}, ${USER});
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by)
      VALUES (1, 1, 'eu', '0000', ${ORG}, ${USER});
    INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
      ${nonCer.map(([k, l], i) => `(1, '${k}', '${l}', 'new', 'coauthor_documents', ${300 + i}, ${ORG}, ${USER})`).join(',\n      ')},
      (1, 'II.6.1.g', 'Clinical evaluation report', 'new', 'coauthor_documents', 9999, ${ORG}, ${USER});

    -- Sequence 2: every required slot resolves, and design-manufacturing holds
    -- TWO distinct II.3.b documents (402 and 499). Both must reach the ZIP.
    INSERT INTO coauthor_documents (id, organization_id, title, content, status, module_number) VALUES
      ${MDR_REQUIRED.map(([k, l], i) => `(${400 + i}, ${ORG}, '${l}', '<p>${k} body S2</p>', 'approved', '${k}')`).join(',\n      ')},
      (499, ${ORG}, 'Manufacturing process validation', '<p>Process validation body</p>', 'approved', 'II.3.b');
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by)
      VALUES (2, 1, 'eu', '0001', ${ORG}, ${USER});
    INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
      ${MDR_REQUIRED.map(([k, l], i) => `(2, '${k}', '${l}', 'new', 'coauthor_documents', ${400 + i}, ${ORG}, ${USER})`).join(',\n      ')},
      (2, 'II.3.b', 'Manufacturing process validation', 'new', 'coauthor_documents', 499, ${ORG}, ${USER});

    INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title) VALUES
      ('doc_ivdr', ${ORG}, '${IVDR_PROG}', 'ivdr', 'ema', 'eu-ivdr', 'IVDR TF');
    INSERT INTO c2c_document_sections (document_id, section_key, parent_key, label, path_order, mandatory, status, content) VALUES
      ${[...IVDR_REQUIRED, IVDR_STABILITY, ...IVDR_OPTIONAL].map(([k, l], i) => sec('doc_ivdr', k, l, i + 1)).join(',\n      ')};

    INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title) VALUES
      ('doc_ivdr_nostab', ${ORG}, '${IVDR_NO_STABILITY_PROG}', 'ivdr', 'ema', 'eu-ivdr', 'IVDR TF without stability');
    INSERT INTO c2c_document_sections (document_id, section_key, parent_key, label, path_order, mandatory, status, content) VALUES
      ${IVDR_REQUIRED.map(([k, l], i) => sec('doc_ivdr_nostab', k, l, i + 1)).join(',\n      ')};
  `);

  /*
   * 2026-09-23 (W5/D7, residual repair). Sequences 3 and 4: every required MDR
   * slot resolves except II.6.1.g; instead a bench report (650) and the CER
   * (651, document_type 'cer') share section code II.6.1.b — bench first in
   * sequence 3, CER first in sequence 4. The Annex XIV folder must hold 651.
   */
  const seqLeaves = (seq: number) =>
    nonCer.map(([k, l], i) => `(${seq}, '${k}', '${l}', 'new', 'coauthor_documents', ${600 + i}, NULL, ${ORG}, ${USER})`).join(',\n      ');
  const bench = (seq: number) => `(${seq}, 'II.6.1.b', 'Physical and chemical characterisation bench report', 'new', 'coauthor_documents', 650, NULL, ${ORG}, ${USER})`;
  const cer = (seq: number) => `(${seq}, 'II.6.1.b', 'CER', 'new', 'coauthor_documents', 651, 'cer', ${ORG}, ${USER})`;
  await h.pglite.exec(`
    INSERT INTO coauthor_documents (id, organization_id, title, content, status, module_number) VALUES
      ${nonCer.map(([k, l], i) => `(${600 + i}, ${ORG}, '${l}', '<p>${k} body S3</p>', 'approved', '${k}')`).join(',\n      ')},
      (650, ${ORG}, 'Physical and chemical characterisation bench report', '<p>BENCH</p>', 'approved', 'II.6.1.b'),
      (651, ${ORG}, 'CER', '<p>CLINICAL EVALUATION REPORT</p>', 'approved', 'II.6.1.b');
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by)
      VALUES (3, 1, 'eu', '0002', ${ORG}, ${USER}), (4, 1, 'eu', '0003', ${ORG}, ${USER});
    INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, document_type, organization_id, created_by) VALUES
      ${seqLeaves(3)},
      ${bench(3)},
      ${cer(3)},
      ${seqLeaves(4)},
      ${cer(4)},
      ${bench(4)};
  `);
});

afterAll(async () => {
  await h.close();
});

describe('technical-file ready — unmapped leaves are reported, not folded into ready', () => {
  it('a complete MDR program that also holds the mandatory IV.* sections is ready, and names them', async () => {
    const r = await assembleTechnicalFileFromProgram({ programId: MDR_PROG, organizationId: ORG, userId: USER, regulation: 'mdr' });
    expect(r.unresolvedLeaves).toEqual([]);
    expect(r.ready).toBe(true);
    expect(r.unmappedLeaves.map((u) => u.source)).toEqual(['IV.1', 'IV.3', 'IV.5']);

    const { manifest } = await zipManifest(r.buffer);
    expect(manifest.ready).toBe(true);
    expect(manifest.unmappedLeaves.map((u: any) => u.source)).toEqual(['IV.1', 'IV.3', 'IV.5']);
    // The returned manifest (the governed artifact's content) is the one in the ZIP.
    expect(r.manifest.ready).toBe(true);

    const audit = lastAudit();
    expect(audit.ready).toBe(true);
    expect(audit.unmappedLeaves).toEqual(['IV.1', 'IV.3', 'IV.5']);

    // 2026-09-23 (W5/D7, final pass): every leaf here is outline-keyed, so no
    // slot rests on a title alone — and the result, the ZIP manifest and the
    // audit row all carry the (empty) list.
    expect(r.matchedByTitleOnly).toEqual([]);
    expect(manifest.matchedByTitleOnly).toEqual([]);
    expect(audit.matchedByTitleOnly).toEqual([]);
  }, 60_000);
});

describe('technical-file ready — the ZIP manifest agrees with the response and the audit row', () => {
  it('a ZIP without the CER says ready: false and does not list the CER as present', async () => {
    const r = await assembleTechnicalFileFromCore({ sequenceId: 1, organizationId: ORG, userId: USER, regulation: 'mdr', applicationId: 'TF' });
    try {
      expect(r.ready).toBe(false);
      const { zip, manifest } = await zipManifest(await fs.readFile(r.bundle.path));
      const cer = manifest.entries.find((e: any) => e.id === 'clinical-evaluation');
      const cerPdfs = Object.keys(zip.files).filter((f) => f.startsWith(`${cer.path}/`) && f.endsWith('.pdf'));
      expect(cerPdfs).toEqual([]);
      expect(manifest.ready).toBe(false);
      expect(cer.status).toBe('missing');
      expect(cer.sources).toEqual([]);
      expect(cer.unresolvedSources).toEqual(['II.6.1.g']);
      expect(lastAudit().ready).toBe(false);
      expect(r.unmappedLeaves).toEqual([]);
    } finally {
      await r.cleanup();
    }
  }, 60_000);
});

describe('technical-file ready — every claimed leaf reaches the ZIP, and Annex II/III leaves count', () => {
  it('a slot holding two documents with one section code places both, once each, and names neither unmapped', async () => {
    const r = await assembleTechnicalFileFromCore({ sequenceId: 2, organizationId: ORG, userId: USER, regulation: 'mdr', applicationId: 'TF2' });
    try {
      const { zip, manifest } = await zipManifest(await fs.readFile(r.bundle.path));
      const dm = manifest.entries.find((e: any) => e.id === 'design-manufacturing');
      const pdfs = Object.keys(zip.files).filter((f) => f.startsWith(`${dm.path}/`) && f.endsWith('.pdf')).sort();
      expect(pdfs).toHaveLength(2);
      expect(pdfs.some((f) => /-402\.pdf$/.test(f))).toBe(true);
      expect(pdfs.some((f) => /-499\.pdf$/.test(f))).toBe(true);
      expect(dm.sources).toEqual(['II.3.b', 'II.3.b']);
      expect(r.unmappedLeaves).toEqual([]);
      expect(r.skipped).toEqual([]);
      expect(r.ready).toBe(true);
      expect(manifest.ready).toBe(true);
    } finally {
      await r.cleanup();
    }
  }, 60_000);

  // 2026-09-23 (W5/D7, residual repair): this case expected II.6.3.a unmapped
  // and ready false (no IVDR slot existed). The slot exists now; the case
  // asserts the section is placed, with the optional II.6.4 / II.6.5 ones.
  it('an IVDR program with the mandatory II.6.3.a places it in the stability slot and is ready, in the result, the ZIP and the audit row', async () => {
    const r = await assembleTechnicalFileFromProgram({ programId: IVDR_PROG, organizationId: ORG, userId: USER, regulation: 'ivdr' });
    expect(r.unresolvedLeaves).toEqual([]);
    expect(r.unmappedLeaves).toEqual([]);
    expect(r.ready).toBe(true);
    const { zip, manifest } = await zipManifest(r.buffer);
    const pdfsIn = (id: string) => {
      const e = manifest.entries.find((x: any) => x.id === id);
      return Object.keys(zip.files).filter((f) => f.startsWith(`${e.path}/`) && f.endsWith('.pdf'));
    };
    expect(manifest.entries.find((e: any) => e.id === 'stability')).toMatchObject({ status: 'present', required: true, sources: ['II.6.3.a'] });
    expect(pdfsIn('stability')).toHaveLength(1);
    expect(pdfsIn('software-cybersecurity')).toHaveLength(1);
    expect(pdfsIn('usability')).toHaveLength(1);
    expect(manifest.ready).toBe(true);
    expect(r.manifest.ready).toBe(true);
    expect(lastAudit().ready).toBe(true);
    expect(lastAudit().unmappedTechnicalDocumentation).toEqual([]);
  }, 60_000);

  it('an IVDR program without the mandatory II.6.3 stability group is not ready, and says the stability slot is missing', async () => {
    const r = await assembleTechnicalFileFromProgram({ programId: IVDR_NO_STABILITY_PROG, organizationId: ORG, userId: USER, regulation: 'ivdr' });
    expect(r.unresolvedLeaves).toEqual([]);
    expect(r.unmappedLeaves).toEqual([]);
    expect(r.ready).toBe(false);
    expect(r.manifest.entries.find((e) => e.id === 'stability')).toMatchObject({ status: 'missing', required: true, sources: [] });
    const { manifest } = await zipManifest(r.buffer);
    expect(manifest.ready).toBe(false);
    expect(lastAudit().ready).toBe(false);
  }, 60_000);
});

/*
 * 2026-09-23 (W5/D7, residual repair): a slot places the leaves IT matched. A
 * bench report and the CER at the same section code II.6.1.b: the CER slot took
 * the bench report (first leaf with that code), the real CER sat only in the
 * preclinical folder, and every readiness surface said ready.
 */
describe('technical-file ready — a slot holds the document it matched, not the first one with the same code', () => {
  for (const [seq, order] of [[3, 'bench first'], [4, 'CER first']] as const) {
    it(`sequence ${seq} (${order}): the Annex XIV clinical-evaluation folder holds the CER (651) and only the CER`, async () => {
      const r = await assembleTechnicalFileFromCore({ sequenceId: seq, organizationId: ORG, userId: USER, regulation: 'mdr', applicationId: `TF${seq}` });
      try {
        const { zip, manifest } = await zipManifest(await fs.readFile(r.bundle.path));
        const pdfsIn = (id: string) => {
          const e = manifest.entries.find((x: any) => x.id === id);
          return Object.keys(zip.files).filter((f) => f.startsWith(`${e.path}/`) && f.endsWith('.pdf'));
        };
        const cerPdfs = pdfsIn('clinical-evaluation');
        expect(cerPdfs).toHaveLength(1);
        expect(cerPdfs[0]).toMatch(/-651\.pdf$/);
        // The CER folder's file is the CER's bytes, not the bench report's.
        const cerBytes = await zip.file(cerPdfs[0])!.async('nodebuffer');
        const benchPdf = pdfsIn('preclinical-clinical').find((f) => /-650\.pdf$/.test(f))!;
        expect(benchPdf).toBeDefined();
        expect(cerBytes.equals(await zip.file(benchPdf)!.async('nodebuffer'))).toBe(false);
        expect(manifest.entries.find((e: any) => e.id === 'clinical-evaluation')).toMatchObject({ status: 'present', sources: ['II.6.1.b'] });
        expect(r.unmappedLeaves).toEqual([]);
        expect(r.skipped).toEqual([]);
        expect(r.ready).toBe(true);
        expect(manifest.ready).toBe(true);
        // 2026-09-23 (W5/D7, final pass): the sequence path carries the
        // title-only list too; every leaf here is keyed or typed.
        expect(r.matchedByTitleOnly).toEqual([]);
      } finally {
        await r.cleanup();
      }
    }, 60_000);
  }
});
