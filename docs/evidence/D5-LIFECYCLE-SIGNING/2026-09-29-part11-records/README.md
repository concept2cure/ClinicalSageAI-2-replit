# VR-12: lifecycle sign-offs are Part 11 signature records, bound to content the server reads (row D5)

**Plan item:** VR-12, `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`. **Date:** 2026-09-29.
**Depends on:** VR-03 (`docs/evidence/D5-LIFECYCLE-APPEND-ONLY/2026-09-25/`), VR-06.

## The finding

On the governed document pipeline (`/api/regulatory/documents`), a review or an
approval was a `csig:<uuid>` JSON object on the canonical row:

- no `electronic_signatures` row, no printed name, no binding to any content;
- the org-wide audit row went through `logAction`, which runs on its own
  connection and swallows a failure, so a stage change could commit with no
  audit row;
- the content hash was whatever the request body said, at creation and on every
  transition;
- nothing recorded who created a document, so nothing stopped its author from
  reviewing and approving it.

## The change

| Piece | File |
|---|---|
| A sign-off is a governed ledger pair (chained, sealed `audit_logs` row + `c2c_ana_actions`) and one `electronic_signatures` row: printed name, declared meaning (`REVIEWED` / `APPROVED`), time, §11.200 attribution hash. They are written on the transaction that records the lifecycle change, beside the re-verification that precedes them. The canonical copy names the record (`esig:<id>`) and the content hash it covers. | `server/routes/document-lifecycle.ts` (`recordLifecycleSignature`) |
| What a sign-off binds. For a document made from a Vault version, it binds that version's `vault.documents.content_hash`, read FOR SHARE in this organization (`BINDING_BASIS.VAULT_DOCUMENT_VERSION`). The signature is refused if the version can't be read or its hash is not the one the document recorded. A document with no source the server can read binds the ledger's chain hash, labelled as not a content hash (`GOVERNED_ACTION_LEDGER`). | `server/services/regulatory/lifecycle-signature.ts`, `server/services/part11/signature-persistence.ts` (one constant) |
| Every lifecycle audit row is written with `writeChainedAuditRow` on the same transaction, so a failure rolls the stage change back. `applySignature` has no default: the csig fallback is gone, and approving without the route's signer is refused. | `server/services/regulatory/lifecycleBindings.ts` |
| A body `contentHash` is never read, at creation or on a transition. A Vault source must be a version in this organization (422 `VAULT_SOURCE_NOT_FOUND`). | route |
| Nobody signs off a document they created or uploaded: the platform's one separation-of-duties check now models `canonical_document` authorship (the record's creator, plus the Vault version's uploader). The result is 403 `SELF_APPROVAL`, before any credential is asked for. | `server/services/governance/separation-of-duties.ts`, route |
| A review covers the content it was signed over. `REVIEW_SIGNOFF_REQUIRED` now holds unless the review's bound hash equals the current one. A sign-off recorded before this change covers nothing. | `shared/regulatory/document-lifecycle.ts` (`reviewCoversContent`) |
| `canonical_documents.created_by`: `ADD COLUMN IF NOT EXISTS`, amended in place into `20260731c` with a dated header note (Rule 1). VR-03's guard makes it write-once, also amended in place with a dated note. | `migrations/20260731c_canonical_documents.sql`, `migrations/20260925_canonical_documents_append_only.sql`, `shared/schema/canonical_documents.ts` |
| Test fixture: the governed-signing tables, with the real D6, §11.70 and chain-order migrations applied from disk. It is kept under `fixtures/` because the harness's runtime-DDL allowance only shrinks. | `server/db/fixtures/governed-signing-pglite.ts`, `server/db/pglite-harness.ts` (`governedSigning`) |

## Verified by making it fail

| Check | Red | Green |
|---|---|---|
| Route with production bindings on PGlite, real D6 and §11.70 migrations (`document-lifecycle-part11-record.test.ts`), plus the pure gate | `red/route-and-gate.txt`: 16 failed against trunk: no signature row, `'forged'` stored, 200 where the audit INSERT failed, 200 for the creator and the uploader, no `created_by` | `green/route-and-gate.txt`: 34/34 |
| The write-once clause alone removed from the guard | `red/trigger-created-by.txt`: the reassignment test fails, and only it | green above |
| On PostgreSQL as `app_service`, RLS enforcing (`tests/db/lifecycle-signature-binding.dbtest.ts`): the FOR SHARE read and its tenant scope; authorship through the runtime role; the guard | `red/db-separation-of-duties.txt`: with the `canonical_document` case removed, the creator is "unresolved", not refused | `green/db-binding-and-authorship.txt`: 6/6, with the VR-03 append-only dbtest |
| Replay | — | `green/deploy-replay.txt`: `deploy-migrate` twice; `created_by integer` |
| The suites these files touch (regulatory, governance, part11, qms, the pipeline) | — | `green/related-suites.txt`: 132 files, 1823 tests |

The pipeline suite had one user author, review and approve every document. That
was the defect: the self-approval this change refuses. It now uses a second
signer, and its `csig:` assertion is `esig:<id>`.

Also green: `tsc` (0 errors), `ci:sign-ceremony` (the write sits beside its
ceremony, and there is no new baseline entry), `ci:runtime-ddl`,
`ci:discarded-audit-write`, `ci:migration-drop-safety`,
`ci:migration-set-order`, `ci:column-reachability`, `ci:drizzle-tenant-scope`,
`db:sync-manifest:check`, `ci:vault-document-writers`. ESLint per file matches
trunk (the one new warning, the advance handler's length, was removed by
extracting `prepareApproval`).

## Limits, stated

- A document with no readable source still takes `hasContent` from the request.
  Its signatures bind the ledger, and they say so. VR-13 creates lifecycle
  documents from Vault versions, where everything is read from the row.
- Sources other than `vault_documents` (coauthor, unified, artifacts) are
  stored as named, not verified. Only the Vault source is read.
- A record created before this change has no `created_by`. A review or approval
  of it is refused (409 `SEPARATION_OF_DUTIES_AUTHOR_UNRESOLVED`) rather than
  assuming who wrote it. A pre-VR-12 review covers nothing, so a revision is
  needed before approval. No client calls this route yet.
- Approving writes three audit rows: the signature's ledger row, `registered`,
  and the transition. The sign-off alone writes one.
- Supersession revokes no signature. The esign trigger's revocation defect
  belongs to P0-7.
