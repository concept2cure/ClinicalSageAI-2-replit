# The CSR path, project start to submission (review of 2026-10-29)

Prepared for the Lumen Bioscience LMN-201 / RePreve prospect (NCT05330182). The
study is a Phase 2/3, double-blind, placebo-controlled trial under a US IND with
Fast Track. Its Part B randomized 23 patients 1:1, and its primary analysis is
Bayesian: global cure was 10/12 on LMN-201 against 4/11 on placebo.

The review followed one CSR from project creation to an FDA gateway
transmission. It used eight reading agents, one agent running every existing
test of the path (208 files, 2,953 tests), and checks of my own. Each finding
below names the code it rests on. Items marked **fixed** were fixed and pushed
during the review.

**What already exists.** This review is the inventory: every row below names
the existing code by path, what it does and what it does not. Nothing in the
order of work is a rebuild.

## The short answer for the prospect

Concept2Cure can support this study's CSR today:
- Hold the project and its IND.
- Build the §10–12 tables with fixed code from the approved clinical source.
- Draft the ICH E3 body with a model, under figure guards that refuse any
  statistic the study information did not supply.
- Record a Bayesian primary result (credible interval, posterior
  probability) and show it in the §11.4 table.
- Have an independent reviewer map every reported figure to its retained table
  cell, then approve and sign it under Part 11.
- Place it in Module 5.3.5.1 with its study tagging file.
- Compile and validate the sequence.

It cannot yet:
1. **Take the CRO's TLFs or SDTM/ADaM values directly.** The tables are
   transcribed into the `concept2cure.csr-source.v1` contract.
2. **Show that a transmission reached FDA.** The ESG client has never run
   against FDA, and acknowledgments 2 and 3 are not ingested.
3. **Render PDF/A, capture the investigator's 16.1.5 signature, or produce the
   16.x appendices**, which exist only as headings.

The sponsor's CRO and publisher can cover all three for a first engagement.
The report must say plainly which parts came from outside the platform.

Fixed during this review, each shown failing first (evidence under
`docs/evidence/D5/2026-10-29-*`):
- A CSR could not be approved through the product: no screen sent the map the
  server required (`91465a856`).
- An author could approve their own CSR (`265ea2c5b`).
- Signing, freezing, export and filing to Vault answered 500 for any document
  with one malformed row, and had no passing test since 2026-10-28
  (`eefcaf2c8`, `b84f297ca`).
- The Bayesian primary result had nowhere to go, and the figure guard did not
  see a posterior (`c173d35f5`, `d9e8b41db`).
- Four launch downloads could leave unrecorded, or saved a refusal as a file
  (`9acdf6f0e`).
- A signature's meaning could be spaces, a number or an object (`56504daea`).
- Module 2 read "Phase 3" and "III" as not pivotal, and "Phase 1" as not
  clinical pharmacology (`cb14dfc51`).
- Module 2 called a planned sample size "subjects enrolled", and counted it as
  exposure (`9b0a63be0`).
- An information amendment's letter did not say "Clinical", and a CSR had no
  amendment category (`b9dbaeff4`).
- An export record could be hard-deleted, which removed data disposition's
  proof that a filed copy carries another document's data (`239bf4214`).

## Stage by stage

### 1. Project and study setup

| | Path | State |
|---|---|---|
| Projects, programs, IND lifecycle | Submission Center, `server/services/csr/project-scope.ts` | Works. A CSR now refuses an organization-wide build and needs a project (`6f57de780`). |
| Study register | the study register's zod schema and the AnA tool schema | **Gap:** it accepts device phases only. "Phase 2/3" cannot be recorded truthfully. |
| Study design store | the study design store | **Gap:** no NCT number field and no Fast Track designation field. |
| Filing type "Clinical Study Report" | project creation | **Gap:** a project of this type can never be sequenced. A CSR is filed as an information amendment to the IND. |
| Sequence numbering | Submission Center | **Gap:** the first platform sequence is always 0000. LMN-201's IND already has sequences, so the next sequence number must be entered. |

### 2. Clinical data inputs

| | Path | State |
|---|---|---|
| Approved clinical source | `shared/csr-source-input.ts`, `server/services/csr/vault-source-input.ts`, `saved-clinical-tables.ts` | Works. Fixed code builds the §10–12 tables from a Vault JSON whose approval is canonical. 381/381 tests pass. |
| CDISC checks | ADaM, SDTM, SEND, define.xml checkers | Work (structure checks, not value ingest). |
| Bayesian results | `shared/csr-source-input.ts`, `csr-tabulation-builders.ts`, `unsupplied-statistics.ts` | **Fixed** (`c173d35f5`, `d9e8b41db`): a result records its credible interval and the posterior probability of a named hypothesis, and the §11.4 table shows them only when present, so existing tables and their receipts are unchanged. The figure guard now refuses a model-stated posterior, a bare n/N and an unbracketed interval. The prior is not a field: it belongs in the SAP. |
| TLF / SDTM value ingest | — | **Gap:** none exists. |
| MedDRA coding | — | **Gap:** not configured. Adverse event terms arrive as written. |

### 3. Drafting

| | Path | State |
|---|---|---|
| ICH E3 outline | market-specs CSR spine | 119 headings (`13bafc62f`). The test that expected 16 is stale. |
| AI drafting | `server/services/csr/csr-job-runner.ts` | Drafts from Data Room excerpts, with the placeholder gate and the unsupplied-statistics guard. **Gaps:** <ul><li>The §10–12 tables never enter the document text.</li><li>Seven of nine job-runner state tests are disabled by a stale fake database.</li><li>Saved placeholder text is now sent back to the model instead of failing the job (`2f57e2e7f`). This looks like a regression.</li></ul> |
| Rule 2 (no figure from a model) | `record_endpoint_result`, `narrate_statistical_result`, `draft_safety_narrative`, `log_study_ae` | **Defect:** these AnA tools take clinical figures as model-supplied arguments. |
| Study facts the draft states | `m2-summary-builders.ts`, `load-csr-inputs-for-project.ts` | **Fixed:** planned N no longer presented as enrolled (`9b0a63be0`); "Phase 3", "III" and "Phase 1" read as written (`cb14dfc51`). **Open, founder's call:** whether a Phase 2/3 study counts as pivotal; it still reads as Phase 2 first. |
| Appendices 16.x | — | **Gap:** headings only. |
| Rendering | the PDF renderer | Works (52/52). **Gap:** no PDF/A output. |

### 4. Review and QC

| | Path | State |
|---|---|---|
| Clinical QC, claim reconciliation, evidence binding, peer review | `m5-clinical-qc`, `csr-claim-reconciliation`, `csr-section-evidence-binding` | Work. 487/487 tests pass. |
| CSR scientific review | `server/services/authoring/csr-scientific-review.ts` (`07857e3e3`) | Since 2026-10-28 the server has refused to approve a CSR without a map binding each reported figure to its retained table cell. **Fixed** (`91465a856`): before this, no screen could send the map, so no CSR could be approved through the product. The review decision now has the step. |

### 5. Approval, e-signature, lock, export, filing to Vault

| | Path | State |
|---|---|---|
| Approval independence | `authoring.router.ts` `signingRefused` | **Fixed** (`265ea2c5b`): an author could approve their own CSR. |
| Release gate order | `csr-scientific-review.ts` `assertCsrScientificRelease` | **Fixed** (`eefcaf2c8`, `b84f297ca`): the gate framed every document as a CSR before checking whether it was one. A malformed row on any document made signing, freezing, export and filing to Vault return 500, and since 2026-10-28 those routes had no passing test. 17 suites are green again. |
| Named signer set | — | **Gap:** no required set of named signers (sponsor's responsible medical officer, biostatistician). |
| Investigator signature (16.1.5) | — | **Gap:** not captured. |
| Export history | `DELETE /api/authoring/export-history/:id` | **Fixed** (`239bf4214`): it refuses; the record is kept. |
| Signing reason | `/sign`, `/e-sign` | **Fixed** (`56504daea`): a trimmed meaning of at least 8 characters, as the signing dialog asks. |

### 6. Module 5 placement, STF, compile, validation

| | Path | State |
|---|---|---|
| Placement, STF, compile, DTD validation, compiled-sequence view | `place_into_sequence`, the STF generator, `EctdCompile.tsx` | Work. 621 tests pass. |
| 5.3.5.1 placement | the placement dialog | **Gap:** the section must be typed by hand. |
| STF tags | the reviewed STF tag list | **Gap:** `study-report-body` is missing. |
| Tests | the STF and compile suites | 39 red: the fake PDF fixtures predate the PDF integrity check, a table is missing from the test schema, and one test hangs. |

### 7. Dispatch, transmission, acknowledgments

| | Path | State |
|---|---|---|
| Dispatch readiness, release signature, pre-transmit checks | the submission gateways | Work, offline, against local mTLS fixtures. 567 tests pass. |
| FDA ESG | ESG REST, SFTP and AS2 clients | **Gap:** never run against FDA. ACK2 and ACK3 are not ingested. |
| Archive | the guarded transmit, `submission-gateways/sent-package-archive.ts` | **Fixed** (D7, `docs/evidence/D7/2026-10-29-sent-package-kept/`): the guard stores the package's exact bytes before the wire and refuses to send when it cannot. Every transmittal row, the `ECTD_TRANSMITTED` row and the sign record name the copy. The **Package** action in Gateway transmittals downloads it, under project access and recorded (`docs/evidence/D7/2026-10-29-sent-package-download/`). **Gap:** packages above the 25 MiB download limit are refused (413), though kept. |
| The amendment itself | the amendment planner, the cover letter, Form 1571 | **Fixed** (`b9dbaeff4`): a CSR is an information amendment; the plan and the letter say "Information Amendment: Clinical" (21 CFR 312.31(b)), or name the gap. **Open:** the 1571's contents box (item 11) is not in its unverified field registry, and filling it needs the official form, which is not readable from here. |
| ClinicalTrials.gov results | — | **Gap:** no path to post results for NCT05330182 under 42 CFR Part 11. |

## What AnA can learn from

The public CSR reference corpus is 22 records, with 56 entries in the catalog
(`server/data/public-csr-reference/manifest.json`, seeded by
`migrations/20261027_cdi_public_reference_seed.sql`). All of them are
`trainingApproved=false` and `external_reference`.

For C. difficile, the vetted public sources are US federal:
- the FDA reviews of bezlotoxumab (BLA 761046) and of Rebyota;
- the FDA draft guidance on Bayesian methods (January 2026);
- the NIH/BPCA CSR bodies.

Fetching their full text needs these domains allowed under the environment's
network access: `www.ncbi.nlm.nih.gov`, `ftp.ncbi.nlm.nih.gov`,
`pubmed.ncbi.nlm.nih.gov`, `dash.nichd.nih.gov`, `www.accessdata.fda.gov`,
`www.fda.gov`, `clinicaltrials.gov` and `cdn.clinicaltrials.gov`. EMA, Health
Canada, sponsor portals and Vivli do not clearly allow commercial reference use,
and are not used.

## Order of work

1. ~~Bayesian result fields~~: done (`c173d35f5`, `d9e8b41db`).
2. Rule 2:
   - `record_endpoint_result` and `log_study_ae` already need a person's yes
     before they write (their register class is `confirm`).
   - `narrate_statistical_result` and `draft_safety_narrative` narrate the
     figures their call supplies, under a deterministic-sounding source label.
   - Next: bind them to a retained run's source, or say in their output that
     each figure is as given.
3. The study facts the draft states: enrolled vs planned N and the phase are
   done (`9b0a63be0`, `cb14dfc51`). Open: an NCT field, a Fast Track field,
   and whether a Phase 2/3 study counts as pivotal (the founder's call).
4. ~~The amendment's Clinical identification~~: done (`b9dbaeff4`). Open:
   the 1571 contents box, and whether `study-report-body` is an STF file tag
   at all; both need the official specification, not recall.
5. ~~Signing: the whitespace reason and the protected export history~~: done
   (`56504daea`, `239bf4214`).
6. Transmission: ~~archive the package sent, and download it~~: done (D7).
   Open: ingesting the acknowledgments, and a streamed download above 25 MiB.
7. Then the larger items: TLF ingest, the named signer set and the 16.1.5
   capture, PDF/A, and the 16.x appendices.
