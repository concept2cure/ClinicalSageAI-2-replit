# D07 configured organization SAML sign-in

Implemented against the prior `identity-sso-contract.md` contract. The active
Concept2Cure login page now lets a member look up the explicit organization
identifier their administrator supplied, then follow the canonical same-origin
SAML initiate route with a validated continuation. Unknown configuration,
orphan organizations, incomplete entries, network failure and a contradictory
response offer no handoff. No customer directory, IdP URL, trust certificate or
private key is returned. Identity Console explains the configured slug and
the deployment-managed setup; it introduces no provider-write API. Generic
Google/Microsoft OAuth remains honestly unavailable.

Exposing SAML also revealed an existing mandatory-MFA bypass: its callback
issued an access token directly after the assertion. A verified assertion now
issues only the existing five-minute MFA challenge for the configuration-owned
tenant. The account's canonical enrollment chooses authenticator or email;
unavailable/failed email delivery refuses sign-in. Only the existing canonical
MFA verifier opens the tenant-configured session and issues access/refresh
tokens. Provider and IdP session index survive as signed challenge context for
existing logout. Request-body claims cannot add or replace that context.

The handoff places the challenge in a fragment, immediately cleared by the
active login page. Challenge storage is tab scoped and never authenticates the
browser. The existing factor UI handles verification/recovery, retains a
refused challenge, and follows its safe continuation only after verification.
Ambiguous or malformed MFA fragments are cleared and fail closed. Existing
session handoffs still require the canonical server session probe.

## Evidence

- `identity-sso-backend-red.log`: before-fix new regression **11 failures**;
  missing discovery and direct access issuance despite unavailable/failed MFA
  delivery.
- `identity-sso-ui-red.log`: before-fix active login **5 failures, 1 control
  pass**; missing SSO controls and MFA handoff.
- `identity-sso-context-red.log`: the new strict signed-context test run against
  HEAD's auth route in a temporary sibling module **1 failure, 1 control pass**;
  provider/session index were lost. Temporary modules were removed.
- `identity-sso-green.log`: after restoring dependencies with the canonical
  lockfile, **116/116 tests in 12 files**, including active login, canonical
  factor verification, signed context/tamper rejection, configured discovery,
  tenant binding, provider signature/audience/replay controls, safe redirects,
  session adoption, verification routing and SCIM controls.
- Scoped `--no-ignore` lint has zero errors; new production modules and new
  test modules have no warnings. Warnings in the older large auth/redirect
  sources remain (complexity, size, existing hooks/globals/console usage).
  Scoped `git diff --check` is clean.

The route tests mock the IdP assertion outcome and database, while the canonical
provider suite separately tests cryptographic checks. These are local regression
proofs, not a live federation or a production RLS qualification. No live IdP
call or provider credentials were used. Operators still configure certificates,
SMTP, ACS/audience and process-local replay-cache routing as the contract states.
