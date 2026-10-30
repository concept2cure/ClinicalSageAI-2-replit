# CAT2-20 closed: a QMS approval never signs an artifact pointer as its text, and an artifact version is never rewritten

Row: D2 (W1), workstream MR-12, Stage 3, the bound-content half (CAT2-20). 21 CFR 11.70 (signature to record
linking), 11.10(e).

## The finding (from the 2026-10-13 audit, at 94b4f9238)

The QMS approval digest covered `artifactId`, the pointer from `qms_documents.artifact_id` to an artifact, but not the
artifact's bytes. The artifact's content could be rewritten after approval. `artifact_id` could be set on create and
PATCH with no tenant check. The append-only trigger for `concept2cure_artifact_versions` was on no applier.

## Re-confirmed at head (2026-10-29)

Three of the finding's four points no longer hold. Since the audit, the controlled text converged onto authored
content.

| Finding point | At head | Where |
|---|---|---|
| The signed text can be the artifact's | **No.** An approval signs authored sections (captured under lock into `metadata.authoringContent`), or a legacy entry's `metadata.sections`. Both are inside `computeQmsDocumentContentDigest`'s `metadata`. A row with neither is refused (`QMS_CONTENT_REQUIRED`), whatever its `artifact_id`. | `approvableContent` and `qmsSignedContent`, `server/services/qms/document-approval-signature.ts`. Pinned by `controlled-document-lifecycle.pglite.test.ts` (`QMS_CONTENT_REQUIRED`). |
| The artifact's content is served as the document's text | **No.** The register, training (`qmsTrainingSections`), the controlled copy (`renderQmsControlledCopy`, from `qms_document_versions.sections`) and periodic review all read authored or `metadata.sections` text. Nothing reads the artifact behind `artifact_id`. No client reads the field. | `server/services/qms/training-content.ts`, `controlled-copy.ts`. A grep of `client/src` finds no `artifact_id` or `artifactId` under quality. |
| `artifact_id` can be set | **No.** No writer names the column. The create INSERT, PATCH (`updateControlledQmsDocument`), bind (`bindControlledQmsDocument`), revise, approval, retirement, training text and the review route's return to draft all omit it. | Census, below. |
| Artifact versions have no append-only trigger on an applier | **Yes, still open. Fixed here.** | `db/migrations/20260318_ga_immutability_hardening.sql` is not in `C2C_MIGRATION_FILES`. |

Census of the `qms_documents` writers (`grep -rnE "(INSERT INTO|UPDATE)\s+(public\.)?qms_documents" server shared scripts`):
- `controlled-document-service.ts`: create :100, bind :126, PATCH :215, revise :274, :305.
- `document-approval-signature.ts`: approval :383, retirement :631.
- `training-controlled-text.ts`: :58.
- `qms-review-route.ts`: :377.
- `scripts/seed/ga-demo.d/123-qms-quality.mjs`, which runs on laptops only.

None of them writes `artifact_id`.

## What already exists

| Piece | Path | Note |
|---|---|---|
| Artifact version history | `concept2cure_artifact_versions` (baseline `migrations/0000_sweet_joseph.sql`) | Each artifact version's content and hash. Signatures (`concept2cure_signatures.artifact_version_id`) and lock snapshots point at these rows. |
| The trigger written for it | `db/migrations/20260318_ga_immutability_hardening.sql` | UPDATE and DELETE refused. On no applier. It is not added here: its DELETE refusal would break the tenant purge's cascade, and it also touches the snapshots, which `20260929` now guards. |
| Signatures and snapshots guard | `migrations/20260929_concept2cure_signatures_append_only.sql` | Append-only with the purge's door. It refuses the cascade from deleting a signed version. |
| Boot requirement | `EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS`, `server/services/audit/audit-immutability-triggers.ts` | A missing or disabled trigger fails the security-health check. |

## What changed

- **`migrations/20261029k_artifact_versions_no_rewrite.sql`**, on the applier after `20261029j`:
  - `c2c_artifact_version_no_rewrite()` refuses UPDATE per row and TRUNCATE per statement, for every role.
  - **DELETE stays open.** The tenant purge deletes `projects`, which cascades to artifacts and their versions. A
    signed version is still kept, because its signatures refuse that cascade (`20260929`).
  - No foreign key into the table is `ON DELETE SET NULL`, so no cascade is an UPDATE here.
  - Census: every server writer of the table INSERTs only. They are `artifactVersionStore.ts`, `exportGovernance.ts`,
    `artifactWriteback.ts`, `verifiedSealService.ts`, `workflow-integrator.ts` and `AnaToolExecutor.ts`.
  - Replay-safe: `DROP TRIGGER IF EXISTS` of its own names, then `CREATE TRIGGER`. Each deploy re-arms a disabled one.
- **Boot-required.** Both triggers are in `EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS`.

## Not done, and why

**No digest v2 over artifact bytes.** The finding asked to add `artifactVersion` and `artifactContentSha256` to the
approval digest. The artifact is not the document's controlled text. Nothing approves, serves, trains on or copies
it as the SOP. Signing its bytes would bind text that no reader shows as the procedure, and changing the recipe would
split every review, periodic-review and training signature that shares it. The text that is signed (authored
sections, or `metadata.sections`) is already in the digest, and the exact reader re-checks it.

The `artifactId` pointer stays in the digest unchanged. Removing it would change every existing digest.

## Proof

- `green.txt`:
  - `server/services/audit/__tests__/artifact-versions-no-rewrite.pglite.test.ts` passes. It applies the file twice,
    then:
    - a new version and a head move are recorded;
    - rewriting a version's content, hash or number is refused, and so is TRUNCATE, with the row unchanged;
    - deleting an artifact cascades to its versions.
  - The boot-trigger tests also pass. Their prelude gains the table stub.
- `mutation-no-update-trigger.txt`: with the UPDATE trigger removed from the file, the four refusal cases fail.
  The file was then restored.
- Gates: `ci:migration-set-order`, `ci:migration-drop-safety`, `ci:migration-guard-order` and
  `ci:migration-deploy-path` all report OK.
