# The "regulatory AI platform blueprint", against this repository — 2026-10-25, updated 2026-11-01

**Why this exists.** On 2026-10-18 the founder asked what the platform has, needs and must complete
against an industry blueprint for regulatory AI. The blueprint names nine capabilities and one
example tool for each:

| Capability | Example tool |
|---|---|
| Hierarchical document parsing | LlamaParse, Unstructured |
| A knowledge graph | GraphRAG on Neo4j |
| Deterministic multi-agent workflows | LangGraph, CrewAI |
| No-code AI templates | Dify |
| A zero-retention gateway | Langfuse, Azure AI Foundry |
| Evaluation | Promptfoo, DeepEval |
| An audit ledger | Amazon QLDB |
| A mock health-authority reviewer | Pydantic AI |
| Regulatory-change QA | — |

On 2026-10-25 the founder said to finish the work. This record holds the answer and what was then
done. It extends `OSS_AI_TOOLING_FIT_ASSESSMENT_2026-07-30.md`, which judged ten other open-source
tools the same way. Work since 2026-11-01 is bound by the one plan (`docs/design/ONE_DESIGN_PLAN.md`,
P-78) and RULE 6 (P-80): each remaining item below names the plan package that owns it.

## The verdict on the named tools

None is adopted. Each is either already present here in governed form, or would open a second path
for regulated text to leave the platform outside the AI gateway (`server/services/ai-gateway`).

| Tool | Verdict |
|---|---|
| **Amazon QLDB** | AWS ended support for it in July 2025. The ledger here is the per-tenant hash chain in `audit_logs`, HMAC-sealed, append-only by trigger and grant, with the chain head anchored daily to S3 Object Lock (`server/services/audit/chain-anchor.ts`). That is the right design. |
| **LlamaParse** | A hosted service: it would send dossier text to a third party. The self-hosted Docling and Unstructured clients exist behind flags that are off (`server/integrations/docling`, `server/integrations/unstructured`). |
| **LangGraph, CrewAI, Dify** | Rejected 2026-07-30 and by P-37 (a workflow designer is new capability). The four-agent council and the Submission Center package orchestrator already run sequential, persisted steps. |
| **Promptfoo, DeepEval** | The PQ harness exists (`server/eval/pq/`). The gap is that it has never run (P-56), not a missing framework. |
| **Langfuse** | The gateway log stores prompt hashes, not text, by design. A trace store of prompts would become a PHI store. |

## Capability by capability

### 1. Hierarchical document parsing

**What already exists:**
- Vault text extraction: `server/services/ocr/extractDocumentText.ts` (pdf-parse, mammoth, exceljs, Tesseract).
- Page-aligned chunks with exact offsets: `server/services/vault/document-chunking.service.ts`.
- Span lineage: `document_span_lineage`.
- Section columns on `vault.document_chunks` that nothing wrote.

**Done:**
- `66f09c814`: each Vault chunk stores its section, section path and table type, and the citation
  locator keeps the page beside the section (`server/services/vault/document-section-structure.ts`).
- `edbd4d073`: `/api/document-understanding` returned invented bounding boxes for every element,
  table cell and form field. It now returns null where no position was measured.

**Owed:**
- Tables that span pages. Table cells are read since P-90 (2026-11-01), when a deployment turns the
  Docling reader on. A table split across two pages is still two tables.
- AnA's two looser heading detectors (`document-analysis.ts` `detectHeading`,
  `ana/document-search-core.ts` `extractHeadingOutline`) should converge onto `detectHeadingLine`
  (zero duplication; S4).

### 2. Knowledge graph

**What already exists:**
- `/api/graphrag`, over Postgres `knowledge_graph_nodes` and `knowledge_graph_edges`. No screen calls
  it (R1).
- CMC change control mapping to the affected Module 3 sections: `module3Composer.ts`
  `impactedSectionsForChangeControl`.
- Vault where-used.
- The living-record spine. It is created on a fresh install only.

**Owed:**
- The blueprint's example, a site change reaching registrations in 90+ countries, is outside the
  catalog: registrations wait for a marketing application (P-37, P-74) and the regions are five
  (P-79).
- Work-project deliverables mapped to the sections they feed is package **S12** (P-83).

### 3. Deterministic multi-step workflows

**What already exists:**
- AnA's agentic loop (`server/services/ana/agentic-loop.ts`).
- The four-agent council (`multi-agent-council.ts`), persisted.
- The Submission Center package orchestrator, persisted and resumable.
- The deterministic figure checks on Authoring save (`draft-figure-check.ts`,
  `section-claims-check.ts`, `document-figure-consistency.ts`).

**Owed:**
- A health-authority style rule pack does not exist. Today the M2, M4 and M5 QC rules carry into
  Submission Readiness as named findings (P-55).

### 4. AI template library

**What already exists:**
- Engineer-authored templates: IND outlines, CSR, Module 3 and the 93 IND deliverables, started
  from Plan (P-47).
- QMS controlled documents, versioned and signed.

**Owed:** nothing inside the plan. A user-authored AI template library is new capability. The
Template Library's return is parked (P-53).

### 5. Zero-retention gateway

**What already exists:**
- One gateway, with placement checked before every fallback.
- A production boot that refuses an unenforced policy.
- A tenant residency floor.
- PII blocking.
- A Python bypass gate (closed 2026-07-30).

**Done:** `4bfd143ea`.
- A zero-retention approval must name its signed agreement and its effective date.
- The approval and the provider registry must agree.
- Bedrock no longer claims zero retention by default.
- The audit row names the agreement relied on.
- Terraform refuses an approval with no agreement.

**Owed:**
- The signed Anthropic BAA and zero-retention agreement (row D6; owner action).
- The PII detector finds structured identifiers only. Names and free-text narratives need the
  small-model classifier, which falls back to the regex today.

### 6. Evaluation

**What already exists:**
- The PQ harness, with a pinned protocol and a per-item faithfulness floor.
- A production refusal of high-risk drafting by any model whose PQ has not passed
  (`ai-gateway/model-governance.ts`).
- The deterministic figure checker: advisory in AnA. On Authoring save it marks figures `unverified`.
  Since P-89 (2026-11-01), approval and seal check the signed text again and refuse until each unverified
  figure is acknowledged.

**Owed:**
- **The top launch blocker.** Opus 5.5 and Opus 5 are both `pq: pending`, so production refuses
  governed drafting today. P-56 sets the order:
  1. Gold-bank items for CMC / Module 3 and Module 2.5 to 2.7, authored from real source text and
     never invented: a W3 slice.
  2. A production provider key: an owner action.
  3. Then the approval signature.
- No live-model regression runs on a schedule.

### 7. Audit ledger and AI provenance

**What already exists:**
- The chained, sealed, append-only `audit_logs`, anchored to S3 Object Lock.
- AI provenance per section: the revision `origin`, machine contributors, and the audit trail
  row's `generator` (model, provider, prompt hash, turn record).

**Done:** `3a8fcdcf4` (LX-10). The Vault filing's chained row names each filed section's revision
head. Its derivation already travels into the package governance record, so provenance now
survives through Vault and packaging.

**Owed:**
- **Row D5.** A real KMS key, and a production verifier run with seals.
- **LX-10's remaining items.** The seal, the signature ids and the lineage digest.
- **`audit_events` seals.** No writer exists yet: the chain fields come from a database trigger and
  the table refuses UPDATE. The integrity sweep already reports these seals honestly as
  unverifiable. The fix is to converge those writers onto the chained `audit_logs` writer, not to
  seal in place.
- **A screen.** No screen shows "this filed section was accepted from model X, turn Y". That is a
  reach for R1, D6 or D7.

### 8. Mock health-authority reviewer (Shadow Review)

**What already exists:**
- Shadow Review in Submission Center: an LLM reviewer per lens, findings persisted, a critical
  finding blocking dispatch, closure by a Part 11 signature (P-35), and a signed waiver for a
  provider outage (P-34).

**Done:** `3cacf2e15`.
- **The reviewer reads the documents.** It used to receive section codes and titles only. It now
  gets each leaf's text from the rendered leaf, within a budget, with contact details masked and
  patient identifiers withheld.
- **A review covers only the leaves it read.** It used to clear the gate forever, even after its
  leaves changed. It now lapses with its leaves, as a waiver does.
- **The PII classifier stops reading numeric tables as card numbers.** That false positive would
  have made production refuse nearly every real document.
- **The run says what it read.** Submit's Shadow Review panel shows it per run.

**Owed:** a panel of reviewer personas, drafted information requests or deficiency letters, and any
measure of the reviewer's accuracy. Each is new capability (RULE 6).

### 9. Regulatory-change QA

**What already exists:**
- A registry of 17 dated guidance facts.
- AnA's on-demand freshness tools.
- The nightly external-intelligence sweep: Federal Register, FDA, EMA, MHRA, TGA.
- A guidance impact scanner. Its tables are on no deploy path and nothing schedules it.

**Owed:**
- The FDA guidance index fetcher, deferred by P-9.
- Re-checking sealed documents when a cited guidance is superseded. That is new capability unless
  it is a reach for the existing scanner, which is R1's to decide.

## Decisions the founder made (2026-11-01)

The founder answered both questions this record owed with "Yes" (`docs/LAUNCH_DEFINITION_OF_DONE.md`):

1. **P-89: an unverified figure blocks an approval or a seal unless the signer acknowledges each one.** Done:
   - **The check.** Approval and freeze re-check the text being signed against its cited sources, inside the signing
     transaction (`draft-source-references.ts` `savedSourceExcerptsForSigning`; `draft-figure-check.ts`
     `unverifiedFiguresAtSigning`).
   - **The refusal.** While a figure is unverified, the act is refused with 409 `FIGURES_UNVERIFIED`, naming each
     figure (`authoring.router.ts` `figuresRefused`). This happens before re-authentication.
   - **The acknowledgement.** The signing dialog asks about each figure (`AuthoringFilingBar.tsx`). The
     acknowledgement is recorded on the act's transaction.
   - **Evidence:** `docs/evidence/D5-SIGNATURE-FIGURE-GATE/2026-11-01/`.
   - **Not covered.** Figures in sections that cite no sources are outside the check. Covering them would take a
     further founder decision.
2. **P-90: the self-hosted Docling layout reader is admitted**, behind `oss.ingestion.docling_primary`, off by
   default. Done:
   - The client speaks docling-serve's real v1 interface (`server/integrations/docling/client.ts`). It used to call
     a `/parse` endpoint the reader does not have.
   - Vault ingestion asks for it through the one extractor. A PDF's tables come out as rows and cells the chunker
     reads as tables.
   - The reader is a pinned, portless `docling` service in `docker-compose.yml`.
   - **Evidence:** `docs/evidence/D2-LAYOUT-READER/2026-11-01/`.
   - **Owed:** a run on a real reader, which this environment's network refuses.
