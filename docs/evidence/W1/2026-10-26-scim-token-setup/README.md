# W1 / D2 — complete governed enterprise identity setup

## What already exists

- `server/routes/admin/scim-tenants.ts`: mounted platform-admin token create/list/rotate/enable/disable/revoke endpoints. Generates one-time secrets and stores SHA-256 hashes. Mutations have no reason or audit transaction; IDs accept non-integers.
- `server/routes/scim.ts`: resolves provisioning bearer tokens from `scim_tenants`; preserve this credential format and runtime behavior.
- `server/middleware/requirePlatformAdmin.ts`: authoritative platform-grant/password-owner gate; an organization membership role grants no platform standing.
- `server/services/scim-ip-policy.ts`: established locked-row, platform-standing recheck, chained-audit and commit-uncertainty pattern for the separate IP policy capability. Reuse this pattern and the same canonical audit writer for token records; do not change IP policy behavior.
- `server/services/auditService.ts`: canonical `writeChainedAuditRow`, used on the mutation connection. Token values and hashes must not enter audit metadata.
- `client/src/concept2cure/v2/surfaces/IdentityConsole.tsx`: existing token issue form, one-time memory-only reveal, and immediate rotate/toggle/revoke buttons; existing IP controls already collect reasons through `C2CForm`.
- `client/src/concept2cure/v2/C2CForm.tsx`: established governed form, submission state and cancel controls; extend these existing controls for token actions.
- `server/__tests__/security/scim-tenants-admin.test.ts` and the client's `identityConsole*.test.tsx`: existing endpoint/access/hash and UI/refusal coverage, extended in this slice.
- `docs/evidence/D2-CLIENT-ONBOARDING/2026-10-14/backend-ui-inventory.md`: records the outstanding token audit gap separately from completed IP-policy changes.

Searches: `scim-tenants` across server registration/routes and client callers; token/rotate/revoke/audit names; SCIM service and test filenames; `git log --all --diff-filter=D -- '*scim*' '*IdentityConsole*'` (no matching deletions in available history). This is completion of existing setup, not a new identity service, surface, role grant or SAML configuration writer.

## Design

Keep the existing endpoints and UI owner. All token mutations require a 3–500-character reason. Lock the existing target row to establish its organization, recheck platform standing on the transaction connection, and commit the mutation with its chained audit record. Return one-time secrets only after confirmed commit. Refuse unknown request fields and invalid IDs. Report uncertain commit outcomes honestly and require readback before a fresh action.

Extend the existing governed forms for rotation, enable/disable and revocation, explaining provisioning consequences before submission. Retain refused drafts; block duplicate/pending actions. Preserve one-time secret memory, no browser persistence and no AnA credential context. No new dependencies or schema changes.

## Verification

Implementation and focused negative/positive tests are recorded below. Hosted release of the preceding onboarding revision remains separately queued in GitHub Actions.

## Verification results and boundaries

- `validation-red.txt`: five reason/identifier regressions fail against the original router.
- `regressions.txt`: 118 tests pass across 12 suites, including existing onboarding, identity-console/IP-policy controls, the administrative-changes report, and real-SQL token transaction checks.
- The PGlite token suite applies the canonical `20260609_scim_tenants.sql` migration. It uses the actual platform grant guard and grant lookup, and makes a real audit insert violate a NOT NULL constraint. Credential creation, rotation, disable and revocation roll back on that insert failure. A revoked grant between the route guard and mutation connection is refused. An injected lost COMMIT reply after a real commit returns an unconfirmed outcome without a secret or a false rollback claim. The audit insertion adapter is a test seam; this does not substitute for the existing audit-chain cryptographic suites or deployed-database/RLS evidence.
- `browser-check.json` and eight PNGs: actual IdentityConsole, C2CForm, API transport and canonical CSS with synthetic API replies. Rotation/revocation forms and reason-bearing requests work at 1440px and 390px in light/dark themes, with no overflow, page errors or credential persistence. Screenshots finish CSS animations before capture. No production IdP or credential was used.
- `build.txt`: production client, server and audit verifier build pass; existing chunk-size warnings remain.
- `typecheck.txt`: full-program zero-error gate, result recorded on completion.
- ESLint reports only the existing IdentityConsole function-length warning, with no warning-count increase; the baseline remains unchanged.

The API intentionally tightens existing mutation bodies: integrations must now supply `reason`; creation accepts `organizationId` and optional `label`, updates accept `enabled`, and rotation/revocation accept only `reason`. Existing endpoint paths, platform standing and SCIM bearer format remain canonical. This completes the token audit gap from the prior inventory, without exposing deployment-managed SAML settings or inert personal preferences as working controls. Hosted release remains separate from local verification.

`typecheck-test-options-red.txt` records TypeScript catching unsupported Testing Library query options in the added tests. Those options were removed (role names already match strings exactly); the subsequent full-program gate passes with zero errors.
