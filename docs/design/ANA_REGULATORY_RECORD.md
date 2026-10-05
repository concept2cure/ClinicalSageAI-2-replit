# ARCHITECTURE — one regulatory record AnA answers from

FDA · EMA · PMDA × drug · biologic · device · IVD. Launch row **D2** (AnA document intelligence).
Evidence for every step goes in `docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/<date>-record/<step>-{facts,red,green}.*`, following the round-2 convention in `…/2026-10-04-depth/`.

Repository: `/home/user/ClinicalSageAI-2-replit`, branch `concept2cure-v2` only (Rule 0). Read at HEAD `dacbc67b` plus the uncommitted batch-3 working tree, 2026-10-05.

---

## 0. The decision

`server/services/ind/ctd/` is extended in place. It becomes the single record that AnA, the drafting paths and the readiness gates read for five questions:

1. What a document or section must contain.
2. Where it is filed, in which regulator's tree.
3. What is required for this application.
4. What will make the agency refuse it.
5. What comes after database lock.

Every fact carries one provenance type, `RegulatoryBasis`, and is keyed by jurisdiction × product × application × document × section. The record adds no new directory under `ind/ctd`, no new key vocabulary and no AnA tool. It deletes four AnA tools and about thirty parallel copies. Each copy is deleted in the commit that migrates its readers, and that commit names the replacement by path.

Its parts:

- **One provenance type.** `shared/regulatory/regulatory-basis.ts`.
- **One Module 1 record.** `shared/regulatory/regional-module1.ts`: pure data for US, EU and JP, re-exported from `ind/ctd`.
- **One ICH M2–M5 record.** `CTD_AUTHORING_GUIDANCE` (content) plus `ich-m4-headings.ts` (structure). Module 3 content belongs to the CMC lane.
- **One resolver.** `ind/ctd/requirements-resolver.ts`.
- **One placement matcher.** `ind/ctd/document-reference.ts`.
- **One acceptance registry.** `server/services/ectd/validation-rule-corpus.ts`.
- **One store of dated facts.** `regulatory-currency/currency-registry.ts`.
- **Engines that already own verdicts keep their homes.** The resolver reads them as projections: CER/PER, eSTAR, CTIS, tech-doc, PMA, Shōnin and classification.

When the record does not encode something, the answer is `not_indexed` with what to read instead. It is never another regulator's answer and never the model's memory.

---

## 1. How this was chosen

| Design | Judge 1 (C/Z/I/Cov/S) | Judge 2 (C/Z/I/Cov/S) | Combined |
|---|---|---|---|
| **extend-in-place (A)** | 8/8/8/8/8 = 40 | 8/8/8/8/8 = 40 | **80, winner** |
| consumer-first (C) | 7/8/5/9/6 = 35 | 7/7/5/9/6 = 34 | 69 |
| registry-first (B) | 7/7/7/7/5 = 33 | 7/6/7/7/5 = 32 | 65 |

**Kept from A (the skeleton):**
- no new directory;
- the existing vocabularies: `CanonicalRegion` narrowed to US/EU/JP, shared `ProductType`, registry ids;
- the four-partition record;
- one `resolveRequirements`;
- `RULE_CORPUS` as the acceptance registry;
- the sidecar-free Module 1 move;
- its explicit resolutions of findings 27 vs 75, 53/54/78 and 39/79.

**Grafted from B (registry-first):**
- an evaluable `Necessity` with a `ConditionId`, so an unknown fact is "undetermined" (a gap);
- a small closed `DocumentRole` list with `placementFor(role, j)`;
- `status: modeled | partial | not-indexed` with `sourcesOwed` per application;
- a `vendored` field on the basis;
- the ICH_BACKBONE parity test before the DTD lands;
- three-way parity for `ind-ectd-sections`;
- Module 1 consumers migrated one commit at a time;
- a basis field that is optional in the type and enforced by a gate;
- launch row D2 named, and the `section-generation-service.ts` window respected.

**Grafted from C (consumer-first):**
- a tree `owner` file that drives the inventory gate;
- a `candidates` answer for ambiguous text;
- the code-boundary rule (a bare number is a code only after "section", "module" or an m-prefix, or as an exact key);
- `factId` on the basis itself;
- `basisProblems`, `basisLabel` and `REGULATOR_HOSTS` next to the type;
- the ratchet against US tokens in common M2–M5 text;
- a failed program read reported as failed;
- the persona's dossier order derived from `SUBMISSION_CHAIN`;
- one `Necessity` enum (eSTAR Necessity ∪ E3Applicability);
- coverage of findings 71, 73, 77 and 81.

**Fixes to A that both judges asked for:**
- the Module 1 data lives in `shared/` from day one;
- `ApplicationKind` is a union, not `string`;
- the resolver is extracted as a pure refactor *before* scope is added;
- the inventory ratchet lands *before* the consumer migrations;
- ALWAYS_ON and the dotted-code tokenizer move next to the tool's new jurisdiction input;
- all four tool deletions are stated, including `ind_generate_section`, `ind_get_status` and the `intelligence-questions/engine.ts:458` action;
- `biostatistics-bridge/filing-placement.ts` is brought under the record.

**Rejected:**
- from B: the `dossier/` directory, a new `Jurisdiction`, a shadowing `ProductType`, a ~45-term `DocumentRole`, a profile table that restates registry attributes, and routing project-bootstrap through a server catalog;
- from C: a required `basis` on `CtdSection`, a 115-entry basis rewrite of the hot `authoring-guidance.ts`, the `csr-e3-basis.ts` → `bases.ts` rename, the boot-time re-seed of templates, a 24-id `TreeId` with a `brief()` per tree, `AppToken` mixing documents with applications, and the big-bang S2 step;
- from A: the `ctd-basis.ts` sidecar (it split one section's facts across two files) and the prose-only `RegionalHeading.condition`.

---

## 2. Disagreements resolved

Each item is decided once here so later steps do not re-argue it.

1. **Where section basis and regional notes live.**
   - A: a sidecar keyed by code. B and C: inline on `CtdSection`. C also made the field required.
   - **Decision:** inline and optional. `CtdSection.basis?` holds overrides only. `CtdSection.regional?` holds jurisdiction notes. A computed module default fills the rest: `moduleDefaultBasis(code)` gives M4Q(R1) for 2.3/3.x, M4S(R2) for 2.4/2.6/4.x, and M4E(R2) for 2.5/2.7/5.x.
   - `basisFor(code) = inline ?? module default`.
   - Only Module 1 entries need an inline override (the CFR section or FDA M1 spec). Those still missing one sit in a shrink-only, reasoned baseline.
   - Result: one home per section, no 115-entry rewrite, and the CMC lane's in-flight 3.x entries never fail the gate, because they inherit M4Q(R1).

2. **Where the Module 1 data lives.**
   - **Decision:** `shared/regulatory/regional-module1.ts`, re-exported by `ind/ctd/index.ts`. It is pure data plus pure helpers. Its runtime imports are limited to `shared/**`, and `import type` is allowed.
   - `regional-ctd-templates.ts` has no imports today, so the move is mechanical.
   - `shared/regulatory/project-bootstrap.ts`, which is re-exported by `@shared/regulatory/index.ts` and so reaches the client bundle, imports it without pulling in server code.
   - B's alternative (route US/EU/JP through a server catalog and audit every `getSectionBlueprintForEntry` reader) is rejected as riskier.

3. **ApplicationKind.**
   - **Decision:** `Exclude<LegacyLowerType, 'cer'|'ectd'|'general'> | 'dmf'|'asmf'|'jmf'|'ctn'|'hde'|'jp_todokede'|'jp_ninsho'|'jp_shonin'`.
   - `LegacyLowerType` is defined at `shared/regulatory/submission-type-bridge.ts:255`.
   - The registry's `applicationType` is a display string ("510(k)", "NDA"), not a usable key. `applicationKindOf(entry)` in `ind/ctd/jurisdiction.ts` is therefore the one mapping. 505(b)(2) maps to `nda` and 351(k) to `bla`.

4. **Necessity.**
   - **Decision:** one enum, `'always'|'conditional'|'when-applicable'|'authority-dependent'`, which is the eSTAR `Necessity` (estar-mapper.ts:67) ∪ `E3Applicability`.
   - Both existing names become aliases: `Exclude<Necessity,'authority-dependent'>` and `Exclude<Necessity,'conditional'>`.
   - Conditionality is evaluable through `condition?: ConditionId`, where `ConditionId = M1ConditionId | DeviceFlagId` and `DeviceFlagId` comes from `shared/constants/domain/device-classification`.
   - `requiredModule1(j, kind, facts)` and `requiredSectionsFor(registryId, facts)` return `required`, `undetermined` and `notApplicable`. An unknown fact is a gap, never "not required".

5. **DocumentRole versus equivalents.**
   - **Decision:** a closed list of about 19 Module 1 roles, with each role attached to nodes, is the one datum.
   - `placementFor(role, j)` replaces A's `labelingHeading(j)`, the component-to-heading map and the hand-typed artifact codes.
   - `equivalentsOf(j, code)` (US 1.14.1.3 ↔ EU 1.3.1 ↔ JP 1.8) is *derived* from shared roles, so no separate `equivalents` field can drift from it.
   - Placement in Modules 2–5 uses the ICH code itself plus the title index in `document-reference.ts`; roles are not needed there.
   - A test requires every role to be used by at least one node and read by at least one consumer.

6. **Profiles versus registry dispatch.**
   - **Decision:** no profile table that restates registry attributes.
   - `application-coverage.ts` holds only `{registryId, status, sourcesOwed}` for the ids the record answers for.
   - Composition (which trees make up the dossier) is *computed* from the registry entry's `dossierStandard` and region.
   - The rule-pack join is computed through the existing `c2c/document-class.ts resolveDocumentClass`.
   - An absent id means `not-indexed`.

7. **Resolver home.** Findings 25 (section-brief), 26 (document-reference), 74 (drafting-requirements.ts) and B's dossier/requirements.ts proposed four homes.
   - **Decision:** `ind/ctd/requirements-resolver.ts` for the dispatch and `ind/ctd/document-reference.ts` for free-text placement. There is no `drafting-requirements.ts`.
   - The resolver imports `section-brief.ts`, never the reverse, because `csr-e3-guidance.ts:32` already imports `clip` from `section-brief.ts`.

8. **Path and file-name limits.** Findings 54 (datasheet), 78 (`ectd-regional-rules.ts`) and A (corpus) disagreed.
   - **Decision:** the *numbers* are `RULE_CORPUS` rows, one row per tier, each with its own basis and severity.
   - The *function* `ectdPathFindings` lives in `ectd-regional-rules.ts`, as finding 78 proposes, and reads those rows.
   - `market-submission-specs.maxPathLength` becomes a derived alias.

9. **How corrected seed templates reach a deployed database.** Findings 39/32 (refresh in place) and 79 (version bump).
   - **Decision:** finding 79. Write a new `TEMPLATE_ROW_VERSION` row and deprecate the old version in the same transaction, never in place and never delete, because of the `template_validations` FK.
   - C's boot-time re-seed is rejected.
   - Whether the boot seeder may write the new version row, or a migration must, is a founder decision (Rule 1 names migrations as the only deployed seed path).

10. **Finding 27 vs 75.**
    - **Decision:** delete `ind_generate_section` and `ind_get_status`. They return 401 on every call.
    - Keep finding 75 step 1, which fixes `buildSectionGenerationPrompt`.
    - Whether to retire the `/api/ind-generation` engine is a founder or Authoring-lane decision.

11. **eSTAR content source.** Finding 57 (the tree) vs 70 (the mapper).
    - **Decision:** `estar-mapper` slots remain the necessity and authority source now (an `estarSlots()` accessor).
    - `device-dossier-toc.ts` crosswalks to them by slot id.
    - Only in slice 3 do label, authority and necessity move into the tree, with the mapper reading them back. They are never held in both places.

12. **`csr-e3-basis.ts`.** There is no rename and no shim.
    - Shared constants (`FDA_E3`, `E3_QA_R1`, `FDA_PDF_SPECS`, `FDA_STUDY_DATA_TRC`, `FDA_SDTCG`, `CFR_314_50_F`) move to `ind/ctd/regulatory-basis.ts`, and their importers are repointed after the csr-e3 lane commits.
    - `csr-e3-basis.ts` keeps only what is E3-specific: `CDISC_CONVENTION` and `e3SectionBasis()`.

13. **Jurisdiction and product vocabularies.**
    - **Decision:** `ModeledJurisdiction = Extract<CanonicalRegion,'US'|'EU'|'JP'>` and the shared `ProductType` (`drug|biologic|device|ivd|cdx|samd`).
    - B's shadowing `ProductType` and C's `ProductClass`/`AppToken`/`TreeId` are rejected.
    - The repository already has eight `Jurisdiction` types. This design adds none and consolidates none (see §13).

14. **JP post-lock chain.**
    - **Recommendation:** ship the ICH-common nodes plus recall-labelled JP regional nodes. Transmission fails closed, because no JP eCTD v4.0 profile exists.
    - The founder may choose to fail the whole JP chain closed instead.

15. **Duplicate basis constants.** Verified with grep:
    - Only `M4E_R2` (submission-chain.ts:48 and fda-technical-rules.ts:34) and the ISS/ISE placement constant (`FDA_ISS_ISE_PLACEMENT` at submission-chain.ts:36 and `FDA_ISS_ISE` at fda-technical-rules.ts:33) are duplicated.
    - C's claim that `FDA_ECTD_TCG` and `CFR_314_101` have second copies is wrong; each is defined once, in `fda-technical-rules.ts`.

16. **The E2F DSUR outline now in flight.**
    - The meetings-dsur lane is adding `ICH_E2F_DSUR_SECTIONS`, an `E2fSection` type, a local `recall()` helper and `FDA_FORMAL_MEETING_TIMELINES` to `lifecycle-document-types.ts`. This is uncommitted at the time of writing.
    - **Decision:** it lands as that lane wrote it.
    - In R1 its local `recall()` is replaced by the import.
    - In R13 the E2F array moves to `periodic-safety-reports.ts` as a `DocumentOutline<'dsur-e2f'>` of `OutlineNode`s, beside PBRER and PADER, and `lifecycle-document-types.ts` imports it. The `E2fSection` type is deleted in the same commit.

---

## 3. Corrections to the inputs, verified on 2026-10-05

- **(a)** No `shared/` file imports `regional-ctd-templates.ts`; `placement-vocabulary.ts:45` names it only in a comment. `regional-ctd-templates.ts` itself has no imports.
- **(b)** `LegacyLowerType` exists at `shared/regulatory/submission-type-bridge.ts:255`. The registry's `applicationType` is display text, not lower-case.
- **(c)** `ind:fda` is already at `ich-m4-v2.2` (`migrations/20260902_ind_fda_outline_v2_2_initial_ind_flags.sql`) and has its parity test (`tests/regulatory/ind-required-set-agrees-with-rule-pack.test.ts`). The rule-pack parity gate *generalises* that test rather than adding a second one.
- **(d)** The intelligence-questions action that names `ind_generate_section` is at `server/services/ana/intelligence-questions/engine.ts:458`.
- **(e)** `ind-ectd-sections.ts` is at `services/regulatory/ind-ectd-sections.ts`, under the top-level `services/` directory, not `server/`.
- **(f)** `authoring/section-generation-service.ts` already injects `renderSectionBrief(sectionCode)`, with no scope, as prompt v1.1 (`8183432b`). Threading scope into it waits until another lane's window closes at **2026-10-05 17:10 UTC**.
- **(g)** `server/services/biostatistics-bridge/filing-placement.ts` is a live placement table with its own `ApplicationType` and `BACKBONE_FOR_APPLICATION`. None of the three designs migrated it; this one does (R5 and R9).
- **(h)** `RULE_CORPUS` severity is `'high'|'medium'|'low'` and its enforcement is `'dispatch-readiness'|'ectd-validator'|'packager'|'external'`. Path tiers are therefore separate rows, not a nested params array with a second severity vocabulary.
- **(i)** `DeviceFlagId` is defined in `shared/constants/domain/device-classification` (estar-mapper re-exports it), so the shared `ConditionId` can name it.
- **(j)** `RESULT_BUDGET = 5000` is defined at `regulatory-knowledge-tools.ts:62`. The labeling area already uses 4886 of it (F11).

---

## 4. Invariants every step keeps

1. **One answer per key.** A Module 1 code is answered only from its own jurisdiction's tree, with no fallback across jurisdictions. If no scope is known, the answer is labelled `US (FDA) Module 1, assumed` and lists the EU and JP equivalents.
2. **Fail closed.** An unmodelled jurisdiction (CA, UK, CH, AU, CN, KR, BR, IN, SG), an unencoded document (JP STED, IMDRF ToC beyond eSTAR, M1 trees for regions outside US/EU/JP) or ambiguous text gets `not_indexed` or `candidates`, never a guess. A failed program read says it failed and never silently becomes the US.
3. **Every node, rule and chain fact resolves to a non-empty `RegulatoryBasis[]`.**
   - `regulator-text` requires either a URL on a host in `REGULATOR_HOSTS` and a `checked` date, or a `vendored` repo path and a `checked` date.
   - A date in a statement comes from a currency fact (`factId`) and is never copied into the text.
   - Nothing is promoted to `regulator-text` without a row in the step's `facts.md`.
4. **Numbers and verdicts come from these deterministic engines.** The model narrates. Text a node does not encode renders as "content not encoded — do not supply from memory".
5. **Zero duplication.** A copy is migrated and deleted in the same commit. The inventory ratchet only shrinks.
6. **Rule 1.** Rule-pack and seed corrections are new version rows using `ON CONFLICT DO NOTHING`, a guarded `superseded_by`, a row-count `RAISE` and a dated header, placed before the final sweep pair. Amending a migration in place is allowed only on the creating file, and only with a dated header note. There is no DROP.
7. **Red first.** Every step's test is run red against the old code before the change. Every new gate is shown failing on the case it exists to catch (a selftest or a mutation).

---

## 5. Types

```ts
// ── shared/regulatory/regulatory-basis.ts  (NEW; no imports; client- and server-safe) ──────────
export type RegulatoryConfidence = 'regulator-text' | 'recall' | 'platform-convention';
export interface RegulatoryBasis {
  ref: string;                    // 'EU M1 eCTD Specification v3.1 §1.3.1' | '21 CFR 314.50(d)(5)(vi)(b)'
  confidence: RegulatoryConfidence;
  url?: string;                   // regulator-text: host ∈ REGULATOR_HOSTS (unless `vendored`)
  checked?: string;               // ISO date; regulator-text: required
  vendored?: string;              // repo path of a vendored regulator artifact that was read
                                  //   e.g. server/services/ectd/controlled-vocab/cv-v4-data.ts, eSTAR template XML
  factId?: string;                // currency-registry id; a dated statement reads its date from the fact
  note?: string;                  // 'search extract of the regulator page; verbatim re-read owed'
}
export const REGULATOR_HOSTS: readonly string[];
//  fda.gov ecfr.gov federalregister.gov hhs.gov ema.europa.eu esubmission.ema.europa.eu eur-lex.europa.eu
//  health.ec.europa.eu pmda.go.jp mhlw.go.jp ich.org database.ich.org
export function basisProblems(b: RegulatoryBasis): string[];   // [] = well formed
export function basisLabel(b: RegulatoryBasis): string;        // "ref (recall — not checked against the regulator's text)"

// ── shared/regulatory/regional-module1.ts  (NEW; pure data + pure helpers; runtime imports: shared/** only) ──
import type { CanonicalRegion } from './region-identity';
import type { LegacyLowerType } from './submission-type-bridge';
import type { DeviceFlagId } from '../constants/domain/device-classification';
import type { RegulatoryBasis } from './regulatory-basis';

export type ModeledJurisdiction = Extract<CanonicalRegion, 'US' | 'EU' | 'JP'>;
export type ApplicationKind =
  | Exclude<LegacyLowerType, 'cer' | 'ectd' | 'general'>      // ind nda bla anda maa jnda cta 510k de_novo pma mdr_td ivdr_td
  | 'dmf' | 'asmf' | 'jmf' | 'ctn' | 'hde' | 'jp_todokede' | 'jp_ninsho' | 'jp_shonin';

/** One enum: estar Necessity ∪ E3Applicability. Both become aliases of this. */
export type Necessity = 'always' | 'conditional' | 'when-applicable' | 'authority-dependent';
export type M1ConditionId =
  | 'orphan_designation' | 'paediatric_obligation' | 'generic_hybrid_biosimilar' | 'bibliographic'
  | 'foreign_manufacturer' | 'referenced_master_file' | 'clinical_data_required' | 'sponsor_investigator';
export type ConditionId = M1ConditionId | DeviceFlagId;
export interface Applicability<C extends string = ConditionId> {
  kinds?: ApplicationKind[];      // absent = every kind that uses the tree
  necessity: Necessity;
  condition?: C;                  // for 'conditional': the deciding fact; unknown ⇒ 'undetermined' (a gap)
  when?: string;                  // for 'when-applicable': the deciding circumstance in words
  basis?: RegulatoryBasis[];
}

/** Closed list. Each role is used by ≥1 node and read by ≥1 consumer (test). Final membership fixed in R4. */
export type DocumentRole =
  | 'cover_letter' | 'application_form' | 'product_information_draft' /* US 1.14.1.3 · EU 1.3.1 · JP 1.8 */
  | 'labeling_mockup' | 'labeling_specimen' | 'readability_consultation' | 'investigators_brochure'
  | 'rmp' | 'rems' | 'pv_system' | 'paediatric' | 'environmental' | 'orphan' | 'patent' | 'debarment'
  | 'financial_disclosure' | 'letter_of_authorization' | 'expert_information' | 'meeting_information';

export interface RegionalHeading {
  number: string; title: string; titleLocal?: string;          // 添付文書(案)
  applies: Applicability[];                                     // [] = heading only, no requirement claim
  roles?: DocumentRole[];
  description: string;
  childSections?: RegionalHeading[];
  basis: RegulatoryBasis[];                                     // non-empty
  contains?: string[]; pitfalls?: string[];                     // EU/JP depth; US depth stays in CTD_AUTHORING_GUIDANCE
  platformSubKeys?: Array<{ code: string; title: string }>;     // US 1.1.1–1.1.4 filed under FDA heading 1.1
  pointsTo?: { outline: 'us-pi' | 'eu-smpc-qrd' | 'jp-package-insert' | 'eu-rmp'; module: string }; // labelling depth stays in its engine
  notInEctd?: true;                                             // EU 1.1 TOC
}
export interface RegionalModule1 { jurisdiction: ModeledJurisdiction; spec: RegulatoryBasis; tree: readonly RegionalHeading[] }
export const REGIONAL_MODULE1: Readonly<Record<ModeledJurisdiction, RegionalModule1>>;
export function moduleOneTree(j: ModeledJurisdiction): readonly RegionalHeading[];
export function module1Heading(j: ModeledJurisdiction, code: string): RegionalHeading | null;
export function flattenModule1(j: ModeledJurisdiction, kind?: ApplicationKind): RegionalHeading[];
export function module1Rows(j: ModeledJurisdiction, kind: ApplicationKind): Array<{ code: string; title: string; required: boolean }>;
export function requiredModule1(j: ModeledJurisdiction, kind: ApplicationKind, facts?: Partial<Record<ConditionId, boolean>>):
  { required: string[]; undetermined: Array<{ code: string; condition: ConditionId }>; notApplicable: string[] };
export function placementFor(role: DocumentRole, j: ModeledJurisdiction, kind?: ApplicationKind): RegionalHeading[];
export function equivalentsOf(j: ModeledJurisdiction, code: string): Array<{ jurisdiction: ModeledJurisdiction; code: string; title: string }>; // derived from roles

// ── server/services/ind/ctd/types.ts  (EXTEND IN PLACE; every existing import keeps working) ────────────
export type { RegulatoryBasis, RegulatoryConfidence } from '../../../../shared/regulatory/regulatory-basis';
export type { ModeledJurisdiction, ApplicationKind, Necessity, ConditionId, Applicability, DocumentRole,
              RegionalHeading } from '../../../../shared/regulatory/regional-module1';
export type E3Confidence = RegulatoryConfidence;             // was a declaration; now an alias
export type E3Basis = RegulatoryBasis;                       // was a declaration; now an alias
export type E3Applicability = Exclude<Necessity, 'conditional'>;

// CtdSection: the 115 literals are untouched; three OPTIONAL fields (enforced by gates, not the type):
//   basis?: RegulatoryBasis[];             // overrides only; basisFor(code) = basis ?? moduleDefaultBasis(code)
//   regional?: Partial<Record<ModeledJurisdiction, { note: string; basis: RegulatoryBasis[] }>>;  // US-only 314.x text moves here
//   subsections?: OutlineNode[];           // M4E 2.5.6.x, 2.7.2.x, 2.7.3.x, 2.7.4.x (F3)
// LifecycleComponent += heading?: string    // Module 1 heading in the type's own jurisdiction; validated against REGIONAL_MODULE1

/** General outline node. E3Section is this with E3's narrower `applies`, so no E3 consumer sees a widened union. */
export interface OutlineNode<A extends Necessity = Necessity> {
  number?: string; title: string; titleLocal?: string;
  applies: A; condition?: ConditionId;
  purpose?: string; contains?: string[]; sources?: string[]; presentation?: string[]; pitfalls?: string[]; see?: string[];
  basis?: RegulatoryBasis[];               // beyond the outline's governing basis
  headingOnly?: true;                      // content not encoded; renderer says so and adds nothing
}
export type E3Section = OutlineNode<E3Applicability>;
export type OutlineId = 'csr-e3' | 'protocol-m11' | 'dsur-e2f' | 'pbrer-e2c-r2' | 'pader-314-80' | 'jp-ctn' | 'eu-ctr-annex-i';
export interface DocumentOutline {
  id: OutlineId; title: string;
  jurisdictions: ModeledJurisdiction[] | 'ich';
  governing: RegulatoryBasis[];            // non-empty
  aliases: string[];                       // 'csr','e3','pbrer','psur','protocol','csp','ctn','治験計画届'…
  owner: string;                           // the ONLY file allowed to hold this outline's number/title pairs (inventory gate)
  nodes: readonly OutlineNode[];
}

/** Device dossier ToC (F57), in eSTAR vocabulary. */
export type EstarFamily = 'nivd' | 'ivd';
export interface DeviceTocNode {
  family: EstarFamily; token: string;      // 'CH3.05.06' — ambiguous without family
  heading: string; parent?: string;
  applies: Applicability<DeviceFlagId>;
  crosswalk: { estarSlotIds: string[]; rulePackKeys?: { k510?: string; denovo?: string }; pmaModule?: string; documentTemplateId?: string };
  basis: RegulatoryBasis[]; contains?: string[]; pitfalls?: string[]; headingOnly?: true;
}

/** Which applications the record answers for. Nothing the registry already says is restated. */
export interface ApplicationCoverage {
  registryId: string;                      // GLOBAL_REGISTRY id; region/agency/productClass/dossierStandard read from the entry
  status: 'modeled' | 'partial' | 'not-indexed';
  sourcesOwed?: RegulatoryBasis[];         // what must be read before status can rise
}
// compositionOf(entry): computed from dossierStandard + region (eCTD/CTD → that region's M1 + ICH M2–M5;
//   eSTAR → device ToC; MDR/IVDR tech doc → tech-doc-assembler; CER/PER/CEP → cer/per-structure;
//   EU CTA → eu-ctr-annex-i; JP CTN → jp-ctn; PMA → pma-mapper). Rule-pack join: c2c/document-class resolveDocumentClass.

// ── server/services/ind/ctd/requirements-resolver.ts  (the one entry point) ─────────────────────────
export interface RequirementQuery {
  document: string; section?: string;
  jurisdiction?: string | null;            // 'US'|'EU'|'JP'|'FDA'|'EMA'|'PMDA'|… via canonicalRegionOf
  product?: string | null;                 // isProductType
  application?: string | null;             // registry id or alias via resolveToRegistryEntry
  family?: EstarFamily;
}
export interface ResolvedScope {
  jurisdiction: ModeledJurisdiction | null; product: ProductType | null; application: string | null; kind: ApplicationKind | null;
  from: Record<'jurisdiction' | 'product' | 'application', 'input' | 'program' | 'registry' | 'assumed' | 'none'>;
  programRead: 'ok' | 'no-open-program' | 'failed';   // 'failed' is said aloud, never silently US
  notModeled?: CanonicalRegion;                          // e.g. 'CA': answered not_indexed, never FDA
}
export type RequirementSource =
  | { kind: 'ctd-section'; code: string }                // ICH M2–M5 (+ US M1 depth)
  | { kind: 'regional-m1'; jurisdiction: ModeledJurisdiction; code: string }
  | { kind: 'lifecycle'; id: string }
  | { kind: 'outline'; outlineId: OutlineId; section?: string }
  | { kind: 'device-toc'; family: EstarFamily; token?: string; pathway?: '510k' | 'de_novo' }
  | { kind: 'application'; registryId: string }          // M1 tree + M2–M5 listing, or device/CTA/CTN composition
  | { kind: 'engine'; engine: 'cer' | 'per' | 'eu-tech-doc' | 'pma-814-20'; section?: string };   // read, not copied
export type RequirementAnswer =
  | { kind: 'answer'; source: RequirementSource; scope: ResolvedScope;
      match: 'exact' | 'ancestor' | 'parent' | 'subsection' | 'outline';
      title: string; requirements: string /* rendered, ≤ budget */; basis: RegulatoryBasis[] /* non-empty */;
      alternatives?: Array<{ jurisdiction: ModeledJurisdiction; code: string; title: string }>; assumed?: 'US' }
  | { kind: 'candidates'; scope: ResolvedScope; candidates: Array<{ source: RequirementSource; title: string }> }  // never pick one
  | { kind: 'not_indexed'; scope: ResolvedScope; reason: string;
      readInstead?: { tool?: string; url?: string }; sourcesOwed?: RegulatoryBasis[] };
export function resolveRequirements(q: RequirementQuery, program?: ProgramFacts): RequirementAnswer;

// ── ind/ctd/document-reference.ts ───────────────────────────────────────────────────────────
export function resolveCtdDocumentReference(text: string, scope: Partial<ResolvedScope>):
  | { kind: 'match'; code: string; title: string; module: 1 | 2 | 3 | 4 | 5; jurisdiction: ModeledJurisdiction | 'ich';
      role?: DocumentRole; lifecycleId?: string; via: 'code' | 'role' | 'title'; alternatives: Array<{ jurisdiction: ModeledJurisdiction; code: string }> }
  | { kind: 'candidates'; candidates: Array<{ code: string; title: string; jurisdiction: ModeledJurisdiction | 'ich' }> }
  | null;
// Order: explicit code only after 'section'/'module'/m-prefix or as an exact key ('2.5 mg' is not 2.5);
// then role aliases (ISS, IB, USPI, PIL, J-RMP, 1571…); then the most specific title across the scope's trees,
// with Module 2 summary titles beating study-report words. Ties → candidates.

// ── submission-chain.ts  (EXTEND IN PLACE) ───────────────────────────────────────────────────
// ChainStage += 'post-filing'
// ChainNode  += jurisdictions?: ModeledJurisdiction[]            // absent = ICH-common
//            += overrides?: Partial<Record<ModeledJurisdiction, Partial<Pick<ChainNode,
//                 'title' | 'files' | 'dependsOn' | 'gate' | 'reviewerChecks' | 'basis' | 'evidence'>>>>
//            += filesRole?: DocumentRole                          // labeling node: placementFor('product_information_draft', j)
//            += checklist?: Array<{ item: string; basis: RegulatoryBasis }>
//            += deliverables?: Array<{ name: string; ctd: string; fileName?: string; stfFileTag?: string;
//                                      vault: 'visible' | 'not-visible'; basis: RegulatoryBasis }>
// ChainEvidence 'vault' += kinds?: string[]; excludeTitle?: RegExp; misfiledPattern?: RegExp
// VaultSectionFact = { ctdSection: string | null; folderId?: string | null; evidenceKind?: string | null; placementStatus: string; title: string }
export function chainFor(j: ModeledJurisdiction): readonly ChainNode[];     // SUBMISSION_CHAIN stays the US view
export function evaluateChain(facts: readonly VaultSectionFact[], j?: ModeledJurisdiction /* 'US' */,
  opts?: { applicationFiled?: boolean }): ChainVerdict & {
    misfiled: Array<{ title: string; filedAt: string; expected: string[]; basis: RegulatoryBasis }>; afterFiling: NodeVerdict[] };

// ── server/services/ectd/validation-rule-corpus.ts  (EXTEND IN PLACE: the one acceptance registry) ───
// ValidationRule +=
//   basis: RegulatoryBasis[];                          // `source` becomes a derived string (client unchanged)
//   area: 'pdf' | 'ectd' | 'study-data' | 'content' | 'labeling' | 'device-dossier' | 'ctis';
//   outcome: 'not-received' | 'technical-rejection' | 'refuse-to-file' | 'technical-screening-hold' | 'validation-issue' | 'warning';
//   consequence: string;
//   appliesTo?: { kinds?: ApplicationKind[]; products?: ProductType[]; ectdVersion?: '3.2.2' | '4.0' };
//   params?: { maxPath?: number; maxFolderName?: number; countedFrom?: 'zip-root' | 'sequence-folder'; fileNamePattern?: string };
//   verbatim?: string; platformNote?: string;          // carried over from FDA_TECHNICAL_RULES / PLR_FORMAT_RULES
//   checkedBy?: string;                                // module path when enforcement === 'pathway-engine'
// RuleEnforcement += 'pathway-engine'                  // eSTAR / PMA / CTIS / Shōnin outcome rows (founder confirms)
export function platformCheck(r: ValidationRule): 'enforced' | 'partial' | 'not-checked';   // derived, never hand-kept
export function rulesFor(q: { region?: RuleRegion; area?: string; kind?: ApplicationKind; product?: ProductType }): ValidationRule[];

// ── regulatory-currency/currency-registry.ts ─────────────────────────────────────────────────
// RegulatoryFact += confidence?: RegulatoryConfidence
// fromFact(id): RegulatoryBasis = { ref: topic, confidence: fact.confidence ?? 'regulator-text', url: sourceUrl, checked: lastVerified, factId: id }
```

---

## 6. File layout

All paths are relative to the repository root. `ind/ctd` keeps its name, so import paths stay valid. Its `index.ts` header states that it holds every modelled jurisdiction and product.

**NEW in `shared/regulatory/`**
- `regulatory-basis.ts`: the types, `REGULATOR_HOSTS`, `basisProblems` and `basisLabel`.
  - `shared/ivd/types.ts` `Citation` adopts `confidence` and `checked` from it (the F67 type half).
- `regional-module1.ts`: `REGIONAL_MODULE1` {US, EU, JP} and the helpers in §5.
  - US is moved from `FDA_TEMPLATE.module1Sections`. Leaves present in `CV_CONTEXT_OF_USE` carry `regulator-text` with `vendored: 'server/services/ectd/controlled-vocab/cv-v4-data.ts'`. Headings outside the CV stay `recall` until they are read.
  - EU is moved from `EMA_TEMPLATE`, adding 1.3.5, 1.3.6 and 1.5.3.
  - JP is moved from `PMDA_TEMPLATE`.
  - Each node's confidence follows the verified findings 31, 39 and 79 and their facts files.

**NEW or EXTENDED in `server/services/ind/ctd/`**
- `types.ts` (extend): §5.
- `regulatory-basis.ts` (new): every shared basis constant, plus `recall(ref)`, `practice(ref)`, `fromFact(id)`, `moduleDefaultBasis(code)` and `basisFor(code)`.
  - Constants: FDA_E3, E3_QA_R1, FDA_PDF_SPECS, FDA_STUDY_DATA_TRC, FDA_SDTCG, CFR_314_50_F, M4E_R2, FDA_ISS_ISE_PLACEMENT, FDA_ISE_GUIDANCE, FDA_ECTD_TCG, CFR_314_101, FDA_ECTD_VALIDATION_CRITERIA, cfr201_57(), EU_M1_SPEC_V31, QRD_V10_4, PMDA_M1, EURLEX_536_2014, EURLEX_2017_745 and EURLEX_2017_746.
  - M4Q constants are appended by the CMC lane.
  - `csr-e3-basis.ts` keeps only `CDISC_CONVENTION` and `e3SectionBasis`, importing from here.
- `jurisdiction.ts` (new):
  - `scopeFrom({jurisdiction, product, application, program})`, built only on `canonicalRegionOf`, `isProductType` and `resolveToRegistryEntry`;
  - `applicationKindOf(entry)`;
  - `isModeled()`;
  - `jurisdictionOf(lifecycleType)`.
- `ich-m4-headings.ts` (new): structural rows for M2, M4 and M5 (code, title, parent, basis, `ectdElement?` once the DTD is vendored) and `isIchHeading(code)`.
  - Examples: 2.1, 2.6, 2.7, 4.1, 4.2.1, 5.3.1.1–4, 5.4.
  - The CMC lane appends the M3 skeleton through the same type. There is never a second Module 3 tree.
  - A test keeps it disjoint from the `CTD_AUTHORING_GUIDANCE` keys.
- `application-coverage.ts` (new): `APPLICATION_COVERAGE` (`ApplicationCoverage[]`) and `compositionOf(entry)`.
- `requirements-resolver.ts` (new): `resolveRequirements`, plus the engine projections.
  - It absorbs `CSR_ALIASES`, the code dispatch and the lifecycle dispatch from `regulatory-knowledge-tools.ts`.
  - Projected engines (cer-structure, per-structure, tech-doc-assembler, pma-mapper, ctr-annex-i) import only `./types` and `./regulatory-basis`, never `index.ts`.
- `document-reference.ts` (new): `resolveCtdDocumentReference`, the one "where does this go" matcher.
- `section-brief.ts` (extend):
  - `resolveSectionBriefSource(code, scope?)` gains the kinds `regional-m1` and `subsection`;
  - `renderSectionBrief(code, maxChars | { scope, maxChars })` adds the Basis line (`basisLabel`), regional notes (all of them, labelled, when there is no scope), and the "US (FDA) Module 1, assumed" label with equivalents;
  - `renderOutlineBrief(outline, section?)` is added, and `renderE3Brief` and `renderLifecycleBrief` become wrappers over it.
- `device-dossier-toc.ts` (new, R14): `DEVICE_DOSSIER_TOC`, `deviceSectionsFor(pathway, family)` and `renderDeviceBrief`.
- `periodic-safety-reports.ts`, `protocol-m11-guidance.ts`, `jp-ctn.ts` (new, R13): `DocumentOutline` data.
- `jp-programs.ts` (new, R13): a satellite record on the same basis type. It holds conditional approval as amended in 2025, SAKIGAKE, orphan, priority review, the paediatric plan duty and the consultation types. It is not a tree.
- `submission-chain.ts` (extend): §5.
- `fda-technical-rules.ts` (shrink): keeps `ELSA_NOTE` and the derived views `FDA_TECHNICAL_RULES`, `PLR_FORMAT_RULES` and `rulesByArea` over `RULE_CORPUS`, so the import paths of `labeling-authoring.ts` and `labeling-intelligence-knowledge.ts` are kept.
- `index.ts`: re-exports everything above, including the shared Module 1 data.
- `authoring-guidance.ts` and `lifecycle-document-types.ts`: targeted edits only, after the in-flight lanes commit.

**EXTENDED outside `ind/ctd` (one home each, kept)**
- `server/services/ectd/validation-rule-corpus.ts`: the acceptance registry (§5).
- `server/services/ectd/required-sections.ts`: the pack-bound resolver is unchanged.
  - `requiredSectionsFor(registryId, facts)` moves here from `ectd4-validator.ts`.
  - It draws Module 1 from `requiredModule1` and M2–M5 from `ich-m4-headings` applicability.
  - It returns `required`, `undetermined` and `notApplicable`.
- `server/services/ectd/ectd-regional-rules.ts`: `ectdPathFindings(path, region, version)` reads the path-limit corpus rows, and `FILENAME_PATTERN` is derived from corpus params.
- `server/services/ectd/pdf-leaf-conformance.ts` (new, F77): `assessPdfLeaf(bytes, {acceptedVersions})`, the one leaf measurement every gate uses.
- `server/services/pathway-engines/ctis/ctr-annex-i.ts` (new, F41): `CTR_ANNEX_I` rows B–R, with Part I/II, per-member-state and `ctisSlug`. Registered as outline `eu-ctr-annex-i`.
- `server/services/pathway-engines/shared/slot-def.ts` (new, F72): `always`, `whenFlag`, `whenApplicable` and `evalSlot`, extracted from estar-mapper. Created only in the commit where `pmda-shonin` adopts it.
- `server/services/market-specs/software-lifecycle.ts` (extend, F71): `fdaDocumentationLevel()` and `FDA_SOFTWARE_DOCUMENTATION_SET`.
- `server/services/regulatory-currency/currency-registry.ts`: the dated facts.
- `server/services/regional-ctd-templates.ts`: `module1Sections` is derived via `toCtdSection(h)`, and `CTDSection` stays its projection type. `commonModules` is derived from `ich-m4-headings`. NMPA and MFDS stay, labelled "not modeled".

**Tests and gates**
- `tests/regulatory/regulatory-basis.test.ts`
- `tests/regulatory/regional-module1-one-answer.test.ts`
- `tests/regulatory/rule-pack-parity.test.ts`. This generalises and replaces `ind-required-set-agrees-with-rule-pack.test.ts`; the old file is deleted in the same commit.
- `tests/regulatory/requirements-resolver.test.ts`, with a regression snapshot.
- `tests/regulatory/ctd-contract.ts` (extracted from `fda-module1-numbering.test.ts`) and `tests/regulatory/ctd-registry-consistency.test.ts`.
- `tests/regulatory/common-text-us-token-ratchet.test.ts`
- `tests/regulatory/ich-backbone-parity.test.ts`
- `tests/regulatory/no-copied-dates.test.ts`
- `server/services/ind/ctd/__tests__/record-purity.test.ts`. It also walks `shared/regulatory/regional-module1.ts` and `regulatory-basis.ts`.
- `server/services/ind/ctd/__tests__/device-dossier-toc.test.ts`
- `scripts/ci/check-ctd-registry-inventory.mjs`, with `-baseline.json`, the npm scripts `ci:ctd-registry-inventory` and `:selftest`, wired into `.husky/pre-push`.

---

## 7. The resolver

**Scope precedence**, resolved once in `jurisdiction.ts scopeFrom()`:

1. Explicit input wins.
2. Otherwise the open program. This is one org-scoped read beside `resolveOpenProgram` (`c2c/program-access.ts:211`) of `regulatory_programs.primary_agency`, `product_type`, `program_type` and `target_agencies`. That read is placed once in `regulatory-knowledge-tools.ts` and reused by the drafting paths through the same helper.
3. Otherwise the document's registry entry.
4. Otherwise none.

A read that throws sets `programRead: 'failed'`, and the answer says so. An agency outside US/EU/JP sets `notModeled`.

**Routing in `resolveRequirements`, in order:**

1. **Outline aliases.**
   - csr/e3 → `csr-e3`
   - protocol/csp → `protocol-m11`
   - dsur → `dsur-e2f`
   - pbrer/psur → `pbrer-e2c-r2`
   - pader → `pader-314-80`
   - ctn/治験計画届 → `jp-ctn`
   - eu cta/ctis/annex i → `eu-ctr-annex-i`
2. **A CTD code** (`normalizeCtdCode`, which stays a strict placement gate):
   - **Module 1, jurisdiction EU or JP** → `REGIONAL_MODULE1[j]`, never a US entry. A code absent from that tree → `not_indexed` ("not encoded; do not supply from memory").
   - **Module 1, jurisdiction US or no scope** → `CTD_AUTHORING_GUIDANCE` depth plus the US tree node. With no scope it is labelled `assumed: 'US'`, and `alternatives = equivalentsOf('US', code)` plus the EU and JP *same-number* meanings.
   - **Modules 2–5** → the ICH entry, with `basisFor` and `regional[j]`. With no scope, every regional note is shown with its label.
   - **A parent code** → a listing of its children. **A subsection code** (2.5.6.4) → its parent's subsection node.
3. **A device token** (`/^CH\d/`) → `device-toc`. The family comes from input or product. If it is missing and the token differs between nIVD and IVD, both answers are returned, labelled.
4. **A lifecycle id** → the lifecycle brief, with component headings in the type's own jurisdiction.
5. **A registry id or alias** (`resolveToRegistryEntry`) → `compositionOf(entry)`, filtered by `APPLICATION_COVERAGE` status:
   - eCTD/CTD → that region's M1 tree with `requiredModule1(j, kind)`, plus the ICH M2–M5 listing;
   - eSTAR → the device ToC pathway outline;
   - MDR/IVDR tech doc → the tech-doc-assembler outline;
   - CER/PER/CEP → the cer/per-structure projection;
   - EU CTA → `eu-ctr-annex-i`;
   - PMA → the pma-mapper 814.20 projection, once it is projected;
   - `not-indexed` (JP_SHONIN/STED, IMDRF, CA/UK/other Module 1) → `not_indexed` with `sourcesOwed` and `readInstead`.
6. **Free text** → `resolveCtdDocumentReference`. A unique match is answered; ties return `candidates`.
7. **Anything else, or `notModeled`** → `not_indexed`.

**Budget.** The answer still fits `RESULT_BUDGET` (5000). Basis is compacted to `ref (confidence)`, and every renderer gets a cap test and a brief mode. The labeling area is already at 4886 (F11), so its notes are trimmed before any rule is added.

---

## 8. AnA tools

**No new tools. Four are deleted. Three record tools share one scope resolver.**

1. **`get_document_section_requirements`** (content).
   - Inputs: `document` (required), `section`, `jurisdiction` (US|EU|JP or FDA/EMA/PMDA), `product`, `application` (registry id or alias), `family` (nivd|ivd).
   - Output: the existing JSON shape, pinned by the R2 regression snapshot, plus:
     - `scope` (jurisdiction, product, application, from, programRead);
     - `match`;
     - `basis` (compact);
     - `alternatives`;
     - `assumed`, `candidates` or `read_instead` where they apply.
   - Routing: §7.
   - The description and `persona.ts:338` say "FDA, EMA and PMDA; drugs, biologics, devices and IVDs; pass jurisdiction and product; the record is per regulator and the tool states which one it used". The EU/JP and device vocabulary in the description lands in the same commit as the content it advertises.

2. **`plan_submission_from_database_lock`** (sequence).
   - Inputs: `step` and `jurisdiction`.
   - Chain selection: `chainFor(j)`, and the output states `chain_used`.
     - Unknown scope: the US chain with `jurisdiction_assumed: 'US'`.
     - Another agency: "no chain indexed for <agency>".
     - Device or IVD product: "no post-lock chain indexed for device pathways; use assess_pathway_readiness / assemble_device_submission".
   - `readVaultFacts` builds its WHERE clause from the chosen chain's Vault evidence sections, replacing the `'1.14%'` literal at `regulatory-knowledge-tools.ts:199`. It also reads `folder_id` and `evidence_kind`.
   - The standing adds `misfiled` and `afterFiling`. Post-filing nodes stay out of `next` unless an `applicationFiled` fact exists.
   - `step` detail prints the checklist, deliverables and `basisLabel` for each.

3. **Acceptance rules: `list_validation_rules` survives** (recommended, because it is already region-aware and backs `GET /validation-rules` and `market-specs/regulatory-capabilities-index.ts:40`). The founder confirms the name; both names never coexist.
   - Inputs: `region`/`jurisdiction`, `area`, `product`, `pathway` and `include_elsa_note`. The region defaults from the program.
   - Each rule is returned with `basis`, `outcome`, `consequence`, `platformCheck` (derived from enforcement), the enforcement statement and `verbatim` where present.
   - A region or area with no regulator-text rule returns `not_indexed` with the regulator URL to read.
   - `ectd-backbone-validity` (F81) carries a runtime line: vendored DTD count, xmllint availability and the resolved external validator name. These come from the existing probes, and the line never changes the static `not-checked`.
   - The handler moves from `AnaToolExecutor.ts:9976` into `regulatory-knowledge-tools.ts`, registered through the injected `register`. Routes `submissions.ts:297` and `knowledge.ts:148` keep calling the corpus functions.

**Deleted.** Each deletion is preceded by the CLAUDE.md history search, and its commit names the replacement by path.

| Tool | Removed from | Replacement |
|---|---|---|
| `get_ctd_module_home` | `bla-biologics-tool-defs.ts:258-271`, handler `AnaToolExecutor.ts:6076`, `AnaToolDefinitions.ts`, `ana-launch-scope.inventory.json`, `tool-authorization.register.json`, `tests/services/biologics/ana-tools.test.ts:8` | `get_document_section_requirements({document:'m1', jurisdiction})`, pinned by `regulatory-knowledge-registration.test.ts` |
| `list_fda_technical_rules` | def and handler, `tool-pedigree.ts:163`, `agentic-loop.ts:680`, `persona.ts:340`, `submission-chain.ts:220` gate text, ALWAYS_ON | `list_validation_rules` (above). Pins move in the regulatory-knowledge-registration, regulatory-knowledge-tools, submission-center-tools and tool-selection-routing tests |
| `ind_generate_section`, `ind_get_status` | `AnaToolDefinitions.ts` (~998-1036, ALL_ANA_TOOLS 2313-2314), `AnaToolExecutor.ts` handlers, `tool-authorization.register.json:2378-2386`, `ana-launch-scope.inventory.json:794-795`; `intelligence-questions/engine.ts:458` action → `draft_authoring_document` | `get_document_section_requirements`, then `draft_authoring_document` (`server/services/ana/document-surface-tool-defs.ts`, pinned by the `docs/design/ANA_DOCUMENT_CANVAS.md` gate) or `batch_draft_sections`. There is no project-level IND progress replacement, and the commit says so |

**Kept, reading the record.** These answer different questions, so they are not parallel copies:
- `advise_ctd_structure` answers placement through `document-reference.ts`. Retiring it into get_document_section_requirements(free text) is a founder call.
- `resolve_regulatory_structure` keeps its review clocks; its section list comes from `requiredSectionsFor`.
- `get_document_template` and `get_csr_template` have derived spines.
- The `classify_*`, `assess_pathway_readiness` and `build_pathway_manifest` engines are kept.

**Routing (`tool-selection.ts`).**
- `ALWAYS_ON_TOOLS` adds the three record tools under their final names. If R6c lands before R12, it uses today's name, and R12-C3 renames the entry.
- `tokenize` emits dotted codes, CH tokens and annex keys, matched at code boundaries, scoring +3 on a name match and +2 on a description match.
- The routing eval runs on the launch-scoped pool with SELF_DRIVE pins, and adds EU MAA, PMDA, EMA-validation and device phrasings.
- The 29-case eval and the tight-cap tests are re-run.

**Chat context.**
- `submissionContextBlockFor(application)` (in `server/services/ana/`) replaces the hand-written IND block at `send-message.ts:610-634`. It contains `renderLifecycleBrief(ind_initial|nda|bla)`, the drafting route, and, for an IND, the IB stated as required unless the sponsor is a sponsor-investigator.
- It is also called from `server/routes/ana-ri/stream.ts` and added to the `chat-path-parity.test.ts` assertions, or the exclusion is recorded there.

---

## 9. Consumers: migrations and deletions

Format: **consumer**, then today → after, then *deleted (replacement)*, then the step.

### A. AnA tools and prompts
- **`regulatory-knowledge-tools.ts` documentSectionRequirements.**
  - Today: no jurisdiction or product. EU/JP 1.2, 1.3.3, 1.3.4 and 1.9 get FDA meanings; EU 1.3.1, 1.8.2 and 1.10, `maa`, `jnda`, `510k`, `cer`, `per`, `protocol` and `pbrer` are not_indexed; M2–M5 carry unlabelled 21 CFR 314 text.
  - After: a thin wrapper over `resolveRequirements` with program defaults (§7, §8).
  - *Deleted: the inline `CSR_ALIASES` and dispatch (moved into `requirements-resolver.ts`).*
  - Steps: R2, R6a, R6b.
- **`send-message.ts` IND block** → `submissionContextBlockFor`. *Deleted: the hand block and two tools (§8).* Step R6e.
- **`persona.ts:336-359`.**
  - After: pass jurisdiction and product; the record is per regulator.
  - *Deleted: the FDA-only acceptance instruction and the hand-listed order (derived from `SUBMISSION_CHAIN`).*
  - Steps: R6c, R11.
- **`tool-selection.ts`**: ALWAYS_ON and the tokenizer. Step R6c.

### B. Module 1 readers (one record; each commit removes its line from the inventory and one-answer baselines)
- **`regional-ctd-templates.ts`** (feeds region-profile-service, `requiredModule1CodesForRegion`, the assess-dispatch-readiness Module 1 gate, body-aware-authoring, market-submission-specs and document-template-library).
  - After: `module1Sections` derived; `commonModules` derived from `ich-m4-headings`.
  - *Deleted: the three module1Sections literals (moved) and the commonModules literal.*
  - Steps: R4, R5.
- **`regulatory/ctd-module-structure.ts`** + `routes/biopharma/ctd.ts`.
  - Today: M1_FDA/M1_EMA/M1_PMDA literals, with JP off by one; `normalizeRegion` sends CA/CN/AU/BR/IN/KR/SG to FDA and UK/CH to EMA.
  - After: `getModule1Structure` maps `moduleOneTree(j)`. `normalizeRegion` returns `CtdRegion | null`, and the route renders "Module 1 for <region> is not modeled".
  - *Deleted: the M1_* literals and the REGION_TO_CTD fallbacks.*
  - Step R7.1.
- **`global-ri/regional-module1-requirements.ts`** (global_ri_strategy_brief, workspace-config-enrichment, module1.routes, maa-module1.routes).
  - After: component codes become roles, and `section = placementFor(role, j)`. The other five markets are flagged "not regulator-checked".
  - *Deleted: the FDA/EMA/PMDA section literals.*
  - Step R7.2.
- **`reasoning-engine/rule-data.ts`** M1_FDA/M1_EU/M1_JP and ICH_COMMON (`resolve_regulatory_structure`).
  - After: derived from `requiredModule1` and `ich-m4-headings`.
  - *Deleted: all four literals.*
  - Step R7.3.
- **`ctd-ingestion-service.ts` PMDA Module 1 rows.** *Deleted (derived).* Step R7.4.
- **`ectd-regional-rules.ts` PMDA-004**, which warns on every correct J-NDA, and the `regional-packager.ts:14` comment. *Deleted.* Step R7.5.
- **`registry/adapters/ctdBlueprintNormalizer.ts` MODULE_1_TEMPLATES** (us/eu/jp blueprints → sectionBlueprintCatalog → submissionPackageBuilder → AnA submissionIntelligenceTools, Submission Readiness).
  - After: `module1Rows(j, kind)`, sorted with `compareSectionCode`. CA and DEFAULT stay, flagged, with no FDA-colliding codes.
  - *Deleted: MODULE_1_TEMPLATES.US/EU/JP and the `localeCompare` sort.*
  - Step R7.6.
- **`shared/regulatory/project-bootstrap.ts`** CTD_SECTIONS M1, MASTER_FILE_SECTIONS M1 and the `*_ctd_m1_regional` blueprints (read by projectBootstrapFromRegistry, submissionPackageBuilder, canonicalDocumentStore, readinessEvaluator, registryValidation, globalDocumentRegistryService and AnaDocumentDraftingService).
  - After: US/EU/JP keys and the per-region master-file Module 1 come from `module1Rows` (a pure shared import). Other regions get "Module 1 — <region> not modeled". The DMF splits into a 3.2.S body plus a per-region Module 1.
  - *Deleted: the hand-typed M1 rows.*
  - Step R7.7.
- **`regulatory/requiredArtifactMatrix.ts` EU_MAA.**
  - After: codes from `placementFor`: pil 1.3.1, rmp 1.8.2, era 1.6, pv 1.8.1, paediatric 1.10 (findings 31/39).
  - *Deleted: the literal codes.*
  - Step R7.8. EU_CTA follows in R13.
- **`intelligence/template-seeds.ts`** (fda_nda_module1, ema_maa_module1, pmda_nda_module1).
  - After: M1 sections built from `module1Rows`, with an overlay carrying only criticality and content guidance. A new `TEMPLATE_ROW_VERSION` row is written and older versions are deprecated (§2.9).
  - *Deleted: the hand M1 arrays and the agencySpecificNotes numbers.*
  - Step R7.9.
- **`pdev/pdev-activity-registry.ts` and `ectd-fallback-templates.ts`**: codes corrected and held by the consistency gate. Step R7.10.
- **Dead copies**: `templateCatalog.ts` (replacement: document-template-library via `get_document_template`); `routes/concept2cure.ts` TEMPLATES and its two routes (replacement: `/api/c2c/templates`); `getCTDModuleStructure` and the JSON `ctdModuleStructure` (no caller). Each is deleted after the git history search. Step R7.11.

### C. Placement ("where does this go")
- **`ana-ri/document-routing.ts` DOCUMENT_PATTERNS** (context-enrichment draft prompt, `/draft`).
  - Today: IB → 1.3.3, cover letter → 1.1, clinical pharmacology → 4.2.1, "2.5 mg" → 2.5, and "not placeholders".
  - After: `resolveCtdDocumentReference`, then the node's brief, with the canonical placeholder rule.
  - *Deleted: the M1–M5 `ctd_section` rows, the US 1.14 row and the "not placeholders" sentence.*
  - Step R9.
- **`ana/ctd-structure.ts` (advise_ctd_structure).**
  - After: module mode lists `getCtdGuidanceForModule` plus `ich-m4-headings`; document mode returns the code, title, module, alternatives and jurisdiction, with the 5.3.5.3 ISS/ISE note.
  - *Deleted: `MODULES.sections`, `placementCues` and `placeDocument`.*
  - Step R9.
- **Vault classifier**: `vault-filing.service.ts classifyForFiling`, `ctd-ingestion-service.ts` detectCTDSection, SECTION_PATTERNS, REQUIRED_SECTIONS and DEFAULT_REQUIRED, and `POST /api/ctd/projects/:id/validate`. The D5 Vault lane is notified first.
  - After: a title index from `document-reference`. FilingInput gains `agency` from `primary_agency`. FDA form numbers keep FDA codes. Module 1 goes through `placementFor`. An unknown agency → the module-1 folder with a null section (Unfiled). `validateCTDCompleteness` reads `ectd/required-sections.ts`.
  - *Deleted: the SECTION_PATTERNS numbers, REQUIRED_SECTIONS/DEFAULT_REQUIRED and the TEXT_RULES IB → module-5 rule.*
  - Step R9.
- **`biostatistics-bridge/filing-placement.ts`.**
  - Its CTD codes are registered in the consistency gate in R5.
  - In R9 its `ApplicationType` becomes `Extract<ApplicationKind, …>`. Each placement that names a CTD code resolves that code through `ich-m4-headings` or `placementFor`, so the code literals go. The deliverable semantics (SAP, DSMB charter, `not_applicable` reasoning) stay; they are its own domain.

### D. Drafting paths (R8; scope from the open program, gated by framework)
- **`AnaDocumentDraftingService.resolveSectionRequirements`** (batch_draft_sections, `/api/claude/batch`).
  - After: `resolveRequirements` for CTD-framework entries. A non-US M1 code with no node gets "not indexed; do not supply from memory". `fda_510k` "Device Description" goes to the device ToC, never CTD Module 3.
  - *Deleted: the blueprint M1 fallback.*
- **`csr-builder.ts:491/:597`**: the E3 brief with parent fallback. *Deleted: "Include all required elements per ICH E3" at both sites.*
- **`ana-ri/artifact-generator.ts`**: rewritten_section, revised_artifact and attach_to_dossier append the node brief. Memo types get nothing.
- **`lumen-context/sections.ts:428-440`** and **`ana-ri/orchestrator.ts:66`**: `renderSectionBrief(code, {scope})`.
- **`authoring/section-generation-service.ts:68-69`**: the same, **only after 2026-10-05 17:10 UTC**. `requirementsSource` names the tree and match.
- **`ind/ctd/index.ts buildSectionGenerationPrompt`** (routes/ind-generation.ts, the knowledge-base auto-draft): resolves through `resolveSectionBriefSource` and prints `basisFor` refs (R3). `getCtdAuthoringGuidance` is kept for `GET /guidance/:code`.

### E. Required sets, rule packs, readiness (R10)
- **`validate-completeness-engine.ts`** (`/api/validate-completeness`, scoreSubmissionDraft, runDeficiencyRiskForDraft).
  - After: `requiredSectionsFor(registryId)`. Presence uses `sectionMatches`. Every missing required node is a blocker. Devices return `not_assessed`, pointing to estar-filing-readiness. Prediction refuses a `not_assessed` profile.
  - *Deleted: the commonCTD/ANDA/505(b)(2)/MAA/device arrays and TYPE_MAP `MAA:'NDA'`/`CTA:'IND'`.*
- **`ectd4-validator.ts`.** *Deleted: `requiredSectionsFor`, IND/NDA/BLA_M2_M5, `module1Required` (all moved to `required-sections.ts`) and `ECTD_FILENAME_PATTERN` (corpus, R12).* The "2-6-2" text is also deleted (R12).
- **`ectd/required-sections.ts`**: `FALLBACK_REQUIRED_MODULES` becomes a labelled derivation from `requiredSectionsFor`.
- **Rule packs** `nda:fda`, `bla:fda` (ich-m4-v2.1), `anda:fda` (v1.0) and `jnda:pmda` (v2.1).
  - After: one migration mints nda/bla `ich-m4-v2.2`, anda v1.1 and jnda v2.2 (with 1.11), each with ON CONFLICT DO NOTHING, a guarded `superseded_by`, 20260810c-style provenance and a row-count RAISE, before the final sweep pair.
  - `maa:ema` v2.2 is minted only if the founder decides the flags.
  - No in-place edit and no DROP. Old versions stay for scaffolded documents.
- **`services/regulatory/ind-ectd-sections.ts`**: three-way parity (`ind:fda` v2.2 pack = tree required set = `requiredSectionsFor('US_IND')`), then its flags derive. *Deleted: the hand-set required flags, after parity.*

### F. Chain and workflows (R11)
- **`submission-chain.ts`**, `plan_submission_from_database_lock` and `readVaultFacts`.
  - After: §5 and §8.
    - EU-only nodes: eligibility/letter of intent, PIP compliance 1.10, ERA 1.6, PV 1.8.1, RMP 1.8.2, readability 1.3.4.
    - `iss_analysis_plan`, and `safety_update` in post-filing.
    - Evidence matched by folder and kind; csr exclusions; misfiled.
  - *Deleted: the '1.14%' literal and the unconditional "FDA ESG" title, which is now read from `submissionChannelFor`.*
- **`submissionChannelFor`** (finding 42) is a new function in `server/services/regulatory/registry/submittabilityCoverage.ts`, and it is the one channel function. A centralised EMA filing → "unconnected: eSubmission Gateway / Web Client", not CESP. *Deleted: the EMA branch in `submission-resolver gatewayFor` and the restated channel prose in ema-cesp, market-submission-specs, workflow-orchestration and sop-generator.*
- **`ana-ri/workflow-orchestration.ts MAA_WORKFLOW`** and the `euMaaBlueprint` task text: amended in place, under a consistency test that its order never contradicts `chainFor('EU')`. *Deleted: the lumped maa-7 step and the CESP wording.*

### G. Acceptance rules and gates (R12)
- **`fda-technical-rules.ts` FDA_TECHNICAL_RULES and PLR_FORMAT_RULES**: rows move into `RULE_CORPUS`. `assess_plr_structure` and `plan_labeling_authoring` read the views. *Deleted: the local arrays.*
- **`ectd-regional-rules.ts` REGIONAL_RULES**: rows gain `corpusId` and read their title, severity, basis and enforcement from the corpus. *Deleted: the per-row source/description strings and the literal 180 and 64.*
- **Path and file names**: `market-submission-specs` (maxPathLength, fileNamePattern), `market-formatting-validator`, `ectd-structural-validator` (validateEctdPackage, validateEctdLeafs), `fda-criteria-adapter VALID_NAME` and `region-profile-service.validationRules` all use `ectdPathFindings` and the corpus `FILENAME_PATTERN`.
  - Tiers as rows: US v3.2.2 230 (criterion 1085, medium) and 150 (TCG, low/warning); US v4.0 180; EU 180 plus folder 64, counted from the sequence folder (confidence per the step's facts file); per findings 54/78.
  - `validateEctdPackage` gains `{region, ectdVersion}`, threaded from `routes/ectd-export.ts`. If the region cannot be inferred, the strictest limit is applied and the finding says so.
- **PDF leaves** (F77): `assessPdfLeaf` is used by `validateEctdLeafs` (submission-ops), `validateEctdPackage` (ectd-export) and `validateEctdPackageHardened`.
  - FDA-ESG-006 is the single version rule, its text corrected to 1.4–1.7 / PDF/A-1/-2.
  - New ids: LEAF-PDF-IMAGE-ONLY, LEAF-PDF-BOOKMARKS, LEAF-PDF-FONTS and LEAF-PDF-ABSOLUTE-LINK. `buildLeafPdf` gains an outline.
- **Dispatch**: `JP_ECTD_V4_REQUIRED` reads the currency fact `pmda-ectd-v4-mandatory` with `asOf` passed explicitly (F46).

### H. Document outlines (R13; each copy derives in the commit that deletes its literals)
- **Periodic reports.**
  - Readers: ana-ri `document-templates.ts` dsur/psur_pbrer, `safety-reports/psur-dsur-service.ts`, project-bootstrap DSUR/PSUR, `pharmacovigilance-knowledge.ts AGGREGATE_REPORTS`, `ana/pharmacovigilance.ts` and the market-specs interim list.
  - Source: `periodic-safety-reports.ts`.
- **Protocol.**
  - Readers: ana-ri `ind_phase1_protocol`, `ana/medical-writing.ts`, `templates/clinical-csr-templates.ts`, `study-design/protocol-projection.ts` and `protocol-development/*`.
  - Source: `protocol-m11-guidance.ts`, with numbers kept as recall until the M11 Step 4 template is supplied.
- **CSR.**
  - Readers: the docx `templateRegistry` csr-ich-e3, `clinical-intelligence-service SEMANTIC_MODELS.csr`, the 8-node csr rule pack and the market-specs CSR copy (F1, F4, F80).
  - Source: the E3 tree. The `20260810c` csr/ib/protocol provenance is amended in place with a dated header (Rule 1).
- **2.5/2.7.x headings** in `document-templates.ts` derive from `CtdSection.subsections`.
- **SmPC**: `labeling/smpc-qrd-catalog.ts` is canonical. labeling-authoring `EU_REQUIRED`, labeling-structure `SMPC_SECTIONS`, labeling-intelligence-knowledge `SMPC_SECTION_STRUCTURE` and document-template-library `smpc` derive from it, with overlays keyed by number.
- **JP package insert**: `global-ri/labeling-requirements.ts` holds the new format (F47) plus an OBSOLETE map. JP 1.8 `pointsTo` it.
- **JP CTN**: `japanCtnBlueprint`, `global-ri/clinical-trial-application-requirements.ts` PMDA rows and `intelligent-report-engine.ts:237` derive from `jp-ctn.ts`. *Deleted: jp_ctn_cmc and jp_ctn_nonclinical.* JP_CTN becomes `submissionFormat 'regional'`.
- **EU CTA / CTIS**: `ctis-mapper.ts` slots are `CTR_ANNEX_I` rows, matched by `ctisSlug` or `documentType`. Part II requires `part-ii.<ms>.<slot>`, and "if applicable" is undetermined. `euCtaBlueprint`, `requiredArtifactMatrix.EU_CTA` and the CTIS placement vocabulary derive from the rows. *Deleted: the startsWith/titleHas matchers and the two extra CTIS lists.*

### I. Devices and IVD (R14)
- **`device/device-section-registry.ts`** (send-message device block, ind-generation `/device-status`). *Deleted, whole file. Replacements: `ind/ctd/device-dossier-toc.ts deviceSectionsFor`, and `market-specs/cer-structure.ts` / `per-structure.ts` for CER and IVDR context; pinned by `device-section-truth.test.ts`.*
- **`medical-device-knowledge.ts`** (commonUSSections, plan_device_submission), `lumen-context-builder.ts` device blocks and `market-specs/submission-requirements.ts` 510k/de_novo rows: rows come from `estarSlots()` and the ToC projection. *Deleted: the Form 3514 and 860.93 citations, the "level of concern" and 820.30 bullets, and the hand rows.*
- **`cer/cerConformanceValidator.ts`**: moves onto `mapStoredCerToCanonicalSections` + `assessCerStructure` (MDR) or the PER mapping + `assessPerStructure` (IVDR). `assessCerClassRules` covers Art 61(4)/(5) and 54. *Deleted: the private checklist.*
- **`pathway-engines/pmda/pmda-shonin.ts`**: slots on `slot-def.ts`, with an Essential Principles node, clinical data conditional on `clinical_data_required`, and route-aware via the JP classifier. *Deleted: the sted/E5 slots, codeStarts and local matchers.* JP_SHONIN stays `not-indexed` for STED content.
- **EU classification**: `market-specs/device-classification.ts` becomes the canonical `EU_MDR_RULES`/`EU_IVDR_RULES` with a basis per row. `regulatory/ivdr-classification.ts` holds `IVDR_CONFORMITY_ROUTES` once. The medical-device-knowledge `classify*`, global-ri `IVDR_CLASSES` and eu-ivdr prose become fact mappers or references. *Deleted: the inline rule bodies and CONFORMITY_ROUTE_BY_CLASS.*
- **JP classification**: `global-ri/device-classification.ts` adds JP_MD and JP_IVD (届出/認証/承認), returning JP_NINTEI, JP_SHONIN or JP_IVD_APPROVAL.
- **Post-market**: `gspr-postmarket/post-market-readiness.ts EU_POSTMARKET_OBLIGATIONS` is regulation-aware and fail-closed. *Deleted: `requiredTypes()`, the CITATION map, and `report-authoring buildPsur` with its three entry points (replacement: post-market-authoring).*
- **Software documentation (F71)**: `fdaDocumentationLevel` and the documentation set. Its readers are device-510k-auditor, pma-auditor, reviewer-personas, device-shadow-reviewer, the AnaToolExecutor SE row, se-discussion fixtures, `shared/regulatory/work-packages.ts:391`, CrossReferenceMapping, the docx templateRegistry, workflow-orchestration, ana-features, lumen-context-builder and mdx-software. *Deleted: the Level-of-Concern prose.* The PMA rule-pack node C.4 changes only through a new version row.
- **IVDR GSPR (F73 A)**: in document-template-library, `gspr_checklist` becomes MDR-only and `ivdr_gspr_checklist` is added (Ch I §1–8, II §9–19, III §20, all recall). The `submission-requirements.ts:234` ivdr_td row, the `tech-doc-assembler.ts:297` matcher and `market-registry.ts:108` point to it. Part B (IVDR outline v1.2) waits for the EUR-Lex re-read.
- **`estar-mapper`, `tech-doc-assembler`, `technical-file-packager`**: labels, authorities and annex keys come from ToC/annex nodes (slice 3). `codeStarts('4','5')` is deleted.

### J. Dated facts (R15)
- `currency-registry` gains the EU M1 v3.1.1/validation facts, JP eCTD v4 mandatory, QMSR, eSTAR 7.1/PreSTAR 3.1, MDR 2023/607 and IVDR 2024/1860 transitions, the E6(R3) EU in-force dates and the 2025 PMD Act amendment.
- Readers cite them through `factId`. `estar-versions.ts` gains `lastVerified`, `sourceUrl` and `confidence`, and reuses `verificationAgeDays`.
- *Deleted: copied date literals in market-submission-specs, electronic-submission-format, global-document-registry prose, locale-overlays:457 and eu-ivdr.ts:240-256.*
- Stale registry descriptions are corrected (LDT, 820.30, EU M1 v3.0). Registry ids and `active` flags are unchanged.

### K. eCTD backbone
- **`ectd-packager/ich-headings.ts ICH_BACKBONE`**: a parity test now (every section exists in `ich-m4-headings`). It is derived from `ectdElement` only after the DTD is vendored (finding 37, blocked on ops).

---

## 10. Gates

Each gate is shown failing before it is trusted.

| Gate | Fails on | Shown failing by |
|---|---|---|
| `regulatory-basis.test.ts` | a malformed regulator-text basis; one regulator URL bound to two constants | the M4E_R2 and ISS/ISE pairs at HEAD; mutation: drop `checked` from FDA_E3 |
| basis coverage (in `requirements-resolver.test.ts`) | any code, M1 node, outline node, chain node or corpus row resolving to an empty basis; M1 entries without an override that are not in the shrink-only baseline | the 115 entries at HEAD (no basis) |
| `record-purity.test.ts` | a runtime import from `regional-module1.ts`, `regulatory-basis.ts` or `types.ts` outside `shared/**`; an engine projected by the resolver importing `ind/ctd/index.ts` | a planted import |
| `regional-module1-one-answer.test.ts` | any Module 1 reader disagreeing with the record (JP package insert 1.8, RMP 1.11, form 1.2; EU 1.8.2/1.10 required, 1.3.2 mock-up; US 1.1 forms, 1.2 cover letter) | about 7 readers at HEAD, listed in a shrink-only expected-failures list |
| `ctd-registry-consistency.test.ts` + `check-ctd-registry-inventory.mjs` | a registered copy with a title contradicting the record; any *new* file holding code/title pairs outside a tree's `owner` file or the reasoned baseline | selftest plants a registry and must exit non-zero; mutation: retitle 2.7.3 |
| `common-text-us-token-ratchet.test.ts` | '21 CFR', 'FDA reviewer' or 'NDA' in common M2–M5 fields beyond the shrink-only baseline | 2.5, 2.7.3, 2.7.4 and 5.3.5.3 at HEAD |
| `rule-pack-parity.test.ts` | live pack code sets or mandatory flags differing from `requiredSectionsFor`. Titles are not compared; consistency covers titles | jnda 1.11; nda 1.19 'Environmental analysis', 1.14.4/1.14.5; anda 1.15.x |
| `ich-backbone-parity.test.ts` | an ICH_BACKBONE section absent from `ich-m4-headings` | a planted heading |
| `no-copied-dates.test.ts` | an ISO date or "since <year>" in `ind/ctd` or record text outside `checked` fields and `CHECKED` constants, unless its basis has a `factId` | the current copied dates (ratchet baseline) |
| `requirements-resolver.test.ts` regression snapshot | any change to today's US output during R2 | mutate one alias |
| `ci:migration-drop-safety`, `ci:migration-set-order` | Rule 1 violations in the R10 migration | existing selftests |

---

## 11. Migration order

Each step is one or more commits on `concept2cure-v2`, red first, with evidence filed and a typecheck over the whole tree. Parallelism: R12 may start after R1, R14 after R6b, and R13 after R2 once its lanes commit.

**R0 — Coordination (no code).**
- Wait for the batch-3 lanes to commit: `lifecycle-document-types.ts` (meetings-dsur), `ana-ri/document-templates.ts`, `ana/medical-writing.ts`, `AnaToolExecutor.ts`, `writing-precision-gate.ts`, `writingQualityTools.ts`, `dossierReconciliation.ts`, `promotional-screening.ts`, `truth-engine/figure-consistency.ts`, `terminology-consistency.ts`, `authoring-guidance.ts` and `csr-e3-*.ts`.
- Claim the new files on row D2 in `docs/work-orders/README.md`.
- Agree with `…01GJidg5` (CMC/Module 3):
  - `types.ts`, `ind/ctd/regulatory-basis.ts` and `ich-m4-headings.ts` are append-only shared files;
  - that lane appends the M3 skeleton and M4Q constants and owns all 3.x content;
  - there is never a second Module 3 tree.
- Notify the D5 Vault lane before R9's classifier commit.
- No edit to `authoring/section-generation-service.ts` before 2026-10-05 17:10 UTC.

**R1 — Provenance (S; no behaviour change; F5 prep, F67 type half).**
- 1a: `shared/regulatory/regulatory-basis.ts`; aliases in `types.ts`; `shared/ivd/types.ts` Citation adopts the type.
- 1b: `ind/ctd/regulatory-basis.ts`.
  - The shared constants move there, and `csr-e3-basis.ts` keeps its E3-only helpers.
  - The duplicate M4E_R2 and ISS/ISE constants in `submission-chain.ts` and `fda-technical-rules.ts` are deleted.
  - The meetings lane's local `recall()` helper is replaced by the import.
- Red: one URL bound to two constants (two pairs); the basisProblems mutation.

**R2 — Extract the resolver (S; pure refactor).**
- `requirements-resolver.ts`; `documentSectionRequirements` delegates.
- Red: the regression snapshot over every code, lifecycle id, CSR section and not-indexed key is shown failing on a mutated alias, then green unchanged.

**R3 — Section basis and prompt (M; F5, F75 step 1).**
- `CtdSection.basis?/regional?/subsections?` (types only); `moduleDefaultBasis` and `basisFor`; the Basis line in briefs; the coverage gate with the M1 baseline.
- `buildSectionGenerationPrompt` resolves via `resolveSectionBriefSource` and prints basis refs.
- Red:
  - prompt('2.7') is drafted as 2.7.1;
  - prompt('3.2.S.1') prints prose as "Governing reference";
  - brief('2.7.3') has no Basis line.

**R4 — The regional Module 1 record (M; F39a).**
- One commit: `shared/regulatory/regional-module1.ts`, created by *moving* the three `module1Sections`, with a basis, roles and applicability on every node. `regional-ctd-templates.ts` derives from it via `toCtdSection` in the same commit. Plus `record-purity.test.ts`.
- Red:
  - every M1 node has a basis (none do at HEAD);
  - EU 1.3.5/1.3.6/1.5.3 exist;
  - every role is used.

**R5 — Gates before consumers (S–M; F33 steps 1–2, F37 prep).**
- `ich-m4-headings.ts`; commonModules derived; `ctd-contract.ts`; `ctd-registry-consistency.test.ts`.
- The inventory script, selftest and baseline. The baseline lists every current copy (including `biostatistics-bridge/filing-placement.ts` and `ICH_BACKBONE`) with the step that removes it, and is wired into pre-push.
- `regional-module1-one-answer.test.ts` with an expected-failures list; `ich-backbone-parity.test.ts`.
- Red: the inventory selftest; the 2.7.3 retitle mutation; '4.3.1' is not an M4 heading.

**R6 — AnA's front door (six commits).**
- **6a (F40 c1–2):**
  - jurisdiction, product and application inputs; `scopeFrom` with program reporting; Module 1 only in its own tree; no scope → assumed US plus equivalents;
  - a targeted `authoring-guidance.ts` edit moves the US-only sentences of 2.5, 2.7.3, 2.7.4 and 5.3.5.3 into `regional.US`, and rescopes the 2.7.6 hyperlink rule (F8/F9);
  - the US-token ratchet.
  - Red: EU '1.2' is not the Application Form; JP '1.9' is PREA; EU '1.8.2' is not indexed; the EU 2.5 brief contains '314.126'.
- **6b (F40 c3):** registry ids, `APPLICATION_COVERAGE`, application composites and not-modeled regions. Red: 'maa' and 'jnda' are not_indexed today; 'CA_NDS' must be not_indexed, not FDA.
- **6c (F24, F51):** ALWAYS_ON, the tokenizer, the routing eval and the persona sentence. Red: "what goes in the ISS" and "what goes in the 2.7.3 summary for an EU MAA" are not offered the tool.
- **6d:** delete `get_ctd_module_home` (§8).
- **6e (F27):** `submissionContextBlockFor` (send-message and stream); delete `ind_generate_section`/`ind_get_status`; repoint `engine.ts:458`. Red: the block names a tool that returns 401; NDA is labelled IND; the IB is missing.
- **6f (F4):** US M1 entries 1.14.1.2, 1.16.1, 1.16.2.2, 1.18.1, 1.4.1 and 1.4.4, and `LifecycleComponent.heading` validated against the US tree. Red: those codes are not_indexed.

**R7 — Module 1 consumers (F39b–c, F31, F32, F79).** Eleven commits in the order of §9.B, each red first, each removing its baseline lines. R7.9 waits for the founder's decision on seed delivery.

**R8 — Drafting paths (F28, F74 remainder).** The §9.D commits; section-generation-service only after the window. Red:
- ('nda', '2.7.4') is null;
- an fda_510k "Device Description" is briefed as Module 3;
- an EU 1.3.1 brief is null;
- the CSR prompt carries only "per ICH E3".

**R9 — Where does this go (F25, F26, F29, F3).** `document-reference.ts` (candidates, code-boundary rule); `CtdSection.subsections` for 2.5.6, 2.7.2, 2.7.3 and 2.7.4 with the `subsection` kind; then one commit each for document-routing, ctd-structure, the Vault classifier (with `required-sections.ts` named as the replacement for REQUIRED_SECTIONS) and filing-placement. Red:
- the 115-title probe misfiles 20;
- '2.5 mg' matches 2.5;
- IB → 1.3.3;
- ISS → Module 2;
- Form 3454 → 1.1;
- renderSectionBrief('2.5.6.4') returns nothing.

**R10 — Required sets and rule packs (F30, F39d, F55; Rule 1).**
- `requiredSectionsFor` moves into `required-sections.ts`, and ectd4-validator, validate-completeness and dispatch `requiredModule1Codes` read it.
- The rule-pack migration; `rule-pack-parity.test.ts` replaces the IND-only test; three-way parity for `ind-ectd-sections`.
- Red: parity on jnda 1.11 and nda 1.19; an empty IVDR file is conditional_go; an NDA with no Module 5 is not blocked.
- `ci:migration-drop-safety` and `ci:migration-set-order` must be green.

**R11 — Chain by jurisdiction (F42, F43, F34, F20, F10, F38; one commit each).**
- `submissionChannelFor` first. Then: overrides and `chainFor`; EU nodes; the JP chain (recommended form, §2.14); evidence by folder and kind, csr exclusions and misfiled; `iss_analysis_plan` and the post-filing stage; checklists and deliverables; the plan tool's jurisdiction and fail-closed behaviour; the MAA_WORKFLOW amendment and consistency test; the persona order derived.
- Red:
  - `chainFor('EU')` has iss and "FDA ESG";
  - a SAP at 5.3.5.1 marks csr filed;
  - EU 1.3.1 labeling reads missing;
  - `evaluateChain([]).next` contains safety_update.

**R12 — One acceptance registry (F53 C1–C5, F54, F78, F46, F77, F81; ordered commits).**
- C1: PDF_NO_SECURITY becomes 'packager'. Red: the corpus says 'external' while four paths enforce it.
- C2: extend ValidationRule; fold the FDA_TECHNICAL_RULES and PLR rows into the corpus; derive `platformCheck`.
- C3: one tool. Delete `list_fda_technical_rules` with its pins and rename the ALWAYS_ON entry.
- C4: REGIONAL_RULES gain `corpusId`.
- C5: path-tier rows and `ectdPathFindings` on every gate; FILENAME_PATTERN derived. Delete ECTD_FILENAME_PATTERN and "2-6-2". Red: m5-3-5-3_iss.pdf passes for the US and fails for the EU; a 187-character EU path gives no finding; a 200-character US path gives no warning.
- C6: JP_ECTD_V4_REQUIRED. Red: a J-NDA sequence 0000 with asOf 2026-10-04 passes.
- C7: `pdf-leaf-conformance.ts` and the leaf rows. Red: a scanned 300-page leaf with no outline passes every gate.
- C8: the `ectd-backbone-validity` row and its probe line (F81).

**R13 — Document outlines (F7, F8, F44, F47, F48, F50, F80, F41; one commit each).**
- `DocumentOutline` with `owner`. Then: periodic-safety-reports (E2F moved from lifecycle, E2C(R2), PADER at 314.80(c)(2)); protocol-m11; jp-ctn and jp-programs; ctr-annex-i with the ctis-mapper rewrite; SmPC; JP package insert; CSR copies and the 20260810c amendment.
- Red, one per finding:
  - 'pbrer' '16.2' is not_indexed;
  - PADER cites 314.81(b)(2);
  - 'protocol' is not_indexed;
  - an NDA-shaped CTIS set reads ready;
  - the SmPC guard misses 6.3;
  - the JP insert lacks item 9;
  - the JP CTN carries a CMC package.

**R14 — Devices, in order (F70, F68, F57 slice 1, F72/F49, F64, F65/F66/F67/F63, F71, F73 A, then F57 slices 2–3).**
- The commits follow §9.I. Device coverage rows flip to `modeled` or `partial` only after their tree passes the basis gate.
- Red:
  - a 510(k) with no labeling reads ready;
  - '510k' is not_indexed;
  - a pacemaker classifies as IIb;
  - IVDR Class B is asked for a PSUR;
  - the GSPR template cites "Requirement 23" for IVDs;
  - the 510(k) auditor fires on `software_level_of_concern`.

**R15 — Dated facts (F45, F52, F60, F61, F50/F66 dates; S each).** Append the facts; `factId` on readers; `no-copied-dates.test.ts`; estar-versions provenance. Red: the current copied dates.

---

## 12. Risks

1. **Concurrency.**
   - Batch-3 lanes have uncommitted edits in `lifecycle-document-types.ts`, `document-templates.ts`, `medical-writing.ts`, `AnaToolExecutor.ts` and the writing gate. The CMC lane builds in `ind/ctd`.
   - Mitigation: R0 waits; only the R6a/R6f entries in `authoring-guidance.ts` are touched, after merge; the shared files are append-only by agreement; the in-flight E2F lands as written (§2.16).
   - If the meetings lane changes `E2fSection` further before committing, R13's move absorbs it.
2. **Client bundle.** The Module 1 data reaches the client through project-bootstrap. `record-purity.test.ts` must stay green; `import type` from `submission-type-bridge.ts` is erased at build. If purity ever breaks, the fix is in the data file, never a server import from `shared/`.
3. **Fabrication through recall.**
   - Regulator hosts are egress-blocked here, so most EU/JP, M11, STED, IVDR §6 and QRD statements start as recall.
   - Mitigations:
     - `basisLabel` on every rendered statement;
     - "content not encoded" for heading-only nodes;
     - `not_indexed` for unencoded documents;
     - promotion only with a facts row;
     - the persona tells AnA to say "recall" aloud.
   - Some changes cannot ship until a human reads the primary text, because seeded rows cannot be corrected in place: IVDR outline v1.2, M11 numbering as fact, ICH_BACKBONE derivation (DTD) and any JP chain node stated as regulator-text.
4. **Persisted data is not corrected.** Projects seeded with wrong Module 1 codes, `c2c_documents` bound to v2.1/v1.0 packs, Vault rows at 5.3.5 or 1.1, and seeded templates keep their values. Remediation is a founder decision, done as a data migration with an assertion.
5. **Type ripple.**
   - `normalizeRegion` returning null affects `routes/biopharma/ctd.ts` and reasoning-engine snapshots.
   - `renderSectionBrief`'s second parameter becomes `number | options`.
   - `E3Section` is generic and keeps E3's narrow `applies`, so there is no widening.
   - About 19 tests pin deleted tools or M1 literals and change in the same commits.
6. **Import cycles.** `market-specs/document-template-library.ts` and `ana-ri/document-templates.ts` import `ind/ctd/index.ts`. Projected engines must import only `./types` and `./regulatory-basis`. `record-purity.test.ts` checks this.
7. **Result budget and per-turn cost.** Scope, basis and alternatives push briefs toward 5000 characters, and labeling is at 4886. Three always-on tools add tokens to every chat, voice and deep-investigation turn. Brief mode and the cap tests are mandatory, and the routing eval is re-run.
8. **Parity is partial by design.** Packs and the record legitimately differ in title wording, so parity compares codes and mandatory flags only, and titles are caught by the consistency gate. Parity runs in vitest CI, not in pre-push. The inventory ratchet is what runs in pre-push.
9. **Half-migrated state.** A record added without the copy deleted is a second answer. Mitigations: deletion in the same commit; one-answer and inventory baselines that only shrink; a step is not done while its baseline lines remain.
10. **User-visible behaviour changes.**
    - Vault filing proposals change.
    - CTIS readiness flips from ready to not ready.
    - A centralised MAA becomes build-only, with no CESP and no connector.
    - New J-NDAs are blocked at dispatch until a JP v4 packager exists.
    - Stored IVDR classifications change, and drift-detection will flag them.
    - validate-completeness RTF features change.
    - The release note for each step names the change.
11. **Device token ambiguity.** CH tokens differ between nIVD and IVD. Every lookup needs a family; if it is missing and the token is ambiguous, both answers are returned and one is never silently picked.
12. **Naming debt.** `ind/ctd` holds EU, JP, device and IVD knowledge under an "IND" path. It is kept for import stability and documented in `index.ts`. A rename is a separate change that needs its own reachable-replacement evidence.

---

## 13. Deliberately NOT done

- **No new directory under `ind/ctd`, no rename of `ind/ctd` or `csr-e3-basis.ts`, no new AnA tool, no new surface, model or integration (Rule 2).** Specifically not built: an EDC connector, an EMA eSubmission Gateway connector, a JP eCTD v4.0 packager, or configuration of the Lorenz validator. Until a connector exists, each of these answers "not connected".
- **No new key vocabulary.** No ninth `Jurisdiction`, no shadow `ProductType`, no `TreeId`/`AppToken`/`CodeScheme`. The eight existing `Jurisdiction` types are not consolidated here; currency-registry's type covers ICH/GLOBAL and is a different domain.
- **No profile table restating registry attributes.** Coverage holds only status and sourcesOwed.
- **No Module 3 content.** That is the CMC lane (`…01GJidg5`). This design supplies only the M3 skeleton slot in `ich-m4-headings.ts`, `regional`, the basis type and the resolver.
- **No Module 1 trees for CA, UK, CH, AU, CN, KR, BR, IN or SG, and no JP STED or IMDRF content beyond what eSTAR names.** These answer `not_indexed` with what to read.
- **No correction of persisted data, no boot-time re-seed, no in-place edit of a version row, no DROP.** The 20260810c provenance amendment (R13) is an in-place amendment of the creating file, with a dated header, per Rule 1.
- **No ICH_BACKBONE derivation before the DTD is vendored** (F37). No IVDR outline v1.2 before the EUR-Lex re-read (F73 B). No M11 numbers stated as fact before the template is supplied.
- **No retirement of `/api/ind-generation`.** That is a founder or Authoring decision.
- **No edit to `section-generation-service.ts` before 2026-10-05 17:10 UTC. No Vault taxonomy or ingest changes beyond the classifier codes, and those only after notifying D5.**
- **Findings not addressed by this architecture, and why:**
  - **Already landed, or in flight in batch 1–3:** 0, 1, 2, 6, 9, 11, 16, 18, 19, 21, 22, 23. Their outputs are absorbed: the meetings-dsur E2F and timelines (§2.16) and the PLR rows folded in R12.
  - **Writing-QC and reconciliation lane, not the record:** 12, 13, 14, 15, 17.
  - **Study-data conformance and Vault datasets, which belong to the Vault/Submission Readiness lanes:** 35, 36, 56, 76.
  - **Device engine decision defects with their own lanes:** 58, 59 (the QMSR crosswalk), 62 and 69. When those lanes correct their citations, they type them with `RegulatoryBasis` and dated facts through `factId`.

---

## 14. Founder decisions

1. The surviving acceptance tool name. Recommended: `list_validation_rules`.
2. How corrected seed templates reach deployed databases. Recommended: a new version row with the old one deprecated. Open question: may the boot seeder write it, or must a migration?
3. The `maa:ema` mandatory flags (1.3.2, 1.9, 1.10), and whether to mint v2.2.
4. Whether eSTAR, PMA, CTIS and Shōnin outcome rows go in `RULE_CORPUS` as `'pathway-engine'`.
5. The JP post-lock chain. Recommended: recall-labelled regional nodes with transmission failing closed. The alternative is to fail the whole chain closed.
6. Remediation of persisted projects, documents, Vault rows and seeded templates.
7. Supplying primary texts: the ICH M11 Step 4 template, an EUR-Lex IVDR Annex II §6 re-read, QRD v10.4 and the PMDA PDFs. Vendoring the eCTD DTDs is an ops task.
8. Whether to retire the `/api/ind-generation` engine.
9. Whether to author CA, UK, CH and AU Module 1 trees.
10. New integrations: the EMA gateway, the JP eCTD v4 packager and the Lorenz validator.
11. US path-limit severities. Recommended: 230 error, 150 warning, and 180 for v4.0. Also whether US underscores are accepted. Recommended: keep the strict ICH set.
12. PDF leaf severities. Recommended: version and image-only as errors; bookmarks, fonts and links as warnings.
13. Whether completeness prediction refuses to score unprofiled types. Recommended: yes.
14. Whether Japan devices and IVDs are inside a current launch D-row.
15. Whether `advise_ctd_structure` is retired into `get_document_section_requirements`.
16. Where the `applicationFiled` fact comes from, for example Submission Center sequence state. This is optional.
17. A member-state column, or CTIS slugs, for CTIS Part II.
18. Whether to keep the US_LDT registry entry.

---

## 15. Finding coverage map

| Step | Findings |
|---|---|
| R1 | 5 (prep), 67 (type) |
| R2 | 40 (prep), 74 (prep) |
| R3 | 5, 75 (step 1) |
| R4 | 39 (a), 4 (data) |
| R5 | 33 (steps 1–2), 37 (prep) |
| R6 | 40, 24, 51, 27, 4, F8/F9/F10 follow-ups |
| R7 | 39 (b–c), 31, 32, 79 |
| R8 | 28, 74 |
| R9 | 25, 26, 29, 3 |
| R10 | 30, 39 (d), 55 |
| R11 | 42, 43, 34, 20, 10, 38 |
| R12 | 53, 54, 78, 46, 77, 81 |
| R13 | 7, 8, 44, 47, 48, 50, 80, 41, F1/F3/F4 follow-ups |
| R14 | 70, 68, 57, 72, 49, 64, 65, 66, 67, 63, 71, 73 (A) |
| R15 | 45, 52, 60, 61, 50, 66 |

**Covered (57):** 3, 4, 5, 7, 8, 10, 20, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 57, 60, 61, 63, 64, 65, 66, 67, 68, 70, 71, 72, 73, 74, 75, 77, 78, 79, 80, 81.

**Not covered (25), with reasons in §13:** 0, 1, 2, 6, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 35, 36, 56, 58, 59, 62, 69, 76.
