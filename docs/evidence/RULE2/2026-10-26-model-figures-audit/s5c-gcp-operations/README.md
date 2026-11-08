# Rule 2 · S5c GCP operations: the GCP worksheets grade, choose and plan nothing from a fact nobody stated

**Rule:** CLAUDE.md Rule 2 and "fail closed, never fabricate".
**Plan:** `docs/design/ONE_DESIGN_PLAN.md` package **F1** (a repair of shipped behaviour). The engine
(`server/services/gcp-operations/`) is in no narrower package. The tool definitions and the clinical skill are S4
paths, which F1 covers. The coordinating session approved S5c under F1, on these files.
**Audit:** `../design.md`, S5c, the GCP family.
**Date:** 2026-11-08 (planned and critiqued 2026-11-02).

## The defect

The design said the GCP engine "already" read an omitted boolean as `not_stated`. That held, in part, for three of
its six functions: the monitoring plan, inspection readiness and deviation classification. Even there, a malformed
value was never refused. It did not hold for the GCP compliance check, the consent design or the essential-documents
plan. Inputs below were run on the engine as it was before this change.

- **GCP compliance** (`assess_gcp_compliance`).
  - `assessGCPCompliance({})` returned "major_gaps", score 0, with five gaps for facts nobody gave.
  - With the nine principles true and the other seven facts omitted, it returned "minor_gaps", 100, with gaps such
    as "Delegation of authority is not adequately documented".
  - `null` delegation and systems flags read as true and earned strengths.
  - `sponsorOversightDocumented: 'false'` read as true.
  - An omitted safety-reporting, vendor-oversight, audit-trail or record-retention fact left "compliant", where a
    stated false gives a critical or major gap.
  - `protocolFollowedWithChangeControl` was never read: all true but that one false returned "compliant", 100.
- **Monitoring plan** (`design_monitoring_plan`).
  - Omitted factors were already left unscored.
  - A malformed value was read as another value: `isFirstInHuman: 'true'` and `phase: 'Phase 1'` gave "low", 0, and
    `experiencedSites: 'false'` read as true.
  - An omitted `blinded`, `vulnerablePopulation` or `usesInvestigationalDevice` dropped its critical-to-quality
    factor with nothing said.
- **Inspection readiness** (`assess_inspection_readiness`).
  - Omitted areas were already not assessed.
  - `essentialDocsCompletePercent: 150` was clamped to "ready", 100.
  - `inspectionTarget: 'FDA'` crashed into `{error: … Cannot read properties of undefined}`.
  - A `null` target read as the sponsor, with no warning.
- **Consent design** (`design_informed_consent`).
  - `{ studyType: 'interventional' }` returned "Paper consent process selected".
  - It omitted, with no word that they were undecided, the elements that depend on unstated study features:
    unforeseeable risks, commercial profit, return of results and genome sequencing.
  - Reading grade 20 was clamped to grade 12.
  - `vulnerablePopulations: 'children'` (a string) was matched as a substring, and `['Children']` was ignored.
  - An omitted placebo fact read exactly as a stated false.
- **Deviation** (`classify_protocol_deviation`).
  - Omitted facts were already not assessed.
  - With every fact stated false, `affectsParticipantSafety: 'true'` gave "non_important", minor, and no IRB report.
  - `category: 'Safety reporting'` gave "non_important", where `'safety_reporting'` gives important, major.
- **Essential documents** (`plan_essential_documents`).
  - `stage: 'Before'` returned 0 documents: an error shown as an empty plan.
  - `includeInvestigatorSiteFile: 'false'` read as include.
  - An omitted device status left out the IDE records with nothing said.

## What already exists (RULE 3)

This is a completion: nothing was rebuilt.
- **The engine:** `gcp-operations-knowledge.ts` is the one engine for all six functions. Its 2026-10-15 sweep added
  `unstated`, `anyOf`, `allOf` and `stated`, the monitoring band bound, the inspection `not_assessed` areas and the
  deviation's `not_assessed` and `undetermined`. Each is pinned by a test in `gcp-operations/__tests__/`, and all
  four pass unchanged. The sweep did not validate values, add `inputStates`, or reach compliance, consent or the
  essential documents. This change extends it.
- **The data:** the sibling `gcp-operations-reference.ts` supplies the 483 findings, the E6(R3) principles, the
  essential documents and the TMF zones. `shared/regulatory/informed-consent-elements.ts` is the one consent-element
  record. Neither is edited, and both are pinned by their tests.
- **The definitions and handlers:** `server/services/ana/gcpOperationsTools.ts`, spread into `ALL_ANA_TOOLS`. The
  handlers run through `runStatsTool`. It labels a success with `statedInputEnvelope`, and turns a
  `ComputationRefusal` into `needs_parameters` with `code` and `field`. `AnaToolExecutor.ts` and the tools' step
  presentation are not touched.
- **The shared readers, reused:** `booleanInputStates`, `statedNumber` and `statedOneOf`
  (`immunogenicity/immunogenicity-reference.ts`), and `ComputationRefusal` (`ana-biostats/computation-engine.ts`).
  No GCP tool has a required input, so `refuseUnlessStated` is not needed.
- **The skill:** `server/services/ana/skills/library/clinical.ts`, consent step 2 and GCP steps 4–9.
- **Other GCP code, not touched:**
  - `server/services/ana/gcp-consent.ts` (`advise_gcp`, `review_informed_consent`), which reads the same
    consent-element record;
  - `server/services/global-ri/gcp-essential-documents.ts` behind `server/routes/global-ri/gcp.routes.ts`, a second
    table of E6 principles and essential records (a residual below);
  - the record-backed services `protocol-deviations/`, `etmf/`, `inspection/` and `protocol-consent/`;
  - `global-ri/inspection-readiness.ts`, a market-checklist assessment of its own.
- **Readers of the changed result fields:** none outside the engine. The manifest's renderers are generic.
- **Searches run:** `git grep` for:
  - the six tool and function names, `GCP_OPERATIONS_TOOLS` and `gcp-operations-knowledge`;
  - `not_stated` in the GCP files (none before this change);
  - the result fields `complianceScore`, `overallRiskLevel`, `readinessScore`, `electronicConsentConsiderations`
    and `applicableAdditionalElements` across client, shared and server.

  Also `ls server/services` for gcp, deviation, inspection, tmf, consent and monitor.
- **History:** `git log` on the engine and the tools file shows only `182fed957`.
  `git log --all --diff-filter=D --name-only`, filtered for
  `gcp|monitoring-plan|inspection-readiness|informed-consent|protocol-deviation|essential-doc|tmf`, finds nothing.
  The clone is shallow, so this covers local history only.

## The change

- **Booleans.** Each of the 58 booleans the engine reads reports `true`, `false` or `not_stated` through
  `inputStates`, and is never scored, graded or classified as false. A malformed value (`'true'`, `0`) is refused by
  field.
- **Enums, lists and numbers** are refused by field when malformed: a phase, novelty, objectivity, inspection target,
  study type, deviation category or stage outside its vocabulary, a vulnerable population outside the list, a site
  count, enrollment, percentage, CAPA count, reading grade or participant count out of range.
- **GCP compliance.** An omitted fact raises no gap or strength. The status is given only when no answer to the
  omitted facts could change it, and the omitted facts are named. For example, `{ safetyReportingCompliant: false }`
  is still "critical_gaps". The score is null while a principle is unverified. A stated
  `protocolFollowedWithChangeControl: false` is now a major gap. An unverified finding reads "Status not provided —
  verify and document. If it is not met: …".
- **Monitoring plan.** An omitted blinding, vulnerable-population or device fact adds a "Not assessed: … (x not
  stated)" note.
- **Inspection readiness.** An omitted or null target reports `inspectionTarget: 'not_stated'` and keeps the sponsor
  483 list with its warning. An omitted prior-findings fact adds a "not provided" CAPA line.
- **Consent design.**
  - With no method stated, "Paper consent process selected" becomes "Consent method not assessed: … not stated…".
  - The elements an unstated study feature decides are named as undecided, not listed as applicable.
  - An omitted placebo fact adds "Placebo use not stated: …".
  - An omitted vulnerable-population list adds a warning, and an omitted reading grade says no target was stated.
- **Essential documents.** An omitted device status, outside the conduct stage, adds a note naming the IDE records.
- **The definitions** say what an omission leaves. The six descriptions fit within the gateway's 1,024 characters
  (881 to 1,002). The monitoring description no longer lists blinding as a scored factor. Inputs the engine never
  reads say so: `therapeuticArea`, `involvesRandomization`, `futureResearchUse` and the deviation `description`.
- **The clinical skill** tells AnA to report these states and ask for the fact.
- **The design** records this family's "What already exists" and its result, and its status row moves on.

**Stated inputs whose result changes.** Fully stated, well-formed inputs were compared with the engine before this
change: 110,592 monitoring, 131,072 readiness, 24,576 consent, 4,608 deviation and 128 document inputs, and all
65,536 compliance inputs.
- **Five functions:** nothing changes but the new `inputStates`.
- **Compliance:** 32,768 change: exactly those that state `protocolFollowedWithChangeControl: false`, a fact the old
  code ignored. Each gains one major `protocol_compliance` gap, and nothing else differs. 1,020 move from
  "minor_gaps" to "major_gaps", and one, all true but that fact, moves from "compliant" to "minor_gaps". The other
  31,747 keep their status.

**Results that change because an input was omitted or malformed** (the old result was a default or a misreading), for
example:
- `assessGCPCompliance({})`: "major_gaps", 0, five gaps becomes `not_assessed`, null, no gaps, with 16 facts named.
- `inspectionTarget: 'FDA'`: the crash becomes a refusal by field.
- `stage: 'Before'`: the empty plan becomes a refusal.
- `numberOfParticipantsAffected: '5'`, which had fallen back to 1, is now refused. 0 and 1.5 are refused too.
- Malformed booleans:
  - monitoring's `experiencedSites: 'false'` had read as true, giving risk 0 where a stated false gives 8;
  - consent's `moreThanMinimalRisk: 'true'` had read as false, and `electronicConsent: 'true'` had given the paper
    line;
  - `includeInvestigatorSiteFile: 'false'` had read as include.

  All are now refused.

**Residuals, recorded rather than changed:**
- **Disclosed reference or scope defaults, not facts.**
  - An omitted inspection target still lists the sponsor 483 observations, now with `not_stated` and a warning.
  - An omitted reading grade uses grade 8, and says so.
  - An omitted stage means all stages.
  - Omitted investigator-site-file and sponsor-TMF flags include those documents: they are view filters.
  - An omitted `electronicTmf` or `multiSite` adds nothing, as each definition says.
- **Cautious readings kept.** An omitted `genomicData` with `studyType: 'gene_therapy'` still gives the gene-therapy
  reminder. An omitted study type reads as neither observational nor gene therapy, so the applicable-clinical-trial
  warning is given.
- **A note printed without need.** The note "'Unverified' principles reflect inputs not provided" is printed even
  when no principle is unverified.
- **An element never selected.** The record's Common Rule `future_use` element is never selected by any input.
  Reading `futureResearchUse` would be a regulatory change beyond this slice.
- **Unused member and duplicated vocabularies.** `PrincipleAssessment` keeps an unused `'partial'` member, which the
  description no longer claims. The phase, study-type, category and stage vocabularies live in both the schema and
  the engine.
- **A second E6 table.** `global-ri/gcp-essential-documents.ts` holds a second table of E6 principles and essential
  records. Converging it onto `gcp-operations-reference.ts` is outside S5c.
- **Size.** The engine is 99,120 bytes, 880 under the 100,000-byte ceiling, and was already over the 1,500-line
  threshold. A follow-up that needs room should first move `CTQ_LIBRARY` or `GCP_GAP_RULES` into
  `gcp-operations-reference.ts` (Rule 6, split in the same folder).

**User-visible:** AnA's GCP answers no longer report a gap, a "not documented", a paper consent or a compliant trial
from facts it was not given. Each names what was not stated and asks for it. A malformed value is asked for again,
not graded, crashed on or answered with an empty plan.

## Proof

- `red/before.txt`: `gcp-operations-unstated-inputs.test.ts` fails 104 of 112 cases on trunk `7e3cb137c`, all on
  assertions. The 8 controls pass: the six stated-basis pins, "keeps the stated answers" and "decides an element
  from a stated fact that settles it alone".
- `green/after.txt`: 112 of 112 pass, with the engine's suites: 127 in all.
- **The neighbourhood: 29 files, 2,282 tests, 2,280 pass.** It covers:
  - the GCP engine's suites;
  - `gcp-consent` and its elements test;
  - global-ri's essential-documents test;
  - the consent-element record test;
  - every S5 unstated-input suite;
  - the skills suites, the tool-selection suites and the tool registry.

  The two failures are in `tool-selection-tokenize.test.ts`: routing "write sections 2.6.2 and 2.6.4" to
  `draft_nonclinical_summaries_m2_6`. They fail identically on trunk without this change, and are not GCP's.
- **Gates:**
  - typecheck: 0 errors;
  - ESLint ratchet: one warning fewer (10 to 9 on the engine: gap synthesis made table-driven);
  - `manifest:ana`: regenerated in its own commit. The six GCP tools change their descriptions and inputs, with no
    renderer change.
- **Mutations.** Against deliberately broken copies of the patched engine, the red test fails:
  - status from the best case only: 11 cases;
  - deviation booleans unvalidated: 8;
  - the paper-consent default restored: 1;
  - an omitted fact raising its gap: 2;
  - the percentage unbounded: 1.

**How it was made.** A read-only planner wrote the patch; an adversarial critic then applied it to scratch copies,
ran it through the real executor, and enumerated the stated inputs above. The critic made these corrections:
- re-anchored the design edits on the GMP rows, which had landed first;
- fixed one omission still read as false (the placebo fact);
- corrected four sentences that were false of the code: the engine header, a readiness comment, the gap-rule
  comment and the compliance description;
- removed "blinding" from the monitoring description;
- named the two other GCP pieces above;
- corrected the old-behaviour examples.

Its corrected edits and red test were applied. They still applied, unchanged, to trunk on 2026-11-08.
