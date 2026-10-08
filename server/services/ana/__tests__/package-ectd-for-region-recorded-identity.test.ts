/**
 * package_ectd_for_region names the application and the applicant from the
 * record, never from the model (P-27, Rule 2).
 *
 * 2026-10-08 (P-27 follow-up). The tool took `application_id`, `sponsor_id`
 * and `sponsor_name` from its input, so whatever the model wrote — a program
 * code, a guessed IND number, a sponsor name read out of a document — was
 * written into the regional backbone as the agency application number and the
 * applicant. Export and compile already read both from package-identity.ts
 * (organizations.name, regulatory_programs.application_number) and refuse by
 * name when either is missing. This tool now does the same: it takes the
 * project (`program_id`), reads the identity from the record, and refuses
 * PACKAGE_IDENTITY_MISSING when the record lacks one. The model-input fields
 * are gone from the schema.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import JSZip from 'jszip';

const { resolveSignerOrgRole, programInOrganization, readRecordedPackageIdentity } = vi.hoisted(() => ({
  // Confirmed writes need an editor role (writeRoleRefusal); a member may edit.
  resolveSignerOrgRole: vi.fn(async (): Promise<string | null> => 'member'),
  // The registry wrapper confirms the named program is this organization's.
  programInOrganization: vi.fn(async () => true),
  readRecordedPackageIdentity: vi.fn(),
}));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole }));
vi.mock('../../c2c/program-access', async (orig) => ({ ...(await orig<object>()), programInOrganization }));
vi.mock('../../c2c/program-access.js', async (orig) => ({ ...(await orig<object>()), programInOrganization }));
// Only the record read is replaced; the refusal (packageIdentityRefusal) is the real one.
vi.mock('../../ectd/package-identity', async (orig) => ({ ...(await orig<object>()), readRecordedPackageIdentity }));
vi.mock('../../ectd/package-identity.js', async (orig) => ({ ...(await orig<object>()), readRecordedPackageIdentity }));

import { PACKAGE_ECTD_FOR_REGION } from '../AnaToolDefinitions';
import { getToolHandler } from '../AnaToolExecutor';
import { anaScratchDir } from '../document-workspace';

const CTX = { organizationId: 1, userId: 1, humanConfirmed: true };
const PROGRAM = '7d1c2f0e-5b7a-4c1e-9a43-0f2b6d1e8c55';
const pdf = (l: string) => Buffer.from(`%PDF-1.4\n% ${l}\ntrailer<< /Root 1 0 R >>\n%%EOF\n`, 'utf8');

type Schema = { properties: Record<string, unknown>; required: string[] };
const schema = () => PACKAGE_ECTD_FOR_REGION.input_schema as unknown as Schema;

async function run(input: Record<string, unknown>) {
  const handler = getToolHandler('package_ectd_for_region');
  expect(handler).toBeTypeOf('function');
  return JSON.parse(await handler!(input, CTX)) as {
    ok?: boolean; error?: string; code?: string; missing?: string[]; bundlePath?: string;
    applicationNumber?: string; applicantName?: string;
  };
}

async function coverLeaf(): Promise<{ work: string; leaves: unknown[] }> {
  const work = anaScratchDir(CTX.organizationId, 'submissions');
  await fs.mkdir(work, { recursive: true });
  const cover = path.join(work, 'p27-cover.pdf');
  await fs.writeFile(cover, pdf('cover'));
  return { work, leaves: [{ ctd_section: '1.2', operation: 'new', source_path: cover, file_name: 'cover.pdf', title: 'Cover' }] };
}

/** What a model used to send, identity fields included: none of them may reach the package. */
const modelInput = (work: string, leaves: unknown[], extra: Record<string, unknown> = {}) => ({
  region: 'fda', program_id: PROGRAM, sequence: '0000', submission_type: 'original', application_type: 'ind',
  product_name: 'P', output_dir: path.join(work, 'p27-out'), leaves,
  application_id: 'MODEL-999999', sponsor_id: 'MODEL-DUNS', sponsor_name: 'Model Invented Sponsor',
  ...extra,
});

beforeEach(() => {
  readRecordedPackageIdentity.mockReset();
  programInOrganization.mockClear();
});

describe('package_ectd_for_region — identity from the record (P-27)', () => {
  it('takes no application number or applicant from its input, and asks for the project instead', () => {
    const s = schema();
    expect(s.properties).not.toHaveProperty('application_id');
    expect(s.properties).not.toHaveProperty('sponsor_id');
    expect(s.properties).not.toHaveProperty('sponsor_name');
    expect(s.properties).toHaveProperty('program_id');
    expect(s.required).toContain('program_id');
    expect(s.required).not.toContain('application_id');
  });

  it('writes the recorded application number and applicant, never the model-supplied ones', async () => {
    readRecordedPackageIdentity.mockResolvedValue({
      programId: PROGRAM, applicationNumber: '123456', applicantName: 'Concept2Cure Therapeutics',
    });
    const { work, leaves } = await coverLeaf();
    try {
      const out = await run(modelInput(work, leaves));
      expect(out.error).toBeUndefined();
      expect(readRecordedPackageIdentity).toHaveBeenCalledWith(expect.anything(), 1, PROGRAM);
      expect(out.applicationNumber).toBe('123456');
      expect(out.applicantName).toBe('Concept2Cure Therapeutics');
      const zip = await JSZip.loadAsync(await fs.readFile(out.bundlePath!));
      const regional = Object.keys(zip.files).find((f) => f.endsWith('us-regional.xml'))!;
      const xml = (await zip.file(regional)?.async('string')) ?? '';
      expect(xml).toMatch(/<application-number[^>]*>123456<\/application-number>/);
      expect(xml).toContain('<company-name>Concept2Cure Therapeutics</company-name>');
      expect(xml).not.toContain('MODEL-999999');
      expect(xml).not.toContain('Model Invented Sponsor');
      expect(xml).not.toContain('MODEL-DUNS');
    } finally {
      await fs.rm(path.join(work, 'p27-out'), { recursive: true, force: true });
      await fs.rm(path.join(work, 'p27-cover.pdf'), { force: true });
    }
  });

  it('refuses by name when the project records no application number, and builds nothing', async () => {
    readRecordedPackageIdentity.mockResolvedValue({
      programId: PROGRAM, applicationNumber: null, applicantName: 'Concept2Cure Therapeutics',
    });
    const { work, leaves } = await coverLeaf();
    try {
      const out = await run(modelInput(work, leaves));
      expect(out.ok).toBeUndefined();
      expect(out.code).toBe('PACKAGE_IDENTITY_MISSING');
      expect(out.missing).toEqual(['applicationNumber']);
      expect(out.error).toMatch(/application number/);
      expect(out.error).toMatch(/Nothing was built/);
      await expect(fs.readdir(path.join(work, 'p27-out'))).rejects.toThrow();
    } finally {
      await fs.rm(path.join(work, 'p27-cover.pdf'), { force: true });
    }
  });

  it('refuses by name when the organisation records no usable applicant name', async () => {
    readRecordedPackageIdentity.mockResolvedValue({ programId: PROGRAM, applicationNumber: '123456', applicantName: null });
    const { work, leaves } = await coverLeaf();
    try {
      const out = await run(modelInput(work, leaves));
      expect(out.code).toBe('PACKAGE_IDENTITY_MISSING');
      expect(out.missing).toEqual(['applicantName']);
    } finally {
      await fs.rm(path.join(work, 'p27-cover.pdf'), { force: true });
    }
  });

  it('refuses a call that names no project, even with model-supplied identity, and reads nothing', async () => {
    const { work, leaves } = await coverLeaf();
    try {
      const out = await run(modelInput(work, leaves, { program_id: undefined }));
      expect(out.code).toBe('PACKAGE_IDENTITY_MISSING');
      expect(out.error).toMatch(/program_id/);
      expect(readRecordedPackageIdentity).not.toHaveBeenCalled();
    } finally {
      await fs.rm(path.join(work, 'p27-cover.pdf'), { force: true });
    }
  });
});
