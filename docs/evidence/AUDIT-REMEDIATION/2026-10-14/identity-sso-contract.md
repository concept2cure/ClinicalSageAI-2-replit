# D07: configured organization SAML sign-in

Contract published 2026-10-14 before implementation. The normal Concept2Cure
sign-in page offers organization SSO using the organization slug provided by
its administrator. It does not list other customers or expose IdP credentials.

## Discovery and handoff

`GET /api/auth/sso/saml/configuration?org=<slug>` accepts one explicit slug
(1–128 letters, digits, underscores or hyphens). Missing or malformed input
returns 400. Unknown, incomplete or orphan configuration returns 404
`SAML_NOT_CONFIGURED`; it never uses another tenant's IdP. Success returns
`{ success: true, provider: "saml", organization: "<slug>", configured: true }`
with `Cache-Control: no-store`. No provider directory, IdP URL, certificate,
private key, or other tenant metadata is returned. This states configured
availability; it does not claim a live federation has been validated.

The client constructs the canonical same-origin
`/api/auth/sso/saml/initiate?org=<slug>&returnTo=<safe path>` itself. It validates
the existing login continuation with `computeRedirect`, always supplies a
return path, and uses browser navigation rather than fetching an IdP. The
server's existing signature, audience, InResponseTo/replay, organization and
account-standing checks remain authoritative.

## Mandatory second factor

A verified SAML assertion is the first factor. It cannot mint an access token
or open a session. The callback derives the account's enrolled factor through
`mfaEnrolmentOf`, issues the existing five-minute server-signed MFA challenge
for the configuration-owning organization, and uses the existing OTP service
and configured delivery check for an email factor. Delivery failure refuses
sign-in. An authenticator account receives no email-factor fallback.

With a safe return path the callback redirects to the normal login page with
`#mfa=<challenge>&method=<email|totp>&provider=saml&returnTo=<path>` (and an
optional masked email). Without a return path it returns the existing-shaped
MFA challenge JSON. It never puts a bearer or challenge into the query string.
The client immediately clears the fragment, stores only the challenge in
session storage, shows the existing MFA view, and submits to the canonical
`/api/auth/mfa/verify`. Only that verifier creates access/refresh tokens and
opens the tenant-configured session. Signed provider/sessionIndex context is
preserved so existing SAML logout continues to work. UI values cannot grant
roles, tenant membership, a session, or second-factor verification.

## Operator configuration and limits

Canonical configuration remains deployment-managed: `SAML_TENANTS` is a JSON
object keyed by `organizations.slug`; each entry requires nonempty
`idpSsoUrl`, `idpEntityId`, and `idpCertificate`. Optional canonical fields are
`entityId`, `assertionConsumerServiceUrl`, `signRequests`, `spPrivateKey`,
`spCertificate`, `nameIdFormat`, and `idpSloUrl`. When request signing is enabled,
its private key must be present. The default deployment variables
`SAML_IDP_SSO_URL`, `SAML_IDP_ENTITY_ID`, and `SAML_IDP_CERTIFICATE` serve only
`organizations.slug = "default"`, with matching optional `SAML_SP_*`,
`SAML_SIGN_REQUESTS`, `SAML_NAME_ID_FORMAT`, and `SAML_IDP_SLO_URL`. `APP_BASE_URL`
defines generated SP URLs. Per-tenant JSON is loaded at startup; operators
restart after configuration changes. No invented tenant-provider database or
configuration-write endpoint is introduced.

SP metadata remains `/api/auth/sso/saml/metadata?org=<slug>`. Operators must
configure the IdP ACS and SP audience, verify certificates and delivery, and
test federation in their deployment. The canonical provider uses a process-local
request cache: one instance or sticky routing is required until a shared cache
is deployed. Generic Google/Microsoft OAuth is still unimplemented outside the
explicit development stub and stays absent from normal sign-in controls.

Verification will include regression failures before the fix, active login UI,
configured/unknown/orphan/invalid lookup, canonical MFA handoff and refusal,
tenant binding, redirect guards, provider signature controls, and scoped lint.
No real IdP, provider credentials, or live external federation is used here.
