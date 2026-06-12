/**
 * Tests for the Veeva Vault client — fail-closed config, session lifecycle,
 * Vault responseStatus handling, upload/query parsing. Mock fetch; no network.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  VeevaVaultClient,
  resolveVaultConfig,
  VaultCredentialError,
  VaultApiError,
} from '../client';

const ENV = {
  VEEVA_VAULT_DNS: 'https://acme.veevavault.com',
  VEEVA_VAULT_USERNAME: 'svc-c2c@acme.com',
  VEEVA_VAULT_PASSWORD: 'secret',
} as NodeJS.ProcessEnv;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const AUTH_OK = { responseStatus: 'SUCCESS', sessionId: 'SESS-123' };

describe('resolveVaultConfig (fail-closed)', () => {
  it('reports every missing variable instead of guessing', () => {
    const { config, missing } = resolveVaultConfig({} as NodeJS.ProcessEnv);
    expect(config).toBeNull();
    expect(missing).toEqual(['VEEVA_VAULT_DNS', 'VEEVA_VAULT_USERNAME', 'VEEVA_VAULT_PASSWORD']);
  });

  it('applies defaults and strips trailing slash from the DNS', () => {
    const { config } = resolveVaultConfig({ ...ENV, VEEVA_VAULT_DNS: 'https://acme.veevavault.com/' });
    expect(config?.vaultDns).toBe('https://acme.veevavault.com');
    expect(config?.apiVersion).toBe('v25.1');
    expect(config?.sessionTtlMinutes).toBe(20);
  });

  it('fromEnv throws a structured VaultCredentialError when unconfigured', () => {
    expect(() => VeevaVaultClient.fromEnv({} as NodeJS.ProcessEnv)).toThrow(VaultCredentialError);
    expect(VeevaVaultClient.isConfigured({} as NodeJS.ProcessEnv)).toBe(false);
    expect(VeevaVaultClient.isConfigured(ENV)).toBe(true);
  });
});

describe('authentication & session lifecycle', () => {
  it('authenticates against /auth with form-encoded credentials and caches the session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(AUTH_OK));
    const client = VeevaVaultClient.fromEnv(ENV, fetchMock);

    const s1 = await client.getSessionId();
    const s2 = await client.getSessionId();
    expect(s1).toBe('SESS-123');
    expect(s2).toBe('SESS-123');
    expect(fetchMock).toHaveBeenCalledTimes(1); // cached, no re-auth

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://acme.veevavault.com/api/v25.1/auth');
    expect(init.method).toBe('POST');
    expect(String(init.body)).toContain('username=svc-c2c%40acme.com');
  });

  it('surfaces a Vault auth FAILURE as VaultApiError with Vault errors attached', async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      jsonResponse({
        responseStatus: 'FAILURE',
        errors: [{ type: 'NO_PASSWORD_PROVIDED', message: 'Invalid login' }],
      }, 401),
    );
    const client = VeevaVaultClient.fromEnv(ENV, fetchMock);
    await expect(client.getSessionId()).rejects.toThrow(VaultApiError);
    await expect(client.getSessionId()).rejects.toThrow(/Invalid login/);
  });
});

describe('document upload', () => {
  it('posts multipart with the session header and parses the new document id', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(AUTH_OK))
      .mockResolvedValueOnce(
        jsonResponse({
          responseStatus: 'SUCCESS',
          id: 4711,
          major_version_number__v: 0,
          minor_version_number__v: 1,
        }),
      );
    const client = VeevaVaultClient.fromEnv(ENV, fetchMock);
    const result = await client.uploadDocument({
      fileName: 'csr-draft.docx',
      bytes: Buffer.from('docx-bytes'),
      fields: { 'name__v': 'CSR Draft', 'type__v': 'Clinical Study Report' },
    });
    expect(result).toEqual({ documentId: 4711, majorVersion: 0, minorVersion: 1 });

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://acme.veevavault.com/api/v25.1/objects/documents');
    expect(init.headers.Authorization).toBe('SESS-123');
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('never fakes success — upload FAILURE throws', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(AUTH_OK))
      .mockResolvedValueOnce(
        jsonResponse({ responseStatus: 'FAILURE', errors: [{ type: 'INVALID_DATA', message: 'bad type__v' }] }),
      );
    const client = VeevaVaultClient.fromEnv(ENV, fetchMock);
    await expect(
      client.uploadDocument({ fileName: 'x.pdf', bytes: Buffer.from('x'), fields: {} }),
    ).rejects.toThrow(/bad type__v/);
  });
});

describe('document fetch & VQL query', () => {
  it('maps Vault document fields onto the typed shape', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(AUTH_OK))
      .mockResolvedValueOnce(
        jsonResponse({
          responseStatus: 'SUCCESS',
          document: {
            id: 99,
            name__v: 'Protocol v3',
            type__v: 'Protocol',
            lifecycle__v: 'Draft to Approved',
            status__v: 'Approved',
            major_version_number__v: 2,
            minor_version_number__v: 0,
          },
        }),
      );
    const client = VeevaVaultClient.fromEnv(ENV, fetchMock);
    const doc = await client.getDocument(99);
    expect(doc.name).toBe('Protocol v3');
    expect(doc.status).toBe('Approved');
    expect(doc.majorVersion).toBe(2);
    expect(doc.raw.lifecycle__v).toBe('Draft to Approved');
  });

  it('runs VQL and returns rows + total', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(AUTH_OK))
      .mockResolvedValueOnce(
        jsonResponse({
          responseStatus: 'SUCCESS',
          responseDetails: { total: 2 },
          data: [{ id: 1, name__v: 'A' }, { id: 2, name__v: 'B' }],
        }),
      );
    const client = VeevaVaultClient.fromEnv(ENV, fetchMock);
    const out = await client.query("SELECT id, name__v FROM documents WHERE type__v = 'Protocol'");
    expect(out.total).toBe(2);
    expect(out.rows).toHaveLength(2);

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://acme.veevavault.com/api/v25.1/query');
    expect(String(init.body)).toContain('q=SELECT');
  });
});

describe('file download', () => {
  it('returns binary on success and a structured error on failure', async () => {
    const fileBytes = Buffer.from('%PDF-1.4 fake');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(AUTH_OK))
      .mockResolvedValueOnce(new Response(fileBytes, { status: 200 }))
      .mockResolvedValueOnce(
        jsonResponse({ responseStatus: 'FAILURE', errors: [{ type: 'OPERATION_NOT_ALLOWED', message: 'no access' }] }, 403),
      );
    const client = VeevaVaultClient.fromEnv(ENV, fetchMock);

    const buf = await client.downloadDocumentFile(5);
    expect(buf.toString()).toContain('%PDF-1.4');

    await expect(client.downloadDocumentFile(6)).rejects.toThrow(VaultApiError);
  });
});
