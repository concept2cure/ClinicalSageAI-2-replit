import { describe, it, expect } from 'vitest';
import { getSamlProvider, SAMLValidationError, type SAMLConfig } from '../saml-provider';

/**
 * Regression suite for the SAML SSO authentication-bypass fix.
 *
 * The prior hand-rolled provider trusted assertions even when signature
 * verification failed ("proceeding with caution"), and parsed assertions with
 * regexes (XML Signature Wrapping). These tests pin the security-critical
 * property of the vetted-library implementation: an assertion that is not
 * validly signed by the configured IdP certificate is ALWAYS rejected — the ACS
 * never yields a user for an unverified assertion.
 */

// Throwaway self-signed certificate used as the IdP trust anchor. No matching
// private key is available to the test, so nothing the test can craft will
// validate against it — which is exactly the point.
const TEST_IDP_CERT = `-----BEGIN CERTIFICATE-----
MIIDBzCCAe+gAwIBAgIUaa1TCGFm2td0uDEX0YR+o2VsHs0wDQYJKoZIhvcNAQEL
BQAwEzERMA8GA1UEAwwIdGVzdC1pZHAwHhcNMjYwNjA4MDQ0MjM5WhcNMzYwNjA1
MDQ0MjM5WjATMREwDwYDVQQDDAh0ZXN0LWlkcDCCASIwDQYJKoZIhvcNAQEBBQAD
ggEPADCCAQoCggEBAJ9p7dpTQKjW2H7Vn/7/BGvZY7742Iv/vehUUK/kXnQLJnl+
6th8OlVkQuVYsmQMC7z1NxrIdGcWklgMy58IXCpbXDXe/QmeSG9qBQpPgOZjLwBq
tA/yWZnL4kuXNu1g+pDvdtxiOUc1h7OWIx1TrKTACCaWBnKFgv3diWQ+mUNXmkaC
2MFFPiWUFyXwiZ5mCLmAu3WcSBAxSopQDBllIRGKZfsupwwyZVJ8hi/vG0YlAc6V
brs1l2rYrrPcYEYxDTGI6bbPneW9hqVIeLY0PRzhM8f+bJ/krVFM5ySGssnD1or0
6ebZC9r1VYfJJb9uBt0oU7b88B9+2HX1vQe4k68CAwEAAaNTMFEwHQYDVR0OBBYE
FMS/2wtOm8+5Si9nvKOjzSga/fqMMB8GA1UdIwQYMBaAFMS/2wtOm8+5Si9nvKOj
zSga/fqMMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAAddZGvR
/ZTY+7nAJbZ3s/I/c3BBffD+k4vrUaSCQbwOqI6yQG5+G6MwnZVC0LBNZTMwSRsR
SslmvJmbmksUlyINY+I2odWu4t/ie3n0enlxTkjWlqrXtOx5fLDv0rNP3HVZNN/K
qfOFijVeQe0LOA8gEw4ZEwPvV4NnyK+N3mYuvag4ZG/dNHtao2Jr4RCTpT2zZmBf
G7Q3L0jCs2BSTJn13WSd3WW4L3mYIX3dcIk0iSfrG3j/tJUOdmQ7Y9D7kF8z5q/q
xG8qaBQPSzB91h5ZlPrQs+Li6xUk6sM0+r7yvMG1KqttATRqTEyEcaF4L/MBquNv
j8ENs4zdQ5tz45Y=
-----END CERTIFICATE-----`;

const CONFIG: SAMLConfig = {
  entityId: 'https://sp.example.test/saml/metadata',
  assertionConsumerServiceUrl: 'https://sp.example.test/api/auth/sso/saml/callback',
  idpSsoUrl: 'https://idp.example.test/sso',
  idpEntityId: 'https://idp.example.test',
  idpCertificate: TEST_IDP_CERT,
  signRequests: false,
};

function b64(xml: string): string {
  return Buffer.from(xml, 'utf-8').toString('base64');
}

describe('saml-provider — fail-closed signature enforcement', () => {
  it('rejects a forged, UNSIGNED assertion (the prior auth-bypass payload)', async () => {
    const provider = getSamlProvider('forge-test-1', CONFIG);

    // A well-formed but completely unsigned Response asserting an attacker email.
    const forged = b64(`<?xml version="1.0"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
  xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_r1" Version="2.0"
  IssueInstant="${new Date().toISOString()}">
  <saml:Issuer>https://idp.example.test</saml:Issuer>
  <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
  <saml:Assertion ID="_a1" Version="2.0" IssueInstant="${new Date().toISOString()}">
    <saml:Issuer>https://idp.example.test</saml:Issuer>
    <saml:Subject><saml:NameID>attacker@evil.test</saml:NameID></saml:Subject>
    <saml:Conditions><saml:AudienceRestriction>
      <saml:Audience>${CONFIG.entityId}</saml:Audience>
    </saml:AudienceRestriction></saml:Conditions>
  </saml:Assertion>
</samlp:Response>`);

    await expect(provider.validateResponse({ SAMLResponse: forged })).rejects.toBeInstanceOf(
      SAMLValidationError
    );
  });

  it('rejects empty / garbage SAMLResponse input', async () => {
    const provider = getSamlProvider('forge-test-2', CONFIG);
    await expect(provider.validateResponse({ SAMLResponse: '' })).rejects.toBeInstanceOf(
      SAMLValidationError
    );
    await expect(
      provider.validateResponse({ SAMLResponse: b64('not even xml') })
    ).rejects.toBeInstanceOf(SAMLValidationError);
  });

  it('never returns an authenticated user for an unverified assertion', async () => {
    const provider = getSamlProvider('forge-test-3', CONFIG);
    const forged = b64(
      `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"` +
        ` xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"><saml:Assertion>` +
        `<saml:Subject><saml:NameID>admin@victim.test</saml:NameID></saml:Subject>` +
        `</saml:Assertion></samlp:Response>`
    );

    let returnedUser: unknown = null;
    try {
      returnedUser = await provider.validateResponse({ SAMLResponse: forged });
    } catch {
      // expected
    }
    expect(returnedUser).toBeNull();
  });

  it('can produce SP metadata for federation setup', () => {
    const provider = getSamlProvider('meta-test', CONFIG);
    const xml = provider.metadata();
    expect(xml).toContain('EntityDescriptor');
    expect(xml).toContain(CONFIG.entityId);
  });
});
