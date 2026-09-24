/**
 * Shared fixtures for the Vault surface tests: the payload shapes the
 * project-vault read model returns, and the api mock both files install.
 * Not a test file — the runners match *.test.tsx.
 */
import { vi, type Mock } from 'vitest';

export const PID = '11111111-1111-4111-8111-111111111111';
export const DOC_ID = '22222222-2222-4222-8222-222222222222';

export function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}

/* An expired-token 401 as authenticateToken returns it. apiRequest does NOT
   throw on 401, so this response reaches the caller — the case that used to fall
   through Vault's filing handler into a fabricated success. */
export function unauthorized() {
  return {
    ok: false,
    status: 401,
    json: async () => ({ error: { code: 'AUTH_002', message: 'Invalid or expired token' } }),
  } as Response;
}

export function uploadDoc(over: Record<string, unknown> = {}) {
  return {
    id: `up-${DOC_ID}`,
    num: '3.2.P.8',
    title: 'stability-summary-24m',
    type: 'Test reports',
    status: 'suggested',
    pct: 0,
    owner: 'A. Author',
    ver: 'v1.0',
    updated: '2m ago',
    preview: 'stability-summary-24m.pdf · 1.0 MB · SHA-256 aaaaaaaaaaaa…',
    src: 'upload',
    docId: DOC_ID,
    sizeLabel: '1.0 MB',
    hash: 'a'.repeat(64),
    filing: {
      folderId: 'module-3',
      folderLabel: 'Module 3 · Quality',
      evidenceKind: 'report',
      ctdSection: '3.2.P.8',
      placementStatus: 'suggested',
      confidence: 'high',
      rationale: 'CTD pattern "Stability" → Module 3 (3.2.P.8).',
    },
    ...over,
  };
}

export function cabinetTree(docs: unknown[] = [uploadDoc()], unfiledDocs: unknown[] = []) {
  return [
    {
      id: 'cabinet',
      code: '',
      label: 'Source files · filing cabinet',
      children: [
        { id: 'cab-unfiled', code: '', label: 'Unfiled · needs review', children: unfiledDocs },
        { id: 'cab-module-3', code: '', label: 'Module 3 · Quality', children: docs },
        { id: 'cab-corresp', code: '', label: 'Agency correspondence', children: [] },
      ],
    },
  ];
}

export function vaultPayload(over: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      program: 'BX-301',
      spine: 'IND · 21 CFR 312',
      standard: 'pharma',
      documentCount: 1,
      tree: cabinetTree(),
      unfiledCount: 0,
      ...over,
    },
  };
}

export const props = () => ({
  surface: { id: 'vault', label: 'Vault' } as any,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

export function mockVaultApi(
  apiRequest: Mock,
  vaultResponse: () => Response,
  onFile?: (body: unknown) => Response,
) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') return vaultResponse();
    if (url === `/api/c2c/project-vault/${PID}/file` && method === 'POST') {
      return onFile
        ? onFile(body)
        : ok({ success: true, filing: { folderId: 'module-3', folderLabel: 'Module 3 · Quality', placementStatus: 'confirmed' } });
    }
    return ok({});
  });
}
