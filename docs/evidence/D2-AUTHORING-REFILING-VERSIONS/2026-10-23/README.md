# Authoring refiling version qualification

W1 / D2, directly on `concept2cure-v2`. Extends the existing Authoring → Vault
filing and canonical check-in; no new surface, store, provider or dependency.

## What already exists

`server/services/authoring/authoring-file-to-vault.ts` already renders and
records the exact source, uses canonical ingest/placement and compensates
proven admissions. It still creates independent hash-labelled rows.
`server/services/vault/vault-version-checkin.ts` already owns explicit-head
numbering, locks, duplicate-byte refusal and inherited filing; tombstoned
numeric slots currently make a retry collide. `vault-version-family.ts` and
the 20260930 lineage migration already define the governed family.
`authoring-vault-filing-receipt.ts` already verifies byte/project/source-bound
audit derivation. `FileToVaultDialog.tsx` already protects scope, uncertain
outcomes and exact Vault navigation, but does not display version lineage.
The existing placement parity fixture retains the refiling TODO and the
existing leaf resolver/current-version gates protect sequence byte pins.

Code/route/schema/AnA/surface and deleted-history searches found no competing
canonical refiling implementation. Retired version display helpers do not
replace these services. Exact paths, limits, policy and disjoint ownership are
in [the design](../../../design/AUTHORING_REFILING_VERSIONS_2026-10-23.md).

## Scope and limits

New numeric families are separate for PDF and Word and require verified source
receipts before automatic check-in. Legacy hash-labelled records are retained
and require review; no predecessor is guessed or label renamed. Submission
leaves remain pinned until the user deliberately replaces them. Qualification
receipts will record actual commands, exits, source pins and retained output.
Human acceptance, provider connectivity and agency transmission are not claimed.

## Implemented outcome

Fresh filings start numeric PDF and Word families independently. Refiling an
edited working document verifies the exact retained source receipt, passes the
current UUID to canonical check-in, and returns its assigned version and
predecessor. The source-family decision repeats through existing ingest
preview/commit admission. Initial-only defaults no longer overwrite a
successor's confidentiality; type, retention and filing remain inherited.

The locked check-in compares the prepared head's inherited metadata. A Move
or details change during storage is a definite refusal, rather than a stale
successor. Retired numeric labels remain reserved; changed-byte retries advance
past them. Exact bytes already held by any retained version remain refused.
Legacy, all-retired, ambiguous, wrong-format or unverifiable families require
review before another filing.

The existing dialog uses the same controls/classes and shows only confirmed
lineage. Invalid/partial/contradictory lineage retains an unknown outcome;
older response shapes invent no version. Its copy explains independent
renditions, inherited filing and deliberate replacement of pinned placements.
No existing leaf, prior byte, version label or approval is overwritten.

## Retained qualification

- `parity-red-tests.json`: two meaningful failures in actual route → ingest →
  leaf orchestration before implementation. `storage-move-red-tests.json`
  demonstrates a real service Move during the storage seam being undone by
  the old unlocked metadata plan (201 instead of the required 409).
- `backend/qualification-backend.json` retains numeric-slot and inherited-
  metadata REDs and final **129 passed**, with zero scoped lint warnings/errors.
  `ui/green-wrap.metadata.json` retains final **83 passed**, and
  `ui/eslint-wrap.metadata.json` retains zero warnings/errors. These
  focused counts overlap the merged run and are not additive.
- `final-regressions-tests.json`: **384 passed, zero failed, zero TODO across
  23 files**. This includes actual source-bound receipts, compensation,
  interleaved Move/legacy admission, classification/type/filing inheritance,
  byte/leaf-pin preservation, readiness/release/transmit blocking, access,
  approval, both editor hosts, Vault check-in, and the existing device eSTAR
  journey. Its declared storage/PDF/OCR seams remain explicit.
- The first integration run exposed an incoming fixture missing the canonical
  legal-registry migration. The next run exposed a direct metadata-service
  fixture call without its tenant scope. Both fixture defects are retained in
  `integration-initial*` / `integration-reviewed*`; neither is described as a
  product regression or a successful check. The corrected combined run is the
  authoritative regression result.
- `release-checks.json`: changed-file ESLint and warning-growth gate pass.
  Fifteen selected safety gates pass; the generated text-ramp gate initially
  fails. The incoming company preview selectors were missing from the existing
  generated sheet. `scripts/design/generate-surface-text-ramp.mjs` is reused;
  no palette or hand-maintained stylesheet is introduced. The follow-up checks
  and build pin that generated-only delta separately.
- The first compiler run (`qualified-typecheck.json`) reports four errors in
  new fixture rows returned as `unknown`. The fixed projection now has an
  explicit metadata row type and a stronger non-null deleted-property
  assertion. The zero baseline is unchanged. Final compilation is retained
  separately, along with repeated affected regressions and publication checks.
- `browser/red-layout/` retains the actual narrow receipt overflow (473px
  content inside a 366px body). The existing receipt span now wraps long IDs
  and hashes. `browser/component-browser-review.json` and screenshots pass all
  **eight layouts** at 390/1440px in light/dark themes, with reachable body
  bottoms and footer controls. These are serialized mounted DOM with built
  CSS, not live-app interaction, web-font delivery or human acceptance.

Earlier combined tests and checks use `release-source-freeze.json` (base Git
revision plus every dirty source hash). The generated-sheet correction is
retained in `qualified-source-freeze.json`; final receipt wrapping and fixture
typing are in `final-source-freeze.json`. Unchanged source is fixed by the named
Git revision. The final 23-file regressions, all 16 selected static gates,
changed-file lint/warning-growth check and build were repeated on the final
source. Commands retain timing, exit status, compressed raw output and hashes;
separate epochs are not pooled or silently relabelled. `independent-review.json`
retains the resolved findings and review of the final wrapping/fixture delta.

`qualification-summary.json` records the final result: **384 passed / zero
failed / zero TODO**, all **16** selected safety gates passed, production build
passed, **zero TypeScript errors** against the unchanged zero baseline, zero
lint errors and no warning growth (23 existing changed-file warnings).
`final-checks.json` confirms unchanged source hashes before/after every final
command. The artifact manifest hashes this packet and its linked design/guide;
its self-reference is excluded.

## Canonical integration

Implementation `f7e6c12fe` passed normal commit hooks. Canonical advanced during
publication with native AnA model-call provenance and documentation. Normal
merge `7909171a2` retains both increments, including incoming `4718e17cb`.
`canonical-integration.json` lists seven incoming source/test paths; every
qualified Authoring/Vault/UI source hash remains unchanged. Incoming paths are
qualified separately in `merged-incoming-regressions*`, with zero-error
compiler and production build receipts in `merged-checks.json` against
`merged-source-freeze.json`. The original 384-test count retains its original
source freeze and is not relabelled as a repeated merged run.

## Human handoff and limits

The existing [human testing guide](../../../testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md)
now has 72 sequential cases, all **Not run**, including refiling cases 68–72.
Editable working-document coverage does not authorize editing a sealed source
or define a sealed-source revision-copy policy. Historical hash-labelled and
all-retired families remain an explicit review boundary, not a migration.

PGlite plus deterministic storage interleavings does not qualify native
multi-connection PostgreSQL concurrency. Commit-time revalidation does not
serialize arbitrary independent-root inserts after that check. Audit `no-key`
does not mean HMAC authenticity. No live provider, deployment, human acceptance,
regional package suitability or agency transmission is established here.
