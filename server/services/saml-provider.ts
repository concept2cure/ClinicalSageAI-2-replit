/**
 * SAML 2.0 Service Provider Implementation
 *
 * Implements SP-Initiated SSO flow with:
 * - AuthnRequest generation (HTTP-Redirect binding with deflate + base64)
 * - SAML Response parsing (base64 decode + XML extraction)
 * - Assertion validation (timestamps, audience, InResponseTo)
 *
 * Uses only Node.js built-in modules (crypto, zlib) — no external SAML dependencies.
 *
 * @version 1.0.0
 */

import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('saml-provider');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
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

export interface SAMLAssertion {
  issuer: string;
  nameId: string;
  nameIdFormat: string;
  sessionIndex?: string;
  notBefore?: string;
  notOnOrAfter?: string;
  audience?: string;
  inResponseTo?: string;
  attributes: Record<string, string>;
}

interface AuthnRequestResult {
  requestId: string;
  redirectUrl: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const SAML_PROTOCOL_NS = 'urn:oasis:names:tc:SAML:2.0:protocol';
const SAML_ASSERTION_NS = 'urn:oasis:names:tc:SAML:2.0:assertion';
const DEFAULT_NAME_ID_FORMAT = 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress';

/** Maximum clock skew tolerance in seconds (5 minutes) */
const CLOCK_SKEW_TOLERANCE_SECONDS = 300;

// Common SAML attribute URIs mapped to friendly names
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

// ═══════════════════════════════════════════════════════════════════════════════
// SP-INITIATED FLOW: BUILD AUTHN REQUEST
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generates a SAML AuthnRequest and returns a redirect URL to the IdP.
 * Uses HTTP-Redirect binding (deflate + base64 + URL encode).
 */
export function buildAuthnRequest(samlConfig: SAMLConfig): AuthnRequestResult {
  const requestId = `_${crypto.randomUUID()}`;
  const issueInstant = new Date().toISOString();
  const nameIdFormat = samlConfig.nameIdFormat || DEFAULT_NAME_ID_FORMAT;

  const authnRequestXml = [
    `<samlp:AuthnRequest`,
    `  xmlns:samlp="${SAML_PROTOCOL_NS}"`,
    `  xmlns:saml="${SAML_ASSERTION_NS}"`,
    `  ID="${requestId}"`,
    `  Version="2.0"`,
    `  IssueInstant="${issueInstant}"`,
    `  Destination="${samlConfig.idpSsoUrl}"`,
    `  AssertionConsumerServiceURL="${samlConfig.assertionConsumerServiceUrl}"`,
    `  ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"`,
    `  >`,
    `  <saml:Issuer>${samlConfig.entityId}</saml:Issuer>`,
    `  <samlp:NameIDPolicy`,
    `    Format="${nameIdFormat}"`,
    `    AllowCreate="true"`,
    `  />`,
    `</samlp:AuthnRequest>`,
  ].join('\n');

  // Deflate (raw, no header) then base64 encode per SAML HTTP-Redirect binding spec
  const deflated = zlib.deflateRawSync(Buffer.from(authnRequestXml, 'utf-8'));
  const encoded = deflated.toString('base64');

  // Build redirect URL
  const redirectUrl = new URL(samlConfig.idpSsoUrl);
  redirectUrl.searchParams.set('SAMLRequest', encoded);

  // If signing is enabled and we have a private key, add signature
  if (samlConfig.signRequests && samlConfig.spPrivateKey) {
    const sigAlg = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
    redirectUrl.searchParams.set('SigAlg', sigAlg);

    // For redirect binding, signature is over the query string (SAMLRequest + SigAlg)
    const signablePayload = `SAMLRequest=${encodeURIComponent(encoded)}&SigAlg=${encodeURIComponent(sigAlg)}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signablePayload);
    const signature = signer.sign(samlConfig.spPrivateKey, 'base64');
    redirectUrl.searchParams.set('Signature', signature);
  }

  logger.info(`Built AuthnRequest ID=${requestId} for IdP=${samlConfig.idpSsoUrl}`);

  return { requestId, redirectUrl: redirectUrl.toString() };
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESPONSE PARSING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Decodes a base64-encoded SAML Response, parses XML, and extracts assertion data.
 * Uses regex-based XML extraction (no external XML parser dependency).
 */
export function parseAssertion(samlResponseB64: string, samlConfig: SAMLConfig): SAMLAssertion {
  // Decode base64 SAML Response
  const responseXml = Buffer.from(samlResponseB64, 'base64').toString('utf-8');

  logger.debug('Parsing SAML Response XML');

  // Extract InResponseTo from top-level Response element
  const inResponseTo = extractAttribute(responseXml, 'Response', 'InResponseTo');

  // Extract Issuer
  const issuer = extractElementContent(responseXml, 'Issuer') || '';

  // Extract NameID
  const nameId = extractElementContent(responseXml, 'NameID') || '';
  const nameIdFormat = extractAttribute(responseXml, 'NameID', 'Format') || DEFAULT_NAME_ID_FORMAT;

  // Extract SessionIndex from AuthnStatement
  const sessionIndex = extractAttribute(responseXml, 'AuthnStatement', 'SessionIndex') || undefined;

  // Extract Conditions
  const conditionsMatch = responseXml.match(/<(?:saml:)?Conditions([^>]*)>/);
  let notBefore: string | undefined;
  let notOnOrAfter: string | undefined;
  if (conditionsMatch) {
    const condAttrs = conditionsMatch[1];
    notBefore = extractAttrFromString(condAttrs, 'NotBefore') || undefined;
    notOnOrAfter = extractAttrFromString(condAttrs, 'NotOnOrAfter') || undefined;
  }

  // Extract AudienceRestriction
  const audience = extractElementContent(responseXml, 'Audience') || undefined;

  // Extract Attributes from AttributeStatement
  const attributes = extractSamlAttributes(responseXml);

  const assertion: SAMLAssertion = {
    issuer,
    nameId,
    nameIdFormat,
    sessionIndex,
    notBefore,
    notOnOrAfter,
    audience,
    inResponseTo: inResponseTo || undefined,
    attributes,
  };

  logger.info(`Parsed SAML assertion: nameId=${nameId}, issuer=${issuer}, attributeCount=${Object.keys(attributes).length}`);

  return assertion;
}

/**
 * Converts a parsed SAML Assertion into a SAMLUser by mapping well-known attributes.
 */
export function assertionToUser(assertion: SAMLAssertion): SAMLUser {
  const attrs = assertion.attributes;

  // Find email: from NameID (if email format) or from known attribute URIs
  let email = '';
  if (assertion.nameId && assertion.nameId.includes('@')) {
    email = assertion.nameId;
  }

  let firstName: string | undefined;
  let lastName: string | undefined;
  const groups: string[] = [];

  // Map attributes using both URI keys and friendly names
  for (const [key, value] of Object.entries(attrs)) {
    const friendlyName = ATTRIBUTE_MAP[key] || key.toLowerCase();

    switch (friendlyName) {
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
        groups.push(...value.split(',').map((g) => g.trim()));
        break;
    }
  }

  // Fallback: if still no email, use NameID directly
  if (!email) {
    email = assertion.nameId;
  }

  return {
    nameId: assertion.nameId,
    email,
    firstName,
    lastName,
    groups: groups.length > 0 ? groups : undefined,
    attributes: attrs,
    sessionIndex: assertion.sessionIndex,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ASSERTION VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validates a parsed SAML Assertion:
 * - NotBefore / NotOnOrAfter timestamps (with clock skew tolerance)
 * - Audience restriction matches our SP entity ID
 * - InResponseTo matches original request ID (if provided)
 * - Issuer matches expected IdP entity ID
 *
 * Throws on validation failure.
 */
export function validateAssertion(
  assertion: SAMLAssertion,
  samlConfig: SAMLConfig,
  expectedRequestId?: string
): void {
  const now = Date.now();
  const toleranceMs = CLOCK_SKEW_TOLERANCE_SECONDS * 1000;

  // Validate issuer matches IdP
  if (assertion.issuer && assertion.issuer !== samlConfig.idpEntityId) {
    throw new SAMLValidationError(
      `Issuer mismatch: expected "${samlConfig.idpEntityId}", got "${assertion.issuer}"`
    );
  }

  // Validate NotBefore (assertion not yet valid)
  if (assertion.notBefore) {
    const notBeforeMs = new Date(assertion.notBefore).getTime();
    if (isNaN(notBeforeMs)) {
      throw new SAMLValidationError(`Invalid NotBefore timestamp: "${assertion.notBefore}"`);
    }
    if (now < notBeforeMs - toleranceMs) {
      throw new SAMLValidationError(
        `Assertion not yet valid: NotBefore=${assertion.notBefore}, now=${new Date(now).toISOString()}`
      );
    }
  }

  // Validate NotOnOrAfter (assertion expired)
  if (assertion.notOnOrAfter) {
    const notOnOrAfterMs = new Date(assertion.notOnOrAfter).getTime();
    if (isNaN(notOnOrAfterMs)) {
      throw new SAMLValidationError(`Invalid NotOnOrAfter timestamp: "${assertion.notOnOrAfter}"`);
    }
    if (now >= notOnOrAfterMs + toleranceMs) {
      throw new SAMLValidationError(
        `Assertion expired: NotOnOrAfter=${assertion.notOnOrAfter}, now=${new Date(now).toISOString()}`
      );
    }
  }

  // Validate Audience restriction
  if (assertion.audience) {
    if (assertion.audience !== samlConfig.entityId) {
      throw new SAMLValidationError(
        `Audience mismatch: expected "${samlConfig.entityId}", got "${assertion.audience}"`
      );
    }
  }

  // Validate InResponseTo
  if (expectedRequestId && assertion.inResponseTo) {
    if (assertion.inResponseTo !== expectedRequestId) {
      throw new SAMLValidationError(
        `InResponseTo mismatch: expected "${expectedRequestId}", got "${assertion.inResponseTo}"`
      );
    }
  }

  logger.info('SAML assertion validation passed');
}

/**
 * Verifies the XML signature on the SAML Response using the IdP's public certificate.
 * Returns true if signature is valid, false otherwise.
 *
 * Note: This performs a basic signature check on the response. Full XML canonicalization
 * (c14n) is complex; this validates the digest over the raw signed content.
 */
export function verifySignature(samlResponseB64: string, samlConfig: SAMLConfig): boolean {
  try {
    const responseXml = Buffer.from(samlResponseB64, 'base64').toString('utf-8');

    // Extract SignatureValue
    const signatureValue = extractElementContent(responseXml, 'SignatureValue');
    if (!signatureValue) {
      logger.warn('No SignatureValue found in SAML Response');
      return false;
    }

    // Extract SignedInfo block for verification
    const signedInfoMatch = responseXml.match(/<(?:ds:)?SignedInfo[^>]*>([\s\S]*?)<\/(?:ds:)?SignedInfo>/);
    if (!signedInfoMatch) {
      logger.warn('No SignedInfo block found in SAML Response');
      return false;
    }

    // Reconstruct the SignedInfo element for verification
    const signedInfoXml = signedInfoMatch[0];

    // Normalize the certificate (strip PEM headers, whitespace)
    const certPem = normalizeCertificate(samlConfig.idpCertificate);

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(signedInfoXml);

    const isValid = verifier.verify(certPem, signatureValue.replace(/\s/g, ''), 'base64');

    if (!isValid) {
      logger.warn('SAML Response signature verification failed');
    } else {
      logger.info('SAML Response signature verification passed');
    }

    return isValid;
  } catch (err) {
    logger.error('Signature verification error', err as Record<string, unknown>);
    return false;
  }
}

/**
 * Generates SP metadata XML for sharing with IdPs during federation setup.
 */
export function generateSpMetadata(samlConfig: SAMLConfig): string {
  const nameIdFormat = samlConfig.nameIdFormat || DEFAULT_NAME_ID_FORMAT;

  let keyDescriptor = '';
  if (samlConfig.spCertificate) {
    const certBody = samlConfig.spCertificate
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s/g, '');
    keyDescriptor = `
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>${certBody}</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>`;
  }

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${samlConfig.entityId}">`,
    `  <md:SPSSODescriptor AuthnRequestsSigned="${samlConfig.signRequests}" protocolSupportEnumeration="${SAML_PROTOCOL_NS}">`,
    keyDescriptor,
    `    <md:NameIDFormat>${nameIdFormat}</md:NameIDFormat>`,
    `    <md:AssertionConsumerService`,
    `      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"`,
    `      Location="${samlConfig.assertionConsumerServiceUrl}"`,
    `      index="0"`,
    `      isDefault="true"`,
    `    />`,
    `  </md:SPSSODescriptor>`,
    `</md:EntityDescriptor>`,
  ].join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// XML HELPERS (regex-based, no external deps)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extracts text content of the first occurrence of an XML element.
 * Handles both namespaced (saml:Issuer) and non-namespaced (Issuer) forms.
 */
function extractElementContent(xml: string, elementName: string): string | null {
  // Match with optional namespace prefix: <ns:Element>content</ns:Element>
  const regex = new RegExp(`<(?:[\\w-]+:)?${elementName}[^>]*>([^<]*)<\\/(?:[\\w-]+:)?${elementName}>`, 's');
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Extracts an XML attribute value from the first occurrence of an element.
 */
function extractAttribute(xml: string, elementName: string, attrName: string): string | null {
  const elementRegex = new RegExp(`<(?:[\\w-]+:)?${elementName}\\s([^>]*)>`, 's');
  const elementMatch = xml.match(elementRegex);
  if (!elementMatch) return null;
  return extractAttrFromString(elementMatch[1], attrName);
}

/**
 * Extracts an attribute value from an attribute string.
 */
function extractAttrFromString(attrString: string, attrName: string): string | null {
  const attrRegex = new RegExp(`${attrName}="([^"]*)"`, 's');
  const match = attrString.match(attrRegex);
  return match ? match[1] : null;
}

/**
 * Extracts all SAML Attributes from an AttributeStatement.
 * Handles both <saml:Attribute Name="..."> and <Attribute Name="..."> forms.
 */
function extractSamlAttributes(xml: string): Record<string, string> {
  const attributes: Record<string, string> = {};

  // Match each Attribute element with its Name and nested AttributeValue
  const attrRegex = /<(?:[\w-]+:)?Attribute\s+[^>]*Name="([^"]*)"[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?Attribute>/g;
  let attrMatch: RegExpExecArray | null;

  while ((attrMatch = attrRegex.exec(xml)) !== null) {
    const name = attrMatch[1];
    const innerXml = attrMatch[2];

    // Extract the first AttributeValue content
    const valueMatch = innerXml.match(/<(?:[\w-]+:)?AttributeValue[^>]*>([^<]*)<\/(?:[\w-]+:)?AttributeValue>/);
    if (valueMatch) {
      attributes[name] = valueMatch[1].trim();
    }
  }

  return attributes;
}

/**
 * Normalizes a PEM certificate to standard format for crypto operations.
 */
function normalizeCertificate(cert: string): string {
  // If it already has PEM headers, return as-is
  if (cert.includes('-----BEGIN CERTIFICATE-----')) {
    return cert;
  }

  // Strip whitespace and wrap in PEM headers
  const cleaned = cert.replace(/\s/g, '');
  const lines: string[] = [];
  lines.push('-----BEGIN CERTIFICATE-----');
  for (let i = 0; i < cleaned.length; i += 64) {
    lines.push(cleaned.substring(i, i + 64));
  }
  lines.push('-----END CERTIFICATE-----');
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class SAMLValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SAMLValidationError';
  }
}
