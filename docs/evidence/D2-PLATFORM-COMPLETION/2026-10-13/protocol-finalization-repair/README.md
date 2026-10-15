# Bounded protocol reservation and current-binding correction

Implemented directly on `concept2cure-v2`, after the root released the source freeze at base `920b230bd1509a41347fe653605babdabea2ae78`. No migration, dependency, provider/model call, signature recipe change, persistence rewrite, parallel dashboard, commit, push or standalone compiler was performed by this workstream.

The original retained baseline in the adjacent `protocol-finalization` directory had two reproduced native failures and one green control: the finalizer ignored an incomplete section written on its own transaction client, and an actual authenticated section writer committed changed prose after an actual authenticated signature. Those original fixtures remain preserved. The correction reserves the parent before every protected original-protocol/SoA mutation, rechecks current editable status after lock waits, touches its MVCC row with exact-one-row success, and reads completeness on the actual finalizer client. Supplemental `signedContent:false` registers retain their existing behavior.

## Actual executed evidence

| File | Result | What it establishes |
| --- | --- | --- |
| `native-green.txt` | Canonical native runner: 25 passed, zero skips, 38.63s | Restricted `app_service`, enforced RLS and forced-RLS stores; same-client structural state; real authenticated finalizer-first section refusal; full protected writer census; mutable SoA child ordering; writer-first binding; stale repeatable-read refusal; supplemental controls; clean actual export 200; legacy drift actual export 409; unverified binding delivery and uncoordinated executor holds; unchanged source/version/signature/action/chain during guard reads. |
| `source-and-export-regressions.txt` | 42 passed in 4 files, 15.71s | Actual PGlite source composition/signature manifestations, pure export historical qualifications, and actual Express named 409/503 error contract. The source fixture's incomplete signature is held; content-only import continues to compose the real matrix without transferring signature authority. |
| `existing-writer-regressions.txt` | 96 passed in 6 existing files, 19.28s | Existing protocol writer tenant/status boundary, source lineage gates, study design links, real PGlite signature ceremony and existing signing/SoA HTTP routes. |
| `scoped-lint.txt` | Exit 0, zero errors, no new warning | The existing renderer complexity23 warning is unchanged from baseline. `git diff --check` passed. |
| `preserved-binding-before.json` | Read-only native baseline | Original org18/doc9/signature12 has a genuine retained historical manifest/hash, current canonical digest differs, but the old facet/export claims signed/finalized and prints the later prose. |
| `preserved-binding-after.json` | Read-only native correction | The same unchanged source/history/signature remains retained and valid historically; the facet is `changed`, and controlled export refuses with `SIGNATURE_CONTENT_CHANGED`. No HTTP authentication mutation was used for this preserved-fixture observation. |
| `source-digests.json` | SHA256 of bounded production/tests | Reviewable final source identities; the canonical native test is reachable through the existing native runner. |

The original signed digest remains `7658064e001bd837d393fda041093a819007fb0dd34f33450a1b25911162ea7b`, and current digest remains `a3722c871b26a88f2bd42ea2034c68c8f56445d346db10af40c68510a30eafeb`. Neither was recalculated into the stored historical signature. The existing generic integrity verifier still reports historical hash verified and protocol binding `NOT_REDERIVED_HERE`; it is not treated as current-content authority.

The new native test uses new separate active fixture memberships and genuine real reauthentication/signing. Independent API cases have fresh independent signers, so the real ten-attempt signer limit remains enabled. One deliberate out-of-band source change in a newly genuinely signed QA document tests the legacy guard; it is explicitly a guard fixture, distinct from the original application-writer race. Binder delivery failure is narrowly injected on a real restricted transaction; its 503 HTTP mapping is separately exercised with the actual Express route. No original source/signature history or shared QA org2/user25 is rewritten.

## Current-binding and existing UI contract

The existing canonical protocol content binder and exact persisted manifest hash recipe are reused. `signed` means the valid live historical signature binds the current coherent snapshot. `changed` retains verified historical metadata but withholds current attestation. `unverified` retains available historical metadata while withholding current-binding authority. Existing revoked/none/store-unavailable meanings remain. The existing signature line and fixture type gain the two matching states; styling, timestamp component and workspace layout are preserved.

Default reads own one tenant-scoped repeatable-read read-only transaction. Explicit executors must prove an actual coherent transaction on one backend; configured isolation without a transaction is insufficient. A private branded context carries that proof between the existing services. Controlled finalized export returns a named 409 hold for changed/no-current-signature states or 503 when verification is unavailable. Content-only source import carries no signature authority. The pure renderer labels changed/unverified metadata historical if called independently.

## Limits and next proof

This is regression evidence, not PQ, scientific/agency readiness, review approval or dispatch qualification. Structural completeness requirements and the canonical digest recipe remain unchanged. Historical signatures are retained; no automatic revocation, repair or hash/history rewrite occurs.

The ceremony's pre-parent-lock authorship/independence race and reviewer disposition's assignment-only lock remain separate future issues. The exact deterministic proof and optional shared `prepare(client, meaning)` hook are mapped in `docs/design/PROTOCOL_FINALIZATION_CONCURRENCY_2026-10-13.md`. That hook must reserve the protocol before the existing SoD check and retain SoD-before-finalization-write order. Review must resolve parent, reserve it, then lock/reread assignment and retain current reviewer/lifecycle/meaning policy. No closure is claimed here.

## Harness corrections, excluded from pass counts

Preparation occurred in `/tmp` while the repository was frozen. An initial Vitest overlay incorrectly merged include arrays and began four existing native files (master licensing, entitlement grant resolution, access requests, schema posture); this run was terminated and excluded. Their completed teardown hooks preceded the prototype, and read-only inspection found no leftover roles matching those worker PIDs, with `app_service` remaining non-superuser/non-bypass. No global cleanup edits were attempted. Original baseline fixtures stayed unchanged.

The corrected overlay used an explicit one-file census. Three mutable-child observer cases initially timed out because the observer omitted the preceding queued finalizer PID from PostgreSQL's blocker set; the observer was corrected and the targeted and full canonical native replays passed. A new unit hook initially returned the mock reset function, which Vitest invoked as cleanup; its void block corrected that harness error. The existing source fixture omitted the canonical lineage usage/confidence columns; its schema was completed. Only the canonical green runs above are counted.
