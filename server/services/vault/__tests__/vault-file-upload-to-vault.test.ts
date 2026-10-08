/**
 * Filing an upload into the Vault names its document the same way the Vault
 * upload does (QA-2026-10-08, versions; problems 1 and 3).
 *
 * The Vault upload sends the file name, extension included, as the document
 * code (useVaultUpload.ts). The data room derived its code from the same file
 * with the extension stripped, so one PDF filed from each route became two
 * documents, and a revised file was refused at a code the Vault screen did not
 * show. A check-in names the document it adds to, rather than a code.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { loadUploadedFile } = vi.hoisted(() => ({ loadUploadedFile: vi.fn() }));
vi.mock('../../ana/uploaded-file-access.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../ana/uploaded-file-access.js')>()),
  loadUploadedFile,
}));

const { ingestVaultDocument } = vi.hoisted(() => ({ ingestVaultDocument: vi.fn() }));
vi.mock('../vault-ingest.service.js', () => ({ ingestVaultDocument }));

import { fileUploadIntoVault } from '../vault-file-upload-to-vault';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const HEAD = '44444444-4444-4444-8444-444444444444';
const upload = (fileName: string) => ({ fileName, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 stability') });

const admitted = () => ingestVaultDocument.mock.calls[0][0];

beforeEach(() => {
  vi.clearAllMocks();
  ingestVaultDocument.mockResolvedValue({ ok: false, status: 409, code: 'VERSION_CONTENT_CONFLICT', message: 'x' });
});

describe('a file is named the same whichever route admits it', () => {
  it('the data room files it under the name the Vault upload sends, extension included', async () => {
    loadUploadedFile.mockResolvedValue(upload('Protocol-Stability.pdf'));
    await fileUploadIntoVault({
      organizationId: 7, userId: 3, programId: PROGRAM, fileId: 'file_1',
      documentTitle: 'Protocol-Stability', documentType: 'OTHER',
    });
    expect(admitted().documentCode).toBe('Protocol-Stability.pdf');
  });

  it('a name with spaces is kept as the uploader named it', async () => {
    loadUploadedFile.mockResolvedValue(upload('Protocol Stability (final).pdf'));
    await fileUploadIntoVault({
      organizationId: 7, userId: 3, programId: PROGRAM, fileId: 'file_2',
      documentTitle: 'Protocol Stability', documentType: 'OTHER',
    });
    expect(admitted().documentCode).toBe('Protocol Stability (final).pdf');
  });

  it('an explicit code the caller gives is used as given', async () => {
    loadUploadedFile.mockResolvedValue(upload('Protocol-Stability.pdf'));
    await fileUploadIntoVault({
      organizationId: 7, userId: 3, programId: PROGRAM, fileId: 'file_3', documentCode: 'STB-0042',
      documentTitle: 'Protocol', documentType: 'OTHER',
    });
    expect(admitted().documentCode).toBe('STB-0042');
  });
});

describe('a check-in names the document it adds to', () => {
  it('passes the named head through to the ingest, which takes the code and filing from it', async () => {
    loadUploadedFile.mockResolvedValue(upload('Protocol-Stability.pdf'));
    await fileUploadIntoVault({
      organizationId: 7, userId: 3, programId: PROGRAM, fileId: 'file_4',
      documentTitle: 'Protocol-Stability', documentType: 'OTHER', supersedesDocumentId: HEAD,
    });
    expect(admitted().supersedesDocumentId).toBe(HEAD);
  });

  it('a file that is not a check-in carries no head', async () => {
    loadUploadedFile.mockResolvedValue(upload('Protocol-Stability.pdf'));
    await fileUploadIntoVault({
      organizationId: 7, userId: 3, programId: PROGRAM, fileId: 'file_5',
      documentTitle: 'Protocol-Stability', documentType: 'OTHER',
    });
    expect(admitted().supersedesDocumentId).toBeUndefined();
  });
});
