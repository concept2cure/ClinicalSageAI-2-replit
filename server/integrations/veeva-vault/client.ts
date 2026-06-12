/**
 * Veeva Vault REST API client — the enterprise RIM/DMS coexistence integration
 * (GA gap audit Tier-1 #3: "Veeva Vault integration absent — zero code").
 *
 * Large-pharma regulatory organizations run Veeva Vault as their system of
 * record; C2C must coexist with it (pull source documents in, push authored
 * outputs back) rather than replace it. This module is the protocol layer:
 * authentication (session ID), document upload/download, and VQL query —
 * the primitives every coexistence workflow composes.
 *
 * Honesty contract (same as the submission gateways): credentials come from
 * env/config; when absent the client throws a structured VaultCredentialError —
 * it NEVER fakes success. Every Vault response carries `responseStatus`; a
 * FAILURE is surfaced as VaultApiError with Vault's own error list, never
 * swallowed. No mock mode exists in this module.
 *
 * Protocol notes (Vault REST API, see developer.veevavault.com):
 *  - Auth: POST {vaultDns}/api/{version}/auth (x-www-form-urlencoded
 *    username/password) → { sessionId }. Sessions idle-timeout (Vault-admin
 *    configured) and hard-cap at 48h; we conservatively re-auth after
 *    `sessionTtlMinutes` (default 20) of age.
 *  - All subsequent calls send the session in the `Authorization` header.
 *  - Documents: POST /api/{version}/objects/documents (multipart file + fields),
 *    GET /api/{version}/objects/documents/{id}, GET .../file for content.
 *  - Query: POST /api/{version}/query with VQL `q`.
 *
 * @module server/integrations/veeva-vault/client
 */

export interface VaultConfig {
  /** Vault DNS, e.g. https://myvault.veevavault.com (no trailing slash). */
  vaultDns: string;
  username: string;
  password: string;
  /** API version segment, e.g. 'v25.1'. */
  apiVersion: string;
  /** Re-authenticate when the cached session is older than this. */
  sessionTtlMinutes: number;
}

/** Thrown when required Vault credentials/config are absent. Fail-closed. */
export class VaultCredentialError extends Error {
  readonly errorClass = 'auth' as const;
  constructor(readonly missing: string[]) {
    super(
      `Veeva Vault is not configured — missing: ${missing.join(', ')}. ` +
        'Set VEEVA_VAULT_DNS, VEEVA_VAULT_USERNAME, VEEVA_VAULT_PASSWORD ' +
        '(optional: VEEVA_VAULT_API_VERSION, VEEVA_VAULT_SESSION_TTL_MINUTES).'
    );
    this.name = 'VaultCredentialError';
  }
}

/** Thrown when Vault returns responseStatus FAILURE (or a non-2xx without one). */
export class VaultApiError extends Error {
  readonly errorClass = 'gateway' as const;
  constructor(
    message: string,
    readonly httpStatus: number | null,
    readonly vaultErrors: Array<{ type?: string; message?: string }>,
  ) {
    super(message);
    this.name = 'VaultApiError';
  }
}

/**
 * Resolve Vault config from the environment. Returns the missing-variable list
 * instead of throwing so `isConfigured()` can answer without exceptions.
 */
export function resolveVaultConfig(env: NodeJS.ProcessEnv = process.env): {
  config: VaultConfig | null;
  missing: string[];
} {
  const missing: string[] = [];
  const vaultDns = env.VEEVA_VAULT_DNS?.replace(/\/+$/, '');
  const username = env.VEEVA_VAULT_USERNAME;
  const password = env.VEEVA_VAULT_PASSWORD;
  if (!vaultDns) missing.push('VEEVA_VAULT_DNS');
  if (!username) missing.push('VEEVA_VAULT_USERNAME');
  if (!password) missing.push('VEEVA_VAULT_PASSWORD');
  if (missing.length) return { config: null, missing };
  return {
    config: {
      vaultDns: vaultDns!,
      username: username!,
      password: password!,
      apiVersion: env.VEEVA_VAULT_API_VERSION || 'v25.1',
      sessionTtlMinutes: Number(env.VEEVA_VAULT_SESSION_TTL_MINUTES) > 0
        ? Number(env.VEEVA_VAULT_SESSION_TTL_MINUTES)
        : 20,
    },
    missing: [],
  };
}

/** A document as Vault describes it (subset of Vault's document fields). */
export interface VaultDocument {
  id: number;
  name: string;
  type?: string;
  subtype?: string;
  lifecycle?: string;
  status?: string;
  majorVersion?: number;
  minorVersion?: number;
  /** Raw Vault fields for anything not modeled above. */
  raw: Record<string, unknown>;
}

export interface VaultUploadInput {
  fileName: string;
  bytes: Buffer | Uint8Array;
  mimeType?: string;
  /** Vault document metadata fields, e.g. { name__v, type__v, lifecycle__v }. */
  fields: Record<string, string>;
}

export interface VaultUploadResult {
  documentId: number;
  majorVersion: number | null;
  minorVersion: number | null;
}

export interface VaultQueryResult {
  rows: Array<Record<string, unknown>>;
  total: number | null;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Parse a Vault JSON body; convert responseStatus FAILURE into VaultApiError. */
function assertVaultSuccess(body: any, httpStatus: number, context: string): void {
  const status = body?.responseStatus;
  if (status === 'SUCCESS') return;
  const errors: Array<{ type?: string; message?: string }> = Array.isArray(body?.errors)
    ? body.errors
    : [];
  const detail = errors.map((e) => `${e.type ?? 'ERROR'}: ${e.message ?? ''}`).join('; ');
  throw new VaultApiError(
    `Vault ${context} failed (${status ?? `HTTP ${httpStatus}`})${detail ? ` — ${detail}` : ''}`,
    httpStatus,
    errors,
  );
}

export class VeevaVaultClient {
  private session: { id: string; obtainedAt: number } | null = null;

  constructor(
    private readonly config: VaultConfig,
    /** Injectable for tests; defaults to global fetch. */
    private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init),
  ) {}

  /** Build a client from the environment, or throw VaultCredentialError. */
  static fromEnv(env: NodeJS.ProcessEnv = process.env, fetchImpl?: FetchLike): VeevaVaultClient {
    const { config, missing } = resolveVaultConfig(env);
    if (!config) throw new VaultCredentialError(missing);
    return new VeevaVaultClient(config, fetchImpl);
  }

  /** True when env carries the required credentials (no network call). */
  static isConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
    return resolveVaultConfig(env).config !== null;
  }

  private apiUrl(path: string): string {
    return `${this.config.vaultDns}/api/${this.config.apiVersion}${path}`;
  }

  /**
   * Authenticate (or reuse a fresh-enough cached session). Vault sessions
   * idle-timeout server-side, so the TTL here is a conservative client bound.
   */
  async getSessionId(): Promise<string> {
    const ttlMs = this.config.sessionTtlMinutes * 60_000;
    if (this.session && Date.now() - this.session.obtainedAt < ttlMs) {
      return this.session.id;
    }
    const res = await this.fetchImpl(this.apiUrl('/auth'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        username: this.config.username,
        password: this.config.password,
      }).toString(),
    });
    const body = await res.json();
    assertVaultSuccess(body, res.status, 'authentication');
    if (!body.sessionId) {
      throw new VaultApiError('Vault authentication returned no sessionId', res.status, []);
    }
    this.session = { id: String(body.sessionId), obtainedAt: Date.now() };
    return this.session.id;
  }

  /** Authenticated JSON request helper. */
  private async request(path: string, init: RequestInit = {}): Promise<any> {
    const sessionId = await this.getSessionId();
    const res = await this.fetchImpl(this.apiUrl(path), {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.headers ?? {}),
        Authorization: sessionId,
      },
    });
    const body = await res.json();
    assertVaultSuccess(body, res.status, `request ${path}`);
    return body;
  }

  /** Create a document in Vault (multipart file + metadata fields). */
  async uploadDocument(input: VaultUploadInput): Promise<VaultUploadResult> {
    const sessionId = await this.getSessionId();
    const form = new FormData();
    form.append(
      'file',
      new Blob([Buffer.from(input.bytes)], { type: input.mimeType || 'application/octet-stream' }),
      input.fileName,
    );
    for (const [k, v] of Object.entries(input.fields)) form.append(k, v);

    const res = await this.fetchImpl(this.apiUrl('/objects/documents'), {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: sessionId },
      body: form,
    });
    const body = await res.json();
    assertVaultSuccess(body, res.status, 'document upload');
    return {
      documentId: Number(body.id),
      majorVersion: body.major_version_number__v != null ? Number(body.major_version_number__v) : null,
      minorVersion: body.minor_version_number__v != null ? Number(body.minor_version_number__v) : null,
    };
  }

  /** Fetch a document's metadata by Vault document id. */
  async getDocument(documentId: number): Promise<VaultDocument> {
    const body = await this.request(`/objects/documents/${documentId}`);
    const doc = body.document ?? {};
    return {
      id: Number(doc.id ?? documentId),
      name: String(doc.name__v ?? ''),
      type: doc.type__v != null ? String(doc.type__v) : undefined,
      subtype: doc.subtype__v != null ? String(doc.subtype__v) : undefined,
      lifecycle: doc.lifecycle__v != null ? String(doc.lifecycle__v) : undefined,
      status: doc.status__v != null ? String(doc.status__v) : undefined,
      majorVersion: doc.major_version_number__v != null ? Number(doc.major_version_number__v) : undefined,
      minorVersion: doc.minor_version_number__v != null ? Number(doc.minor_version_number__v) : undefined,
      raw: doc,
    };
  }

  /** Download the latest-version source file of a document. */
  async downloadDocumentFile(documentId: number): Promise<Buffer> {
    const sessionId = await this.getSessionId();
    const res = await this.fetchImpl(this.apiUrl(`/objects/documents/${documentId}/file`), {
      method: 'GET',
      headers: { Authorization: sessionId },
    });
    if (!res.ok) {
      // File downloads return binary on success; JSON error envelope on failure.
      let errors: Array<{ type?: string; message?: string }> = [];
      try {
        const body = await res.json();
        errors = Array.isArray(body?.errors) ? body.errors : [];
      } catch {
        /* non-JSON error body */
      }
      throw new VaultApiError(`Vault file download failed (HTTP ${res.status})`, res.status, errors);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  /** Run a VQL query (e.g. SELECT id, name__v FROM documents WHERE ...). */
  async query(vql: string): Promise<VaultQueryResult> {
    const sessionId = await this.getSessionId();
    const res = await this.fetchImpl(this.apiUrl('/query'), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: sessionId,
      },
      body: new URLSearchParams({ q: vql }).toString(),
    });
    const body = await res.json();
    assertVaultSuccess(body, res.status, 'VQL query');
    return {
      rows: Array.isArray(body.data) ? body.data : [],
      total: body.responseDetails?.total != null ? Number(body.responseDetails.total) : null,
    };
  }
}

export default { VeevaVaultClient, resolveVaultConfig, VaultCredentialError, VaultApiError };
