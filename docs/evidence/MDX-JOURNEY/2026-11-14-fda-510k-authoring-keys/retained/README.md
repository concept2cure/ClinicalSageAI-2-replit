# Retained numeric 510(k) authoring records

F1 test-only qualification of the existing saved-guidance reader. Parent design: `.design/client-journey/FDA_510K_AUTHORING_KEYS_2026-11-14.md`.

## What already exists

- `server/services/authoring/__tests__/authoring-template-guidance-tenant.pglite.test.ts` applies the actual authoring migrations in the existing JourneyDb fixture and checks current project/member authority, recorded guidance and absence of read-time writes. Its original record has a synthetic template UUID, CTD code2.5 and empty text.
- `server/services/authoring/authoring-template-guidance.ts` reads the earliest CREATE guidance after current document/project access checks. Recorded guidance returns before current-reference stores; it does not reseed saved sections.
- `server/services/authoring/__tests__/assembly-template-guidance.test.ts` checks recorded assembly identity and snapshot precedence with a current IND source and a query-refusing stub. It does not compare retained SQL rows.
- `server/services/authoring/builtin-authoring-templates.ts` resolves the static current source for the stable registry UUID. A deliberate new template create records that source; existing records retain their saved codes, body and CREATE metadata.
- The existing migrations already provide document version/provenance, section ordering, CREATE audit metadata and immutable revision records. No additional table, helper service or writer is needed.

## Bounded case

Add one case to the existing native PGlite file. Seed the actual stable US_510K UUID, retained code5 / Performance Testing, nonempty historical text, ordering4, document version0.4, full historical source metadata and guidance, and a valid genesis revision. Snapshot all four retained document/section/revision/audit rows. Resolve the current builtin, read through the actual authorized saved-guidance helper, then require the historical source/guidance and complete row snapshots to remain equal, with no mutation SQL in the read.

The historical builtin was captured before the shared-source repair at 2026-11-14T03:44:20Z: UUID `519dfd9a-dc91-57ea-a6b5-d45259d8b6c1`, numeric10 source hash `14f3dc252c4f830045b994b94a926329e9abe0d86b64179db948ac1108ef17b4`. Its full capture is retained in `old-us-510k-builtin.json`; a separate worker also captured the same source before editing under the parent packet's `red/source/` directory.

This is a retention control, expected to pass before and after the outline repair. It is not the repair's RED demonstration. The focused alias contract owns exact current38/47 shape. PGlite proves real SQL behavior under the applied migrations, not native PostgreSQL concurrency, RLS or a deployed human/browser journey.

## Status

Frozen candidate qualification passed: one existing file, four tests, including the added retention control, in 10.61s under Node 22.23.5 with one worker and file parallelism disabled. Single-file ESLint reports zero errors and zero warnings. `qualification-test.log`, `lint.json`, `run-summary.json` and `source-pins-final.json` retain the result, exact command and 11 critical source pins. The first invocation rejected an unsupported `--minWorkers` option before test loading; `cli-option-rejected.log` preserves this invocation separately. It is not a failed product test or RED evidence.

The authorized test executed against the frozen repaired source. An independent fresh projection read confirms the current US_510K source has 38 nodes and snapshot `edd6a20e0f40453098ac3812555158b56bb83af42be0a487dd4aef095e6f7a99`, distinct from the retained numeric10 source. The retained test's complete document/section/revision/audit snapshot comparison passes, and the actual read executes SELECT statements only. Existing development audit-initialization warnings remain in the raw test log; this test does not qualify deployed audit infrastructure.

## Independent candidate review

Reviewed the two production files against the worker's actual compressed pre-edit captures and read the new seven-case alias contract. The diff adds exactly an explicit E9–E17 exclusion set, copied generic rows, generic guidance, and three US alias replacements. It leaves the IVD array, UK alias, existing numeric constant and persistence/read/write owners unchanged.

`independent-review.json` records fresh comparisons against the actual published SQL blobs: US_510K and US_510K_MOD each match every generic38 key, label, required flag and array order; US_CDX_510K and US_510K_IVD each match IVD47. Generic E1/E5 remain required; IVD E1 remains required and E5 optional. All four builtins retain manual preparation and no AI eligibility. Every generic row is a distinct copy with no IVD/non-contact/hidden-bench language. The IVD source hash and exact UK blueprint hash match the new contract's pre-edit controls.

No blocker found within the bounded contract. Static product-aware template recommendation and deliberate remediation of old unmatched numeric drafts remain the parent design's explicit limits. Root owns the combined cohort, compiler, build, commit and normal publication; this packet makes no publication claim.
