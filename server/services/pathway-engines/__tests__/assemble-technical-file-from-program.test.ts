/**
 * `assembleTechnicalFileFromProgram` — the program-scoped MDR/IVDR technical
 * file built from the GOVERNED authored sections (c2c_documents doc_type
 * mdr/ivdr + c2c_document_sections). Proves that what a manufacturer authors
 * in the governed editor can actually leave the platform as a technical-file
 * ZIP: bytes are returned, the Annex II/III tree holds real PDFs, an empty
 * section is reported missing (never invented), and the staging directory is
 * removed. Runs on PGlite.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import JSZip from 'jszip';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any, pool: null as any }));
vi.mock('../../../db', () => ({
  get db() { return holder.db; },
  get pool() { return holder.pool; },
}));
vi.mock('../../auditService', () => ({
  default: { logAction: vi.fn(async (..._a: any[]) => ({ persisted: true, chained: true, tamperProof: true })) },
}));

import { assembleTechnicalFileFromProgram } from '../mdr-ivdr/assemble-technical-file-from-core';

let harness: IndPgliteDb;
const ORG = 8;
const OTHER_ORG = 9;
const USER = 4;
const PROGRAM = '5b0f2f0e-9a7d-4a2e-8c3f-2d1e6f7a8b9c';

async function stagingDirs(): Promise<string[]> {
  const entries = await fs.readdir(os.tmpdir());
  return entries.filter((e) => e.startsWith('techfile-program-'));
}

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true, governedSections: true });
  holder.db = harness.db;
  holder.pool = harness.pglite;

  await harness.pglite.exec(`
    INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title)
    VALUES ('doc_mdr_1', ${ORG}, '${PROGRAM}', 'mdr', 'ema', 'eu-mdr-2017-745-annex-ii-v1.0', 'AcmeScope MDR technical documentation');

    INSERT INTO c2c_document_sections (document_id, section_key, parent_key, label, path_order, mandatory, status, content)
    VALUES
      ('doc_mdr_1', 'II.1.a', 'II.1', 'Product/trade name, general description, intended purpose and intended users', 3, true, 'approved',
        '{"text":"AcmeScope is a single-use sterile arthroscope intended for visualisation of joint spaces during arthroscopic surgery."}'::jsonb),
      ('doc_mdr_1', 'II.2.b', 'II.2', 'Instructions for use, in the required Union languages', 12, true, 'todo', '{}'::jsonb),
      ('doc_mdr_1', 'II.4.a', 'II.4', 'GSPR checklist — applicability, method of conformity, evidence', 18, true, 'approved',
        '{"paragraphs":[{"text":"GSPR 1 — applicable; EN ISO 14971:2019; risk management file RMF-001."}]}'::jsonb),
      ('doc_mdr_1', 'II.5.a', 'II.5', 'Risk management plan and file — EN ISO 14971', 21, true, 'locked',
        '{"markdown":"# Risk management plan\\n\\nConducted per EN ISO 14971:2019."}'::jsonb),
      ('doc_mdr_1', 'II.6.1.g', 'II.6.1', 'Clinical evaluation report — Annex XIV Part A', 31, true, 'drafted',
        '{"text":"Clinical evaluation draft based on equivalence to the previous generation."}'::jsonb);
  `);
});

afterAll(async () => {
  await harness.close();
});

describe('assembleTechnicalFileFromProgram', () => {
  it('packages the authored MDR sections into a real ZIP and returns the bytes', async () => {
    const before = new Set(await stagingDirs());

    const result = await assembleTechnicalFileFromProgram({
      programId: PROGRAM,
      organizationId: ORG,
      userId: USER,
      regulation: 'mdr',
      productName: 'AcmeScope',
      manufacturer: 'Acme Medical GmbH',
    });

    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.filename).toMatch(/technical-file-mdr\.zip$/);
    expect(result.fileCount).toBeGreaterThan(0);
    expect(result.fileCount).toBe(4); // II.1.a, II.4.a, II.5.a, II.6.1.g

    const zip = await JSZip.loadAsync(result.buffer);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    const status = (id: string) => manifest.entries.find((e: any) => e.id === id)?.status;
    expect(status('device-description')).toBe('present');
    expect(status('gspr')).toBe('present');
    expect(status('risk-management')).toBe('present');
    expect(status('clinical-evaluation')).toBe('present');
    // The empty II.2.b section is a gap, never invented.
    expect(status('manufacturer-information')).toBe('missing');
    expect(result.ready).toBe(false);

    const devEntry = manifest.entries.find((e: any) => e.id === 'device-description');
    const devFiles = Object.keys(zip.files).filter((f) => f.startsWith(`${devEntry.path}/`) && f.endsWith('.pdf'));
    expect(devFiles).toHaveLength(1);
    const pdf = await zip.file(devFiles[0])!.async('nodebuffer');
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    // Every authored leaf found a slot.
    expect(result.skipped.filter((s) => s.sectionId === 'unmapped')).toEqual([]);
    expect(result.unresolvedLeaves).toEqual([]);
    // The drafted CER renders but is reported as unfinalized.
    expect(result.unfinalized).toBe(1);
    expect(result.unfinalizedSections).toEqual([{ sectionCode: 'II.6.1.g', status: 'drafted' }]);

    // Staging directory is gone.
    const after = await stagingDirs();
    expect(after.filter((d) => !before.has(d))).toEqual([]);
  });

  it('refuses honestly when the program has no authored content in the caller organization', async () => {
    await expect(
      assembleTechnicalFileFromProgram({ programId: PROGRAM, organizationId: OTHER_ORG, userId: USER, regulation: 'mdr' }),
    ).rejects.toMatchObject({ code: 'NO_AUTHORED_CONTENT' });
  });

  it('filters by the requested regulation — an mdr-only program has no ivdr technical file', async () => {
    await expect(
      assembleTechnicalFileFromProgram({ programId: PROGRAM, organizationId: ORG, userId: USER, regulation: 'ivdr' }),
    ).rejects.toMatchObject({ code: 'NO_AUTHORED_CONTENT' });
  });
});
