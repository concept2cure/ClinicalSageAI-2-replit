# Independent read-only server review

The client worker reviewed the frozen server implementation and directly
affected fixtures after completing client verification. No server source was
edited and no additional test, compiler, build or Git command ran in this review.

## Reviewed behavior

- `authoring-file-to-vault.ts` uses the same fixed, parameterized locked header
  projection at capture and recording. `isDeepStrictEqual` compares the complete
  selected header, including real Date values, optional template/governed
  binding and source provenance. The existing ordered rendered-section check
  remains inside the recording transaction before history and approval.
- `vault-ingest.service.ts` appends a candidate UUID at `$31`, preserving prior
  bind positions, and bases `admission.created` on the actual returned row UUID.
  An empty pre-read or an absent `reupload` cannot establish ownership.
- Authoring refuses a known reused admission with
  `VAULT_VERSION_ALREADY_RECORDED`; missing or malformed creation proof becomes
  `OUTCOME_UNKNOWN`. Neither branch reaches authoring placement, export history,
  approval carryover or compensation of the existing row.
- The existing compensation path now checks the affected row identity within
  captured tenant/project scope, and tombstone plus chained audit share one
  transaction. Failed audit, rollback, unmatched row or commit acknowledgement
  cannot produce a confirmed cleanup claim. Recording COMMIT/ROLLBACK ambiguity
  similarly retains the admitted record and suppresses approval carryover.
- The canonical ingest protects stored bytes before attempting COMMIT. A lost
  COMMIT/ROLLBACK acknowledgement retains them and returns `OUTCOME_UNKNOWN`;
  the existing discard helper cannot remove possibly referenced bytes.
- `vault-ingest-types.ts` contains public types only. The existing service
  imports those types and re-exports its existing public type names; it does not
  add a second admission implementation or runtime import side effect.
- The route passes refusal code, status and message through, including both
  client reconciliation codes. Success includes the project, hash and format
  required by the strengthened client receipt.

## Evidence interpretation

The authoring snapshot PGlite fixture exercises real recording/compensation
transactions, header changes with unchanged status, date changes, missing and
wrong-tenant compensation rows, audit rollback, and unacknowledged transactions.
Ingest and approval are explicit seams in that fixture.

`server/services/ectd/__tests__/placement-vault-leaf-parity.pglite.test.ts:166–230`
also executes the actual canonical ingest INSERT/ON CONFLICT in PGlite. It proves
new versus ordinary reused identity, and a winner returned after an empty
pre-read. Only that missed pre-read is replaced as a declared statement-timing
seam. Its COMMIT/ROLLBACK cases execute the SQL before withholding acknowledgement
and assert retained bytes. This is real SQL qualification, not a claim about
native simultaneous connections or lock scheduling. The separate mocked
`vault-ingest-storage.test.ts` qualifies candidate binding, returned-row logic
and cleanup calls.

## Bounded residuals

No blocking correctness gap was found in the changed ownership, snapshot or
unknown-outcome decisions. The previously existing post-admission
`filingTarget`/`resolveVaultView` call occurs before the placement compensation
catch. A throw there can leave a verified admitted row active and reach the
route's generic HTTP 500. The client treats that as an unknown outcome and holds
replay; there is no false cleanup claim. Thus this increment does not establish
universal compensation of every post-admission throw. Root was informed; no
server expansion was requested after source freeze.

The pre-existing route comments at `authoring.router.ts:6986–6994` still describe
"or nothing" and "Never a partial write". Runtime refusal handling correctly
preserves uncertainty; those broad comments should be qualified separately.

Historical hash-version check-in/renumbering, native multi-connection scheduling
and third-party use during the admission/recording interval remain outside this
increment. Existing byte-bound independent approval gates are preserved.

Reviewed production SHA-256 pins:

| File | SHA-256 |
| --- | --- |
| `authoring-file-to-vault.ts` | `d45dc46f3a6eb7d414da89eb22340cc309ed33c3b9c65905a34903c9b93ce43e` |
| `vault-ingest.service.ts` | `161fb45f4530b1835455007a89d44f0a98b04a29fc417c4b5c26e3a86118b991` |
| `vault-ingest-types.ts` | `2de6f13da5b667d83440bae480a36d615d06981d17c2b8dc7d775912ff9b01d8` |
