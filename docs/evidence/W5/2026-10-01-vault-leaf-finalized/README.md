# VR-14, server half: only an approved, current Vault version is transmitted

**Date:** 2026-10-01 · **Rows:** D7 (one real sequence), D5 (Part 11) · **Plan:** `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`, VR-14

## The defect

The board's open item: *"Vault leaves are exempt from the approval ('finalized') transmit gate: an unapproved upload can be placed and transmitted."*

- `FINALIZED_STATUSES_BY_STORE` in `server/services/ectd/leaf-source-resolver.ts` had no Vault entry.
- The resolver's Vault branch staged the bytes and never reported an unfinalized leaf.

So these all passed transmit's "only approved documents" rule and could be filed with an agency:

- an upload nobody reviewed;
- a version still in review;
- a version a later one had superseded;
- an Authoring export stamped WORKING DRAFT.

## The rule (no second gate)

A Vault leaf counts as finalized only when all three hold. The rule is `vaultVersionNotTransmittable`, in `server/services/vault/vault-lifecycle.ts` beside VR-13's stage definitions.

| Condition | Why |
|---|---|
| The version's VR-13 lifecycle record, **in this organization**, is at a steady stage (`STEADY_STAGES`: approved, placed, packaged, submitted) | A stage is decided on the governed spine with an e-signature, not by an upload |
| The version is **current**: no live later version in its family (`supersededSql`) | A superseded version is not filed into a new assembly |
| The record's content hash, which is what was approved, **equals the hash of the bytes being staged** | An approval of other bytes approves nothing here |

Anything else is reported through the resolver's existing unfinalized count. `assembledTransmitBlockers` already turns that count into a refusal for transmit, the governed freeze and dispatch. The refusal names the file and the reason, for example `csr-draft.pdf: in_review, not approved`.

**FD5** (grandfathering Vault leaves in open, untransmitted sequences) is a founder decision and is not taken. Nothing is grandfathered: an open sequence holding an unapproved Vault leaf now refuses to transmit until the version is approved.

## Proof

| Check | Result |
|---|---|
| `leaf-source-resolver-vault-finalized.test.ts` against the trunk resolver (source stashed, test kept) | `red-against-trunk-resolver.txt`: 8 of 12 fail. Unreviewed, in-review, superseded, other-bytes and foreign-record versions all counted as approved, and the transmit blocker was empty. The 4 steady-stage cases pass on both versions, as they should. |
| Same, after | `green-vault-finalized.txt`: 12/12 |
| Each condition removed in turn | `mutations.txt`: current-version, steady-stage, approved-bytes and organization-scope removals each turn a case red |
| Every test placing a Vault leaf, plus all eCTD and submission-service tests | `green-related.txt`: 126 files, 1494 tests |

Three fixtures that place Vault leaves now carry an approved lifecycle record for the bytes they stage, plus the version-family columns the rule reads. The plan's ownership note predicted this. The files are `leaf-source-resolver-vault.test.ts`, `assemble-from-core.vault-uuid.pglite.test.ts` and `assemble-technical-file-vault-uuid.pglite.test.ts`.

## Not done here (the Vault lane's half of VR-14)

- The placement dialog showing the version's stage and warning that a draft will not be transmitted.
- Prefilling the CTD section (`VaultPlaceIntoSubmission.tsx:185`).
- "Placed in" on each version (`project-vault.ts`, `Vault.tsx`).

## Noticed, not changed

The version-family rule (`VALID_LINK`) requires both rows' `organization_id` to match. `vault.documents.organization_id` is nullable (attribution). So a later version of a row whose `organization_id` is NULL is never recognized as its successor, and the older version still reads as current. This belongs to the Vault lane's family rule.
