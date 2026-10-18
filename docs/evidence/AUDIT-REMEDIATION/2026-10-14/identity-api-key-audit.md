# O01 API-key lifecycle audit completion

Creation previously committed the API-key hash before attempting its audit;
revocation did the same. Expiration changed status and discarded a background
audit result (the service's one discarded-write baseline entry).

All three successful transitions now use one tenant-scoped transaction and the
existing `writeChainedAuditRow`. A failed canonical chain read or audit INSERT
rolls back the domain change and returns no issued secret. The existing writer
adds its HMAC seal when configured; this does not introduce a second sealing
policy or audit store. Public-key validation fails closed with 503 if an expired
credential's recorded transition cannot complete, then records the transition
once on recovery. Already expired/revoked credentials remain refused.

The issuer/revoker keep authenticated organization/user identity and the
canonical `authMiddleware` fresh organization membership role plus
`requireAdminRole` gate. The issuer carries reason, scopes, prefix and request
provenance into its transaction; generated plaintext is not an audit parameter
or stored field. Success carries `meta.auditTrail={persisted:true,chained:true}`.
The refused-revocation attempt has no mutation to enlist and carries the
existing canonical audit outcome in its 404 envelope.

The server distinguishes a known pre-commit rollback from a lost COMMIT
response. The latter is `API_KEY_COMMIT_UNCONFIRMED`, never a claim that no key
exists. The actual admin UI disables another issuance, refreshes the estate and
asks the administrator to close the form and check the key list. A lost network
response or missing one-time handover likewise remains uncertain. Known audit
failure preserves entered values for an explicit retry. Plaintext remains in
only the mounted one-time view and is removed on dismissal/tab leave/unmount.

`identity-api-key-audit-contract.md` preceded implementation.
`identity-api-key-audit-red.log` retains the initial 7 failing actual lifecycle
regressions. Its initial missing-HMAC expectation was corrected to exercise an
actual unavailable canonical chain: the existing writer's seal is opt-in, and
this remedy preserves that policy. `identity-api-key-audit-ui-red.log` records
the initial unknown-commit retry defect (1 failure, 1 rollback-retry control);
`identity-api-key-network-red.log` records the lost-network-response defect.

`identity-api-key-audit-green.log` records 40 passing tests in 4 files: actual
Express/PGlite issuer and canonical audit writer, private audit INSERT outage,
chain-read outage, committed-but-response-lost uncertainty, foreign revocation
isolation, revocation/expiration recovery, current canonical administrator
refusal, API validation/scopes/reason controls, unchanged always-hash timing
shape, and actual mounted admin one-time custody and recovery.
The PGlite schema is a local synthetic fixture with the actual chain-position
migration, not a production role/RLS deployment qualification.

`identity-api-key-audit-lint.log` reports zero errors; the established positional
generator signature retains its preexisting max-parameters warning. Whitespace
checks pass. `identity-api-key-tenant-entry-gate.log` reports 13 entry points and
8 baseline entries: removing the unused `validateApiKey` import removes the
previously documented false-positive management-router classification, and
only its obsolete baseline entry was removed (9 to 8).
`identity-api-key-discard-gate.log` reports 81 discarded outcomes across 43 files
after this service shrinks from 1 to 0; the O01 baseline owner ratchets that one
shared entry. Remaining debt belongs to the separately documented inventory.

No real key, live database transaction, credential, commit, push or deployment
was used. Production source is frozen for the root's integrated qualification.
