# Scientific catalog fact contract: D2/D5 implementation specification

2026-10-14. Read-only specification for `/workspace/Concept2Cure`, `concept2cure-v2`, HEAD `87b27c897c5d1be20b0527009bcaf425ebbf3af6`. No application edits, dependencies, APIs, migrations, tests or commits performed. Proposed file names below are implementation ownership seams, not files already created.

## Smallest useful release

Extend the current Vault catalog with source-anchored fact items and per-fact human review. Keep its document description, `key_data`, whole-document read receipts, existing confirmation/correction endpoints and existing governed audit chain. Add one durable fact-event table; its current-state projection is part of the same catalog service. No second catalog, graph database, general scientific truth engine, new application surface or agency-release shortcut.

**D2 outcome:** a value can be found with the source context that identifies what it measures; another assay's, arm's or configuration's value cannot silently inherit the proposed label.

**D5 outcome:** each candidate, evaluation, acceptance, rejection or correction names its source/version, fact revision, actor and reason; AnA cannot replace a person's accepted fact or make that person's decision.

Phase A delivers source-stated facts for existing Vault/Authoring use. It does not widen the US IND CMC composition gate, agency packaging or dataset intake. The device/IVD branches enable catalog facts inside existing Vault; their new scientific validators require domain fixtures before enablement. A computed fact uses the existing run registry only after its method is admitted by the parallel computation contract. Before then it is rejected as unsupported rather than accepting a model's figure.

## Current source seams

| Existing seam | Exact current location | Extension |
| --- | --- | --- |
| Model tool input and attribution | `server/services/ana/document-catalog-tool-defs.ts:109`; `document-catalog-tools.ts:433`, `:453`, `:475` | Optional discriminated fact-proposal operation on the existing tool; keep old input valid and attribution server-derived |
| Legacy presence and whole-read gates | `server/services/vault/document-catalog-core.ts:363`; `document-catalog.service.ts:324–339` | Keep old checks; new pure anchored-fact verifier checks a bounded context, not an arbitrary key |
| Atomic suggestion/audit | `server/services/vault/document-catalog-governance.service.ts:170` | Reuse transaction/audit pattern; facts-only proposals must leave confirmed description unchanged |
| Human revision locking | `document-catalog-governance.service.ts:268`, `:302`, `:368` | Reuse role/reason/program-source checks; independent per-fact compare-and-swap with source and extraction hashes |
| Existing record read shape | `document-catalog-governance.service.ts:436`, `:482` | Add optional typed-fact summary and paged items; preserve legacy fields and legacy revision meaning |
| Catalog routes | `server/routes/c2c/project-vault.ts:2117`, `:2134`, `:2166` | Add narrowly scoped fact-list/propose/review routes adjacent to this existing resource |
| Existing UI | `client/src/concept2cure/v2/surfaces/VaultCatalogRecord.tsx:19`, `:94`, `:136`, `:227` | Add fact rows and detail/correction inside this panel; existing kind/purpose/summary form stays |
| Clinical semantics | `server/services/truth-engine/clinical-claims/types.ts:190`, `:235`; `clinical-claims.ts:87`, `:93` | Adapt parsed clinical frames/values/locations; do not implement another clinical comparator |
| Current drafted-claim checks | `server/services/authoring/authoring-from-draft.ts:337`; `section-claims-check.ts:239` | Catalog accepted facts can become additional grounded inputs; keep the existing save checks authoritative |
| IVD calculations | `server/services/stats/analytical-performance.ts:49`, `:203`; `analytical-performance-extensions.ts:348` | Source-stated results first; admitted computed references reuse these engines, never an LLM estimate |
| Canonical lineage | `server/services/clinical-regulatory-evidence/lineage-gate.ts:360`; `span-lineage.service.ts:256` | Link supported uses to existing source spans; human fact acceptance does not turn paraphrases into verified quotes |
| Eligibility/change handling | `server/services/vault/document-catalog-eligibility.ts`; `document-data-disposition/derived-impact.ts:47` | Recheck source eligibility; retained-original/withdrawn-data states remain distinct |

Implementation files: shared `shared/ana/catalog-facts.ts` for the contract; pure `server/services/vault/catalog-fact-verification.ts`; persistence/review functions in the existing governance service, with a small helper file only if complexity requires it. UI uses the shared shape rather than creating another interface copy. Root/control tower owns routing and migration-set edits.

## Discriminated contract

These are JSON-compatible TypeScript contracts. UUID/hash/date validity, enum membership, bounded sizes and discriminant-specific required fields are checked at the request boundary. Source scope, extracted text, validation, actor, model, IDs and review status are assigned or verified by the server; they are not accepted as model attestations.

```ts
type UUID = string;
type Sha256 = string;
type Range = { start: number; end: number }; // half-open offsets into exact stored extracted text

type WrittenValue =
  | { kind: 'scalar'; asWritten: string; unitAsWritten: string | null }
  | { kind: 'bound'; asWritten: string; relation: '<' | '<=' | '>' | '>='; unitAsWritten: string | null }
  | { kind: 'range'; asWritten: string; unitAsWritten: string | null }
  | { kind: 'approximate'; asWritten: string; unitAsWritten: string | null }
  | { kind: 'identifier' | 'date' | 'text'; asWritten: string };

type SourceAnchor = {
  documentId: UUID;              // concrete Vault version row, not title-derived family
  contentHash: Sha256;           // original bytes
  extractedTextSha256: Sha256;   // server hash of the exact stored text; re-extraction may change it
  range: Range;
  exactQuote: string;
  // Optional only if extractor/server can verify them; never a guessed page or cell.
  locator?: { page?: number; table?: string; row?: string; column?: string; cell?: string };
};

type Witness = {
  path: string;                  // allowed semantic field path, not an arbitrary new schema key
  anchor: SourceAnchor;          // may be a table heading/footnote outside the value's row
};

type SourceText = string | null; // null = unknown/not stated; mandatory acceptance fields cannot remain null
type ClinicalMeaning = {
  kind: 'pharma_clinical';
  component: 'count' | 'percent' | 'denominator' | 'estimate' | 'lower' | 'upper' | 'p';
  productRef?: string;           // canonical project product reference or source-stated ID
} & (
  | { frameState: 'complete'; frame: ClaimFrame }
  | { frameState: 'incomplete'; partialFrame: Partial<ClaimFrame>; missing: SlotName[] }
);
type CmcMeaning = {
  kind: 'cmc_result';
  property: 'assay' | 'impurity' | 'particle_size' | 'storage_condition' | 'retest_period';
  productRef: SourceText; batchAsWritten: SourceText; materialAsWritten: SourceText;
  methodAsWritten: SourceText; resultRole: 'measured_result' | 'specification_limit';
  conditionAsWritten?: string;
};
type DeviceMeaning = {
  kind: 'device_test';
  property: 'bench_result' | 'acceptance_criterion';
  deviceRef: SourceText; configurationAsWritten: SourceText; testMethodAsWritten: SourceText;
  endpointAsWritten: SourceText; resultRole: 'measured_result' | 'acceptance_criterion';
  softwareVersionAsWritten?: string; testConditionAsWritten?: string;
};
type IvdDiagnosticMeaning = {
  kind: 'ivd_diagnostic';
  property: 'sensitivity' | 'specificity' | 'positive_agreement' | 'negative_agreement';
  assayRef: SourceText; analyteAsWritten: SourceText; specimenAsWritten: SourceText;
  referenceAsWritten: SourceText; referenceBasis: 'reference_standard' | 'comparison_method' | 'not_established';
  cutoffAsWritten: SourceText; populationAsWritten: SourceText;
  denominatorAsWritten: SourceText; // positives or negatives under the named reference, with a witness
  instrumentAsWritten?: string; reagentVersionAsWritten?: string; softwareVersionAsWritten?: string;
};
type IvdAnalyticalMeaning = {
  kind: 'ivd_analytical';
  property: 'lob' | 'lod' | 'loq' | 'repeatability_sd' | 'repeatability_cv' | 'within_lab_sd' | 'within_lab_cv';
  assayRef: SourceText; analyteAsWritten: SourceText; specimenAsWritten: SourceText;
  methodAsWritten: SourceText; designAsWritten: SourceText;
  concentrationAsWritten?: string; lotAsWritten?: string; siteAsWritten?: string;
};
type Meaning = ClinicalMeaning | CmcMeaning | DeviceMeaning | IvdDiagnosticMeaning | IvdAnalyticalMeaning;

type Origin =
  | { kind: 'source_statement'; valueAnchor: SourceAnchor; witnesses: Witness[] }
  | { kind: 'deterministic_computation'; runId: number; outputPath: string;
      inputsSha256: Sha256; outputsSha256: Sha256; method: string; methodVersion: string };

type FactCandidate = {
  schemaVersion: 1;
  meaning: Meaning;
  value: WrittenValue;
  origin: Origin;
  // Existing key_data path, only a link back to the legacy display; never a verified field label.
  legacyPath?: string;
};

type Check = {
  state: 'passed' | 'failed' | 'not_established';
  reasons: Array<{ code: string; path?: string; explanation: string }>;
};
type Evaluation = {
  evaluatorVersion: string;
  candidateSha256: Sha256;
  textSha256: Sha256 | null;
  transcription: Check;
  context: Check;                // source subject/measure relation, not scientific adequacy
  comparison?: { outcome: 'consistent' | 'conflict' | 'not_compared'; reason?: ClaimReasonCode };
};
type Review = {
  action: 'accept' | 'reject' | 'correct' | 'retract';
  basis: 'source_context' | 'deterministic_computation';
  reason: string;
  contextualWitnesses?: Witness[]; // human-supplied bindings when a parser did not establish a relation
  originalVerification?: { basis: 'human_original_review'; documentId: UUID; contentHash: Sha256;
    locatorAsReviewed: string; outcome: 'matches_extraction' | 'extraction_disagrees'; note: string };
  actorId: number; actorName: string | null; recordedAt: string; auditId: string;
};
type FactView = {
  factId: UUID; revision: number; lastEventId: string;
  candidate: FactCandidate; evaluation: Evaluation;
  review: Review | null;
  reviewState: 'proposed' | 'accepted' | 'rejected' | 'retracted';
  contextBasis: 'deterministic' | 'human_review' | 'not_established';
  sourceState: 'current' | 'superseded' | 'text_changed' | 'data_withdrawn' | 'unavailable';
  originalFileAvailable: boolean;
  usability: 'accepted_source_fact' | 'proposal_only' | 'needs_review' | 'unavailable';
};
```

**Clinical reuse detail:** the complete existing `ClaimFrame` is referenced above, but a model does not fabricate absent slots to satisfy the TypeScript shape. A parser returns the existing `Claim` or `Unframed` result. The latter is a persisted proposal with named missing slots, never an automatically compared/accepted claim. Shared transport types should use the existing shared vocabulary and a serializable projection of the internal frame; do not import server code into the browser bundle.

**Numeric detail:** values remain strings as written, including trailing zeros, comparison operators and local typography. Reuse existing token/normalization and `WrittenNumber` rules. Do not automatically sum arms, change denominator, equate percentage points with proportions, convert units or turn a bound/approximation into an exact scalar. An optional normalized value is server-derived index metadata and must not replace the source text displayed or hashed.

**Origin detail:** model-proposed source_statement is permitted only after exact source-range validation. A computation branch is emitted only from a verified server result/run; a model can name a run/output but cannot supply authoritative output numbers, hashes or method qualification. Unsupported methods yield `COMPUTATION_METHOD_UNAVAILABLE`.

**Input bounds:** initial proposal maximum 50 facts, 20 witnesses per fact, 2,000 characters per anchor quote and 100,000 serialized characters per batch. These are explicit transport limits, not document coverage limits. Refuse oversize input before a write and state which limit was hit; the fact-list endpoint pages independently. Do not clip a quote/footnote and claim the same evidence.

**OCR original review:** the optional originalVerification is a named human assertion, never a model-generated or automatically verified fact. The server binds it to the authenticated reviewer and exact original version, checks original availability and records its statement. An extraction_disagrees result cannot accept the numeric fact. Reprocess/correct extraction or resolve through the future verified original-region contract, then make a fresh candidate. A reviewer cannot change an extracted 950 to 95 and still assert an exact matching quote at the old anchor.

## Proposal and review behavior

1. Resolve organization/principal from request scope; resolve the open project's program with `catalogScope`. Read the exact Vault version with existing eligibility/ownership checks. An unavailable/cross-tenant source is 404, not a distinguishable leak. A source retained under keep_data carries original availability caveats; remove_data and supersede are refused for new current-use proposals.
2. For Phase A AnA proposals, preserve the existing full-text-delivery coverage gate. A precise fact anchor is not permission to label the whole document studied. The parallel passage-receipt work can later admit a facts-only proposal from proven task-specific ranges without changing description comprehension semantics.
3. Inside the write transaction, lock the Vault version and obtain its exact stored extraction. Verify byte hash, text hash, exactQuote/ranges and every required context witness. Reject malformed/out-of-range/nonmatching quotes and any value absent from its value anchor. Model text is untrusted data throughout.
4. Run deterministic context adapters. Clinical adapters reuse extraction/comparison; simple CMC/device/IVD adapters identify an explicit subject→measure→value relationship in the anchored sentence/row and its headers/footnotes. Restrict automatic passes to supported forms. If a required relationship is absent or ambiguous, persist an anchored proposal with `context.not_established`; if a clearly different subject/metric is parsed, persist a failed-context proposal. Neither is silently usable as an accepted fact.
5. Append candidate plus evaluation events and chained audit in one transaction. Return per-item facts/statuses and complete counts. No successful item is claimed when the transaction rolls back. A bounded proposal batch (initial maximum 50 facts) is all-or-nothing for structural/source validation; anchored context failures may be persisted as visible proposals. Public review is initially one fact per request, avoiding partial batch approvals.
6. A person reviews a specific `factId`, `revision`, `lastEventId`, candidate digest, byte hash and text hash shown. Re-read and lock the current version before deciding. Compare-and-swap checks all bindings. A catalog header review never implicitly accepts typed facts, and accepting one fact never confirms the whole catalog header.
7. Accept requires transcription passed, complete required context, current source eligibility, and either deterministic context passed or a human context binding with exact source witnesses and stated reason. Hard source/quote mismatch, a proven different subject/measure or an unsupported computation cannot be waived. Correct the candidate and re-evaluate instead. Human review records `contextBasis: human_review`; it does not counterfeit a deterministic pass.
8. A correction creates a new candidate revision and fresh evaluation; it appends history and records the previous revision/reviewer/reason. It may accept the corrected source fact atomically only if the same accept conditions pass. Reject/retract append decision events. AnA can suggest a separate replacement proposal linked to the previous fact but cannot correct, retract or accept a decided fact.
9. Source supersession/re-extraction/withdrawal changes **usability**, not historical acceptance. Do not rewrite a previously accepted event to proposed. Preserve who accepted which evidence, show it stale/unavailable for new drafting, and create review work through existing change-impact services. A newly uploaded version gets new source-bound candidates; no acceptance is automatically inherited by title or matching value.
10. Member/Vault write authority permits a catalog data review as current governance does. Do not label every member a qualified domain expert. Domain qualification for deployment is evidenced through the client workflow/assigned reviewer and the acceptance corpus. Regulatory document approval/e-sign uses the existing signing ceremony separately; fact acceptance is not scientific sufficiency, study validation, release approval or agency acceptance.

### Existing tool/API compatibility

- Keep the existing `catalog_project_document` call (document_id, document_kind, purpose, summary, optional key_data) unchanged. Add optional `record_type: 'description' | 'facts'`, default description. A facts operation requires document_id and `fact_candidates`; description fields are not required for that discriminant. Use explicit JSON-schema branches and regression cases so old callers remain valid. Tool policy remains a governed suggestion write under the same authorization classification; no signature/accept tool is added for AnA.
- Optional facts alongside a description are written in the same transaction as the description. A confirmed/corrected description still refuses replacement. For an existing confirmed header, `record_type: facts` appends fact proposals and leaves kind/purpose/summary/key_data/state/revision untouched. This avoids asking a person to undo a valid header decision to review new facts.
- Existing GET catalog fields and legacy review routes retain their meanings. Add `typedFacts: { available, counts, firstPage?, nextCursor? }`; limit the initial embedded page, preserve exact counts, and expose GET `.../catalog/facts?cursor=...` for subsequent pages. A store/read failure is unavailable with its error, never `facts: []` meaning assessed-empty.
- POST `.../catalog/facts/propose` serves the governed suggestion service; POST `.../catalog/facts/:factId/review` serves human actions. Both live in current project-vault routes, use server actor/context, and write through the existing governance boundary. Review body supplies expected bindings, action, reason, optional corrected candidate/context witnesses and a requestId for idempotency.
- List/search/re-read recall may return typed accepted facts with explicit sourceState/contextBasis/review provenance. Unaccepted facts are labeled proposals; legacy values remain labeled recorded key data. Do not flatten typed accepted facts into old key_data and erase their distinctions.

### Errors and HTTP outcomes

| HTTP/code | Condition/action |
| --- | --- |
| 400 `INVALID_FACT_SCHEMA` | Unsupported discriminant, unknown semantic property, malformed value kind or oversized batch; no writes |
| 400 `FACT_REVISION_REQUIRED` | Reviewer omitted expected fact/version/event bindings; no writes |
| 401 `ACTOR_REQUIRED`; 403 `VAULT_WRITE_ROLE_REQUIRED` | No verified principal or insufficient existing role |
| 404 `DOCUMENT_NOT_FOUND` / `FACT_NOT_FOUND` | Not readable in this tenant/project, absent or unavailable parent |
| 409 `SOURCE_VERSION_CHANGED` / `EXTRACTION_CHANGED` | Original bytes/version or extracted-text hash no longer matches the reviewed evidence |
| 409 `FACT_CHANGED_SINCE_SHOWN` / `FACT_ALREADY_DECIDED` | Stale CAS or AnA attempts to replace a human decision |
| 409 `SOURCE_DATA_WITHDRAWN` | Current source data is removed/superseded; refresh or resolve impact |
| 422 `ANCHOR_MISMATCH` / `VALUE_NOT_IN_ANCHOR` | Claimed exact evidence not found at claimed offsets; no invention stored |
| 422 `CONTEXT_REVIEW_REQUIRED` / `CONTEXT_MISMATCH` | Cannot accept ambiguous or conflicting subject/measure/context; show named missing/different fields |
| 422 `ORIGINAL_VERIFICATION_REQUIRED` | OCR numeric fact lacks recorded original verification when accepting |
| 422 `REASON_REQUIRED` | Reuse governed reason minimum; require it on every per-fact human decision |
| 503 `FACT_STORE_UNAVAILABLE` / `FACT_VERIFICATION_UNAVAILABLE` | Store, eligibility or checks could not be established; no successful write claim |
| 503 `COMPUTATION_METHOD_UNAVAILABLE` | Requested computed branch has no admitted reproducible method |

A dropped response after commit is **unknown outcome**; use requestId replay and reload, consistent with the current panel's `call()` behavior (`VaultCatalogRecord.tsx:56`). The same requestId with different payload/bindings is 409 `IDEMPOTENCY_CONFLICT`, never silently accepted.

## Legacy semantics

The present review audit explicitly says key data is not edited and the decision covers it **as shown** (`document-catalog-governance.service.ts:415`). Preserve that real historical decision. Do not relabel a confirmed legacy record as unreviewed or retrospectively claim it had source-context verification. Display separate lines: “Catalog record confirmed by X” and “Recorded key data: values checked in source text; property/context binding not recorded.” Pre-attribution rows still follow `catalogStateOf` (`:42`), including an unknown proposer.

No automatic migration of JSON key labels into scientific property types. A user or AnA can propose a new anchored typed candidate with `legacyPath` referring to the old value. The typed candidate begins proposed and receives its own decision. Correcting it never rewrites old key_data or old audit history. The first release does not add bulk legacy “confirm all facts.”

## Minimal persistence/migration plan

Use one **public.document_catalog_fact_events** table, rather than mutable JSON inside the single current catalog row. Reason: per-fact reviews must retain immutable candidate revisions and independent decisions when the catalog description is re-suggested, a source is superseded or an individual fact is corrected. The existing chained audit is reused; no second audit-chain design is needed.

Proposed columns: `id BIGSERIAL PRIMARY KEY`, `organization_id INTEGER NOT NULL REFERENCES organizations(id)`, `program_id UUID NOT NULL`, `document_id UUID NOT NULL`, `source_content_hash CHAR(64) NOT NULL`, `extracted_text_sha256 CHAR(64)`, `fact_id UUID NOT NULL`, `fact_revision INTEGER NOT NULL CHECK (>0)`, `event_type TEXT NOT NULL`, `previous_event_id BIGINT`, `candidate_sha256 CHAR(64) NOT NULL`, `payload JSONB NOT NULL`, `request_id UUID NOT NULL`, `actor_id INTEGER`, `actor_kind TEXT NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`. Event types initially `proposed`, `evaluated`, `accepted`, `rejected`, `corrected`, `retracted`; computed events have no fictitious source-text hash. Event payload contains the complete revision snapshot for proposed/corrected events and exact evaluation/review binding for subsequent events.

- Every event points at the same-org/program Vault version; add a guarded composite unique key `(id, organization_id, program_id)` to existing vault.documents and a corresponding event FK, plus the existing same-org regulatory_programs FK. This is an additive index/constraint, not changed identity or an ownership backfill. Refuse facts on unattributed Vault rows; do not guess a tenant to satisfy a new FK.
- Add same-org/document/fact previous-event FK binding (a matching unique target key in this new table), uniqueness for requestId/event role, and indexes `(organization_id, document_id, fact_id, id DESC)` / `(organization_id, program_id, id DESC)`. Make the payload hash canonical using existing stable serialization; source/candidate checks remain server-enforced, not an assertion that JSON-schema shape proves meaning.
- To append a decision, lock the parent Vault row (existing lock order), read latest event for this fact, compare expected lastEventId/revision/digests, then insert event+chained audit in one transaction. For first proposals the same parent lock also serializes deduplication. Independent fact decisions do not alter `vault.document_catalog.updated_at`, so unrelated facts do not invalidate the header review or each other's CAS. The coarse parent lock is acceptable for initial human review volume; benchmark before introducing another lock subsystem.
- A catalog-fact read is a projection of events: latest candidate revision + latest evaluation and decision for that same digest/version, with source eligibility evaluated now. It preserves old accepted/rejected revisions for detail/history. It is not a second mutable authoritative table. Pagination must cover all current fact IDs and report real totals; no audit history silently truncated as complete.
- **Enforce** append-only behavior with guarded UPDATE/DELETE/TRUNCATE triggers and runtime privilege revocation. Insert-only service code is insufficient, as the review found in stats runs. Reuse the repository's owner-run tenant-purge pattern and immutability verification; integrate export/purge before new tenant content can be stored, preserving audit according to existing retention policy. Do not add an unrestricted SECURITY DEFINER escape hatch.
- One replay-safe creating migration: CREATE TABLE/INDEX IF NOT EXISTS; conditionally add constraints by pg_constraint; documented immutable-field trigger functions and guarded trigger creation. Register it in `C2C_MIGRATION_FILES` before child/RLS isolation tail (`scripts/db/migration-set.mjs:3194–3220`). New table is public with integer organization_id, as CLAUDE.md requires. Preserve program-access restrictions in explicit parent policies where needed; tenant sweeps alone are not role checks or project-access proof. Rerun the complete migration set twice and prove no accepted event or constraint is lost. No DROP migration; any later removal must follow Rule 1.
- No rewrite/backfill of existing description or key_data rows, no widening old CHECK constraints in a later file only, no fabricated model attribution, no new production dependency.

## Expert-designed acceptance corpus: 20 meaningful fixture groups

Expected results are specified before the validator code; they are not copied from engine outputs. Each case carries exact bytes/text/hash/ranges, candidate, expected state/reasons, required/forbidden pairings and expert rationale. Each valid source case has an adverse mutation differing by one material relationship. Preserve the existing 431-case clinical corpus intact; add these catalog adapters/integration cases around it rather than reusing test names to claim device qualification.

Table snippets are the distinguishing excerpts, not complete fixtures. F01–F03 share a source-stated header that explicitly names analyte, adult-plasma specimen, reference standard, population, cutoff and denominator for each assay, with separate exact witnesses. The original minimal two-sentence counterexample alone lacks that mandatory context and must remain not_established for a full IVD fact; it still proves that the legacy arbitrary label is unchecked. Every other positive fixture likewise supplies each discriminant's required context in its own source/header or a verified canonical project record, never manufactured by the test adapter.

| ID | Source/operation | Required behavior and forbidden inference |
| --- | --- | --- |
| F01 Two assays, faithful | `Assay A sensitivity: 95.0%. Assay B sensitivity: 99.2%.` Candidate A=95.0% | Transcription/context pass; stays proposed until human review; never automatically accepted |
| F02 Two assays, swapped | Same source, A=99.2% anchored to B's sentence | Value presence alone cannot pass A context; `CONTEXT_MISMATCH`; accept refused; correction A=95.0 has a new revision |
| F03 Invented number | Same source, A=98.4% | `VALUE_NOT_IN_ANCHOR`; no candidate/audit success event persisted |
| F04 Clinical populations | DPL-301 ITT N=300, safety-treated N=292 | ITT candidate cannot use treated N; compare only identical frame; preserve `population_differs` |
| F05 Treatment arms | Drug response 47%; placebo 31%; stated doses | Drug candidate anchored to placebo is failed context; do not choose another 47 elsewhere or combine arms |
| F06 Data cuts/analyses | Interim 2025-06-30 ORR 47%; final 2025-12-31 ORR 42% | Final candidate cannot inherit interim rate; missing cutoff remains needs_review; separate correct source facts remain valid |
| F07 Endpoint/estimand | Same study OS HR0.72; PFS HR0.62; sensitivity estimand elsewhere | Match endpoint/analysis/estimand; same number in another frame does not validate; existing comparator reasons retained |
| F08 Biotech pool context | Safety pool studies A+B N=612; long-term A-only N=220 | No pool→single-study or all-exposure→long-term equivalence; membership/scope mismatch is explicit |
| F09 CMC lot and method | CoA batch23-104 HPLC assay99.20%; batch23-105 titration99.2% | Preserve value-as-written, method and lot; no rounding-away provenance or lot substitution; same key labels do not imply same material |
| F10 CMC specification vs result | Actual impurity0.08%; specification≤0.10% | Distinguish measured result/limit; bound stays bound; never file0.10% as observed impurity |
| F11 Device configuration | Leakage0.8mL/min RevA firmware1.2; RevB firmware1.3 leakage1.1 | A result does not support B configuration; witnesses must name configuration/software; missing firmware requires review when material |
| F12 Device criterion vs performance | Measured burst450kPa; required minimum400kPa, test methodP-17 | Do not treat400 as measured result or qualification verdict; no model inference of pass; deterministic criterion evaluation is separately scoped |
| F13 IVD specimen | Serum sensitivity95.0%, plasma92.0%, same assay/analyte/reference | Serum result cannot label plasma; context failure even if95 occurs elsewhere; accepted serum fact is not plasma applicability |
| F14 IVD cutoff | Cutoff0.4 sensitivity95%, cutoff0.8 sensitivity90%, specified population | Cutoff must bind to result; no universal assay sensitivity; a cutoff change makes existing target-use assertion need review |
| F15 IVD comparator meaning | Compared with methodPCR-X: PPA95%; clinical reference-standard sensitivity absent | Store positive_agreement; reject sensitivity label; do not promote comparison_method to reference_standard by model assertion |
| F16 IVD analytical precision/LoD | LotL1 plasma LoD0.2ng/mL; lotL2 serum LoD0.5; repeatabilityCV3%, within-labCV5% | Bind matrix/unit/lot/design and property; no unit conversion, CV substitution or universal LoD; admitted computed counterpart must name exact engine output |
| F17 OCR numeric ambiguity | Original scan95.0, OCR950 or low-confidence merged table header | Typed proposal visible with OCR caveat; numeric accept requires recorded original witness; no fabricated page/cell when extractor supplied none |
| F18 Same bytes, changed extraction | Accepted item/source byte hash constant, re-extraction changes text offsets/header mapping | Old event remains accepted historically; new-use state text_changed; stale acceptance request refused despite same contentHash |
| F19 Race and idempotent retry | Two reviewers read revision1; one corrects; other accepts old lastEvent; response lost after commit | Stale reviewer409, no duplicate acceptance; identical requestId replays original result; different payload409; audit/event rollback atomic |
| F20 Tenant/legacy/withdrawal | A submits B fact ID; viewer accepts; confirmed legacy key_data migrates; original keep_data then remove_data | Cross-tenant404/no leaked evidence, viewer403; legacy confirmation preserved without typed pass; keep_data discloses original absent, remove_data makes new use unavailable; no rewriting historical decision |

F20 is a small lifecycle fixture family, not one broad assertion; each transition must have its own expected event counts and forbidden reads. Add independent PostgreSQL concurrency/RLS checks for F19/F20, not only a single PGlite connection. Include a held-out domain reviewer cohort for labels/footnotes/language variants. A Japanese/other-language unsupported form may remain `not_established`; do not claim multilingual scientific parsing until its corpus is reviewed.

## Verification/release gates

1. **Contract/pure red→green:** F02/F03 fail against current value-presence behavior; typed verifier refuses or explicitly flags them. Test exact offsets, exponent/bound/precision preservation, overlapping/table-context witnesses and unsupported forms. No test merely asserts that the new schema's enum exists.
2. **Clinical regression:** existing `clinical-claims.test.ts`, `section-claims-check.test.ts`, draft figure checks and saved-source reference tests continue passing; no expanded automatic equivalence without expert expectations. Device/IVD tests do not weaken pharma rules.
3. **Real PostgreSQL D2/D5:** extend `tests/db/document-catalog-governed.dbtest.ts`, catalog role and tenant isolation fixtures for fact events; prove current-source recheck, per-fact CAS, request retries, revoke/withdrawal, append-only privileges and event/audit rollback together. Two separate clients race on the same and different facts. App service, RLS on; owner test fixtures cannot stand in for isolation.
4. **Browser D2:** within existing VaultCatalogRecord, propose two anchored facts, accept one, reject/correct another, reload and inspect source quote/original, then show stale extraction. Source facts, legacy record and whole-header state are visibly distinct. Failed read and unknown write outcome are not success or empty states. Test reviewer keyboard workflow and visible mobile facts, not just container text.
5. **Migration/lifecycle:** from-empty and already-provisioned replay twice; migration-set order/drop-safety checks; new-table isolation and immutability sweep; tenant export/purge contains new content and authorized removal respects retention policy. Preserve existing approved legacy record snapshots.
6. **Model/governance:** approved serving model context supplies attribution; forbidden accepting tool invocation produces no review event. Existing signer ceremony and document release/export gates remain independent. Feature flag defaults off until corpus, DB and UI gates pass for each enabled fact family; deterministic read of existing legacy catalog remains available without AI keys.
7. **Evidence filing:** D2 evidence under `docs/evidence/D2-SCIENTIFIC-CATALOG/<date>/` for anchors, usability and UI; D5 under `docs/evidence/D5-SCIENTIFIC-CATALOG/<date>/` for attribution, review, audit chain and races. Update URS/traceability only for behavior actually tested. Record exact commit, migration set, validator/corpus versions and test posture.

## Dependencies and handoff boundary

- Passage team owns nonzero/multiple source-range receipts; this fact contract depends only on exact anchors and text hashing, so Phase A can use existing whole-read delivery receipts first.
- Processing team must expose stable stored-text identity and changed extraction, not infer it from `updated_at` (catalog review also updates that timestamp). The verifier can initially hash exact server-loaded text per request; persist processor version/coverage when that shared contract lands.
- Computation team owns admitted method/run/output contracts and span linkage; facts must consume that contract and refuse unsupported methods. Do not duplicate analytics or manufacture runs from narrative values.
- Impact team owns use edges and reviewed recheck jobs. Catalog acceptance history is an input; stale source status does not by itself prove every downstream context changed.
- Control tower owns schema, route/tool union, tenant lifecycle and launch-definition reconciliation. UI/fact implementation starts only once these interfaces are accepted by team owners; no mass architecture implementation, new branch or live provider needed to prove this slice.
