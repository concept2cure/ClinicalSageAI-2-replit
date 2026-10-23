# Complete the existing official eSTAR attachment workflow

W1 / D2; product and publication branch `concept2cure-v2`. Evidence:
`docs/evidence/D2-CLIENT-WORKFLOW-COMPLETION/2026-10-23/`.

## What already exists

- `client/src/concept2cure/mdx/surfaces/OfficialEstarPanel.tsx` is the existing
  official FDA export control for device and IVD marketing pathways. It previews
  governed administrative fields but cannot choose attachments.
  Its existing variant helper recognizes only `ivd`, although
  `shared/constants/domain/product-types.ts` already defines CDx as an IVD
  family through `isIvdFamily`. Compose that existing family predicate so
  canonical companion diagnostics reach IVD templates and destinations.
- `mdx/hooks/useEstarExport.ts` already delivers and reports official exports.
  Its options omit the server's attachment input and its outcome omits the
  attachment report. Extend that hook, rather than adding an export action.
- `server/routes/510k-estar-routes.ts` already accepts explicit slot/source
  assignments on `POST /official`, retains the produced PDF, and records the
  attachment report. It has no metadata-only slot catalog for a human picker.
- `server/services/pathway-engines/estar/estar-attachment-slots.ts` reads full
  SOM identities, descriptions, chapters and single-file restrictions from
  FDA's template. `estar-template-registry.ts` verifies vendored bytes against
  pinned checksums. Do not transcribe another slot table.
- `estar-attachment-plan.ts` verifies program/org source identity and stored
  bytes, enforces slot cardinality, filenames, security and manifest rules.
  `estar-fill.ts` embeds the attachments and returns UUID/slot/hash receipts.
  These are the existing producer and source resolver; neither is replaced.
  Discovery found that its Vault branch does not yet assert current actor
  access, binary disposition eligibility, current version or byte-bound review
  approval. Those existing canonical gates must be composed before exposing it.
- `client/src/concept2cure/v2/surfaces/VaultLibraryResults.tsx` already exposes
  `VaultVersionPicker`: authorized program search, exact UUID/version/hash,
  pagination, retry and scope reset. Reuse it. `project-vault.ts` search routes
  enforce current actor access and exclude retired rows. No new document list.
  Its program-result guard currently accepts a missing `current` value and
  the picker defaults that to true. Tighten the existing guard and stop that
  positive default so malformed metadata cannot claim a current version.
  `client/src/concept2cure/v2/styles/vault-picker.css` already owns this
  picker's layout. Measured MDX controls are 28–38px tall; complete their
  existing sizing to the UI standard's 44px touch target without new tokens.
- `submission-service.ts` already supports editing leaf pointers; Builder can
  remove draft placements. `package-from-core.ts` already binds Vault version
  predecessors for later eCTD sequences. Those are separate from official
  eSTAR attachments and are not modified by this increment.
- Legacy/all-retired Authoring recovery has no safe existing mutation:
  `20260926_vault_documents_record_immutability.sql` preserves retirement and
  retained hashes. Keep its refusal; do not infer, undelete or renumber records.
- `client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx` already
  exports `mutationUnconfirmed`, the canonical uncertain-write classifier.
  Move that exact pure function to `v2/mutationOutcome.ts` and re-export it
  from Builder so the existing export hook can share the same policy.
- `estar-attachment-slots.ts` and `estar-attachment-plan.ts` already own the
  chapter-path expression and manifest seeds. Move those existing constants
  to `shared/regulatory/estar-attachment-manifest.ts` with server re-exports
  for the browser receipt reader; do not create a competing format policy.
- Searches covered eSTAR/official/attachment/slot/Vault/placement/version and
  existing route, service, UI, AnA and test references, plus
  `git log --all --diff-filter=D -- '*estar*' '*Estar*' '*attachment*'`.
  Deleted MDX editors and fixture dossier attachment stores are not competing
  official export implementations and must not be revived.

## Bounded contract

1. Extend the existing panel for `510k`, `de_novo` and `pma`, both device and
   IVD, including canonical CDx identity. PreSTAR administrative preparation
   keeps its current boundary.
2. Add authenticated read-only `GET /api/510k/estar/attachment-slots?type=&variant=`.
   Return descriptor/type/variant/template version and template-derived
   `slots: [{somPath, field, description, chapters, singleAttachment}]` only
   from a usable, checksum-verified template. Missing or unverified bytes are
   a named refusal, never an empty available catalog. No program data is read.
3. People choose an exact Vault version and an explicit FDA destination. Start
   with zero attachments; never auto-map a title, section or version family.
   Reuse `VaultVersionPicker` scoped to the open program. Require a valid UUID
   and recorded SHA-256, show version/current status and hash, and allow remove
   or change. Optional earlier-version search must be visibly deliberate.
4. Use existing panel/token/classes, progressive disclosure, labeled native
   controls and reachable actions at narrow widths. Failed/pending slot reads,
   incomplete assignments and duplicate single-file slots prevent attachment
   export with an explanation. Export without attachments remains available
   when the optional attachment section is unused.
5. Extend `OfficialEstarOptions` with explicit Vault attachment selections.
   Carry the expected hash locally; send only the server's existing
   `{slot, source:{kind:'vault_document',documentId}}` request fields. The
   existing server resolver remains authoritative. Compose canonical current
   actor/program access, binary eligibility and `vaultVersionNotTransmittable`
   in that resolver, including after storage reads. For attachment-bearing
   exports, reassert access and source eligibility before producing and before
   retaining/delivering the result; failure must not become success. Refuse
   unapproved, superseded, withdrawn or unavailable sources by name; the picker
   must not implement its own approval policy.
   The attachment-bearing producer uses the exact checksum-verified template
   bytes, closing the interval between catalog selection and production.
6. Before downloading an attachment-bearing success, validate the server's
   requested count, no refusals, and exact one-to-one slot/UUID/SHA-256 receipt.
   A missing, malformed, mismatched or partial receipt holds delivery and
   reports an unconfirmed result. Display returned filenames, chapters and
   hashes so the result is reviewable. Do not invent a successful attachment
   from the request alone.
   Require a coherent official flag, PDF download envelope and manifest, and
   preserve the canonical uncertain-write classification after persistence.
7. Program/pathway/variant/session changes reset selections and results;
   late reads/exports cannot display or download in the next context. Pending
   export disables attachment editing. No new dependency, persistent selection
   store, second writer, schema migration or parallel regulatory engine.

## Qualification and limits

Retain failing-before/passing-after behavior, real-template catalog checks,
mounted UI tests of selection/request/refusal/context changes, exporter receipt
checks before delivery, existing attachment planner/fill/security regressions,
zero-error compiler/build and normal repository push gates. Inspect actual
mounted layouts at narrow/wide widths in light/dark themes. Document human
acceptance steps as **Not run** until a person performs them. Automated
qualification does not establish applicant review, Acrobat qualification,
agency acceptance or complete medical-device/diagnostic readiness.
