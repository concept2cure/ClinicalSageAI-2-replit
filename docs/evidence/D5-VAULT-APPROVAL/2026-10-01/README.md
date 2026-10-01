# VR-13: review and approve a Vault version with an e-signature, superseding the version before it (row D5)

**Plan item:** VR-13, `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`. **Date:** 2026-10-01.
**Depends on:** VR-06, VR-08, VR-09 and VR-12 (all done). **Founder decisions:** FD4 ships its strict
default: a Vault document must be approved to count as settled, a review sign-off is required, and the
uploader may neither review nor approve. FD6 ships as a refusal: an approved version's details are not
corrected in place.

**State of this record:** complete. The server half landed first (`ccd3c388b`). The Vault surface, the
review fixes and the D4 documents landed second.

## The finding

A Vault version had only a filing status, and the Vault counted a confirmed filing as settled, the same as
an approval. The governed lifecycle route had no client caller. It required the caller to supply the
title and type. Nothing superseded an earlier approved version, and nothing stopped the person who
reviewed a version from also approving it.

## The server change

| Piece | File |
|---|---|
| One lifecycle record per Vault version. A unique index on the version the record names. It is created only when no version already has two records; otherwise the migration raises a NOTICE. Replayable, with no DROP. | `migrations/20261001_canonical_documents_vault_version.sql`, `scripts/db/migration-set.mjs` (after VR-03's file) |
| Starting a version's lifecycle (`POST /api/regulatory/documents` naming `sources.vault_documents`): starts are serialized on the version under an advisory lock. A second start returns the first record (200, `created: false`). The record takes its title, type, content hash and program from this organization's row. The body's title, type, `contentHash` and `hasContent` are not read. Another organization's version gets 422 `VAULT_SOURCE_NOT_FOUND`. A version with a later version gets 409 `VERSION_NOT_CURRENT`. | `server/services/regulatory/vault-lifecycle-record.ts`, `server/services/vault/vault-lifecycle.ts`, `server/routes/document-lifecycle.ts` |
| Approval policy (FD4), checked before any credential is asked for. The person who signed the round's review gets 403 `SELF_APPROVAL`. The uploader and the record's creator were already refused (VR-12). A version that is no longer current gets 409 `VERSION_NOT_CURRENT`. | `vault-lifecycle-record.ts` (`vaultApprovalRefusal`) |
| Approving v2 supersedes the earlier steady-state versions (approved, placed, packaged or submitted) in the same transaction. Each move is an ordinary transition: the same gate, the bound chained `audit_logs` row, and a sealed event on that record's own trail. A failure rolls the approval back, including its signature row. | `vault-lifecycle-record.ts` (`supersedePriorVaultVersions`), `vault-version-family.ts` (`readPredecessorIds`, the same link rule) |
| The Vault reads each version's stage and sign-offs. In the version list, each version carries `lifecycle: { canonicalId, stage, review, approval }`. Each sign-off has the printed name and meaning from its `electronic_signatures` row, and the time from the record (UTC). The tree leaf carries `lifecycleStage`. A document's history includes its lifecycle records' audit rows, each naming its version. | `server/routes/c2c/project-vault.ts` |
| Editing the details of a version that is approved or later (placed, packaged, submitted or superseded) gets 409 `APPROVED_VERSION_IMMUTABLE`. | `server/services/vault/vault-metadata-edit.service.ts` |

## The Vault surface and the review fixes

| Piece | File |
|---|---|
| Each version in the list shows its stage, apart from filing: Not sent for review, In review, Approved, Approved (placed, packaged or submitted) or Superseded. Each sign-off shows the printed name, meaning and UTC time from its signature record. A superseded version's sign-offs are marked "no longer current". The detail header shows the stage as its own chip beside the filing chip. | `client/src/concept2cure/v2/surfaces/VaultLifecycle.tsx`, `VaultVersions.tsx`, `Vault.tsx` |
| The current version offers the next step. Send for review is confirmed first: it names the file's SHA-256 and states that the sender then neither reviews nor approves. Sign review and Approve open the shared EsignModal, which offers only the one meaning and collects the reason, the password and the code. The approval dialog names the earlier approved versions it supersedes, or says there are none. The page says, before anyone signs, when this user may not act: the uploader, the sender, the reviewer (for approval), or a role without the authoring grant. | `VaultLifecycle.tsx` |
| Refusals arrive as `apiRequest` delivers them in production, thrown as `ApiRequestError`. A gate refusal is shown in words. A dropped connection says it is not known whether the step was recorded. | `VaultLifecycle.tsx` |
| A folder counts an upload as settled only once its version is approved (FD4). A confirmed filing is no longer counted. | `Vault.tsx` (`isSettled`) |
| Server, after review: a sign-off carries the signer's own reason. The route refuses one without it (400 `REASON_REQUIRED`) and no longer writes one for the signer. Starting a version's record writes a chained `regulated_document.created` row naming who started it, because the record's creator is an author for separation of duties. The versions read carries `creatorId` and each sign-off's `signerId`. The refusal messages were reworded to say the rule and the next action. | `server/routes/document-lifecycle.ts`, `server/services/regulatory/vault-lifecycle-record.ts`, `server/services/vault/vault-lifecycle.ts`, `vault-metadata-edit.service.ts` |
| D4: URS-VAULT-013 (URS-002 v0.4), OQ-VAULT-13 and OQ-VAULT-14 with their runner steps (OQ-002 v0.6), RA-001 v0.11, TM-001 regenerated. OQ-VAULT-14 needs a third identity, `OQ_APPROVER_*` (`tests/validation/lib/credentials.mjs`, `requireApprover`). | `docs/validation/*`, `tests/validation/oq/vault/run.mjs` |

### Found on the way, fixed

- **`ci:launch-scope-api` had never checked the v2 Vault.** It matched a surface id with no left boundary,
  so `vault` resolved to `'device-vault'`'s component (the MDX Vault) and `home` to `'project-home'`.
  - The lookup is now anchored, `home` is declared shell-rendered, and a selftest case pins the fix
    (`red/launch-scope-api-selftest-unanchored.txt`: 2 cases fail with the old lookup).
  - Run on the real tree, the fixed gate found two unclaimed paths that production refuses
    (`red/launch-scope-api.txt`): the Vault's new `/api/regulatory/documents`, and the task board's
    `/api/project-rules`, in use since August. Both are now declared on their launch surfaces
    (`shared/constants/ui-surface-registry.ts`).
- **The signed-history export (VR-09) read a 403 as a dropped connection**, because `apiRequest` throws on
  refusals (`red/client-export-403.txt`). It now says the role may not export and who can.

## Verified by making it fail

| Check | Red | Green |
|---|---|---|
| `tests/db/vault-lifecycle.dbtest.ts`, run on PostgreSQL as `app_service` with RLS on, through the real ingest, Vault and lifecycle routes. The signing ceremony is the only stand-in; its own suites pin it. | `red/db-vault-lifecycle.txt`: 6 of 6 fail with trunk's three server files. The start needs a client-supplied title (400), a second start makes a second record, and so on. `red/db-supersession-removed.txt`: with only the supersession call removed, approving v2 leaves v1 approved, and the injected failure no longer rolls anything back (2 of 6). | `green/db-vault-lifecycle.txt`: 6/6, alongside the version, check-in, lifecycle-binding, append-only and immutability DB suites (44 tests) |
| Lifecycle and Part 11 suites | — | 265 unit files, 3397 tests, after the review fixes |
| The Vault surface (`vaultLifecycle.test.tsx`, 12 tests) | `red/client-vault-lifecycle.txt`: 7 of 7 fail with trunk's `Vault.tsx` and `VaultVersions.tsx`. That was the file's size when captured; the creator/role, supersession-naming and dropped-connection cases were added after the reviews. | `green/client-vault-lifecycle.txt`, with the check-in file: 19/19. All 457 client files, 4966 tests. |
| `ci:launch-scope-api` | `red/launch-scope-api.txt`, `red/launch-scope-api-selftest-unanchored.txt` | `green/launch-scope-api.txt` |

Two existing tests changed with the policy:
- `tests/regulatory/document-lifecycle-pipeline.pglite.test.ts` approves through a third person, because
  the reviewer no longer approves.
- `server/routes/__tests__/document-lifecycle-part11-record.test.ts` gives its Vault fixture the columns
  the start reads, and makes a fresh version for each document, because a version has one record.

## Limits, stated

- **No "return for revision" control.** The route supports in_review → authoring, but the Vault offers
  no button for it yet.
- **Not role-scoped by name.** The page infers the authoring grant from the org roles the server maps
  (`ORG_ROLE_FUNCTIONAL_GRANTS`), and it leaves an unknown role to the server.
- **Transitions other than sign-offs are on the chained `audit_logs` only**, with no `c2c_ana_actions`
  row. These are the start, Send for review and supersession. This is the same as every
  canonical-document transition today.
- **OQ-VAULT-13 and -14 are written, not executed.** They need the validation identities, and -14 a
  third one. → W3.
- **VR-14** (only an approved, current version is transmitted) is next. Its resolver hunk belongs to
  the D7 lanes.

