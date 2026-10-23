# Complete filing scope and section provenance in existing assembly review

W1 / D2; canonical `concept2cure-v2`; local/Codespaces testing. Continue the
single editor and source-first assembly already delivered. No surface, editor,
provider, transport, dependency, schema or migration is added.

## What already exists

- `authoring/authoring-assembly.ts` authorizes the current project/document,
  resolves the selected template before reading sources, previews a hash-bound
  append/preserve plan, and recomputes it inside the canonical write transaction.
  Appended sections retain template source/guidance and an assembly receipt;
  their parent template identity is deliberately unchanged.
- `authoring/authoring-assembly-source.ts` resolves built-in, global and tenant
  templates. It compares modules and recorded parent regions/registry IDs.
  Without parent template provenance it skips filing applicability. It does not
  verify a saved `c2c_document_id`; stored-template region only selects drafting
  eligibility. Same-region components have no registry ID and bypass the
  recorded full-filing comparison.
- `c2c/governed-document-binding.ts`, `c2c/document-class.ts` and the shared
  `regulatory/filing-catalog.ts` own bound filing identity, agency normalization,
  exact regional classes and registry aliases. A no-template authored document
  may bind the project's home filing. `templateWorkingBinding` deliberately
  leaves built-in working documents unbound, allowing many documents per project.
- `market-specs/document-preparation.ts` already rejects 510(k) summary/PMA and
  MDR component/IVDR preparation through exact component compatibility. Reuse
  that validator; no copied device family or filing taxonomy is needed.
- `authoring/authoring-template-guidance.ts` validates per-section assembly
  document/template/snapshot receipts and resolves recorded guidance even when
  the parent's template is absent or different. The section read already works.
- `ana/saved-template-review.ts` supplies bounded, paginated reference context to
  the existing authorized `saved-document-critique.ts`. It reads section CREATE
  metadata only if the parent has a template ID, and compares every section's
  source with that parent. Whole-document review therefore misses assembled
  guidance in a blank document or refuses a valid mixed-template assembly. Its
  reference items also carry only the parent template ID.
- `editor/authoringOversight.ts` sends existing review instructions through the
  current AnA controls. Source/guidance are reference context, not scored prose,
  evidence verification, expert approval, regulatory completeness or readiness.

All server paths above are under `server/services/`; the editor path is under
`client/src/concept2cure/v2/`. Searches covered template/assembly/filing scope,
binding, component compatibility, saved review/critique, section guidance, routes,
fixtures and shared registry metadata. Deleted-history searches for assembly,
template scope, filing scope and saved template review found no retired alternate
implementation to restore. The existing assembly and review are completed in place.

## Implementation contract

1. Extend the existing assembly resolver. For a bound target, verify the actual
   `c2c_documents` identity in the current tenant and program before source reads
   or section writes. Bind the verified filing identity and ownership scope into
   the existing plan target snapshot so a changed binding always requires a
   fresh preview, even if the selected common template remains compatible. Keep
   the template snapshot and saved guidance receipt unchanged. Missing, foreign
   or unreadable recorded bindings cannot
   become permission to substitute another filing. Reuse canonical document
   classes, exact regional metadata and catalog identities. Preserve appropriate
   harmonized/common-module behavior and explicit added-market ownership.
2. Enforce explicit template region/authority conflicts for bound targets,
   including stored organization/global templates. Reuse existing device
   component preparation compatibility for recorded and bound full-filing scope.
   Do not infer a filing from a title, section code or a generic format family.
   Keep legitimate unbound regional working documents and multi-document projects
   available; do not change template creation or binding policy.
3. Complete whole-document saved review using the existing verified per-section
   guidance resolver. Read relevant earliest CREATE metadata even without a
   parent template. Every assembled section retains its own exact template ID,
   full recorded source, original-format/AI eligibility/limitations and guidance.
   A valid assembly source must not be compared with an unrelated parent source.
   Match its recorded program ID to the already authorized actual project, not
   merely a syntactically valid UUID.
   The parent's identity and limits remain unchanged. Historical identity-only
   records keep their existing qualification; do not invent missing metadata.
4. Include section source identities and limitations in existing bounded review
   items, pagination and snapshot hashing. Source/guidance changes must invalidate
   continuation without needing authored text to change. Malformed receipts,
   inaccessible metadata and contradictory sources fail closed. Never fall back
   to a more permissive current template or treat guidance as authored science.
5. Reuse the existing AnA oversight prompt and controls to explain section versus
   parent reference scope. No CSS, new controls, alternate reviewer or changes to
   scoring, review acceptance, document text, signatures or submission authority.

## Ownership and verification

Root owns this contract, evidence, existing client oversight instructions/tests,
combined verification and direct Git operations. The assembly worker owns
`authoring-assembly-source.ts`, the narrow internal template/target-snapshot
addition in `authoring-assembly-plan.ts`, reuse/export of the existing preparation validator,
and focused assembly applicability tests. The review worker owns
`ana/saved-template-review.ts`, the narrow `saved-document-critique.ts` call-site
addition passing its already authorized project ID, and saved-template oversight tests;
any shared guidance resolver change must be coordinated with root first.
Workers do not overlap source files, mutate Git or run compiler/build/full scans.
New HTTP scope cases are registered through a small adjacent test helper using
the existing assembly fixture callbacks; this keeps the existing test file
within its lint limit without creating another harness.

The existing Notified Body-to-pack mapping is currently private to
`regulatory/market-support.ts`, whose gateway imports reach the database at load
time. The assembly resolver must remain independent of that runtime graph.
Root moves that exact existing mapping into the existing pure
`c2c/document-class.ts` and makes `resolveDocumentClass` recognize only its
existing three permitted document classes. Market support imports the same
metadata; no alias/type list is copied and no channel verdict changes. Root owns
these two adjacent production files and the existing document-class tests, with
meaningful negative/positive resolution and market-support regression evidence.

Record meaningful RED before fixes and GREEN afterward with actual commands,
exit codes, source hashes and output. Cover wrong bound region/class/body,
same-region wrong components, stored-template conflict, missing/foreign bindings,
exact Canadian/Japanese and compatible component positives, unchanged sections
and evidence on refusal, null/different-parent section review, invalid receipts,
snapshot drift, pagination and unchanged prose scores. Retain legacy unbound and
medicinal behavior. Root qualifies combined sources with appropriate integration,
compiler/build, design/single-editor and lint gates before normal direct push.

Evidence belongs in `docs/evidence/D2-ASSEMBLY-FILING-SCOPE/2026-10-20/`.
Automated fixtures do not establish human acceptance, live provider behavior,
complete current agency forms, fresh PostgreSQL installation or transmission.
