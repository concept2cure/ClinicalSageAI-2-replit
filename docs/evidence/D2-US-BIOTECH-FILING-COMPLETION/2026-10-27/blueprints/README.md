# Existing US core filing blueprint completion

W1 / D2; new dedicated-blueprint data only. Parent owns canonical registry, catalog wiring, runtime jobs and normal direct publication.

## What already exists

- `server/services/regulatory/registry/adapters/ctdBlueprintNormalizer.ts` owns the full US regional Module1/common Modules2–5 tree. It already carries exact content types and granularity; this scope will call it, never copy the heading array.
- `usNdaBlueprint.ts` and `usBlaBlueprint.ts` already expose the full marketing dossier. Current351K/505B2/ANDA still resolve shallow shared trees. Shared PMR headings are a protocol rather than requirement/status work. Accelerated approval and rolling review currently read generic CTD rather than their actual procedural work product.
- `global-ri/dossier-classifier.ts` owns the legal-basis distinctions and reliance/bridge/patent scope; `biosimilar/biosimilar-knowledge.ts` owns comparative characterization/clinical/extrapolation/interchangeability decision engines. This scope supplies filing preparation groups and source instructions, not another classifier or scientific calculation engine.
- `global-ri/expedited-programs.ts` owns accelerated-approval/Fast Track context. `post-approval/post-approval-knowledge.ts` and existing lifecycle records own postapproval work. Requirement letters, status and milestone evidence must determine a PMR/PMC response; a protocol is a conditional supporting attachment.
- `combination-products/combination-products-knowledge.ts` owns constituent classification and the sole PMOA/Center map. RFD authoring asks for its actual source findings and a proposed rationale; it does not issue an FDA designation.
- Existing section/task catalogs and document-template library are the runtime homes. Parent integrates the new `US_BIOTECH_COMPLETION_BLUEPRINTS` map into those existing owners; this scope does not maintain filing metadata or a second registry.

Discovery searched 505(b)(2)/351(k)/biosimilar/accelerated/rolling/PMR/ANDA/RFD through source, routes, tools and deleted Git history. Old archived documents are not restored. Exact source URLs and retrieval outcomes are retained in `public-source-index.json`; raw public HTML is temporary scratch input, not committed full-page material.

## Contract and evidence

`usBiotechCompletionBlueprints.ts` will export entries keyed by the existing seven exact registry IDs, each with sectionBlueprint, taskBlueprint, basis and limitations. Narrative is explicit; forms, original evidence, tables and mixed attachments keep their recorded content types. Conditional clinical/waiver/interchangeability/agency-decision parts are not automatically required. Custom working group codes do not invent eCTD placement or statutory content requirements.

The focused test file `server/services/regulatory/registry/__tests__/us-biotech-completion-blueprints.test.ts` calls current runtime section/task/library owners. Parent will retain its genuine prepatch failures, then run it after integration. No runtime job, compiler, lint or Git mutation has been performed by this scope.
