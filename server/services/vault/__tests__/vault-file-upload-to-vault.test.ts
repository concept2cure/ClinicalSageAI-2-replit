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

/* Since 14362ef00 the upload is admitted before it is loaded: the caller is a
   current member of the program with a writing role (requireCurrentProgramAccess,
   vaultWriteRefusal), and the original upload is one that caller may read
   (assertVaultUploadSource). Both read the database. Here the member and program
   are seated on the shared current-access double (support/current-member.ts),
   and the upload admission answers from the uploads seated below; an unseated
   caller or upload is refused as the real admissions refuse, so the refusals
   stay observable. The admissions' SQL is proven by their own suites. */
vi.mock('../../c2c/current-program-access', async (original) => {
  const real = await original<typeof import('../../c2c/current-program-access')>();
  return { ...real, ...(await import('../../../routes/c2c/__tests__/support/current-member')).currentAccessDouble(real.ProgramReadAccessError) };
});
const { seatedUploads } = vi.hoisted(() => ({ seatedUploads: new Set<string>() }));
vi.mock('../vault-upload-source-admission.js', async () => {
  const { AnaProjectScopeError } = await import('../../ana/project-scope-admission');
  return {
    assertVaultUploadSource: async (_q: unknown, args: { organizationId: number; fileId: string }) => {
      if (!seatedUploads.has(`${args.organizationId}:${args.fileId}`)) {
        throw new AnaProjectScopeError(404, 'UPLOAD_NOT_FOUND', 'The original upload is unavailable. Nothing was filed.');
      }
    },
  };
});

import { fileUploadIntoVault } from '../vault-file-upload-to-vault';
import { clearSeats, seatMember, seatProgram } from '../../../routes/c2c/__tests__/support/current-member';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const HEAD = '44444444-4444-4444-8444-444444444444';
const upload = (fileName: string) => ({ fileName, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 stability') });

const admitted = () => ingestVaultDocument.mock.calls[0][0];

beforeEach(() => {
  vi.clearAllMocks();
  clearSeats();
  seatMember(7, 3, 'member');
  seatProgram(7, PROGRAM);
  seatedUploads.clear();
  for (let n = 1; n <= 5; n++) seatedUploads.add(`7:file_${n}`);
  ingestVaultDocument.mockResolvedValue({ ok: false, status: 409, code: 'VERSION_CONTENT_CONFLICT', message: 'x' });
});

describe('the upload is admitted before it is named', () => {
  it('a caller who is not a current member is refused, and nothing is loaded or admitted', async () => {
    clearSeats();
    seatProgram(7, PROGRAM);
    loadUploadedFile.mockResolvedValue(upload('Protocol-Stability.pdf'));
    const out = await fileUploadIntoVault({
      organizationId: 7, userId: 3, programId: PROGRAM, fileId: 'file_1',
      documentTitle: 'Protocol-Stability', documentType: 'OTHER',
    });
    expect(out).toMatchObject({ ok: false, status: 403, code: 'PROJECT_ACTOR_ACCESS_DENIED' });
    expect(loadUploadedFile).not.toHaveBeenCalled();
    expect(ingestVaultDocument).not.toHaveBeenCalled();
  });

  it('an upload the caller may not read is refused, and nothing is loaded or admitted', async () => {
    loadUploadedFile.mockResolvedValue(upload('Protocol-Stability.pdf'));
    const out = await fileUploadIntoVault({
      organizationId: 7, userId: 3, programId: PROGRAM, fileId: 'file_unseated',
      documentTitle: 'Protocol-Stability', documentType: 'OTHER',
    });
    expect(out).toMatchObject({ ok: false, status: 404, code: 'UPLOAD_NOT_FOUND' });
    expect(loadUploadedFile).not.toHaveBeenCalled();
    expect(ingestVaultDocument).not.toHaveBeenCalled();
  });
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
