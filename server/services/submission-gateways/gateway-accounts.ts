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

/** The organisation's choice for one gateway and environment. No row is the platform account. */
export async function resolveGatewayAccount(
  db: Queryable,
  organizationId: number,
  region: Region,
  gateway: GatewayName,
  environment: GatewayEnvironment,
): Promise<ResolvedGatewayAccount> {
  const { rows } = await db.query(
    `SELECT account_mode, sender_identifier, credentials_ciphertext
       FROM organization_gateway_accounts
      WHERE organization_id = $1 AND region = $2 AND gateway = $3 AND environment = $4`,
    [organizationId, region, gateway, environment],
  );
  const row = rows[0];
  if (!row || row.account_mode !== 'client') {
    return { mode: 'platform', senderIdentifier: null, credentials: null };
  }
  return {
    mode: 'client',
    senderIdentifier: row.sender_identifier ?? null,
    credentials: row.credentials_ciphertext ? JSON.parse(decryptCredential(row.credentials_ciphertext)) : null,
  };
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
      const mode: AccountMode = row?.account_mode === 'client' ? 'client' : 'platform';
      const held: string[] = row?.credential_fields ?? [];
      let status: GatewayAccountStatus;
      if (mode === 'platform') {
        status = (await platformConfigured(spec, environment).catch(() => false)) ? 'ready' : 'platform_not_configured';
      } else if (!spec.clientTransmit) {
        status = 'client_not_supported';
      } else {
        const complete = !!row?.sender_identifier && spec.clientFields.every((f) => held.includes(f.name));
        status = complete ? 'ready' : 'credentials_needed';
      }
      out.push({
        region: spec.region,
        gateway: spec.gateway,
        agency: spec.agency,
        label: spec.label,
        identifierLabel: spec.identifierLabel,
        environment,
        mode,
        clientTransmit: spec.clientTransmit,
        clientFields: spec.clientFields,
        senderIdentifier: row?.sender_identifier ?? null,
        credentialFieldsHeld: held,
        status,
        updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
        updatedBy: row?.updated_by ?? null,
      });
    }
  }
  return out;
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
  for (const [k, v] of Object.entries(c.credentials ?? {})) {
    if (!spec.clientFields.some((f) => f.name === k)) {
      throw new GatewayAccountInputError('UNKNOWN_FIELD', `${spec.label} takes no credential field '${k}'.`);
    }
    if (typeof v !== 'string' || !v.trim()) {
      throw new GatewayAccountInputError('EMPTY_FIELD', `${k} is empty.`);
    }
    if (spec.clientFields.find((f) => f.name === k)?.pem && !/-----BEGIN [A-Z0-9 ]+-----[\s\S]+-----END [A-Z0-9 ]+-----/.test(v)) {
      throw new GatewayAccountInputError('NOT_PEM', `${k} must be PEM text (-----BEGIN … -----END …).`);
    }
  }
  return { spec, environment: c.environment, mode: c.mode };
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

  let ciphertext: string | null = null;
  let held: string[] = [];
  let senderIdentifier: string | null = null;
  const credentialsChanged = mode === 'client' && Object.keys(c.credentials ?? {}).length > 0;
  if (mode === 'client') {
    const kept: Record<string, string> =
      before?.credentials_ciphertext ? JSON.parse(decryptCredential(before.credentials_ciphertext)) : {};
    const merged = { ...kept, ...(c.credentials ?? {}) };
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
    [c.organizationId, spec.region, spec.gateway, environment, mode, senderIdentifier, ciphertext, held, c.reason.trim(), c.userId],
  );
  return { spec, environment, mode, senderIdentifier, credentialFieldsHeld: held, credentialsChanged, previousMode };
}
