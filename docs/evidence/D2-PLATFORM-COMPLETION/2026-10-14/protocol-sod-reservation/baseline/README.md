# Native baseline: protocol approval signer becomes an author before reservation

The current canonical ceremony reproduced an independence failure on actual PostgreSQL database **`platform_test`**. Its restricted runtime was `app_service`, with `rolsuper=false`, `rolbypassrls=false`, `app.rls_enforce=on` and FORCE RLS on the five observed protocol/signature/action stores. This was not the root session's separate `platform_ci_native_recheck_20261013` run and does not extend that run's test count.

One fresh active membership-backed QA signer attempted one real approval signature. The probe retained the platform's ten-attempt signing limiter, real JWT middleware, role check, password reauthentication, canonical PATCH/finalize routes, lineage, governed update/sign actions and electronic-signature writer. No authorization, SoD, binder or mutation was mocked. All new records are explicitly isolated synthetic QA material; this is a regression baseline, not clinical, scientific, regulatory or PQ qualification.

The actual native queue was holder PID **6494** → writer PID **6490** → signer PID **6495**. The signer waited directly behind the writer (`pg_blocking_pids=[6490]`). Before release, the canonical authors were `[1770269]`; the pending signer **1342039** was still independent. After releasing the holder, that signer's genuine section PATCH committed changed prose, lineage and the real `update` action before finalization obtained its parent lock.

| Observed result | Retained fact |
| --- | --- |
| New isolated organization | `1538506` |
| Protocol / edited section | `86` / `103` |
| Writer PATCH | HTTP 201; section remained complete |
| Approval finalize | HTTP 201, despite new signer authorship |
| Canonical authors after edit | `[1342039, 1770269]`, including the signer |
| Fresh actual independence check afterward | `SEPARATION_OF_DUTIES` refusal |
| Recorded signature | `22`, meaning `approval`, authentication `password` |
| Finalized state / major versions | `finalized` / `1.0`, one major version |
| Current binding | Matches the signature's `protocol-document-content-sha256` digest |
| Intended invariant | HTTP 403 with no signature or major version; **one test genuinely red** |

A matching content digest does not establish independent approval. The section's real update ledger makes this signer an author; the common ceremony had completed its independence read before the protocol parent reservation and did not repeat it after the writer committed.

`observations.json` retains the exact bounded native observations. `native-baseline-red.txt` records the expected assertion failure (`201` versus `403`). `manifest.json` pins the relevant canonical sources and exact private executed probe digest. The published probe copy externalizes only its synthetic QA credential as a required private environment input; the exact executed source remains `/tmp/protocol-sod-baseline.dbtest.ts`. Neither token nor private runtime credentials are included.

The combined before/after preservation hash is equal, but org18/protocol9/signature12 **do not exist in this probe database**. That hash verifies only the actual present org2/user25 row and membership; absent values cannot prove preservation of records elsewhere. The baseline issued no connections to the root's original native database. A subsequent read-only presence query located those original records in `platform_ci_native_recheck_20261013`; it is not a before/after preservation proof, and no mutations were issued there. `database-qualification.json` makes that distinction explicit.

The new failed-independence history is retained without repair, deletion, flag changes or signature rewriting. `retained-red-fixture.json` records a full state hash over protocol86, its 13 sections, one version, signature22, 29 retained document-wide lineage rows, 17 governed actions and 17 audit records. The edited section103 alone has five retained lineage rows. The read-only helper can rederive the same state hash before and after a future green run. Green must use fresh QA records and show the exact 403 independence refusal with no partial major version, sign action or signature; root owns the bounded shared preparation-hook correction and subsequent verification.
