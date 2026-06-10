/**
 * SAML 2.0 Service Provider — vetted-library implementation.
 *
 * Thin, fail-closed wrapper around `@node-saml/node-saml`, which performs real
 * XML-DSig verification (canonicalization / C14N, Reference digest binding,
 * signed-assertion enforcement) via `xml-crypto`. This replaces the previous
 * hand-rolled implementation, which parsed assertions with regular expressions
 * and trusted them even when signature verification failed — an authentication
 * bypass (forged/unsigned assertions ⇒ cross-tenant impersonation) and an XML
 * Signature Wrapping (XSW) surface.
 *
 * Security invariants enforced here (do not relax without security review):
 *   - `wantAssertionsSigned: true`  — an unsigned/invalid assertion is REJECTED.
 *   - `audience` pinned to our SP entityId — AudienceRestriction must match us.
 *   - `validateInResponseTo` — replay/solicitation binding for SP-initiated SSO.
 *   - The IdP signing certificate is the trust anchor; only assertions signed by
 *     it validate, so org selection from untrusted RelayState cannot forge login.
 *
 * @version 2.0.0
 */

import * as crypto from 'crypto';
import {
  SAML,
  ValidateInResponseTo,
  type SamlConfig as NodeSamlConfig,
  type Profile,
} from '@node-saml/node-saml';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('saml-provider');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES (stable public surface — consumed by server/routes/sso.ts)
// ═══════════════════════════════════════════════════════════════════════════════

export interface SAMLConfig {
  entityId: string;
  assertionConsumerServiceUrl: string;
  idpSsoUrl: string;
  idpEntityId: string;
  idpCertificate: string;
  signRequests: boolean;
  spPrivateKey?: string;
  spCertificate?: string;
  nameIdFormat?: string;
  /** IdP Single Logout (SLO) endpoint — enables SP-initiated logout. */
  idpSloUrl?: string;
}

export interface SAMLUser {
  nameId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  groups?: string[];
  attributes: Record<string, string>;
  sessionIndex?: string;
}

export class SAMLValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SAMLValidationError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_NAME_ID_FORMAT = 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress';

/** Maximum clock skew tolerance (5 minutes). */
const CLOCK_SKEW_TOLERANCE_MS = 300_000;

// Common SAML attribute URIs mapped to friendly names.
const ATTRIBUTE_MAP: Record<string, string> = {
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress': 'email',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname': 'firstName',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname': 'lastName',
  'http://schemas.xmlsoap.org/claims/Group': 'groups',
  'http://schemas.microsoft.com/ws/2008/06/identity/claims/groups': 'groups',
  'urn:oid:0.9.2342.19200300.100.1.3': 'email',
  'urn:oid:2.5.4.42': 'firstName',
  'urn:oid:2.5.4.4': 'lastName',
  'urn:oid:1.3.6.1.4.1.5923.1.5.1.1': 'groups',
};

/**
 * InResponseTo / replay validation mode. Default `ifPresent`: validate the
 * solicitation binding for SP-initiated flows (which always carry InResponseTo),
 * while still accepting IdP-initiated SSO. Override with
 * SAML_VALIDATE_INRESPONSETO=never|ifPresent|always.
 *
 * NOTE: node-saml's default in-memory request cache is per-process. For
 * multi-instance / HA deployments, a shared cache (e.g. Redis) should back the
 * InResponseTo store; until then run SSO on a single instance or sticky routing.
 */
function inResponseToMode(): ValidateInResponseTo {
  switch ((process.env.SAML_VALIDATE_INRESPONSETO || '').toLowerCase()) {
    case 'never':
      return ValidateInResponseTo.never;
    case 'always':
      return ValidateInResponseTo.always;
    default:
      return ValidateInResponseTo.ifPresent;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG MAPPING (fail-closed defaults)
// ═══════════════════════════════════════════════════════════════════════════════

function toNodeSamlConfig(c: SAMLConfig): NodeSamlConfig {
  // Some IdPs sign only the assertion (not the whole Response). Requiring a
  // signed assertion is the security floor; requiring a signed Response too is
  // stricter and opt-in via SAML_WANT_AUTHN_RESPONSE_SIGNED=true.
  const wantAuthnResponseSigned = process.env.SAML_WANT_AUTHN_RESPONSE_SIGNED === 'true';

  const base: NodeSamlConfig = {
    // Trust anchor: assertions must be signed by this certificate.
    idpCert: normalizeCertificate(c.idpCertificate),
    issuer: c.entityId,
    callbackUrl: c.assertionConsumerServiceUrl,
    entryPoint: c.idpSsoUrl,
    idpIssuer: c.idpEntityId,
    // Enforce AudienceRestriction == our SP entityId.
    audience: c.entityId,
    identifierFormat: c.nameIdFormat || DEFAULT_NAME_ID_FORMAT,
    // ── Security invariants ──────────────────────────────────────────────
    wantAssertionsSigned: true,
    wantAuthnResponseSigned,
    acceptedClockSkewMs: CLOCK_SKEW_TOLERANCE_MS,
    validateInResponseTo: inResponseToMode(),
    signatureAlgorithm: 'sha256',
    digestAlgorithm: 'sha256',
  };

  // Optionally sign our outbound AuthnRequest.
  if (c.signRequests && c.spPrivateKey) {
    base.privateKey = c.spPrivateKey;
  }

  // Enable SP-initiated Single Logout when the IdP SLO endpoint is configured.
  if (c.idpSloUrl) {
    base.logoutUrl = c.idpSloUrl;
  }

  return base;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER WRAPPER + PER-ORG INSTANCE CACHE
// ═══════════════════════════════════════════════════════════════════════════════

interface CachedProvider {
  saml: SAML;
  configHash: string;
}

/**
 * Cache SAML instances per org so the (process-local) InResponseTo request cache
 * persists across initiate → callback. Re-created if the org's config changes.
 */
const providerCache = new Map<string, CachedProvider>();

function configHash(c: SAMLConfig): string {
  return crypto.createHash('sha256').update(JSON.stringify(c)).digest('hex');
}

export class SamlProvider {
  constructor(
    private readonly saml: SAML,
    private readonly config: SAMLConfig
  ) {}

  /** Build the IdP redirect URL for SP-initiated SSO. */
  async getAuthorizeUrl(relayState: string): Promise<string> {
    return this.saml.getAuthorizeUrlAsync(relayState ?? '', undefined, {});
  }

  /**
   * Validate a SAML Response POSTed to the ACS. Throws {@link SAMLValidationError}
   * on ANY failure (missing/invalid signature, expired/forged assertion, audience
   * mismatch, InResponseTo mismatch). Never returns a user for an unverified
   * assertion — this is the fail-closed guarantee that fixes the prior bypass.
   */
  async validateResponse(container: Record<string, string>): Promise<SAMLUser> {
    let profile: Profile | null;
    try {
      const result = await this.saml.validatePostResponseAsync(container);
      profile = result?.profile ?? null;
    } catch (err) {
      throw new SAMLValidationError(
        `SAML response validation failed: ${(err as Error)?.message ?? 'unknown error'}`
      );
    }
    if (!profile) {
      throw new SAMLValidationError('SAML response did not yield a validated assertion');
    }
    return profileToUser(profile);
  }

  /** Whether IdP Single Logout is configured for this org. */
  get supportsLogout(): boolean {
    return Boolean(this.config.idpSloUrl);
  }

  /**
   * Build the SP-initiated SAML LogoutRequest redirect URL for the IdP's SLO
   * endpoint, so logging out of the app also terminates the IdP session.
   * Requires idpSloUrl to be configured (see {@link supportsLogout}).
   */
  async getLogoutUrl(
    user: { nameID: string; nameIDFormat?: string; sessionIndex?: string },
    relayState: string
  ): Promise<string> {
    const profile: Profile = {
      issuer: this.config.idpEntityId,
      nameID: user.nameID,
      nameIDFormat: user.nameIDFormat || DEFAULT_NAME_ID_FORMAT,
      sessionIndex: user.sessionIndex,
    };
    return this.saml.getLogoutUrlAsync(profile, relayState ?? '', {});
  }

  /** SP metadata XML for IdP federation setup. */
  metadata(): string {
    return this.saml.generateServiceProviderMetadata(null, this.config.spCertificate ?? null);
  }
}

export function getSamlProvider(orgSlug: string, config: SAMLConfig): SamlProvider {
  const hash = configHash(config);
  const cached = providerCache.get(orgSlug);
  if (cached && cached.configHash === hash) {
    return new SamlProvider(cached.saml, config);
  }
  const saml = new SAML(toNodeSamlConfig(config));
  providerCache.set(orgSlug, { saml, configHash: hash });
  logger.info(`Initialized SAML provider for org="${orgSlug}"`);
  return new SamlProvider(saml, config);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE → USER MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

function profileToUser(profile: Profile): SAMLUser {
  const attrs = collectAttributes(profile);

  let email = '';
  if (typeof profile.nameID === 'string' && profile.nameID.includes('@')) {
    email = profile.nameID;
  }
  if (!email && typeof profile.email === 'string') email = profile.email;
  if (!email && typeof profile.mail === 'string') email = profile.mail;

  let firstName: string | undefined;
  let lastName: string | undefined;
  const groups: string[] = [];

  for (const [key, value] of Object.entries(attrs)) {
    const friendly = ATTRIBUTE_MAP[key] || key.toLowerCase();
    switch (friendly) {
      case 'email':
        if (!email) email = value;
        break;
      case 'firstname':
      case 'givenname':
        firstName = value;
        break;
      case 'lastname':
      case 'surname':
        lastName = value;
        break;
      case 'groups':
        groups.push(...value.split(',').map((g) => g.trim()).filter(Boolean));
        break;
    }
  }

  if (!email) email = typeof profile.nameID === 'string' ? profile.nameID : '';

  return {
    nameId: typeof profile.nameID === 'string' ? profile.nameID : '',
    email,
    firstName,
    lastName,
    groups: groups.length > 0 ? groups : undefined,
    attributes: attrs,
    sessionIndex: profile.sessionIndex,
  };
}

/** Flatten node-saml attributes (under `attributes` and/or spread on the profile). */
function collectAttributes(profile: Profile): Record<string, string> {
  const out: Record<string, string> = {};

  const rawAttrs = (profile as Record<string, unknown>).attributes;
  if (rawAttrs && typeof rawAttrs === 'object') {
    for (const [k, v] of Object.entries(rawAttrs as Record<string, unknown>)) {
      out[k] = stringifyAttr(v);
    }
  }

  // node-saml also spreads well-known claim URIs directly onto the profile.
  for (const uri of Object.keys(ATTRIBUTE_MAP)) {
    const v = (profile as Record<string, unknown>)[uri];
    if (v != null && out[uri] == null) out[uri] = stringifyAttr(v);
  }

  return out;
}

function stringifyAttr(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => String(x)).join(',');
  if (v == null) return '';
  return String(v);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CERT NORMALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

/** Wrap a bare base64 certificate body in PEM headers if needed. */
function normalizeCertificate(cert: string): string {
  if (cert.includes('-----BEGIN CERTIFICATE-----')) return cert;
  const cleaned = cert.replace(/\s/g, '');
  const lines: string[] = ['-----BEGIN CERTIFICATE-----'];
  for (let i = 0; i < cleaned.length; i += 64) {
    lines.push(cleaned.substring(i, i + 64));
  }
  lines.push('-----END CERTIFICATE-----');
  return lines.join('\n');
}
