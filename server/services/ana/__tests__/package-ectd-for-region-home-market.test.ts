/**
 * package_ectd_for_region packages a project's home market only (decision P-44,
 * 2026-10-22).
 *
 * The tool reads the project's recorded identity, and the project's number is
 * its home market's. Asked for another market's region, it built that
 * market's backbone under the home number: an EU <procedure-number> carrying a
 * US NDA number. It now refuses NOT_HOME_MARKET and names where that market's
 * package is built; the home market packages as before.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';

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

import { getToolHandler } from '../AnaToolExecutor';
import { anaScratchDir } from '../document-workspace';

const CTX = { organizationId: 1, userId: 1, humanConfirmed: true };
const PROGRAM = '7d1c2f0e-5b7a-4c1e-9a43-0f2b6d1e8c55';
const recordedIdentity = (patch: Record<string, unknown> = {}) => ({
  programId: PROGRAM, applicationNumber: '123456', applicantName: 'Concept2Cure Therapeutics',
  applicantSponsorId: '11111111-1111-4111-8111-111111111111', applicantId: '123456789',
  contact: { name: 'Regulatory Contact', phone: '+1 617 555 0100', email: 'regulatory@example.test' },
  ...patch,
});
const pdf = (l: string) => Buffer.from(`%PDF-1.4\n% ${l}\ntrailer<< /Root 1 0 R >>\n%%EOF\n`, 'utf8');


async function run(input: Record<string, unknown>) {
  const handler = getToolHandler('package_ectd_for_region');
  expect(handler).toBeTypeOf('function');
  return JSON.parse(await handler!(input, CTX)) as {
    ok?: boolean; error?: string; code?: string; missing?: string[]; bundlePath?: string;
    applicationNumber?: string; applicantName?: string;
  };
}

async function coverLeaf() {
  const work = anaScratchDir(CTX.organizationId, 'submissions');
  const cover = path.join(work, 'p27-cover.pdf');
  const output = path.join(work, 'p27-out');
  await fs.mkdir(work, { recursive: true });
  await fs.writeFile(cover, pdf('cover'));
  // Each fixture owns its paths; model input cannot choose a scratch directory.
  const modelInput = (extra: Record<string, unknown> = {}) => ({
    region: 'fda', program_id: PROGRAM, sequence: '0000', submission_type: 'original', application_type: 'ind',
    product_name: 'P', output_dir: output,
    leaves: [{ ctd_section: '1.2', operation: 'new', source_path: cover, file_name: 'cover.pdf', title: 'Cover' }],
    // What a model used to send: none of these identity fields may reach the package.
    application_id: 'MODEL-999999', sponsor_id: 'MODEL-DUNS', sponsor_name: 'Model Invented Sponsor',
    ...extra,
  });
  return { cover, output, modelInput };
}

beforeEach(() => {
  readRecordedPackageIdentity.mockReset();
  programInOrganization.mockClear();
});

describe('package_ectd_for_region packages the home market only (P-44)', () => {
  it("refuses another market's region, and builds nothing", async () => {
    readRecordedPackageIdentity.mockResolvedValue(recordedIdentity({ homeAgency: 'FDA' }));
    const { output, modelInput } = await coverLeaf();
    try {
      const out = await run(modelInput({ region: 'ema', application_type: 'maa' }));
      expect(out.code).toBe('NOT_HOME_MARKET');
      expect(out.error).toMatch(/EMA is another market: its package carries the application number its own agency assigned/);
      expect(out.bundlePath).toBeUndefined();
      await expect(fs.readdir(output)).rejects.toThrow();
    } finally {
      await fs.rm(output, { recursive: true, force: true });
    }
  });

  it('packages the home market from the record, as before', async () => {
    readRecordedPackageIdentity.mockResolvedValue(recordedIdentity({ homeAgency: 'FDA' }));
    const { output, modelInput } = await coverLeaf();
    try {
      const out = await run(modelInput());
      expect(out.error).toBeUndefined();
      expect(out.applicationNumber).toBe('123456');
    } finally {
      await fs.rm(output, { recursive: true, force: true });
    }
  });
});
