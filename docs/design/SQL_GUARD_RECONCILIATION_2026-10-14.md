# Publication SQL gate reconciliation

The required raw SQL interpolation ratchet blocked the integration push. No gate was bypassed. Query values remain bound; fixed code fragments must be reviewed and counted where they are used.

## Static parameterized queries

Project lead reads now select between two complete fixed SQL statements, with the org/program values bound, instead of interpolating the optional lock keyword. The source identity reader uses the same explicit tenant or NULL/global_public predicate with bound org/source IDs. RAG candidate and neighbour reads now bind accessible programme arrays at their fixed parameter positions; NULL retains the declared internal legacy adapter, while an empty admitted list returns no programme matches. Admission/verification remains before metadata, ranking and context. No SQL is assembled from request values or moved to a variable to hide interpolation from the gate.

Vault commit checks reserve the original upload/capture identities using explicit fixed FOR SHARE queries before evaluating current byte availability/checksum. Preview retains its read behavior. Existing disposition programme/table coordination and the fresh original-parent admission remain. The two availability expressions still use the canonical shared disposition/recorded-lineage SQL builders with literal, validated aliases f and s. Their result contains fixed policy SQL, not any caller value; upload ID, org, programme and recorded file identity remain parameters. Those two exact call sites are newly reviewed in the per-file baseline. Duplicating that policy SQL would risk divergent withdrawal/lineage enforcement.

## Catalogue allowance across the service split

The prior document-catalog.service.ts allowance was10; it is now3, with7 in the extracted document-catalog-document.ts, keeping the same aggregate10. The seven expressions are the fixed include-text column choice, disposition and binary-policy projections, two data-eligibility predicates and two server-owned current-version conditions, all with literal alias d. The added identity admission and removed flexible programme condition remain within this existing total. Org, document and programme identity are bound; no caller chooses a SQL identifier. The baseline was edited only for this explicit split and the two reviewed upload-policy expressions, not regenerated across the repository. TypeScript, warning, permission and tenant-policy baselines remain unchanged.

## Verification and qualification

The exact gate must return zero unreviewed sites. Source/project/adoption regressions retain85 passing cases and RAG regressions26, without authority mocks or weaker policy assertions. The older adoption fixture now contains the current-read schema fields and the actual original uploader. Its cross-programme withdrawal case uses a genuine unbound child with a recorded withdrawn-parent edge and a real private destination anchor; expected404, no capture and unchanged audit/source history remain asserted. Original failed runs are retained separately.

Current native checks verify the final reader/commit behavior under restricted app_service and enforced RLS. Earlier sealed browser and source snapshots retain their captured revisions; these SQL-only changes do not modify the verified UI. They establish implementation regressions, not scientific or regulatory qualification or universal sharing serialization.
