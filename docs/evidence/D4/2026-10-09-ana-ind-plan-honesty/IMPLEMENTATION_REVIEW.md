# Independent implementation review: IND planning receipt

**Verdict: approved for the bounded backend contract.** The registered
`plan_ind_module_authoring` result always reports `honesty.sealable: false`,
including caller-declared `live` plans whose supplied-string self-check passes.
This review does not establish independent artifact/source verification or
enforcement in separate sealing routes.

Reviewed against release base `7f3b84ca5e67f1bb920fc662ebf3289578a4ecb6` on
`concept2cure-v2`. The independent reviewer read the frozen diff, registered
handler, definition, focused tests, shared template/helper and reachable
consumers. The reviewer did not run tests or modify production/test source.

## Frozen source identities

These Git blob identities were independently recomputed after the implementer
declared source freeze and match `source-files.json` and focused qualification
metadata.

| File | Git blob |
| --- | --- |
| `server/services/ana/AnaToolExecutor.ts` | `e60ec28d63ac60bc7f7e6dd8beced2d72005a74c` |
| `server/services/ana/evidence-literature-tool-defs.ts` | `f09ba25a88e525de0a337866f2eaf2d56beac1f1` |
| `server/services/ana/__tests__/ind-module-tool.test.ts` | `2d9a9c7e0a0153ea77e0062a5b5c6ecab8cafb59` |

The unchanged shared helper/template blob is
`0678af7a999079bcd43a026de92f918e4004a346` for
`shared/ana/ind-module-authoring.ts`.

## Contract and boundaries

- The handler still constructs the same title, content and `required_strings`
  through the existing pure shared builder. Its original input normalization,
  module/product/indication errors, provenance labels, missing-fact section list
  and self-check result remain intact.
- `verification.ok` retains its original meaning: the generated plan text
  contains its derived required strings. Added `scope: 'plan_text_only'`,
  `artifactVerified: false` and `sourceVerified: false` prevent the receipt from
  claiming a check of an authored file or independently qualified evidence.
- A mandatory planning blocker precedes the original provenance and missing-
  string blockers. The handler overrides only the emitted sealability verdict;
  it does not remove existing diagnostic reasons.
- Definition descriptions accurately call this a scaffold with supported
  template headers and unverified caller/model input. Required fields, types,
  enum values and fact-object shape are unchanged. There are no client, shared
  helper, database, model, dependency or new capability changes.
- Caller-supplied artifact/source identifiers, document text or forged
  verification flags cannot override the handler's generated result. The
  planner reads no artifact or source and performs no independent provenance
  qualification; claimed `live` input therefore cannot attest sealability.

## Reachability and compatibility

The existing tool remains registered and exposed through `AnaToolDefinitions`,
the launch inventory, biotech-program capability lists and the IND submission
context. `tool-authorization.register.json` classifies it as a read operation
with no writes. The intelligence question action points to this same planner.

A source search found no typed client or direct runtime consumer of this IND
result's `honesty.sealable` or the new verification fields. Existing consumers
receive the same generated plan payload and validation errors. Agentic consumers
will see an intentional correction to the previous sealability claim through
the result, note and tool description. The SE discussion consumers of
`honesty.sealable` use a separate contract and are unaffected. This search does
not prove that an external consumer can never forward the receipt incorrectly.

## Focused evidence reviewed

The implementer's recorded fail-first run used the test before its later
type-only correction against the old handler and definition: **16 failed, 9
passed** of 25 cases. Baseline and candidate qualification metadata pin their
source blobs. The final focused report contains **25 passed, 0 failed** in
6.827 seconds at the reviewed final test blob. Forced ESLint records zero
errors, 99 existing executor warnings, one existing definition warning and zero
test warnings; no warning suppression was added.

The final test-only correction gives `schema.properties` a precise local type
for the five existing property assertions. All five runtime assertions are
unchanged; no `any`, error suppression or production change was added. This
resolves the five compiler diagnostics caused by the definition's generic
`unknown` property type without weakening the tested schema contract. The
independent reviewer read that correction and recomputed all three final pins.

Meaningful tests cover both supported modules with facts for every modeled
section and with no facts, including `verification.ok: true` in both cases while
sealability remains false. They also cover the partial fact/source-pointer
payload, ignored forged proof, sample/unassessed/default provenance, actual
missing-string failure for an unsupported section, combined prior blockers,
normalization, exact validation errors and definition/schema boundaries.
Complete-plan payload equality against the unchanged shared builder protects
the authorized scaffold/required-string preservation; it is not evidence of
source fidelity or scientific completeness. DB, gateway and fetch traps assert
that these planner calls do not perform independent reads or model work.

Evidence: `focused-red.json`, `focused-red-report.json`, `focused-green.json`,
`focused-green-report.json`, `focused-eslint.json`,
`focused-eslint-report.json` and `source-files.json` in this directory. Broader
qualification/build/gate and delivery conclusions are owned by the parent
delivery record.

## Explicit limits and follow-ups

1. **Retained shared template wording.** The unchanged plan body still says
   figures are "verified against the source" in
   `shared/ana/ind-module-authoring.ts:173`. The backend note explicitly limits
   that retained phrase to supplied-string self-consistency and says no authored
   file, underlying study, source qualification or caller-declared provenance
   was independently verified. A rendered body separated from its receipt still
   carries this old wording. The shared builder and its sealability helper were
   intentionally outside this batch.
2. **Separate seal endpoint.** `server/routes/ana-ri/seal-verified.ts:45` retains
   only request `verification.ok` and optional message, discarding scope and
   artifact/source verification fields. The independent service's verification
   gate in `server/services/ana/verifiedSealService.ts:138` checks `ok` rather
   than this planner's sealability verdict. The route is feature-gated and has
   other signing/sample checks, but this patch does not establish independent
   enforcement of `plan_text_only` there. No direct planner-to-seal bridge was
   found. This is an existing separate follow-up, not a claim that this batch
   secures every sealing path.
3. **Bounded template coverage.** The shared templates contain six 2.5 headers
   and four 2.7 headers. A passing check does not prove a complete IND hierarchy,
   clinical/therapeutic adequacy, source qualification, temporal currency or
   artifact fidelity. Later governed artifact validation remains separate; the
   planning receipt itself remains non-sealable.
