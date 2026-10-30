# P-73 slice 2b — editor writing agency

Rows: W3 / D2 and D4. Scope: the existing editor panel and its shared writing-agency vocabulary.
No model calls, backend endpoint, CMC composition expansion or regulatory-content additions.

## What already exists

- `client/src/concept2cure/v2/surfaces/AuthoringAiDraft.tsx` owns the existing Region control and retained
  review inputs. It currently defaults an unrecorded region to FDA and offers MHRA although the saved-template
  server mapper recognizes US/CA/EU/JP only. Existing source, manual-preparation and signature gates stay server-owned.
- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` already reads guarded document metadata and
  validates its saved template through `savedTemplateContext.ts`. It also calls `useProgramSummary`.
- `client/src/concept2cure/v2/editor/programSummary.ts` already receives the canonical `registry_id` from
  `GET /api/c2c/projects/:id`; that route uses `registryContextForProgram`. No second filing resolver or read endpoint is needed.
- `shared/regulatory/region-identity.ts` is the canonical region/agency vocabulary. A drafting-specific supported
  subset will reuse it, rather than re-create region identities.
- `server/services/authoring/authoring-draft-template.ts` currently owns a four-region private map and re-reads
  authoritative saved template/program context. The lead session owns its convergence onto the shared subset.
- `client/src/concept2cure/v2/__tests__/authoringDraftInputs.test.tsx` already verifies retained input isolation,
  regeneration, refusal preservation and stale-session holds. Existing default-to-FDA expectations must change.
- Searches covered panel names, `initialRegion`, `filingContext`, `registryId`, document reads and regional maps;
  `git log --all --diff-filter=D` found no deleted panel or shared writing-region owner to restore.

## Contract and behavior

The workbench passes read-only `recordedFiling` context into the panel: the exact section's effective saved
reference projection first, otherwise the current program's canonical registry id. Parent metadata alone is
insufficient for mixed-template assemblies, including after reload. The additive section projection reuses
`savedTemplateReview` once per admitted batch and `savedSectionTemplateReference` for the same precedence as
generation. Its states distinguish recorded, GLOBAL, not-recorded and unavailable. An unavailable or identity-only
reference never falls back to a parent or program agency. The lead session wires this projection into the existing
guarded section read; no endpoint or access grant is added.

This chooses a display default only; generation continues to use the existing endpoint, which re-reads access,
evidence and regulatory authority. `useProgramRead` supplies guarded ready/loading/error state instead of treating
an unread or failed program as an unrecorded one.

`shared/authoring/writing-regions.ts` exposes all twelve canonical region/agency identities and `writingAgencyOf`.
It derives agency names from the canonical region identity. Unknown and GLOBAL values return null.
The panel offers those known writing agencies, preserving MHRA. No recorded or declared supported agency means a blank selection and an
explicit choice before drafting, rather than an automatic FDA default. Retained human selections remain visible;
an agency differing from the recorded application is stated without implying compliance. A concrete saved-template
region remains authoritative and the server's mismatch/manual gates remain unchanged.

Writing preferences are separate from the recorded-template-source validator's existing four-concrete-region
schema. The source schema does not restrict a person's writing preference or the agency of a resolved program.
P-73 admits broader trial drafting; adding these known writing labels changes neither that schema nor regional
content. No UK content, global verification or filing-readiness claim is made here. Historical assembly aliases
(`hc`, Canada, HealthCanada/Health-Canada, Japan and EMEA) map centrally to existing canonical identities.

All new-generation doors honor the hold: section drafting, alternatives, regeneration, revision and passage drafting.
Reviewed candidates, edited text, comparison, tracked replacement and ordinary acceptance remain available under
their existing gates. The passage extension and its independent red/green receipt are documented in
`passage-region-hold.md`.

## Verification

- `region-ui-red.txt`: the new panel suite failed all nine behavioral cases on the original implementation,
  including EU/JP defaults, unknown selection and retained-region generation. This initial receipt preceded
  the final twelve-agency vocabulary correction qualified below.
- `region-ui-green-initial.txt`: 14/14 new panel and projection adapter cases passed after the implementation.
- `region-ui-retained-green.txt`: 35/35 retained-input and shared-vocabulary cases passed. Standalone callers
  now declare an intended FDA preference explicitly in their fixtures; the undefined-region case verifies the
  blank choice and hold.
- `passage-related-fixtures-green.txt`: six directly related panel/passage suites passed all 80 cases, preserving
  source lineage, acceptance, revision, alternatives, currentness and tracked-passage behavior.
- Final panel/adapter rerun and focused lint receipts: `region-ui-green.txt`, `region-ui-lint.txt`.
  The rerun passed 14/14. Focused ESLint exited 0 with no errors and 16 warnings in the large existing
  workbench/panel/passage files; no warning-ratchet claim is made.
- `passage-writing-scope-integration-green.txt`: two real workbench → panel → passage tests passed. Every
  request uses PMDA for a Japanese section inside a US IND program, and EMA for an unscoped section inside
  an EU CTA program. Exact selected words and the absence of saves remain checked.
- `writing-alias-red.txt` / `writing-alias-green.txt`: four historical assembly-alias cases failed before
  the central compatibility fix; the then-current 21 shared cases passed afterward.
- `writing-all-regions-red.txt` / `writing-all-regions-green.txt`: the final twelve-agency contract first
  failed ten cases under the four-region restriction, then passed the shared/UI scenarios after expansion.
  `writing-all-regions-lint.txt` is the focused lint receipt for that final shared vocabulary.

Projection tests supply a typed canonical-validator result and use the real effective-reference selector. They
verify one admitted batch call, mixed Japanese/US precedence, GLOBAL behavior, unread references and identity-only
sources. They do not qualify database access or legal applicability; the lead's existing-read wiring owns its
access/currentness tests.

No broad suite, TypeScript build, model call, commit or push in this lane.
