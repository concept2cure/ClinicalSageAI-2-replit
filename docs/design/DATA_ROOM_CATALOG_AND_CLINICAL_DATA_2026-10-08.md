# The Data Room catalog, AI organization and clinical data management in regulatory document creation

Study and plan, 2026-10-08 (session `…01KnUGoX`). Founder decisions taken the same day:

- **Scope.** Stay inside the launch catalog. Readers for `.xpt`, `.sas7bdat` and Dataset-JSON, and `m5/datasets` packaging, are deferred to a later founder decision (§6).
- **AI posture.** AnA suggests; a person confirms or corrects, with an audit row.
- **Where.** This study lives in the repository.

Launch rows moved: **D2** (the Data Room inside Projects and Vault) and **D5** (an attributed, audited, confirmable AI record).

Implementation plan: §5. Each slice files evidence under `docs/evidence/D2-DATA-ROOM-CATALOG/` or `docs/evidence/D5-AI-CATALOG-GOVERNED/`.

---

## 1. Why this decides document quality

Every document a sponsor files is a re-statement of evidence the sponsor already holds:

- the protocol, the Investigator's Brochure (IB) and the Statistical Analysis Plan (SAP);
- the Clinical Study Report (CSR) and its section 14 tables, figures and listings;
- the Module 2.5/2.7 clinical summaries and the Integrated Summaries of Safety and Efficacy (ISS/ISE);
- the Module 3 quality sections;
- a briefing package or a response to a deficiency letter.

A reviewer at FDA, EMA or PMDA reads such a document as a set of claims, and checks each one against its evidence. When a number in Module 2.7.3 disagrees with CSR table 14.2.1, the reviewer stops trusting the summary. When a statement cannot be traced to its source, it becomes an information request, and the clock stops. The quality of a regulatory document is therefore set upstream of the writing:

1. **What evidence exists, and can it be found?** This is the catalog: what each item is, which study, which product, which data cut, which version. An author or AnA who cannot find the right table writes from memory or from the wrong version.
2. **Is it the right version of the right thing?** This is data management: checksums, supersession, data-cut dates, and the distinction between an interim and a final CSR. Two versions of a TLF with different numbers are the commonest source of inconsistency between a CSR and its summaries.
3. **Does every number say where it came from?** This is lineage. Either a deterministic engine computed it (sample size, power, a derived ratio), or it was copied from a source at a stated locator. Anything else is unverified, and must look unverified.
4. **Did a person decide, or a model?** This is governance. A model can organize thousands of files faster than a person can. But its classification is a proposal, and a record must say who proposed it and who accepted it (21 CFR 11.10(e); ALCOA+ "attributable").

AI makes items 1 and 2 tractable at the scale a submission has: thousands of source files across nonclinical, clinical and CMC. It is a hazard for items 3 and 4 if its output is stored as fact. The platform's rule, in CLAUDE.md Rule 2, is the right one: **numbers and verdicts come from deterministic engines; the model narrates**. This study applies that rule to the Data Room.

## 2. Requirements, and where each lands

| Requirement | What it asks of the catalog | Where it lands |
|---|---|---|
| 21 CFR 11.10(e), audit trail; 11.10(a), validation | Every create, change and confirmation of a governed record is attributable, time-stamped and kept | Capture is already chained (VR-16b). The catalog's AI fields gain a suggested → confirmed state, attribution (model, thread, turn) and an audit row: §5 S4 |
| ALCOA+ (attributable, legible, contemporaneous, original, accurate, complete, consistent, enduring, available) | Original bytes are kept and identified; derived text says how it was produced; nothing is silently overwritten | Checksums and write-once capture columns exist (VR-16). Extraction method and confidence are recorded, and every capture is processed: §5 S2 |
| ICH E6(R3), data governance (computerised systems; data life cycle; metadata) | Data and metadata are managed across the life cycle; systems record who did what | Study, data-cut and version metadata on each item: §5 S3. Attribution of AI organization: §5 S4 |
| ICH E3, CSR structure; "numbers in the text agree with the tables" | Each figure in the body agrees with section 14 | Drafted figures are checked against the cited sources' text; a figure that is not found is flagged `unverified` and never silently accepted: §5 S5 |
| ICH M4 / eCTD v3.2.2 and v4.0, placement | Each leaf is in the right CTD section, and study reports carry STF metadata | Placement is suggested → confirmed today (vault-filing). The STF generator exists for study reports |
| FDA Study Data Technical Conformance Guide; CDISC SDTM, ADaM, SEND, define.xml; rejection criteria 1734/1736 | Standardized datasets with define.xml in `m5/datasets` | **Deferred** (§6). In scope now: profiling CSV/XLSX datasets and reading define.xml metadata, so the catalog knows what a dataset is (§5 S3) |
| Part 11 and data integrity applied to AI (FDA, *Considerations for the Use of AI to Support Regulatory Decision-Making*, draft 2025: credibility, context of use) | The model's role is bounded, its output is attributable, and a person is accountable | AI fields are proposals, named and confirmable: §5 S4. Approved models are pinned in `server/services/ai-governance/approved-models.ts` |

## 3. What the platform holds today (explored 2026-10-08)

**Data Room records** (`cre_evidence_sources`, `db/migrations/20260724_clinical_regulatory_evidence_spine.sql:32-64`):

- **Captured with integrity.** Every row has:
  - the SHA-256 checksum of the original bytes;
  - write-once capture columns, guarded by `migrations/20261001_cre_evidence_sources_capture_immutability.sql`;
  - supersession (`previous_version_id`, `is_current`) and the person who captured it (`created_by`).
- **Described by nothing.** The descriptive columns (product, indication, phase, `document_date`, `trial_registry_identifier`, application number, agency) exist, but no Data Room writer fills them. There is no study, no data-cut date, no dataset structure, and no stored text.
- **Not all processed.** A file adopted from a conversation (`POST /api/c2c/projects/:id/adopt`, `server/routes/c2c/projects.ts`) or derived by a spreadsheet edit (`server/services/ana/uploaded-file-access.ts`) stays `extraction_status='pending'` permanently. Nothing updates it after insert.
- **No search, and every list stops at 200 rows.** The relevant constants are `SOURCES_WINDOW` and `DATA_ROOM_WINDOW` (`server/routes/c2c/project-vault.ts`). The lane counts are floors over that window.

**Vault catalog** (`vault.document_catalog`, `migrations/20260905_document_catalog.sql`):

- **The deterministic extraction tier works.** It records method, confidence and counts.
- **The comprehension tier (kind, purpose, summary, key data) is written by AnA,** behind two deterministic gates: a whole-text read receipt, and every key-data value appearing in the text (`server/services/vault/document-catalog-core.ts`). But:
  - it is **off by default** in every deployment (`server/startup/document-catalog-bootstrap.ts`);
  - it is stored **with no mark that a model wrote it**, and no audit row;
  - **no screen shows it or lets a person correct it**;
  - `document_kind` is **free text**, beside two other "what is it" fields (`document_type`, `evidence_kind`).

**Placement** (`server/services/vault/vault-filing.service.ts`, `vault-placement.service.ts`) is the good model to follow:

- A deterministic classifier proposes a placement.
- AnA can only suggest one, never confirm it.
- A vocabulary is enforced.
- Every change is audited.

**Search:**

- Vault documents have keyless full-text search (`migrations/20260906_vault_documents_fulltext.sql`, `server/services/vault/vault-search.ts`). AnA's `search_project_documents` falls back to it when there is no embedding.
- **Passage search needs an embedding key.** Chunking writes zero chunks when the embedder fails (`server/services/vault/document-chunking.service.ts`), although `vault.document_chunks` already has a full-text index on `chunk_text` that nothing uses.

**Clinical data:**

- **No dataset is read.** `.xpt` and `.sas7bdat` are refused at intake (`shared/constants/document-intake-formats.ts`). CSV, XML and XLSX become flat text.
- **The CDISC validators read caller-typed metadata only** (`server/services/cdisc/`), and no screen calls them.
- **Span lineage has no writer for `computed` or `derived` usage** (`server/services/clinical-regulatory-evidence/span-lineage.service.ts`).
- **The statistics engine's provenance is never stored.** Each result carries method, seed and an inputs SHA-256 (`server/services/stats/computation-provenance.ts`), but the record is discarded.
- **Nothing checks a drafted number** against the evidence it cites.
- **AnA's drafting reads only the first 12,000 characters** of each source (`server/services/ana/draft-project-sources.ts`).

## 4. Design principles

1. **Deterministic first.** Text, counts, identifiers, dates, inherited product facts, dataset structure and lineage are computed by code and recorded with the rule that found them. The model adds only comprehension (kind, purpose, summary), and only as a proposal.
2. **A proposal looks like a proposal.** It shows a suggested state, who suggested it (agent, model, turn), and who confirmed or corrected it with a reason. The audit chain carries both events.
3. **One vocabulary for "what is this".** The evidence-kind vocabulary that placement already enforces becomes the catalog's kind.
4. **Honest capacity.** Counts are exact. Lists page instead of truncating. A ceiling, where one remains, is stated on the record ("first N pages read").
5. **Keyless by default.** Every catalog and search function works with no AI key. An embedding only improves ranking when one is configured.
6. **No new surface** (Rule 2). The work extends the project's Data Room, the Vault lanes and document detail, and AnA's existing tools.

## 5. Plan, in slices

| Slice | Outcome | Launch row |
|---|---|---|
| S1 | **Keyless passage search.** Chunks are written without an embedder. The vault retrieval arm runs full-text over `chunk_text` when the query cannot be embedded. Passage search no longer needs the catalog flag, and it reports `ranking: lexical \| hybrid`. | D2 |
| S2 | **Every capture is processed.** One processing step serves upload, adopt and spreadsheet edit. The Data Room stores extracted text with a full-text index. `/sources` gains search, filters, keyset paging and real totals. Lane counts are exact. | D2 |
| S3 | **The catalog describes the evidence.** Product and application facts are inherited from the project. Registry ids, protocol number, document date, data-cut date and version label are found by tested rules, each with its rule and offset. A `study_ref` key (same-organization) links to the project's study. A dataset profile reads CSV, TSV and XLSX columns, types, rows and the detected CDISC domain, and parses define.xml. The existing CDISC checks run on that parsed metadata. | D2 |
| S4 | **Governed AI organization.** The catalog is on by default. AnA's catalog write is `suggested`, attributed, audited and held to the vocabulary. A person confirms or corrects it, with a reason, in Vault document detail. Session recall labels suggestions as suggestions. | D5 |
| S5 | **A number says where it came from.** Statistics engine runs are stored. A computed figure carries `computed` lineage to its run. A drafted figure found in a cited source carries `derived` lineage with a locator; one not found is flagged `unverified`. Drafting grounds on the most relevant passages, not the first 12,000 characters. | D2, D5 |

Each slice starts with a red test, is proven on PostgreSQL 16, passes tsc and the lint ratchet, gets an adversarial review, and is pushed to `concept2cure-v2`.

## 6. Deferred: founder decision

The following need the launch catalog extended (D2) and change what row D7 proves, so no session may start them without a founder decision:

- **Standardized datasets in the submission.** This means SAS XPORT v5 reading and writing, Dataset-JSON, and `m5/datasets` leaf placement with define.xml and reviewer's guides, to meet FDA technical rejection criteria 1734 and 1736. Today the packager admits PDF leaves only (`server/services/ectd/leaf-source-resolver.ts`), and `server/services/ind/ctd/fda-technical-rules.ts` states the gap.
- **`.zip` intake** of dataset bundles.

Recommendation: decide this before the first NDA, BLA or PMA customer. An IND (row D7) can be filed without standardized datasets in many cases. A marketing application cannot.
