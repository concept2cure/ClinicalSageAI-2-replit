## Lane: Submission Center, Submission Readiness, QMS

This is a cold read of branch `claude/busy-carson-kr611v` @ 92ccdba1. I did not open any prior audit, evidence or report files.

One live test: I ran the canonical packager once on a toy FDA IND sequence 0000 (7 PDF leaves, 2 studies) with `tsx`. Script and output are in `<scratch>/catalog2/` (`toy-package.ts`, `out/123456-0000-fda/`). Every "toy output" claim below refers to that run.

**Launch surfaces** (`shared/constants/launch-scope.ts`):
- Submission Center = submission-center, dossier-map, ectd-compile, ectd-coauthor, ectd-publishing, gateway-transmittals
- Submission Readiness = dispatch-readiness
- QMS = quality, qmp

### Readiness score per app
- **Submission Center (eCTD): 3/10.** It builds a well-formed zip whose checksums are correct, and every step is governed by a Part 11 signature. It cannot yet produce a package an agency would accept, and it cannot send one:
  - None of the agency DTDs are in the repo.
  - The FDA Module 1 and ICH backbones are very likely DTD-invalid.
  - The study tagging file (STF) structure is invented.
  - The EU and other regional Module 1 backbones are made-up structures.
  - The FDA ESG AS2 envelope is not S/MIME.
  - Acknowledgments are never ingested.
  - Existing sequences cannot be imported.
- **Submission Readiness: 4/10.**
  - Good: the gate is deterministic, computed on the server, and honest about "not assessed" versus "clear".
  - Weak: its rules are shallow, and a missing required Module 1 section is only a warning.
  - It depends on an LLM Shadow Review having run.
  - A model-supplied risk figure is shown on screen, which breaks Rule 2.
  - The transmit button that actually exists in the UI does not go through this gate.
- **QMS controlled documents: 3/10.**
  - Good: signed approval and retirement are well built.
  - Missing basics:
    - no version history (a revision overwrites the effective document);
    - an effective-date bug;
    - training compliance that ignores version;
    - no training assignment, no controlled copies, no approval routing.
  - It is well short of MasterControl, Veeva QualityDocs or Greenlight Guru.

### What is genuinely strong (keep)
- **Checksums are correct by construction.** MD5 is taken over the exact bytes shipped (`regional-packager.ts:890-896`). The root `index-md5.txt` holds the MD5 of `index.xml` (`:1097-1103`). The toy run's `md5sum` matched the backbone and `index-md5.txt`, and both XML files are well-formed (`xmllint --noout`).
- **Lifecycle correctness at the one sink every path reaches:**
  - `modified-file` must name a leaf ID in a prior backbone (`regional-packager.ts:732-805`);
  - a delete carries no bytes, no href and no checksum (`:831-864`);
  - replace/append without `modified-file` is refused (`:866-878`);
  - IDs are recorded in the leaf manifest (`:1139-1170`).
- **Governed flow:**
  - freeze, dispatch and transmit each need a Part 11 signature bound to the sequence (`submission-service.ts:1274-1289`);
  - a transmit claim/lock prevents double-sends (`:1333-1340`);
  - any leaf that could not be packaged blocks transmit (`:1377-1421`);
  - content-fingerprint drift is refused (`governed-transmit.ts:522-555`).
- **Dispatch gate honesty:**
  - an unknown count is not treated as zero (`dispatch-gate.ts`);
  - "never reviewed" is not treated as clean (`assess-dispatch-readiness.ts:204-213`);
  - the release signature is scoped to sequence and region (`:530-557`);
  - the UI shows a "Not assessed" state (`DispatchReadiness.tsx:274,315-323`).
- **PDF handling:**
  - the PDF security gate works on the bytes, not the file name (`regional-packager.ts:215-237`);
  - the production image ships gs, veraPDF and xmllint (`Dockerfile.optimized:53-75`);
  - the xmllint wrapper is real (`ectd/xml-validator.ts`).
- **Honest labelling:** placeholder regions are marked non-conformant (`regional-backbone-readiness.ts:35-76`), and the Lorenz report parser fails closed (`lorenz-adapter.ts`).
- **Official forms:**
  - IND forms are filled into the official FDA XFA PDFs by incremental update (`ind-forms/*`, `templates/forms/acroforms/*.manifest.json`);
  - the eSTAR official template is vendored with SHA-pinned checksums (`assets/estar-templates/`) and its fill fails closed (`510k-estar-routes.ts:1061-1109`).
- **QMS signatures:**
  - approve and retire re-authenticate the signer, check signing authority before the password, and refuse self-approval;
  - the UPDATE, the chained ledger and the `electronic_signatures` row commit in one transaction with a content digest (`services/qms/document-approval-signature.ts`);
  - change control has a real state machine with signed approval and proposer ≠ approver (`changeControl.service.ts:47-56`).
- **Fixtures:** they are gated off in production builds (`mdx/lib/sampleMode.ts` `sampleModeAvailable` = `!PROD`), and read errors are not shown as empty (`SopRegister.tsx:150-170`).

### Capability matrix

**Submission Center (eCTD)**

| Capability | Status | Evidence | Note |
|---|---|---|---|
| index.xml backbone v3.2.2 | PARTIAL | `regional-packager.ts:661-697`; toy output | Heading tree truncated. Required attributes missing (see CAT2-03). |
| util/dtd + util/style bundling | PARTIAL code / MISSING files | `dtd-bundler.ts`; `assets/ectd-dtd/` = README, placeholder `checksums.txt`, fixtures | Toy: `dtdStatus.missing=[ich-ectd-3-2.dtd, us-regional-v3-3.dtd]`. `xmllint --valid` says "no DTD found". |
| index-md5.txt / leaf MD5 / relative xlink:href | WIRED | `:332-345, 1092-1103`; toy md5sum | |
| new/append/replace/delete + modified-file | WIRED (in-system history only) | `:795-878`; `package-sequence-lifecycle.ts` | No legacy import (CAT2-07). |
| Leaf titles | WIRED | `:342-344` | |
| node-extension | MISSING | grep: none | |
| STF (M4/M5) | MOCKED structure | `stf-generator.ts:129-136`; toy `stf.xml` | CAT2-04 |
| US regional M1 v3.3 | PARTIAL, likely invalid | `:399-520`; toy `us-regional.xml` | CAT2-02 |
| App type / submission type / sub-type codes | PARTIAL | `core-to-packager.ts:218-239`, `cv-v3-data.ts:36-40,129-133` | Correct fdaat4 for IND in the toy run. |
| Sequence numbering / folder | PARTIAL | `SEQUENCE_NUMBER_FORMAT` rule; toy `unzip -l` | No `NNNN/` top folder. |
| EU / JP / CA / 8 other M1 | MOCKED | `:526-629, 989-998`; `dtd-bundler.ts:17-27` admits 11 of 12 non-conformant | |
| eCTD v4.0 | PARTIAL (library, not wired) | `ectd/ectd4/*`; callers only `qualify.ts:560`, `AnaToolExecutor.ts:9099` | Publishing Center only views vocabularies. |
| DTD/XSD validation before transmit | MISSING (no DTDs) + opt-in | `pre-transmit-check.ts:120-156` | |
| FDA PDF technical conformance | MISSING (encryption only) | `validation-rule-corpus.ts:315-365` (enforcement `'external'`) | CAT2-11 |
| PDF/A pipeline | WIRED (gate opt-in) | `pdfa-pipeline.ts`; `:1020-1035` | |
| External validator (Lorenz/Extedo/GlobalSubmit) | PARTIAL | `external-validator/*`; adapter only, no licence, opt-in | |
| Built-in rules | PARTIAL | 36 internal rules (16 dispatch, 8 packager, 4 validator, 8 "external") | |
| FDA ESG AS2 | NON-CONFORMANT | `fda-esg.ts:18-35` (self-declared) | |
| ESG NextGen REST | MISSING | `fda-esg.ts:37-45` throws `UnverifiedTransportError` | |
| ESG SFTP | PARTIAL | `fda-esg.ts:503-521`; `ssh2-sftp-client` not in `package.json` | |
| ACK1/2/3 ingestion | MISSING | `fda-esg.ts:705-728` returns the stored row only | |
| Test vs prod / center routing | PARTIAL | `FDA_ESG_STAGING_*`; no CDER/CBER/CDRH/test routing (grep) | |
| Certificates / keys | PARTIAL | Platform-global env PEM paths (`fda-esg.ts:109-116`) | CAT2-06 |
| eSTAR / 510(k) | PARTIAL | Official fill = download; transmit uses `buildECTDZip` | CAT2-10 |
| IND forms 1571/1572/3674 | WIRED | `ind-forms.routes.ts:407-1040`; manifests | 1571 and 3674 have `assetTrusted:false`, `reviewedBy:null`. |

**Submission Readiness (dispatch-readiness)**

| Capability | Status | Evidence | Note |
|---|---|---|---|
| Deterministic gate, server-computed inputs | WIRED | `assess-dispatch-readiness.ts:398-624`; `dispatch-gate.ts` | |
| Honest not-assessed vs clear | WIRED | `DispatchReadiness.tsx:274,315-323` | |
| Rule source / versioning | PARTIAL | `validation-rule-corpus.ts` | Internal IDs; not pinned to an FDA criteria version. |
| No LLM figures | DEFECT | `shadow-review-service.ts:224-226` → `SubmissionSeqWorkspaces.tsx:979-980` | CAT2-15 |
| IND/NDA/BLA coverage | PARTIAL | `dispatch-readiness.ts:436` | Missing required M1 section = warning. |
| 510(k) | MISSING in this app | Separate `/api/510k/estar/filing-readiness` | |
| Governs the UI transmit | NO | `governed-transmit.ts` has no reference to sequences, shadow review or release signature | CAT2-09 |

**QMS controlled documents**

| Capability | Status | Evidence | Note |
|---|---|---|---|
| States draft → in_review → effective → superseded/retired | PARTIAL | `mdx-qms.ts:133-139` | "superseded" is never reached; `superseded_by_id` is never written. |
| Enforced transitions | PARTIAL | approve/retire signed; revise is an in-place UPDATE (`:661-676`) | draft → effective directly. |
| Version history | MISSING | `migrations/20260511_qms_and_labeling.sql:23-45` | One row per doc number. |
| Effective-date logic | DEFECT | `document-approval-signature.ts:262` | CAT2-19 |
| E-signature on approval / retire | WIRED | `document-approval-signature.ts`; `mdx-qms.ts:595-748` | |
| Periodic review | PARTIAL | `mdx-qms.ts:415-432` | No interval, no reminders, cannot advance without a revision. |
| Training assignment | MISSING | Denominator = whole org roster (`:828-830`) | |
| Read-and-understood | DEFECT | `:750-785, 823-853` | CAT2-21 |
| Change control | WIRED | `changeControl.service.ts`, `change-approval-signature.ts` | |
| CAPA / deviation linkage | PARTIAL | `changeControl.service.ts:276-299` | Free-text refs, hard delete. |
| Controlled copy / watermark / distribution | MISSING | grep: none in QMS paths | |
| Audit trail | WIRED | `recordAuditRow` → `meta.auditTrail`; signed acts in one transaction | |

### Parallel-implementation map
- **Canonical packager (v3.2.2):** `server/services/submission-gateways/regional-packager.ts#packageEctdSubmission` plus `ectd-packager/*`. It is reached through:
  - `ectd/assemble-from-core` / `package-from-core` (`/api/submissions/sequences/:id/assemble|transmit`, `/api/ectd/export`, `/api/ectd-compile/:id/compile`);
  - `ectd/package-leaf-bytes` (`/api/submission-ops/packages/:id/assemble`, eCTD formats);
  - `ectd/orchestrator-real-package` (`/api/submission-orchestrator`);
  - AnA `package_ectd_for_region`;
  - the qualification harness.
- **Live legacy packager:** `server/src/services/ectd.ts#buildECTDZip` emits an invalid `<ectd:index>`. It is still used by `submission-ops.ts:52,2763` for the `estar` and `eudamed_register` formats.
- **Parallel data model:** `services/ectd-submission-agent.ts` + `/api/ectd-submissions` (`register-document-routes.ts:110`). It has its own 4-rule validator and never transmits (`:290-358`). It is unclaimed by any launch surface, so production refuses it with 403.
- **Dead:** `routes/submissionCenter.routes.ts` (`register-governance-routes.ts:64` `void submissionCenterRoutes`). `ectd-stubs/` is referenced only by `scripts/validate-ectd-stubs-bundle.ts`. `infra/ind_mock/` is orphaned.
- **v4.0:** `ectd/ectd4/*` is a library reached only by qualification, `/api/ectd/v4/validate|forward-compat` and an AnA preview.
- **Validators (6+):**
  - `ectd-structural-validator.ts`
  - `ectd4-validator.ts`
  - `ectd-validator-hardening.ts`
  - `dispatch-readiness.ts`
  - `external-validator/fda-criteria-adapter.ts`
  - `ectd-submission-agent` inline rules
- **Transmit spines (2):**
  - `/api/submissions/sequences/:id/transmit` works on `ectd_sequences` and is gated by dispatch-readiness, but has no UI caller.
  - `/api/mdx/gateways/:region/:gateway/transmit` works on `submission_packages` via `governed-transmit`, is the UI path (`GatewayTransmittals.tsx:332`), and is not dispatch-gated.
- **Readiness engines (7):**
  - dispatch-readiness (the launch app)
  - `/api/submission-readiness` (client-supplied scores)
  - `submission-ops/readiness-engine`
  - `/api/dossier-readiness`
  - estar filing-readiness
  - ind-readiness-service
  - procurement-preflight
- **QMS:**
  - canonical: `/api/mdx/qms` (`mdx-qms.ts` + `services/qms/*`);
  - parallel `/api/qms` (`routes/qms.ts` + `qms.service.ts`), mounted at `register-document-routes.ts:271` and not claimed by the launch API map;
  - AnA duplicates of create, revise and ack (`AnaToolExecutor.ts:13712-13898`);
  - `/api/quality` is QMP/CTQ, a different concept.

### Findings

**CAT2-01 · P0 · Agency DTDs, stylesheets and STF DTD are absent, so no generated package has ever been validated**
- Evidence: `assets/ectd-dtd/` holds only README, `checksums.txt` (every entry commented out) and fixtures. Toy run: `dtdStatus.selfContained:false`, and `xmllint --valid index.xml` says "no DTD found". The same bundle reports `regionalBackbone.regionConformant:true` for FDA (`regional-backbone-readiness.ts:35`), which is a claim nothing has tested.
- Impact: every eCTD claim is unproven. The first real agency validation run will likely fail.
- Fix:
  - acquire the ICH v3.2.2, FDA v3.3 and STF v2.2 DTDs and the XSLs, with checksums;
  - make `xmllint --valid` a hard gate in assemble for FDA;
  - set `regionConformant` only from a passing DTD validation.
- Effort: S (acquire) + M (fix what it reveals). Dependencies: the files come from a network-permitted machine.

**CAT2-02 · P0 · The FDA us-regional.xml admin block is likely DTD-invalid**
- Evidence:
  - `<applicant-info/>` is empty when no contacts are passed, and the canonical path passes none (`regional-packager.ts:349`; `core-to-packager.ts:322-326`);
  - `sponsorId` and `sponsorName` are never used in `buildFdaBackbone`, so there is no DUNS `id` and no `company-name`;
  - in the toy output, `<email>`/`<telephone>` are unwrapped;
  - `<application>` has no `application-containing-files`;
  - M1 headings come out in leaf order (the toy put `m1-2-cover-letters` before `m1-1-forms`, `:485-494`);
  - `<form form-type>` is nested under `submission-information` (`:370-379, 511`);
  - heading names are derived from v4 context-of-use descriptions (`fda-regional-sections.ts`).
- These are UNVERIFIED against the v3.3 DTD because it is not in the repo, but I have high confidence.
- Impact: FDA technical rejection of Module 1.
- Fix: build Module 1 from a governed regulatory-identifiers record (DUNS, company, contacts), emit in DTD order, validate against the vendored DTD, and refuse `UNASSIGNED-ORG` sponsors at assemble.
- Effort: M. Dependencies: CAT2-01.

**CAT2-03 · P0 · The ICH heading tree is truncated and lacks required attributes**
- Evidence:
  - the toy `index.xml` places 3.2.S.4.1 and 3.2.S.4.2 directly under `<m3-2-s-drug-substance>` with no `substance`/`manufacturer` attributes;
  - 4.2.3.2 sits under `m4-2-3-toxicology`;
  - `m5-3-5` has no `indication` attribute and no `m5-3-5-1`;
  - the tree is limited to `ich-headings.ts:69-139`;
  - the comment at `ich-headings.ts:56-59` says "the DTD defines no m3-2-s-4 element", which is wrong for ICH v3.2.2;
  - there is no node-extension support;
  - folder names are non-ICH (`m3/3-2-s-4-1/`).
- Impact: DTD failure (required attributes) and leaves misfiled under the wrong CTD headings in the reviewer's view.
- Fix: encode the full ICH v3.2.2 tree with the repeatable-section attributes (substance, manufacturer, product-name, dosageform, indication) sourced from product data, add node-extension, and use ICH folder names.
- Effort: L. Dependencies: CAT2-01.

**CAT2-04 · P0 · The STF format is invented**
- Evidence (`stf-generator.ts:129-136`, toy `m5/5-3-5-1/study-101/stf.xml`):
  - DOCTYPE `SYSTEM "ich-stf-v2-2.dtd"` is relative to the study folder and cannot resolve;
  - `dtd-version="2.6.1"`, but the STF DTD version is 2.2;
  - it uses `<study-id>/<study-category>/<file-tag><leaf xlink:href=file>` instead of `study-identifier`/`study-document`/`doc-content xlink:href="…/index.xml#ID"` with empty `file-tag`;
  - the STF DTD is not in `requiredDtdsForRegion`.
- Impact: every NDA/BLA with Module 4/5 studies fails FDA STF validation.
- Fix: rewrite to ICH STF v2.2 with categories and index.xml leaf references.
- Effort: M. Dependencies: CAT2-01.

**CAT2-05 · P0 · No transmission path can deliver to an agency or record its acknowledgment**
- Evidence:
  - AS2 posts `application/octet-stream` with a detached signature, not S/MIME or PKCS#7, and there is no MDN verification (`fda-esg.ts:18-35`);
  - REST throws `UnverifiedTransportError`;
  - SFTP needs `ssh2-sftp-client`, which is not in `package.json` (`fda-esg.ts:503-521`);
  - `checkStatus` returns the stored row; there is no ACK1/2/3 poller (`:705-728`);
  - there is no center routing;
  - EMA CESP, EUDAMED, MHRA and the other adapters target unverified REST contracts (`ema-cesp.ts:1-22`, `mhra-gateway.ts:1-16`) without FDA's `UnverifiedTransportError` guard.
- Impact: a paying customer cannot submit through the product.
- Fix: implement CMS/S-MIME AS2 with MDN verification plus an ACK ingestion job, validate in the FDA ESG test environment, or partner with a certified ESG transmission provider. Mark the non-FDA gateways unverified and hide them.
- Effort: XL. Dependencies: FDA ESG account and certificates (founder).

**CAT2-06 · P1 · Gateway credentials are shared by the whole platform, not held per tenant**
- Evidence:
  - `envFor` reads `process.env` (`fda-esg.ts:109-116`);
  - `isConfigured(orgId, …)` ignores the organization (`:560-579`);
  - `loadFdaCredentials` inserts a `submission_gateway_credentials` row claiming the platform certificate as that organization's (`:140-151`);
  - keys are PEM files on disk.
- Impact: every tenant would transmit under one AS2 identity, which is a sponsor-identity and letter-of-authorization problem, with no key custody.
- Fix: per-org credentials in a KMS or secrets manager, rotation, and no side-effect writes in `isConfigured`.
- Effort: M.

**CAT2-07 · P0 (customers with existing applications) · Legacy eCTD sequences cannot be imported**
- Evidence: there is no backbone parser (grep finds only xml2js in `lorenz-adapter.ts`). Prior state comes only from sequences transmitted by the platform (`package-sequence-lifecycle.ts` header; `prior-sequence-loader.ts:58`). A replace or delete needs an in-system `modified-file` (`regional-packager.ts:866-878`).
- Impact: a sponsor at sequence 0042 cannot replace or delete anything filed in 0000–0041, which covers most IND/NDA customers.
- Fix: import existing sequences (index.xml, regional XML, STF) into the filed-leaf manifest.
- Effort: L.

**CAT2-08 · P0 · Submission-grade gates fail open in production by default**
- Evidence: `ECTD_REQUIRE_DTD`, `_PDFA`, `_XREF`, `_EVALIDATOR` and `_REGIONAL_BACKBONE` all default to report-only (`dtd-bundler.ts:219-221`, `external-validator/config.ts`, `pre-transmit-check.ts:13-21`). None is set in `.env.example`, deploy or helm (grep). There is no boot assertion.
- Impact: in production, a package with no DTDs, non-PDF/A leaves, no validator run and a placeholder backbone is allowed to reach the transmit path.
- Fix: invert the defaults (production = required) with a boot-time refusal, the same way `LAUNCH_SCOPE_ENFORCE` works.
- Effort: S. Dependencies: CAT2-01 and CAT2-05, or production dispatch becomes impossible.

**CAT2-09 · P1 · The UI transmit button bypasses Submission Readiness**
- Evidence: `GatewayTransmittals.tsx:332` calls `/api/mdx/gateways/…/transmit`, which runs `governed-transmit.ts:505-633`. That path checks structural errors, fingerprint and lock, but has no reference to sequences, shadow review or release signature (grep). The dispatch-gated `/api/submissions/sequences/:id/transmit` (`submissions.ts:1724`) has no client caller.
- Impact: the launch "Submission Readiness" gate does not govern what is actually sent.
- Fix: one spine. Transmit `ectd_sequences` through `transmitSequence` from Gateway Transmittals, then retire package transmit or make it call `assessSequenceDispatchReadiness`.
- Effort: M.

**CAT2-10 · P1 · The device (eSTAR/EUDAMED) transmit bundle is wrong**
- Evidence: `submission-ops.ts:2346-2360, 2763` builds section PDFs into `buildECTDZip`, producing `<ectd:index><ectd:leaf …/>` (`server/src/services/ectd.ts:40-77`), and that zip can go to ESG. The official eSTAR PDF (`/api/510k/estar/official`) is only a download. There is no CDRH Portal path.
- Impact: 510(k) customers cannot file from the product.
- Fix: the transmitted artifact must be the filled official eSTAR PDF, sent via ESG to CDRH or the CDRH Portal. Delete `buildECTDZip`.
- Effort: M.

**CAT2-11 · P1 · No FDA PDF technical-conformance checks**
- Evidence: PDF version, embedded fonts, bookmarks, hyperlinks, page size and the ≤180-character path length are all marked `enforcement:'external'` (`validation-rule-corpus.ts:315-365`). The fallback adapter checks only presence, naming and empty files, and is opt-in (`fda-criteria-adapter.ts:100-130`). Only encryption is enforced (`regional-packager.ts:228-231`). Whether Ghostscript PDF/A-1b conversion keeps links and bookmarks is UNVERIFIED.
- Impact: validator failures and reviewer complaints.
- Fix: a preflight using qpdf/veraPDF/pdf-lib covering version, fonts, outline depth, link targets, size and path, run before the backbone is built.
- Effort: L.

**CAT2-12 · P1 · Package layout has no sequence folder**
- Evidence: the toy zip root holds `index.xml`, `m1…`, with no `0000/`. `modified-file` pointers (`../0000/index.xml#…`) assume sibling sequence folders. The v4 packager does use `NNNN/` (`ectd4/rps-packager.ts` header). Whether the current ESG packaging rules require the folder is UNVERIFIED.
- Fix: emit `<sequence>/…`, optionally under the application folder.
- Effort: S.

**CAT2-13 · P1 · EU, PMDA, Health Canada and 8 other Module 1 backbones are invented**
- Evidence: `regional-packager.ts:526-629, 989-998`; `dtd-bundler.ts:17-27` admits it.
- Fix: hide these regions from the launch UI until they are built to the agency specs (EU M1 v3.x or v4).
- Effort: S (hide) / XL (build).

**CAT2-14 · P2 · eCTD v4.0 is a library only**
- Evidence: the RPS packager and validator exist but are not wired to assemble or transmit. Publishing Center only reads vocabularies (`PublishingCenter.tsx:1-20`).
- Impact: behind the vendors' v4 offerings. FDA has accepted v4.0 since 2024; v3.2.2 is still accepted.
- Effort: L.

**CAT2-15 · P1 (CLAUDE.md Rule 2) · A model-supplied risk figure is shown**
- Evidence: `rtfRiskScore = max(clamp01(model.rtfRiskScore), agg.rtf)` (`shadow-review-service.ts:224-226`), rendered with `toFixed(2)` in `SubmissionSeqWorkspaces.tsx:979-980`.
- Fix: persist and show only the deterministic aggregate.
- Effort: S.

**CAT2-16 · P1 · Submission Readiness rules are shallow**
- Evidence:
  - `MISSING_REQUIRED_SECTION` (for example no Form 1571 on an IND) is only a warning (`dispatch-readiness.ts:436`);
  - the corpus has 36 internal, unversioned rules, against FDA's criteria spreadsheet (UNVERIFIED count, roughly 150);
  - an imported Lorenz report is stored but never passed to the gate (`ectd-compile.ts:1406-1409`; `submissions.ts:1665` passes no report);
  - dispatch requires a completed LLM Shadow Review (`assess-dispatch-readiness.ts:204-213`), which blocks tenants where AI is disabled or unavailable.
- Fix: make a section required by the application type an error; fold in the imported report bound to the package sha256; pin the rule corpus to an FDA criteria version; allow a signed human-review substitute for Shadow Review.
- Effort: M.

**CAT2-17 · P1 · Duplicate implementations (working agreement: zero duplication)**
- Evidence: see the parallel-implementation map. `ectd-submission-agent`, `buildECTDZip`, `/api/qms`, 6+ validators and 7 readiness engines.
- Fix: delete the non-canonical paths, naming the replacement file in each commit as CLAUDE.md requires.
- Effort: M.

**CAT2-18 · P0 (QMS) · No document version history; a revision overwrites the effective version**
- Evidence: unique `(org, doc_number)`, one row per document (`migrations/20260511_qms_and_labeling.sql:23-45`). Revise sets `status='draft'` and bumps the version on the same row (`mdx-qms.ts:661-676`; `AnaToolExecutor.ts:13816-13826`). `superseded_by_id` is never written, and "superseded" is unreachable on the canonical path.
- Impact: from the moment a revision opens, no effective SOP is in force and the prior approved version cannot be retrieved. This conflicts with 21 CFR 820.40 and ISO 13485 §4.2.4.
- Fix: an immutable `qms_document_versions` table. The prior version stays effective until the new one is approved, then becomes superseded.
- Effort: L.

**CAT2-19 · P1 · Effective date carries over and can be backdated**
- Evidence:
  - revise does not clear `effective_date`;
  - approval sets `COALESCE($param, effective_date, now)` (`document-approval-signature.ts:262`);
  - the client never sends `effectiveDate` (`qmsApproval.ts:32-38`);
  - so v2.0 shows v1.0's effective date;
  - PATCH can set `effective_date` on a draft (`mdx-qms.ts:456-460`), and `effective_date` is excluded from the signed digest (`:120-137`);
  - there is no "approved, pending effective" state.
- Fix: reset the date on revise, require the effective date at signing, include it in the digest, and add a scheduled-effective state.
- Effort: S–M.

**CAT2-20 · P1 · The signature binds the artifact pointer, not its content**
- Evidence: the digest includes `artifactId` only (`document-approval-signature.ts:120-137`).
- Impact: controlled text could change after approval if the artifact is mutable (UNVERIFIED whether it is).
- Fix: include a hash of the artifact bytes.
- Effort: S.

**CAT2-21 · P1 · Read-and-understood records are not trustworthy**
- Evidence:
  - the compliance query counts acknowledgments of any version (`mdx-qms.ts:831-837`, no version filter), while the correct version-matched query sits in the unused parallel service (`qms.service.ts:136-157`);
  - acknowledgment is accepted for draft or retired documents (`mdx-qms.ts:757-763`);
  - there is no assignment, and the denominator is the whole org (`:828-830`);
  - there is no acknowledgment UI (no client caller);
  - AnA `ack_training` writes a training record from chat, with a model-supplied `quiz_score` and no audit row (`AnaToolExecutor.ts:13863-13898`);
  - `/api/qms/training` lets any caller record training for any `userId`, with no audit (`routes/qms.ts:106-121`).
- Impact: training records an auditor could reject; a model can create evidence.
- Fix: role or curriculum assignment, an e-signed acknowledgment in the UI, version-bound compliance; delete the AnA write and `/api/qms`.
- Effort: M.

**CAT2-22 · P2 · Periodic review is incomplete**
- Evidence:
  - there is no review interval or reminders;
  - PATCH is refused on effective documents (`mdx-qms.ts:477-495`), so a "reviewed, no change" outcome forces a major revision;
  - the register's overdue flag is computed in the browser against a hard-coded `TODAY='2026-06-04'` (`quality/data.ts`; `SopRegister.tsx:346`), and `adaptDoc` drops the server's `overdue` value (`hooks.ts`).
- Fix: a review-complete signed action with an interval, a scheduler, and the server's `overdue` value.
- Effort: M.

**CAT2-23 · P2 · Approval is a single step with one signature**
- Evidence: `draft` is approvable (`document-approval-signature.ts:112`; the UI shows Approve on drafts at `SopRegister.tsx:384`). There is no reviewer/approver routing.
- Fix: configurable routing with multiple signatures.
- Effort: M.

**CAT2-24 · P2 · No controlled copies or distribution**
- Evidence: grep finds no watermark, "CONTROLLED COPY" or uncontrolled-print marking in QMS paths, and no distribution lists.
- Fix: rendered PDF with a watermark and print audit.
- Effort: M.

**CAT2-25 · P2 · Change-control links are weak**
- Evidence: links are free-text refs with no foreign key to CAPA or deviation records, and removal is a hard DELETE (`changeControl.service.ts:276-299`).
- Effort: S.

**CAT2-26 · P2 · QMS writes only through the assistant**
- Evidence: create, revise and change transitions from the QMS UI all go through AnA prompts (`SopRegister.tsx`/`ChangeControl.tsx` `onAsk`). Only approve and retire are direct.
- Fix: governed forms.
- Effort: M.

**CAT2-27 · P3 · Two official FDA form templates are unreviewed**
- Evidence: FDA 1571 and 3674 manifests have `assetTrusted:false`, `reviewedBy:null` (`templates/forms/acroforms/*.manifest.json`).
- Fix: a named review before GA.
- Effort: S.

### Recommended work orders (in order)
1. **WO-A: Conformance baseline** (CAT2-01, 08, 12). Vendor the DTDs, XSLs and STF DTD with checksums. Emit a sequence folder. Invert the production gate defaults.
   - Accept when: toy FDA sequence 0000 passes `xmllint --valid` on `index.xml`, `us-regional.xml` and `stf.xml`; a production boot with `ECTD_REQUIRE_*` unset refuses to start; a test shows the gate failing on a missing DTD.
   - Effort: M.
2. **WO-B: FDA Module 1 + ICH tree + STF rebuild** (CAT2-02, 03, 04).
   - Accept when: a golden IND, NDA and BLA package with 3.2.S/3.2.P attributes, 5.3.5 indication and two studies DTD-validates, and a licensed eValidator reports 0 high-severity errors.
   - Effort: L. Needs WO-A.
3. **WO-C: Validator + PDF preflight** (CAT2-11, 16, 15).
   - Scope: Lorenz (or equivalent) as a mandatory production gate; imported report bound to the package sha256 and passed to `assessSequenceDispatchReadiness`; PDF version, font, bookmark, link and path checks; required Module 1 sections become errors; model risk score removed.
   - Accept when: a known-bad PDF (unembedded font, broken link, a 181-character path) blocks dispatch; an IND without a 1571 blocks.
   - Effort: L. Needs a licence.
4. **WO-D: One transmit spine** (CAT2-09, 10, 17).
   - Scope: Gateway Transmittals calls `transmitSequence`; `buildECTDZip`, `ectd-submission-agent` and the package transmit are deleted; eSTAR transmits the official PDF.
   - Accept when: a grep for `buildECTDZip`, `/api/ectd-submissions` and package transmit returns nothing; the UI transmit of a sequence with no Shadow Review is refused.
   - Effort: M.
5. **WO-E: Real transmission** (CAT2-05, 06).
   - Scope: S/MIME AS2 with MDN verification, per-tenant KMS credentials, center routing, ACK1–3 ingestion, and a test in the FDA ESG test environment (or a transmission-partner integration).
   - Accept when: ACK1–3 for a test submission are stored verbatim and the sequence status moves from them.
   - Effort: XL. Needs ESG accounts.
6. **WO-F: Legacy sequence import** (CAT2-07).
   - Accept when: an imported 3-sequence FDA application lets sequence 0003 replace a 0001 leaf, with `modified-file` resolving.
   - Effort: L. Needs WO-B.
7. **WO-G: QMS versioned document control** (CAT2-18, 19, 20, 23).
   - Accept when: after a revision opens, v1.0 is still effective and retrievable byte-for-byte; approving v2.0 supersedes v1.0 and sets v2.0's own effective date (a future date means pending); the signed digest covers the artifact bytes and the effective date; two-step review and approval.
   - Effort: L.
8. **WO-H: QMS training** (CAT2-21, 22, 26).
   - Accept when: assignments exist by role; the acknowledgment is e-signed in the UI; after v2.0 goes effective, compliance for that document falls to 0 of N assigned; `ack_training` (AnA) and `/api/qms` are deleted; overdue comes from the server.
   - Effort: M.
9. **WO-I: Controlled copy + periodic review workflow + CAPA foreign keys** (CAT2-22, 24, 25). Effort: M.

### Open questions / needs from the founder
- **FDA ESG:** a per-customer ESG account and AS2 certificate, or does the platform act as a transmission agent with letters of authorization? Is a production account available, and a test account (GW test)? Or will you partner with a certified ESG transmission provider?
- **Validator licence:** Lorenz eValidator, Extedo or GlobalSubmit, and which region profiles?
- **DTD acquisition:** someone on a network-permitted machine needs to download the ICH, FDA and STF DTDs and XSLs, plus EU M1 if the EU is in scope.
- **Regions at launch:** FDA only? If so, EMA, PMDA, HC and the other regional options should be hidden.
- **eCTD v4.0:** is it required for launch customers, for example new FDA applications?
- **eSTAR:** is the CDRH Portal or ESG the target route? Please confirm the pinned eSTAR template version is current.
- **QMS positioning:** "SOP register lite" or a replacement for MasterControl or Veeva QualityDocs? The answer sets whether WO-G, H and I are launch-blocking.
- **Existing customers:** will pilots bring existing INDs or NDAs? If so, WO-F is launch-blocking.
