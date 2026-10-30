/**
 * An assembled CSR file is not released until an approved, signed CSR covers it
 * (P-22: only approved documents are released; D5, 2026-10-30, the CSR path sweep).
 *
 * The CSR assembly (csr-assembly-run.ts) renders the body, §14 and §16 files
 * from the build job's own sections and stores them as rendered_leaf_files
 * ('csr_assembly'). Placement puts them under 5.3.5.1. The release gates judge
 * every other store's approval, but the rendered store had no verdict at all:
 * - the readiness resolver returned no notTransmittable for it, so Validation
 *   and Dispatch raised no DOCUMENT_NOT_APPROVED;
 * - the assembler never noted it unfinalized, so freeze and transmit had
 *   nothing to refuse.
 * A model-drafted CSR nobody had reviewed, approved or signed could be released
 * toward FDA. The CSR's approval is the Authoring document's, and nothing binds
 * an assembly to an approved one, so an assembled CSR file now reads as not
 * approved. The server's own rendered forms and reports are unchanged.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { createHash } from 'crypto';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../db', () => ({
  get db() { return holder.db; },
  get pool() { return { query: async () => ({ rows: [] }) }; },
}));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true, chained: true, tamperProof: true })) } }));
const store = vi.hoisted(() => ({ objects: new Map<string, Buffer>() }));
vi.mock('../../storage', () => ({
  getStorageProvider: () => ({
    name: 'test',
    async get(vaultVersionId: string) {
      const bytes = store.objects.get(vaultVersionId);
      return bytes ? { bytes, sizeBytes: bytes.length, sha256: '', mime: 'application/pdf', filename: 'f.pdf' } : null;
    },
  }),
}));

import { materializeLeafSources, leafSourceKey } from '../leaf-source-resolver';
import { resolveLeafDocument } from '../leaf-document-resolver';

let harness: IndPgliteDb;
let stageDir = '';
const ORG = 11;
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const md5 = (b: Buffer) => createHash('md5').update(b).digest('hex');

async function seed(renderedFrom: string, fileName: string, sectionCode: string, body: string): Promise<number> {
  const bytes = Buffer.from(`%PDF-1.4\n% ${body}\ntrailer<< /Root 1 0 R >>\n%%EOF\n`, 'utf8');
  const version = `vv-${renderedFrom}-${fileName}`;
  store.objects.set(version, bytes);
  const res = await harness.pglite.query<{ id: number | string }>(
    `INSERT INTO rendered_leaf_files (organization_id, vault_version_id, sha256, md5, mime, byte_size, file_name, rendered_from, section_code)
     VALUES ($1,$2,$3,$4,'application/pdf',$5,$6,$7,$8) RETURNING id`,
    [ORG, version, sha(bytes), md5(bytes), bytes.length, fileName, renderedFrom, sectionCode]);
  return Number(res.rows[0].id);
}

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = harness.db;
  stageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rendered-csr-'));
});
afterAll(async () => {
  await harness?.close?.();
  if (stageDir) await fs.rm(stageDir, { recursive: true, force: true });
});

describe('an assembled CSR file', () => {
  it('reads as not approved to Validation and Dispatch', async () => {
    const id = await seed('csr_assembly', 'lmn-201-cdi02-csr.pdf', 'm5.3.5.1', 'RePreve CSR body, drafted by the build job');
    const resolution = await resolveLeafDocument({ documentTable: 'rendered_leaf_files', documentId: id }, ORG);
    expect(resolution.status).toBe('resolved');
    expect(resolution.notTransmittable).toMatch(/assembled clinical study report.*not bound to an approved and signed CSR/);
  });

  it('is staged but noted unfinalized, so freeze and transmit refuse it', async () => {
    const id = await seed('csr_assembly', 'lmn-201-cdi02-14.pdf', 'm5.3.5.1', 'Section 14 tables');
    const out = await materializeLeafSources({ leaves: [{ documentTable: 'rendered_leaf_files', documentId: id }], organizationId: ORG, stageDir });
    expect(out.byKey.get(leafSourceKey('rendered_leaf_files', id))).toBeTruthy();
    expect(out.unfinalized).toBe(1);
    expect(out.unfinalizedSections[0].status).toMatch(/not bound to an approved and signed CSR/);
  });
});

describe("the server's own rendered forms and reports (control)", () => {
  it('a rendered safety report is released as before', async () => {
    const id = await seed('ind_safety_report', 'ind-safety-report.pdf', 'm1.12.4', 'filed safety report');
    const resolution = await resolveLeafDocument({ documentTable: 'rendered_leaf_files', documentId: id }, ORG);
    expect(resolution.notTransmittable ?? null).toBeNull();
    const out = await materializeLeafSources({ leaves: [{ documentTable: 'rendered_leaf_files', documentId: id }], organizationId: ORG, stageDir });
    expect(out.unfinalized).toBe(0);
  });
});
