/**
 * The Data Room's filing proposal reads the project's region, as the Vault's ingest does (F1, 2026-11-05).
 *
 * describeCapture proposes where a Data Room capture is filed, with the same classifier the Vault ingest runs
 * (classifyForFiling). Since S6 V6 the Vault ingest gives that classifier the project's region and application
 * (resolveVaultFilingContext), so an EMA project's labeling is proposed at the EU Module 1 heading. The Data Room
 * resolved the view alone, so the same file captured in the same project was proposed at the US heading, 1.14.
 *
 * The classifier is the real one; only the program's settings are stated.
 * Evidence: docs/evidence/F1/2026-11-05-data-room-region/.
 */
import { describe, expect, it, vi } from 'vitest';

const settings = vi.hoisted(() => ({
  context: { view: 'pharma', jurisdiction: 'EU', applicationKind: 'maa' } as Record<string, unknown>,
}));
vi.mock('../../../db.js', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }));
vi.mock('../../ocr/index.js', () => ({ extractDocumentText: vi.fn() }));
vi.mock('../../ana/uploaded-file-access.js', () => ({ loadUploadedFile: vi.fn() }));
vi.mock('../../vault/vault-filing.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../vault/vault-filing.service')>()),
  resolveVaultView: async () => settings.context.view,
  resolveVaultFilingContext: async () => settings.context,
  resolveOrgVaultView: async () => 'pharma',
}));

import { describeCapture } from '../data-room-processing';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const LABELING = { fileName: 'Product labeling draft.pdf', mimeType: 'application/pdf', text: null };

describe("the Data Room's filing proposal follows the project's region", () => {
  it('an EMA project is proposed its own Module 1 heading for labeling, not the US one', async () => {
    settings.context = { view: 'pharma', jurisdiction: 'EU', applicationKind: 'maa' };
    const { dossier } = await describeCapture(1, PROGRAM, LABELING);
    expect(dossier).toMatchObject({ suggestedFolder: 'module-1', ctdSection: '1.3.1' });
    expect(String(dossier?.rationale)).toMatch(/Module 1 follows the project's region: EU 1\.3\.1/);
  });

  it('an FDA project keeps the US heading', async () => {
    settings.context = { view: 'pharma', jurisdiction: 'US', applicationKind: 'ind' };
    const { dossier } = await describeCapture(1, PROGRAM, LABELING);
    expect(dossier).toMatchObject({ suggestedFolder: 'module-1', ctdSection: '1.14' });
  });

  it('a region whose Module 1 is not modelled is proposed no section, and marked for review', async () => {
    settings.context = { view: 'pharma', jurisdiction: 'CA', applicationKind: 'nds' };
    const { dossier } = await describeCapture(1, PROGRAM, LABELING);
    expect(dossier).toMatchObject({ suggestedFolder: 'module-1', ctdSection: null, needsReview: true });
    expect(String(dossier?.rationale)).toMatch(/CA Module 1 is not modelled here/);
  });

  it('a capture with no project is proposed as before, with no region', async () => {
    const { dossier } = await describeCapture(1, null, LABELING);
    expect(dossier).toMatchObject({ suggestedFolder: 'module-1', ctdSection: '1.14' });
  });
});
