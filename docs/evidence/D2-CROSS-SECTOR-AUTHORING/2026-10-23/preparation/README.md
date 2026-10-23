# Complete shared planning preparation in the existing template tool

## What already exists

`market-specs/document-preparation.ts` already prepares exact medicinal and
device outlines with bounded batches, discussion markers and read-only guidance.
Its broad GLOBAL/cross_cutting/clinical_document rule also treated the four
existing RI work products as medicinal, asking product/indication questions,
then drug safety/quality/statistical questions and pediatric applicability.
`ana/document-template-tool.ts` already reads the exact RI registry outlines,
while `ana/builtin-template-reference.ts` separately rejected their category.
The existing builtin/editor and saved-template oversight paths are reused by the
source/root workers; this worker adds no new tool, heading registry or editor.

## Bounded correction

The shared exact four-entry predicate owns selection. The existing scope resolver
now refuses a shared planning ID combined with an unrelated component or any
package family, including explicit outline-only requests. Its existing preparation
entry point routes approved RI entries to a narrow inquiry helper before device
or medicinal defaults. Unknown/non-approved categories gain no allowance.

The helper reuses the existing preparation result and topic contracts. Questions
cover purpose/audience, source versions, analysis as-of date and review owners;
meeting notes also distinguish proposed and confirmed commitments. Gap and
competitive inquiries request their specific source/assessment criteria. Batches
stay at three; discussion markers prevent repeats without verifying evidence.
No market is mandatory. An optional US/CA/EU/JP narrows analysis only; the route
stays null, readiness not_assessed and evidenceReviewed false. No pediatric,
drug/PK assumptions, mandatory regional studies, delivery or acceptance is added.
The registry's ICH/GLOBAL metadata remains classification, not an ICH mandate.

The existing UUID reference accepts the same shared predicate and retains exact
registry/family refusals and its 5,000-character paged contract. Every preparation
chunk is reassembled in tests and compared with the direct registry plan; all
outline headings survive pagination. Existing AnA authoring guidance now names
the four shared documents and their proper preparation path. Automatic drafting
eligibility remains the existing manual/preparation policy.

## Retained qualification

- `direct-ri-red.json`: four meaningful failures, 13 skipped, exit 1. Actual
  direct tool calls returned the medicinal product/indication prompt. No missing
  import or fixture setup failure was used; owned source bytes did not drift.
- `green.json`: 65 passed across three suites, exit 0.
- `lint.json`: initial warning refusal, exit 1. The added scope branch raised
  assertPreparationScope complexity to 16 (limit 15). Reusing its checked shared
  scope result corrected the warning; no baseline or rule was relaxed.
- `final-green.json`: 159 passed across four suites, exit 0. Covers shared direct
  and UUID preparation, all supported optional markets, no-market handling,
  bounded complete pagination, discussion semantics, component/family negatives,
  existing medicinal/device behavior and existing tool description/schema paths.
- `final-lint.json`: all four owned files, --max-warnings 0, exit 0.

Each receipt retains actual argv, UTC start, elapsed time, exit, selected Node
version/options, before/after owned pins and compressed raw output SHA-256.
`freeze.json` records final owned pins and separately labels observed dependency
and regression pins. No Git, compiler/build, global scan, provider/model call,
deployment, native-concurrency proof or human acceptance was performed here.
Root owns integrated HTTP/PGlite creation, source assembly, saved review and
final qualification/publication. The source-selection-through-new-document
continuity gap remains outside this bounded increment.
