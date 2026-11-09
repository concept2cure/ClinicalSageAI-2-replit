/**
 * Which account an organisation's submissions go out under: the platform's
 * gateway account or the client's own, per agency gateway and environment.
 *
 * Founder decision, 2026-10-01: "We can have both the platform and client fda
 * account as options and should … it's going to depend on region, regulatory
 * body, as well as account and client preference … part of an account setting
 * in our admin settings when clients onboard." Evidence
 * docs/evidence/D7/2026-10-01-gateway-account-choice/.
 *
 *   platform — the server's configured credentials (each gateway's env vars),
 *              the only behaviour before this module. No row means platform.
 *   client   — credentials the organisation supplies, encrypted at rest
 *              (security/credential-cipher.ts) and never returned by the API.
 *
 * The guarded transmit (./index.ts) resolves the choice for every transmit,
 * refuses before the wire when the chosen account cannot send, and stamps the
 * mode and sender identity on the transmittal. A gateway that cannot yet send
 * under a client's credentials says so (clientTransmit: false): the choice can
 * be recorded, and a transmit under it is refused rather than quietly sent
 * under the platform's identity.
 */
import { CredentialError, type GatewayName, type Region } from './types';
import { decryptCredential, encryptCredential } from '../security/credential-cipher';
import { createHash } from 'node:crypto';

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

export type AccountMode = 'platform' | 'client';
export type GatewayEnvironment = 'staging' | 'production';
export const GATEWAY_ENVIRONMENTS: readonly GatewayEnvironment[] = ['production', 'staging'];

export interface ClientField {
  name: string;
  label: string;
  /** Multi-line PEM text rather than a single value. */
  pem?: boolean;
}

export interface GatewayAccountSpec {
  region: Region;
  gateway: GatewayName;
  agency: string;
  label: string;
  /** What the client's own account is called by the agency. */
  identifierLabel: string;
  /** True when a transmit can be sent under the client's own credentials today. */
  clientTransmit: boolean;
  /** Secret material a client account needs, beyond the identifier. */
  clientFields: ClientField[];
}

const recordOnly = (region: Region, gateway: GatewayName, agency: string, label: string, identifierLabel: string): GatewayAccountSpec => ({
  region, gateway, agency, label, identifierLabel, clientTransmit: false, clientFields: [],
});

/** One entry per gateway in ./index.ts REGISTRY; gateway-accounts.test.ts holds the two equal. */
export const GATEWAY_ACCOUNT_SPECS: readonly GatewayAccountSpec[] = [
  {
    region: 'fda',
    gateway: 'esg',
    agency: 'FDA',
    label: 'FDA Electronic Submissions Gateway (ESG)',
    identifierLabel: 'AS2 identifier assigned by FDA',
    clientTransmit: true,
    clientFields: [
      { name: 'clientCertPem', label: 'Your ESG certificate (PEM)', pem: true },
      { name: 'clientKeyPem', label: 'Its private key (PEM)', pem: true },
    ],
  },
  recordOnly('ema', 'cesp', 'EMA', 'EMA Common European Submission Portal (CESP)', 'CESP organisation id'),
  recordOnly('ema', 'eudamed', 'EU', 'EUDAMED', 'EUDAMED actor id (SRN)'),
  recordOnly('pmda', 'pmda_gateway', 'PMDA', 'PMDA Gateway', 'PMDA applicant id'),
  recordOnly('ca', 'hc_cesg', 'Health Canada', 'Health Canada CESG', 'CESG sender id'),
  recordOnly('uk', 'mhra_gateway', 'MHRA', 'MHRA submissions', 'MHRA organisation id'),
  recordOnly('cn', 'nmpa_gateway', 'NMPA', 'NMPA / CDE electronic submission', 'NMPA company id'),
  recordOnly('au', 'tga_ebs', 'TGA', 'TGA eBusiness Services', 'TGA sponsor id'),
  recordOnly('ch', 'swissmedic_egateway', 'Swissmedic', 'Swissmedic eGateway', 'Swissmedic holder id'),
  recordOnly('br', 'anvisa_gateway', 'ANVISA', 'ANVISA SOLICITA', 'Company CNPJ'),
  recordOnly('in', 'cdsco_sugam', 'CDSCO', 'CDSCO SUGAM', 'SUGAM applicant id'),
  recordOnly('kr', 'mfds_dbio', 'MFDS', 'MFDS dBio', 'MFDS company id'),
  recordOnly('sg', 'hsa_prism', 'HSA', 'HSA PRISM', 'HSA organisation id'),
];

export function specFor(region: string, gateway: string): GatewayAccountSpec | null {
  return GATEWAY_ACCOUNT_SPECS.find((s) => s.region === region && s.gateway === gateway) ?? null;
}

export interface ResolvedGatewayAccount {
  mode: AccountMode;
  senderIdentifier: string | null;
  /** Decrypted client credentials; null in platform mode or when none are held. */
  credentials: Record<string, string> | null;
}

interface AccountAuthority {
  organizationId: number;
  region: Region;
  gateway: GatewayName;
  environment: GatewayEnvironment;
  fingerprint: string;
}

// Process-local authority cannot be supplied by a request or reconstructed
// from public account fields. Neither ciphertext nor its digest is exposed in
// a response, a trace or the account metadata stamped on a transmission.
const accountAuthorities = new WeakMap<ResolvedGatewayAccount, AccountAuthority>();

function authorityFingerprint(row: Record<string, unknown> | undefined): string {
  return createHash('sha256').update(JSON.stringify([
    Boolean(row), row?.account_mode ?? null, row?.sender_identifier ?? null,
    row?.credentials_ciphertext ?? null, row?.updated_at ?? null,
  ])).digest('hex');
}

async function readAccountRow(db: Queryable, authority: Omit<AccountAuthority, 'fingerprint'>) {
  const { organizationId, region, gateway, environment } = authority;
  const { rows } = await db.query(
    `SELECT account_mode, sender_identifier, credentials_ciphertext, updated_at
       FROM organization_gateway_accounts
      WHERE organization_id = $1 AND region = $2 AND gateway = $3 AND environment = $4`,
    [organizationId, region, gateway, environment],
  );
  return rows[0] as Record<string, unknown> | undefined;
}

function resolvedAccount(row: Record<string, unknown> | undefined, authority: AccountAuthority): ResolvedGatewayAccount {
  const account: ResolvedGatewayAccount = row?.account_mode === 'client'
    ? { mode: 'client', senderIdentifier: typeof row.sender_identifier === 'string' ? row.sender_identifier : null,
        credentials: typeof row.credentials_ciphertext === 'string' && row.credentials_ciphertext
          ? JSON.parse(decryptCredential(row.credentials_ciphertext)) : null }
    : { mode: 'platform', senderIdentifier: null, credentials: null };
  accountAuthorities.set(account, Object.freeze(authority));
  return account;
}

/** The organisation's choice for one gateway and environment. No row is the platform account. */
export async function resolveGatewayAccount(
  db: Queryable,
  organizationId: number,
  region: Region,
  gateway: GatewayName,
  environment: GatewayEnvironment,
): Promise<ResolvedGatewayAccount> {
  const identity = { organizationId, region, gateway, environment };
  const row = await readAccountRow(db, identity);
  return resolvedAccount(row, { ...identity, fingerprint: authorityFingerprint(row) });
}

/**
 * Re-establish the account's authority after asynchronous archive/source
 * checks, immediately before handing credentials to the deterministic
 * transport. A rotation, deletion or account/sender change revokes this
 * attempt; it never falls back to the platform account. In-flight network
 * operations cannot be recalled by this checkpoint.
 */
export async function resolveGatewayAccountForUse(
  db: Queryable,
  captured: ResolvedGatewayAccount,
  scope: Omit<AccountAuthority, 'fingerprint'>,
): Promise<ResolvedGatewayAccount> {
  const { organizationId, region, gateway, environment } = scope;
  const authority = accountAuthorities.get(captured);
  const changed = () => new CredentialError(region, gateway, environment, [
    'The gateway account changed or could not be confirmed while this package was being prepared. Review the current account settings and authorize a fresh transmission; nothing was sent.',
  ]);
  if (!authority || authority.organizationId !== organizationId || authority.region !== region
    || authority.gateway !== gateway || authority.environment !== environment) throw changed();
  let row: Awaited<ReturnType<typeof readAccountRow>>;
  try { row = await readAccountRow(db, authority); } catch { throw changed(); }
  if (authorityFingerprint(row) !== authority.fingerprint) throw changed();
  // Decrypt only after the authority still matches, and ignore any mutation of
  // the public captured object's fields while asynchronous checks were running.
  return resolvedAccount(row, authority);
}

/** What a client account still lacks before it can send; empty when it can. */
export function clientAccountMissing(spec: GatewayAccountSpec, account: ResolvedGatewayAccount): string[] {
  const missing: string[] = [];
  if (!account.senderIdentifier) missing.push(spec.identifierLabel);
  for (const f of spec.clientFields) if (!account.credentials?.[f.name]) missing.push(f.label);
  return missing;
}

/**
 * The refusal for a transmit the organisation's chosen account cannot send,
 * or null when it can. Raised before the wire, so a transmit claim is released
 * (refusedBeforeWire treats a CredentialError as proof nothing left).
 */
export function clientAccountRefusal(
  spec: GatewayAccountSpec,
  account: ResolvedGatewayAccount,
  environment: GatewayEnvironment,
): CredentialError | null {
  if (account.mode !== 'client') return null;
  if (!spec.clientTransmit) {
    return new CredentialError(spec.region, spec.gateway, environment, [
      `your organisation chose its own ${spec.agency} account, and sending under a client's own ${spec.label} credentials is not available yet; ` +
        'an organisation admin can choose the platform account under Settings → Agency gateway accounts',
    ]);
  }
  const missing = clientAccountMissing(spec, account);
  return missing.length
    ? new CredentialError(spec.region, spec.gateway, environment, missing.map((m) => `${m} (your organisation's own account)`))
    : null;
}

export type GatewayAccountStatus = 'ready' | 'platform_not_configured' | 'credentials_needed' | 'client_not_supported';

export interface GatewayAccountView {
  region: Region;
  gateway: GatewayName;
  agency: string;
  label: string;
  identifierLabel: string;
  environment: GatewayEnvironment;
  mode: AccountMode;
  clientTransmit: boolean;
  clientFields: ClientField[];
  senderIdentifier: string | null;
  /** Names of the credential fields held — never their values. */
  credentialFieldsHeld: string[];
  status: GatewayAccountStatus;
  updatedAt: string | null;
  updatedBy: number | null;
}

/** One gateway × environment as chosen; no row is the platform account. */
function accountView(
  spec: GatewayAccountSpec,
  environment: GatewayEnvironment,
  row: Record<string, any> | undefined,
  platformReady: boolean,
): GatewayAccountView {
  const mode: AccountMode = row?.account_mode === 'client' ? 'client' : 'platform';
  const held: string[] = row?.credential_fields ?? [];
  const senderIdentifier: string | null = row?.sender_identifier ?? null;
  return {
    region: spec.region,
    gateway: spec.gateway,
    agency: spec.agency,
    label: spec.label,
    identifierLabel: spec.identifierLabel,
    environment,
    mode,
    clientTransmit: spec.clientTransmit,
    clientFields: spec.clientFields,
    senderIdentifier,
    credentialFieldsHeld: held,
    status:
      mode === 'platform'
        ? platformReady ? 'ready' : 'platform_not_configured'
        : clientStatus(spec, senderIdentifier, held),
    updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
    updatedBy: row?.updated_by ?? null,
  };
}

/**
 * Every gateway × environment for one organisation, with what is chosen and
 * whether it can send. `platformConfigured` answers for the platform account
 * (the gateway's own isConfigured); it is passed in so this module stays free
 * of the gateway implementations.
 */
export async function listGatewayAccounts(
  db: Queryable,
  organizationId: number,
  platformConfigured: (spec: GatewayAccountSpec, environment: GatewayEnvironment) => Promise<boolean>,
): Promise<GatewayAccountView[]> {
  const { rows } = await db.query(
    `SELECT region, gateway, environment, account_mode, sender_identifier, credential_fields, updated_at, updated_by
       FROM organization_gateway_accounts WHERE organization_id = $1`,
    [organizationId],
  );
  const byKey = new Map(rows.map((r) => [`${r.region}:${r.gateway}:${r.environment}`, r]));
  const out: GatewayAccountView[] = [];
  for (const spec of GATEWAY_ACCOUNT_SPECS) {
    for (const environment of GATEWAY_ENVIRONMENTS) {
      const row = byKey.get(`${spec.region}:${spec.gateway}:${environment}`);
      const platformReady =
        row?.account_mode === 'client' ? false : await platformConfigured(spec, environment).catch(() => false);
      out.push(accountView(spec, environment, row, platformReady));
    }
  }
  return out;
}

/** Whether a client account, as held, can send: never from a gateway that cannot send under one. */
function clientStatus(spec: GatewayAccountSpec, senderIdentifier: string | null, held: string[]): GatewayAccountStatus {
  if (!spec.clientTransmit) return 'client_not_supported';
  const complete = !!senderIdentifier && spec.clientFields.every((f) => held.includes(f.name));
  return complete ? 'ready' : 'credentials_needed';
}

export class GatewayAccountInputError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'GatewayAccountInputError';
  }
}

export interface GatewayAccountChange {
  organizationId: number;
  userId: number | null;
  region: string;
  gateway: string;
  environment: string;
  mode: string;
  senderIdentifier?: string | null;
  /** Client credential fields to store; omitted fields keep what is held. */
  credentials?: Record<string, string> | null;
  reason: string;
}

export interface GatewayAccountWrite {
  spec: GatewayAccountSpec;
  environment: GatewayEnvironment;
  mode: AccountMode;
  senderIdentifier: string | null;
  credentialFieldsHeld: string[];
  /** True when this write stored new secret material (it needs re-authentication). */
  credentialsChanged: boolean;
  previousMode: AccountMode;
  /** The persisted, secret-free reason the caller must also use for its chained audit. */
  reason: string;
}

function gatewayCredentialVariants(value: string): string[] {
  const normalized = value.replace(/\\r\\n|\\r|\\n/g, '\n').replace(/\r\n?/g, '\n');
  return [value, value.trim(), normalized, normalized.trim(), normalized.replace(/\n/g, '\\n'),
    normalized.trim().replace(/\n/g, '\\n'), JSON.stringify(value).slice(1, -1), JSON.stringify(value.trim()).slice(1, -1)].filter(Boolean);
}

function safeGatewayChangeReason(reason: string, credentials: Record<string, string>[]): string {
  const values = credentials.flatMap(fields => Object.values(fields)).flatMap(gatewayCredentialVariants);
  let safe = reason.trim();
  for (const secret of [...new Set(values)].sort((a, b) => b.length - a.length)) safe = safe.split(secret).join('[redacted]');
  return safe;
}

function priorGatewayCredentials(ciphertext: unknown, mode: AccountMode): { credentials: Record<string, string>; unreadable: boolean } {
  if (!ciphertext) return { credentials: {}, unreadable: false };
  try {
    const credentials: unknown = JSON.parse(decryptCredential(String(ciphertext)));
    if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials) ||
        Object.values(credentials).some(value => typeof value !== 'string')) throw new Error('Invalid stored credentials');
    return { credentials: credentials as Record<string, string>, unreadable: false };
  } catch {
    if (mode === 'client') throw new GatewayAccountInputError('CREDENTIALS_UNREADABLE', 'Stored gateway credentials could not be read. Clear the client account before replacing them.');
    return { credentials: {}, unreadable: true };
  }
}

function gatewayChangeReason(change: GatewayAccountChange, prior: ReturnType<typeof priorGatewayCredentials>): string {
  if (prior.unreadable) return 'Gateway account changed; reason withheld because prior credentials could not be read.';
  return safeGatewayChangeReason(change.reason, [prior.credentials, change.credentials ?? {}]);
}

/** Validate a change before anything is written: the refusals a person can act on. */
export function validateGatewayAccountChange(c: GatewayAccountChange): {
  spec: GatewayAccountSpec;
  environment: GatewayEnvironment;
  mode: AccountMode;
} {
  const spec = specFor(c.region, c.gateway);
  if (!spec) throw new GatewayAccountInputError('UNKNOWN_GATEWAY', `No agency gateway ${c.region}:${c.gateway}.`);
  if (c.environment !== 'production' && c.environment !== 'staging') {
    throw new GatewayAccountInputError('INVALID_ENVIRONMENT', "environment must be 'production' or 'staging'.");
  }
  if (c.mode !== 'platform' && c.mode !== 'client') {
    throw new GatewayAccountInputError('INVALID_MODE', "mode must be 'platform' or 'client'.");
  }
  if (typeof c.reason !== 'string' || c.reason.trim().length < 10) {
    throw new GatewayAccountInputError('REASON_REQUIRED', 'A reason of at least 10 characters is required: this changes whose identity submissions are sent under.');
  }
  validateClientFields(spec, c.credentials ?? {});
  return { spec, environment: c.environment, mode: c.mode };
}

/** Each credential field supplied is one the gateway takes, non-empty, and PEM where it must be. */
function validateClientFields(spec: GatewayAccountSpec, credentials: Record<string, string>): void {
  for (const [k, v] of Object.entries(credentials)) {
    const field = spec.clientFields.find((f) => f.name === k);
    if (!field) throw new GatewayAccountInputError('UNKNOWN_FIELD', `${spec.label} takes no credential field '${k}'.`);
    if (typeof v !== 'string' || !v.trim()) throw new GatewayAccountInputError('EMPTY_FIELD', `${k} is empty.`);
    if (field.pem && !/-----BEGIN [A-Z0-9 ]+-----[\s\S]+-----END [A-Z0-9 ]+-----/.test(v)) {
      throw new GatewayAccountInputError('NOT_PEM', `${k} must be PEM text (-----BEGIN … -----END …).`);
    }
  }
}

/**
 * Write the organisation's choice inside the caller's transaction. Choosing
 * the platform account clears any client credentials held: secrets are not
 * kept for an account that is not in use.
 */
export async function writeGatewayAccount(db: Queryable, c: GatewayAccountChange): Promise<GatewayAccountWrite> {
  const { spec, environment, mode } = validateGatewayAccountChange(c);
  const prior = await db.query(
    `SELECT account_mode, sender_identifier, credentials_ciphertext
       FROM organization_gateway_accounts
      WHERE organization_id = $1 AND region = $2 AND gateway = $3 AND environment = $4
      FOR UPDATE`,
    [c.organizationId, spec.region, spec.gateway, environment],
  );
  const before = prior.rows[0];
  const previousMode: AccountMode = before?.account_mode === 'client' ? 'client' : 'platform';
  const kept = priorGatewayCredentials(before?.credentials_ciphertext, mode);
  const reason = gatewayChangeReason(c, kept);

  let ciphertext: string | null = null;
  let held: string[] = [];
  let senderIdentifier: string | null = null;
  const credentialsChanged = mode === 'client' && Object.keys(c.credentials ?? {}).length > 0;
  if (mode === 'client') {
    const merged = { ...kept.credentials, ...(c.credentials ?? {}) };
    held = Object.keys(merged).sort();
    ciphertext = held.length ? encryptCredential(JSON.stringify(merged)) : null;
    senderIdentifier =
      c.senderIdentifier === undefined ? before?.sender_identifier ?? null : (c.senderIdentifier?.trim() || null);
  }

  await db.query(
    `INSERT INTO organization_gateway_accounts
       (organization_id, region, gateway, environment, account_mode, sender_identifier,
        credentials_ciphertext, credential_fields, reason, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
     ON CONFLICT (organization_id, region, gateway, environment) DO UPDATE SET
       account_mode = EXCLUDED.account_mode,
       sender_identifier = EXCLUDED.sender_identifier,
       credentials_ciphertext = EXCLUDED.credentials_ciphertext,
       credential_fields = EXCLUDED.credential_fields,
       reason = EXCLUDED.reason,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [c.organizationId, spec.region, spec.gateway, environment, mode, senderIdentifier, ciphertext, held, reason, c.userId],
  );
  return { spec, environment, mode, senderIdentifier, credentialFieldsHeld: held, credentialsChanged, previousMode, reason };
}
