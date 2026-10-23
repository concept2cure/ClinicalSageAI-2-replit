# Incoming versioned re-filing compatibility review

Static review of `0fff4da02` →
`8ba496f6989dfee0c92d5bb994fb2ac817faac97`, 2026-10-23. Root owns
synchronization, the human-guide conflict, qualification and publication. No
tests, production/test edits or Git mutations were performed for this review.
This report is its only write. References below identify incoming source lines.

## What already exists

- `authoring-file-to-vault.ts` already owns rendering, canonical admission,
  placement, exact-source recheck, audit/receipt, compensation and byte-bound
  approval carry. This change completes its use of existing Vault check-in.
- `vault-version-checkin.ts`, `vault-version-family.ts` and the existing
  `20260930_vault_documents_version_lineage.sql` already own numeric assignment,
  predecessor identity, current-head locking, duplicate bytes and version
  family constraints. No parallel store or migration is added here.
- `authoring-vault-filing-receipt.ts` already verifies a retained rendition's
  scoped source/Vault identity, byte hash and canonical chained receipt. The
  new narrow plan helper consumes that reader rather than trusting a code/title.
- `FileToVaultDialog.tsx` is already shared by the single Workbench/Canvas and
  retains unknown outcomes and exact admitted UUIDs. Its existing receipt gains
  optional, validated server lineage and the existing status copy explains it.
- The controlling incoming contract is
  `docs/design/AUTHORING_REFILING_VERSIONS_2026-10-23.md`.

## Findings

**No blocking compatibility finding.** The following production files from our
planning slice are unchanged in the incoming diff:

```text
shared/regulatory/global-document-registry.ts
server/services/authoring/builtin-authoring-templates.ts
server/services/market-specs/document-template-library.ts
server/services/market-specs/document-preparation.ts
server/services/market-specs/shared-planning-preparation.ts
server/services/ana/builtin-template-reference.ts
```

Their four exact RI identities, existing five headings, null module, empty
families, manual eligibility, optional analysis market/no filing route,
evidence/readiness limits and bounded AnA pages are preserved. No current actor
read/access, assembly, saved-review or AnA model-provenance implementation is
changed. `ingestDocumentType` still maps a null module to `OTHER`
(`authoring-file-to-vault.ts:212–217`); numeric Vault versions do not confer
filing authority, scientific verification or approval on internal work products.

1. **Actual route and admission.**
   `POST /api/authoring/docs/:docId/file-to-vault` remains the existing route in
   `server/routes/authoring.router.ts:6584`; its only incoming behavior change is
   returning `version` and `supersedesDocumentId` alongside the exact admitted
   UUID (`:6620–6634`). In `authoring-file-to-vault.ts:455–495`, each format uses
   the verified plan's code and explicit predecessor, initial versions alone
   receive `1.0`/initial classification, and the source-admission callback repeats
   the decision. A successor returns canonical inherited placement directly;
   the placement writer is used only for a new family. Confirmed admission is
   required before subsequent writes (`:127–134`). Exact-source recheck,
   compensation and unknown-commit handling remain (`:275–355,515–525,562–571`).
2. **Version plan and original identity.**
   New `server/services/authoring/authoring-vault-version-plan.ts:23–42` checks
   scoped native Vault UUID, MIME, stored hash and recorded original source
   UUID through the canonical receipt. Its family lookups scope organization
   and program. Retained legacy rows, unknown numbering, missing/ambiguous
   current heads, unavailable/unverified receipts and conflicting folders
   refuse (`:45–68`). PDF and Word use separate codes. The preview/commit source
   callback requires the same current head (`:74–81`), preserving provenance
   rather than constructing a lineage from date/title or medicinal assumptions.
3. **Vault assignment and races.**
   `server/services/vault/vault-version-checkin.ts:68–92` advances beyond retained
   tombstoned numeric majors without reusing labels, refuses an occupied slot
   and respects range limits. Existing duplicate-content/current-head rules
   remain. The locked second check compares both assigned version and the
   prepared head's inherited metadata (`:281–297`), so a concurrent Move or
   confidentiality/details edit is not silently overwritten. This is scoped
   locking/rechecking, not proof of arbitrary independent-root phantom
   serialization; the incoming contract states that limit explicitly.
4. **Approval and submission pins.**
   Approval is not inherited by the version-plan/check-in helpers. The filer
   continues to call existing `carryApprovalToVault` for the newly admitted UUID
   and exact rendered bytes only after its filing record commits
   (`authoring-file-to-vault.ts:562–584`). The actual parity fixture now proves
   a successor links while the old leaf and bytes stay pinned, superseded old
   leaves fail release/transmit and an unapproved new version still fails
   release. Separate PDF/Word families remain independent. The approval-carry
   fixture adds the real existing lineage migration; it does not relax policy.
5. **UI lineage and retry holds.**
   `FileToVaultDialog.tsx:100–139` accepts legacy receipts without fabricating
   lineage and requires a coherent optional version/predecessor pair for new
   receipts, including no self-predecessor. Malformed success metadata flows
   into the existing uncertain hold (`:152–167`). The UI displays only confirmed
   facts, keeps exact UUID navigation and explains explicit replacement of
   pinned sequence placements using existing controls/classes (`:218–234,
   415–420`). The small text wrapping change contains long IDs; generated
   `surface-text-ramp.css` additions follow the existing generator/token design.

Retained legacy hash-labelled and all-retired families intentionally require
review; this is an explicit refusal, not automatic migration. Duplicate retained
bytes remain refused even after compensation. Existing sealed-source revision
policy and submission approval gates are unchanged. Root should retain these
limits in the merged human guide; this reviewer has not edited it.

## Bounded post-merge qualification

Recommend these **9 suites** on the actual merged bytes. They cover the actual
route, edited-source compensation, version-plan provenance, canonical numbering
and locks, pinned leaves, strict-PDF compatibility, approval carry and mounted
UI receipt/uncertainty behavior:

```text
server/routes/__tests__/authoringFileToVault.pglite.integration.test.ts
server/routes/__tests__/authoringFileToVaultApprovalCarry.pglite.integration.test.ts
server/services/authoring/__tests__/authoring-file-to-vault-snapshot.pglite.integration.test.ts
server/services/authoring/__tests__/authoring-vault-version-plan.pglite.test.ts
server/services/vault/__tests__/vault-version-checkin.pglite.test.ts
server/services/vault/__tests__/vault-version-checkin-race.test.ts
server/services/ectd/__tests__/placement-vault-leaf-parity.pglite.test.ts
client/src/concept2cure/v2/__tests__/fileToVaultContinuity.test.tsx
client/src/concept2cure/v2/__tests__/workbenchFileToVault.test.tsx
```

Optional additional provenance-reader control:
`server/services/authoring/__tests__/authoring-vault-filing-receipt.pglite.test.ts`.
The reader itself is unchanged, and the required plan/route/parity suites
exercise its new consumption, so this tenth suite is not a demand to repeat
the previous 38 cross-sector suites. Unchanged RI/source/AnA behavior does not
justify repeating that full cohort. Root's compiler/build and mandatory normal
publication hooks remain its own final qualification.

The incoming packet retains its own regression/browser/check evidence under
`docs/evidence/D2-AUTHORING-REFILING-VERSIONS/2026-10-23/`. Those results are
historical incoming evidence, not tests executed by this reviewer or additional
cross-sector passes. No native multi-writer PostgreSQL, live app/human acceptance,
provider, remote-CI, agency or deployment result is established by this review.
