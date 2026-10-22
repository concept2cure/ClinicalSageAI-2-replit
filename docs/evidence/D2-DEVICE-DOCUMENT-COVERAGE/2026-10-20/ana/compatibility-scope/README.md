# Preserve exact component and filing compatibility

W1 / D2, existing device document authoring contract.

## What already exists

`market-specs/document-preparation.ts` already validates regional scope and
medicinal versus device identity. `document-template-tool.ts` calls that
preparation entry for named components, while `builtin-template-reference.ts`
calls the same entry for editor UUID component references. Both already allow
explicit outline-only reference use without building a preparation plan.

`document-template-library.ts` holds each component's authoritative families and
exact registry/component mappings. The shared global registry records exact
application identity and parent application type. Before this correction, the
preparation check stops at device versus medicinal and can mix MDR/IVDR or
510(k)/PMA/De Novo evidence requirements inside the same region. This work
extends that check rather than introducing another preparation or template path.

## Correction and evidence

The existing preparation check now refuses incompatible device component/filing
combinations. Exact registry/component mappings remain valid, including EU PER.
The 510(k) summary requires an exact US/FDA filing whose recorded application
type explicitly identifies 510(k), preserving IVD, CDx and modification variants.
MDR/IVDR components require the corresponding recorded EU base application or
its declared parent relationship. Broad eSTAR format or a shared country does
not establish compatibility. A client eligibility decision remains separate.

The check runs only for preparation. Standalone components and explicit
outline-only references remain available. Named and UUID references already
call the same preparation function, so no library/reference path was added.

- [Meaningful RED](red.json): all 12 selected prepared mismatches failed before
  the fix because the tool returned success without an error. The
  [exact test source](red-test.ts.txt) matches the recorded source hash; 41
  unrelated cases were skipped during this targeted failure probe.
- [Current green](current-tests.json): 222/222 across four suites, including all
  53 new compatibility cases. Ten source/dependency pins were stable during
  that run. Later root device-entry helper extraction and device-only QMS work
  supersede shared/preparation source pins; the
  [later root combined replay](../../integration.json) qualifies final bytes.
  The new suite covers 12 named/UUID refusals, 12 explicit outline-only controls,
  20 compatible prepared references, eight standalone preparations and the
  registry-only EU PER mapping. Existing device and medicinal preparation/tool
  checks pass in the same replay.
- [Strict lint](lint.json): both changed source/test files, zero errors/warnings.
- [Summary](summary.json) records scope and counts. Counts overlap the root
  combined replay and must not be summed.

No model/provider call, scientific assessment, artifact validation or submission
was performed. Existing AI eligibility, provider and approval gates are unchanged.
