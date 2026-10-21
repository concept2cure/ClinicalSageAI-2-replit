# MR-10 — eCTD v3.2.2 conformance and a real FDA transmission path

| | |
|---|---|
| Phase | Phase 0 (stage 1) · Phase 1 (stages 2–9, and the build half of stage 10) · Phase 2 (stage 10 test-endpoint acceptance, stages 11–12, and stage 13 if the pilot is medtech) · Phase 3 (stage 14) · Backlog (stage 15) |
| Highest open severity at head | P0 |
| Human testing | Blocks: placing a Module 4/5 study report in an FDA sequence and compiling, freezing or dispatching it (CAT2-04); transmitting to FDA ESG and seeing an acknowledgment (CAT2-05); replace, append or delete against an existing application (CAT2-07). Degrades: every compile reports "not self-contained" (CAT2-01); us-regional.xml carries a placeholder D-U-N-S and no contacts (CAT2-02); device packages assemble as the wrong artifact (CAT2-10); non-FDA regions are selectable and buildable (CAT2-13). |
| Owner | mixed |
| Effort | XL overall — S + M + M + M + L + M + M + L + L + XL + S + S + M + M + L (stages 1–15) |
| Depends on | MR-11 (CAT2-09 one transmit spine; CAT2-16 readiness rule depth), MR-03 (first production deploy, deploy-aws.yml preflight, KMS and Secrets Manager), MR-08 (Vault ingest of zip archives, for stage 9), MR-02 (a gated branch the new tests run in); F-8, F-9, F-10, F-23; three NEW founder items listed below |
| Findings | 14 total — open 9 · partially fixed 5 · fixed 0 · refuted 0 · unverifiable 0 |
| Basis | cold audit at `92ccdba1`; every status re-verified at `94b4f9238` on 2026-10-13 — [evidence](../evidence/reviews/2026-10-13-market-readiness/) · [findings register](MR-findings-2026-10-13.json). The branch moves about 1,500 commits a day: re-confirm each finding at the current head before starting its stage. |

> **Re-checked 2026-10-18 at `8ca7e74ca`** (every finding that stopped a tester's journey at `94b4f9238`). Start from this, not from the 13 October text below, for:
> - **CAT2-04**: partially fixed; for testers it now still stops the journey. Evidence at head: [findings register](MR-findings-2026-10-13.json), `CAT2-04.recheck`.
> - **CAT2-05**: partially fixed (e1f3fd425); for testers it now still stops the journey. Evidence at head: [findings register](MR-findings-2026-10-13.json), `CAT2-05.recheck`.
> - **CAT2-07**: still open; for testers it now still stops the journey. Evidence at head: [findings register](MR-findings-2026-10-13.json), `CAT2-07.recheck`.

## Goal

A pilot sponsor builds an FDA IND sequence in the Submission Center, and the package passes `xmllint --valid` against the vendored ICH, FDA regional and STF DTDs. It carries the sponsor's real D-U-N-S number and regulatory contact, a full ICH heading tree with the required substance, product and indication attributes, a Study Tagging File for every study report, and leaf PDFs that pass a deterministic FDA technical preflight. The product sends that sequence to FDA's ESG test environment in a signed and encrypted AS2 message, verifies the signed MDN, and records ACK1–ACK3 verbatim against the sequence. Follow-up sequences can replace leaves filed by another publisher once those sequences are imported. In production, every submission-grade gate is required by default.

## Why it matters

- **The pilot deliverable cannot be produced today.** Launch row D7 requires one sequence accepted by FDA's ESG test environment with the acknowledgment chain filed. At head the AS2 message is not S/MIME, the MDN is not verified, and no ACK is ever ingested (CAT2-05). The package would also fail DTD validation, because its Module 1 (CAT2-02), its ICH tree (CAT2-03) and its STFs (CAT2-04) do not match the DTDs, and no DTD is in the repository to show this (CAT2-01).
- **A tester cannot finish the normal IND journey.** An IND sequence 0000 usually carries Module 4 study reports. Since 08b6c053a, the FDA 1789 gate refuses any such sequence unless each leaf has a study id and STF file-tag, and no field in the Submission Center records them (CAT2-04).
- **A design partner with an existing IND cannot use the product for its next amendment.** Sequences filed by another publisher cannot be imported, so replacing an Investigator's Brochure or protocol is refused or skipped (CAT2-07).
- **An auditor would find the wrong artifact under a Part 11 signature.** A 510(k) package assembles as a flat pseudo-eCTD zip that the transmit path admits for FDA ESG (CAT2-10). EU, Japanese, Canadian and other Module 1 backbones are invented, yet can still be built (CAT2-13).
- **"Dispatch cleared" does not mean "agency-valid".** The DTD, external validator, regional backbone and cross-reference gates are report-only in production by default (CAT2-08), and no PDF version, font, bookmark, link, page-size or path-length check runs anywhere (CAT2-11). The first real sequence would surface these as FDA findings rather than product refusals.

## State at head

| Finding | Status at head | Severity (pilot) | Tester impact | Evidence at head |
|---|---|---|---|---|
| CAT2-01 | PARTIALLY_FIXED | P0 | degrades | No `.dtd`/`.xsl` tracked; `assets/ectd-dtd/checksums.txt:44-50` placeholders; `dtd-bundler.ts:85-111` names no STF DTD; no `xmllint --valid` in packager (`regional-packager.ts:1246-1278`) |
| CAT2-02 | PARTIALLY_FIXED | P0 | degrades | `ectd-compile.ts:1047` passes `UNASSIGNED-ORG-${orgId}`; `core-to-packager.ts:349-357` no contacts or forms; Module 1 flat via `fda-regional-sections.ts:92-116` |
| CAT2-03 | STILL_OPEN | P0 | no | `ich-headings.ts:91-161` tree stops at `m3-2-s-drug-substance` etc.; `buildIchModuleTree` (`:290-330`) emits no attributes; no `node-extension` |
| CAT2-04 | PARTIALLY_FIXED | P0 | blocks | `regional-packager.ts:926-948` 1789 refusal, but `UpsertLeafInput` (`submission-service.ts:2363-2385`) has no study id or tag; STF DOCTYPE unresolvable (`stf-generator.ts:232`) |
| CAT2-05 | STILL_OPEN | P0 | blocks | `fda-esg.ts:734-741` posts `application/octet-stream`; `:768` marks received on unverified MDN; `checkStatus` echoes stored row (`:782-805`) |
| CAT2-06 | PARTIALLY_FIXED | P2 | no | `fda-esg.ts:197-210` INSERT reached from `isConfigured`; `credential-cipher.ts` single env key, static salt, no rotation |
| CAT2-07 | STILL_OPEN | P1 | blocks | `package-sequence-lifecycle.ts:430` NO_PRIOR_SEQUENCE; `prior-sequence-loader.ts:138-205` reads only platform-transmitted rows; no importer |
| CAT2-08 | STILL_OPEN | P1 | no | `dtd-bundler.ts:226-228`, `regional-backbone-readiness.ts:138-140`, `cross-reference-resolver.ts:132-134`, `external-validator/config.ts:23-25` default false |
| CAT2-10 | STILL_OPEN | P1 | degrades | `submission-ops.ts:3071-3080` calls `buildECTDZip`; `pre-transmit-check.ts:318-345` maps estar→fda |
| CAT2-11 | STILL_OPEN | P1 | no | `validation-rule-corpus.ts:335-343`, `:384-392` enforcement `'external'`; `pdfa-detect.ts:188-207` checks /Encrypt only |
| CAT2-12 | STILL_OPEN | P1 | no | `regional-packager.ts:1209-1307` writes every entry at archive root; `sequence-manifest.ts:171` assumes `../NNNN/` siblings |
| CAT2-13 | PARTIALLY_FIXED | P2 | degrades | `fixtures/submission.ts:26-39` offers 12 regions; `createSequence` (`submission-service.ts:567-578`) ignores offer tier; `mhra-gateway.ts:67-82` still POSTs |
| CAT2-14 | STILL_OPEN | P3 | no | `routes/ectd-v4.ts` mounted (`register-document-routes.ts:139-140`); `PublishingCenter.tsx:7-14` read/validate only |
| CAT2-27 | STILL_OPEN | P3 | no | `templates/forms/acroforms/*.manifest.json` for XFA 1571 and 3674 have `reviewedBy:null`, `assetTrusted:false` |

## Already done at head — do not redo

- **FDA region conformance is no longer claimed by region alone** (CAT2-01, fixed part). 8f1c2ba5f: `classifyRegionalBackbone` (`server/services/ectd/regional-backbone-readiness.ts:117-135`) returns `regionConformant:true` only when `fdaBackboneGaps` (`regional-packager.ts:465-474`) is empty, and `fdaContactGaps` (`:477-489`) always yields a gap today. Stage 3 adds the DTD result to this, it does not replace it.
- **us-regional.xml applicant block, contact wrappers, `application-containing-files` and heading sort** (CAT2-02, fixed part). 8f1c2ba5f: `fdaApplicantInfoBlock` (`regional-packager.ts:387-395`), `fdaApplicantContact` (`:406-417`), `buildFdaBackbone` (`:632`), `fdaModule1Block` (`:441-458`). cea1f4450: FDA identifier rules in `server/services/ectd/regulatory-identifiers.ts:180-281`, and the package-path refusal REGULATORY-IDENTIFIER-MISSING at `server/routes/submission-ops.ts:2944-3004`, with the form at `PUT /api/submission-ops/packages/:id/regulatory-identifiers` (`:2258`). Stage 4 reuses these rules on the sequence path.
- **STF shape** (CAT2-04, fixed part). 6becd3fda: `stf-generator.ts:153-308` emits `study-identifier` and `doc-content xlink:href='<rel>/index.xml#<leafID>'`, names files `stf-<study-id>.xml`, refuses dataset tags outside the TRC 1735 list; packager wiring at `regional-packager.ts:1114-1186`. 08b6c053a: the 1789 coverage refusal (`regional-packager.ts:916-948`), `migrations/20261012_submission_leaf_stf_study_tagging.sql` and `core-to-packager.ts:203-208`. Keep the refusal; stage 1 makes it satisfiable.
- **Per-organisation FDA ESG client accounts** (CAT2-06, fixed part). b7bf25037, cb2ec9bad, df19950d7: `gateway-accounts.ts`, `fda-esg.ts:133-173`, the guarded transmit at `submission-gateways/index.ts:244-262`, admin-plus-re-auth `PUT` at `server/routes/gateway-accounts.ts:107-119`, `migrations/20261001g_organization_gateway_accounts.sql` (registered at `scripts/db/migration-set.mjs:3078`) and `GatewayAccountsSetting.tsx`.
- **Non-FDA markets are labelled honestly and partly fenced** (CAT2-13, fixed part). a3dd2889b: `market-support.ts:200-235` `filingOfferFor` and `module1ShapeOf`; 2ca6f29d4: `server/routes/c2c/projects.ts:761` refuses not_offered and the Health Canada adapter stops posting; cbe8cd038: JP_ECTD_V4_REQUIRED in `dispatch-readiness.ts`.
- **Transport honesty labels** (CAT2-05). `transport-refusals.ts:21` FDA_ESG_NOT_PROVEN and `market-support.ts:282` label FDA ESG unproven; `pmda-gateway.ts:68`, `health-canada-gateway.ts` and `ema-cesp.ts:332` (centralised) refuse. Do not remove these labels until stage 10's acceptance (f) holds.
- **PDF/A is not required by default.** `server/services/ectd/pdfa-requirement.ts:1-20` records the founder-delegated decision of 2026-10-01. It is a scope decision, not a defect; stage 11 leaves it alone.

## Work, in order

### Stage 1 — Record study id and STF file-tag on the placement path (Phase 0 · S · engineering) — closes CAT2-04 (part: unblocks testing)

2026-10-20 continuation: the governed writer and existing-leaf Builder editor
were already completed in the
[Builder evidence](../evidence/MR-10/2026-10-20-builder-study-tagging/README.md).
The three existing placement forms are now connected to those same fields and
rules; qualification is recorded in
[placement evidence](../evidence/MR-10/2026-10-20-study-placement/README.md).
Required inputs follow the existing FDA/unknown-region coverage severity;
other regions retain their advisory behavior. The tag remains explicit reviewed
text because the document-tag recall list is not yet source-verified. Stage 6
still owns the sourced vocabulary and DTD qualification. This continuation does
not close CAT2-04 or establish agency acceptance or human witnessing.

1. Re-confirm CAT2-04 at the current head (statuses here are from 94b4f9238).
2. Failing first: add a pglite route test showing that an FDA sequence with a 5.3.5.1 leaf placed through `PUT /api/submissions/sequences/:seqId/leaves` fails compile with FDA-TRC-1789 when no study id or file-tag is given. Record the red output.
3. In `server/services/submission-service/submission-service.ts`, add `studyId?: string | null` and `stfFileTag?: string | null` to `UpsertLeafInput` (`:2363-2385`), and persist both in the insert (`:3169-3186`) and in the update branch. The columns already exist (`migrations/20261012_submission_leaf_stf_study_tagging.sql`); no migration is needed.
4. Add both fields to `upsertLeafSchema` (`server/routes/submissions.ts:192-212`). Validate `studyId` with `stfFileName()` (`stf-generator.ts:168-178`), so an id that cannot form an eCTD file name answers 400. Validate `stfFileTag` against `STF_DOCUMENT_FILE_TAGS` (replaced by a sourced list in stage 6) or, for datasets, `STF_DATASET_FILE_TAGS`. Keep the governed-reason requirement and the audit row.
5. In the three placement dialogs — `client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx`, `VaultPlaceIntoSubmission.tsx` and `AuthoringPlaceIntoFiling.tsx` — show required "Study id" and "STF file-tag" fields when `requiresStfReference(section)` (`server/services/ectd/ectd4-validator.ts:134-137`) is true. The file-tag is a select over the tag list. Never prefill by inference. Let an already-placed leaf's study id and tag be edited through the same governed update.

**Acceptance**
- The step-2 test is red at head and green after: the same 5.3.5.1 leaf placed with `studyId: 'STUDY-101'` and a listed tag compiles in eCTD Compile and produces `m5/.../stf-study-101.xml`.
- The placement dialog requires both fields where `requiresStfReference` is true, and does not show them for 4.3, 5.2, 5.3.6 and 5.4.
- A study id that `stfFileName()` rejects answers 400 from the route, with nothing written.

### Stage 2 — Fail closed on formats, regions and adapters the pilot does not support (Phase 1 · M · mixed) — closes CAT2-13; CAT2-10 (interim); CAT2-05 (adapter part)

CAT2-13 alone is P2. It is done here because it is small, it shares the adapter refusal with CAT2-05, and it removes signed-but-wrong artifacts before the first production deploy.

1. Re-confirm CAT2-10, CAT2-13 and CAT2-05 at the current head (statuses here are from 94b4f9238).
2. Founder: confirm in writing that the pilot is FDA-only and non-FDA markets are author-only (F-10), and record it in `docs/LAUNCH_DEFINITION_OF_DONE.md` under D2. Record whether 510(k) is in pilot scope (F-10); stage 13 depends on it.
3. Failing-first tests, all red at head:
   - `server/routes/__tests__/submission-ops-device-format.test.ts`: assembling a package of family `'510k'` and one of family `'mdr'` through `POST /api/submission-ops/packages/:id/assemble` must answer 422 `DEVICE_BUNDLE_NOT_SUPPORTED` and write no `metadata.bundle` (head returns 201 with a `buildECTDZip` bundle);
   - a pre-transmit case under `server/services/submission-gateways/__tests__/`: a stored bundle with format `'estar'` or `'eudamed_register'` and no `officialEstar` evidence is a blocker;
   - a pglite test: `createSequence` for a submission with `primaryRegion 'eu'` and `applicationType 'maa'` throws `SubmissionError('VALIDATION')` carrying the market's `offer.reason`; the same test for fda/ind still creates 0000;
   - a client test: `NewSubmissionForm` with a stubbed market-support response disables "EU (EMA)" for MAA and enables "FDA (US)" for IND;
   - one test per adapter (mhra, nmpa, tga-ebs, swissmedic, anvisa, cdsco-sugam, mfds, hsa-prism, ema:eudamed, and CESP for national/MRP/DCP): with credentials set, `transmit()` throws `UnverifiedTransportError` and makes no HTTP request and no transmittal row.
4. Device interim. In `server/routes/submission-ops.ts`, replace the `else { buildECTDZip(...) }` branch (`:3071-3080`) with a 422 refusal: "A device submission is filed as the official FDA eSTAR, which this route does not build. Nothing was assembled." In `pre-transmit-check.ts` (`:318-345`), push a blocker for `fmt` `'estar'` or `'eudamed_register'` unless the descriptor carries `officialEstar: { templateSha256, filledSha256 }`. Refuse the same way in the k510 transmit in `server/services/ana-ri/mdx-command-handlers.ts:827`. Refuse `'eudamed_register'` in assemble and transmit and hide it in the UI.
5. Sequence creation. In `createSequence` (`submission-service.ts:567`), after the `sequenceTypeRefusal` check at `:578`, read the offer with `readMarketSupport` (`server/services/regulatory/market-support.ts`) for `{ applicationType: parent.applicationType, market: input.region }` and for `parent.primaryRegion`, using the request-scoped client as `server/routes/submissions.ts:351` does (thread a queryable through `ctx`, or call a pure `marketOfferGivenOutline` as `projects.ts:760` does). Throw `SubmissionError('VALIDATION', offer.reason)` unless `offer.tier === 'build_and_sequence'`. AnA and MCP callers reach `createSequence`, so this covers them.
6. Submission creation. In the `POST /` handler at `server/routes/submissions.ts:244`, compute the same offer for `(applicationType, primaryRegion)`. Answer 422 `FILING_NOT_OFFERED` when the tier is `not_offered`; allow `author_only` and return the offer on the created row.
7. Client. In `NewSubmissionForm.tsx` `submissionFields` (`:137-140`), disable region options whose server tier is not `build_and_sequence`, keeping the server's reason as option text. Extend `MarketSupportView` in `client/src/concept2cure/v2/MarketSupportLine.tsx:20` with `offer`. Do not delete `SC_REGIONS` (`client/src/concept2cure/v2/fixtures/submission.ts:26`). Authoring for those markets stays reachable through New project (`server/routes/c2c/projects.ts:761`, `client/src/concept2cure/v2/surfaces/Projects.tsx`, `ProjectMarkets.tsx`); name those paths in the commit message.
8. Adapters. Make each generic adapter's `transmit()` throw `UnverifiedTransportError(..., ADAPTER_UNSOURCED)` before `insertTransmittal` and before any request, mirroring `pmda-gateway.ts:68` and `health-canada-gateway.ts` (`HC_REFUSAL`, `:57-61`): `ema-cesp.ts` (non-centralised), `mhra-gateway.ts:67`, `nmpa-gateway.ts`, `tga-ebs-gateway.ts`, swissmedic, anvisa, cdsco, mfds, hsa and EUDAMED.
9. Leave `ECTD_REQUIRE_REGIONAL_BACKBONE` to stage 11, so `server/services/ectd/__tests__/submission-gate-posture.test.ts` changes once.

**Acceptance**
- Each step-3 test is red at head and green after; existing pre-transmit and regional-backbone-readiness tests stay green.
- Assembling a 510(k)-family package answers 422 `DEVICE_BUNDLE_NOT_SUPPORTED` with no bundle persisted; AnA k510 transmit refuses a non-eSTAR bundle.
- `MhraGateway.transmit` with credentials set throws `UnverifiedTransportError` and never calls `httpsRequest`; likewise for every adapter listed in step 8.

### Stage 3 — Vendor the agency DTDs and validate every backbone (Phase 1 · M · mixed) — closes CAT2-01

This is the root of stages 4–7, 9, 10 and 11. Nothing downstream can be proved without it.

1. Re-confirm CAT2-01 at the current head (statuses here are from 94b4f9238).
2. On a machine with network access (the build environment blocks fda.gov and ich.org), download and keep each agency header byte-for-byte: `ich-ectd-3-2.dtd` and `ectd-2-0.xsl` (ICH eCTD v3.2.2 package); `us-regional-v3-3.dtd` and `us-regional.xsl` (FDA Module 1 v3.3); the FDA Module 1 valid-values file (applicant-contact-type, telephone-number-type, form-type, submission-type codes); `ich-stf-v2-2.dtd` and its stylesheet (FDA STF specification page); and the STF file-tag and category valid-values used in stage 6.
3. Commit them into `assets/ectd-dtd/`. Record source URL, spec version, retrieval date and who fetched them in `docs/runbooks/ectd-dtd-vendoring.md`. In `assets/ectd-dtd/checksums.txt`, replace the commented placeholders at lines 44-50 with real `sha256sum` lines for every `.dtd` and `.xsl`, including `ich-stf-v2-2.dtd` and its `.xsl`. Add the STF rows to the "Required files" table in `assets/ectd-dtd/README.md`.
4. In `server/services/ectd/dtd-bundler.ts`: add `export const ICH_STF_DTD = 'ich-stf-v2-2.dtd'`; change `requiredDtdsForRegion(region)` to `requiredDtdsForRegion(region, opts?: { hasStf?: boolean })` and append `ICH_STF_DTD` when `hasStf`; thread `hasStf` through `assessDtdReadiness`. In `regional-packager.ts` at the `assessDtdReadiness` call (`:1266-1272`), pass `hasStf: stfSyntheticLeaves.length > 0`.
5. In `regional-packager.ts`, after `index.xml` is written (~`:1295`) and before the bundle returns: materialise the package tree in a temp dir (or reuse the `emitUnzipped` tree), run `validateAgainstDtd` (`server/services/ectd/xml-validator.ts`) on `index.xml`, the regional backbone and every `stf-*.xml`, and record `dtdValidation: Array<{ file; ran; valid; errors }>` on the bundle. Add the field to the bundle type in `server/services/submission-gateways/types.ts` beside `dtdStatus`.
6. Fail closed. When `environment === 'production'`, throw a `ValidationError` naming each file and its first xmllint errors if xmllint did not run, any file is invalid, or a required DTD is missing. In staging, record the result on the bundle and surface it.
7. Change `classifyRegionalBackbone` (`regional-backbone-readiness.ts:117-135`) to accept the regional backbone's DTD result and return `regionConformant:true` only when builder gaps are empty and that validation ran and passed. Update the detail text in `evaluateRegionalBackboneGate` and the regional-backbone rows in `pre-transmit-check.ts` (`:279-355`).
8. In `server/routes/ectd-compile.ts` (`:1176-1180`), keep the self-containment blocker and add a blocker naming each DTD-invalid file from `bundle.dtdValidation`.
9. In `server/services/ectd/qualification/qualify.ts` (`:429-440`), run `validateBackboneFile` (`:286-311`) on every `stf-*.xml` too, and stop returning `dtdSkipped` when the DTD is vendored.
10. Add `server/services/ectd/__tests__/dtd-validation-gate.test.ts`: (a) `xmllint --valid` rejects `assets/ectd-dtd/fixtures/index-invalid.xml`; (b) packaging the golden FDA fixture (`qualification/golden-fixtures.ts`) in production mode throws while CAT2-02/03/04 are open — commit that red output, the case turns green as stages 4–6 land; (c) a one-byte change to a vendored DTD in a temp copy makes `verifyChecksumManifest` fail.
11. Do not flip `ECTD_REQUIRE_DTD` here; stage 11 does it.

**Acceptance**
- `git ls-files assets/ectd-dtd` lists `ich-ectd-3-2.dtd`, `ectd-2-0.xsl`, `us-regional-v3-3.dtd`, `us-regional.xsl` and `ich-stf-v2-2.dtd`; `cd assets/ectd-dtd && grep -v '^#' checksums.txt | grep . | sha256sum -c` passes; a one-byte change makes `verifyChecksumManifest` fail.
- Failing first: before stages 4–6, the test shows `xmllint --valid` failing on the golden package's `us-regional.xml`, `index.xml` and STFs, and the production packager throwing; `fixtures/index-invalid.xml` is rejected.
- A production packaging run with xmllint removed from `PATH` refuses rather than recording `ran:false` and continuing.
- `regionConformant` is true only when the regional backbone passed DTD validation and builder gaps are empty; a unit test covers both outcomes.
- `npm run qualify:ectd` emits "xmllint DTD" rows, with no `dtdSkipped`, for `index.xml`, `m1/us/us-regional.xml` and every STF.
- An FDA compile in eCTD Compile no longer shows the "not self-contained" blocker.

### Stage 4 — A conformant FDA us-regional.xml on the sequence path (Phase 1 · M · engineering) — closes CAT2-02

1. Re-confirm CAT2-02 at the current head (statuses here are from 94b4f9238).
2. Failing first: add `server/services/submission-gateways/__tests__/fda-us-regional-dtd-valid.test.ts`. It builds an FDA package through `buildPackagerInputFromCore` and runs `xmllint --valid` on `m1/us/us-regional.xml`. Commit its red output (missing `applicant-contacts`, `telephone-number-type`, `m1-3` nesting).
3. Migration `migrations/<date>_regulatory_programs_fda_applicant_identity.sql`: `ALTER TABLE regulatory_programs ADD COLUMN IF NOT EXISTS` for `applicant_duns`, `regulatory_contact_name`, `regulatory_contact_phone`, `regulatory_contact_phone_type`, `regulatory_contact_email` (all `TEXT NULL`), with a house-style header stating Rule 1 replay safety. Register it in `C2C_MIGRATION_FILES` (`scripts/db/migration-set.mjs`) before the final tenant-sweep pair; run `npm run ci:migration-set-order` and `npm run ci:migration-drop-safety`; mirror the columns in `shared/schema/programs.ts`. (`regulatory_programs` is already public with `organization_id INTEGER NOT NULL`.)
4. Record the values the way `IndFormsPanel.tsx` and `server/routes/ind-forms.routes.ts` record `regulatory_programs.sponsor_address`: a governed write with a required reason and an audit row, validated with `DUNS_NUMBER_PATTERN` and `fdaIdentifierProblems` (`regulatory-identifiers.ts:203-281`), and the fields on the project's regulatory-identity form.
5. In `server/services/ectd/package-identity.ts`, make `readRecordedPackageIdentity` select the new columns and return `applicantId` and `contact`, and make `packageIdentityRefusal` accept `{ fda: true }` and throw `PackageIdentityMissingError` when the DUNS or contact is missing or invalid.
6. Remove every `UNASSIGNED-ORG-` fallback outside `dryRunPackageIdentity`, using the recorded DUNS and refusing when absent: `server/routes/ectd-compile.ts:1047`; `submission-service.ts:2185` (`transmitSequence`); `server/services/ectd/assemble-from-core.ts:655` (where `exportIdentity` also returns `applicantId`); `server/services/ana/AnaToolExecutor.ts:9211`.
7. Add `contacts?: FdaApplicantContact[]` to `BuildPackagerInputArgs` (`core-to-packager.ts:270-282`), put it into the fda block at `:349-357`, and pass it from `assembleSequence` and `packageSequenceFromCore` (`assemble-from-core.ts:236-322`, `package-from-core.ts`).
8. Telephone type: add the FDA telephone-number-type code list from the vendored valid-values file to `server/services/ectd/controlled-vocab/cv-v3-data.ts` with source and checksum; write `telephone-number-type` in `fdaApplicantContact` (`regional-packager.ts:406-417`) from `regulatory_contact_phone_type`; drop the unconditional gap in `fdaContactGaps` (`:477-489`) only when a code resolves.
9. Module 1 nesting: add `scripts/ectd/generate-fda-m1-headings.mjs`, which parses the vendored `us-regional-v3-3.dtd` and writes a checked-in `{section, element, parent}` table stamped with the DTD's sha256. Replace the context-of-use-derived `SECTION_ELEMENT` in `fda-regional-sections.ts:16-36` with it, make `fdaModule1Block` emit nested parents, delete the "written directly under `<m1-regional>`" gap, and add a regenerate-and-diff test.
10. Forms: place `<form>` where the DTD content model puts it. If that is `m1-1-forms`, emit `<m1-1-forms><form form-type=...><leaf/></form></m1-1-forms>` and remove it from `submission-information` (`:420-430`, `:641`). Derive form-type for 1.1 leaves from the leaf's recorded `documentType` through the valid-values list, refuse an unresolved one, and remove the silent `?? 'fdaft2'` default.
11. `us-regional.xml` is validated by the stage 3 hook; no second validator.

**Acceptance**
- The step-2 test is red at head and green after.
- An eCTD Compile of an FDA sequence whose project has no D-U-N-S or no regulatory contact fails with `PACKAGE_IDENTITY_MISSING` naming `applicantId` or `contact`. With them recorded, `us-regional.xml` contains `<id>123456789</id>` and an `<applicant-contacts>` block whose `<telephone>` carries a valid `telephone-number-type`.
- `grep -rn 'UNASSIGNED-ORG-' server --include=*.ts` returns only `package-identity.ts` (dry run) and tests.
- Leaves at 1.3.1.1 and 1.14.4.1 nest inside their DTD parent elements; the heading-table drift test fails on a one-byte DTD change.
- `regionConformant` is true for the golden fixture and false when its contact is removed.
- `ci:migration-set-order` and `ci:migration-drop-safety` pass.

### Stage 5 — The full ICH heading tree with required attributes (Phase 1 · L · engineering) — closes CAT2-03

Stages 1 and 5 touch the same leaf plumbing (`UpsertLeafInput`, `upsertLeafSchema`, the three placement dialogs). Extend what stage 1 added; do not add a second field path.

1. Re-confirm CAT2-03 at the current head (statuses here are from 94b4f9238).
2. Failing first: a test packages the golden fixture with leaves at 3.2.S.4.1, 3.2.P.5.1, 4.2.3.2 and 5.3.5.1 and runs `xmllint --valid index.xml`. Commit its red output (missing required attributes or elements on `m3-2-s-drug-substance`, `m3-2-p-drug-product` and `m5-3-5`).
3. Add `scripts/ectd/generate-ich-headings.mjs`. It parses the vendored DTD's ELEMENT and ATTLIST declarations for Modules 2–5 and writes `server/services/submission-gateways/ectd-packager/ich-headings.generated.ts` with `{element, section, children, requiredAttributes, allowsLeaf}`, stamped with the DTD's sha256. `ICH_BACKBONE` in `ich-headings.ts` (`:91-161`) re-exports it. Add a regenerate-and-diff test. Delete the incorrect comment at `ich-headings.ts:78-89`.
4. Migration `migrations/<date>_submission_leaf_ich_heading_attributes.sql`: `ALTER TABLE submission_leaves ADD COLUMN IF NOT EXISTS` for `ich_substance`, `ich_manufacturer`, `ich_product_name`, `ich_dosage_form`, `ich_indication` (all `TEXT NULL`), with a Rule 1 header, registered before the final tenant-sweep pair; run `ci:migration-set-order` and `ci:migration-drop-safety`; mirror in `shared/schema/submissions.ts`.
5. Carry the attributes end to end: `UpsertLeafInput` (`submission-service.ts:2363-2385`), the insert (`:3169-3186`) and update branch, `upsertLeafSchema` (`server/routes/submissions.ts:192-212`), `CoreLeaf` and `mapCoreLeafToEctdLeaf` (`core-to-packager.ts`), `EctdLeaf` (`ectd-packager/types.ts`).
6. In the placement dialogs, show the attributes the target heading requires (from `requiredAttributes`), prefill from `regulatory_programs.product_name` and `regulatory_programs.indication` where recorded and never guess, and refuse placement until given — server-side too.
7. Rewrite `buildIchModuleTree` (`ich-headings.ts:290-330`): group leaves by (heading element, attribute tuple) so two drug substances emit two `m3-2-s-drug-substance` elements; emit escaped attributes; nest each leaf under its deepest DTD heading (3.2.S.4.1 → `m3-2-s-drug-substance[substance, manufacturer] > m3-2-s-4-control-of-drug-substance > m3-2-s-4-1-specification`); throw `ValidationError` when a required attribute is missing.
8. Add `node-extension` support below the deepest ICH heading (for example per-study grouping under 5.3.5.1), only where the DTD permits it.
9. Replace the `ctdFolderSlug` use in `leafPackagePath` (`regional-packager.ts` ~`:185-209`) with the ICH folder-name table (for example `m3/32-body-data/32s-drug-sub/<substance-manufacturer>/32s4-contr-drug-sub/32s41-spec/`), sourced from the ICH specification and pinned by test. Prior sequences keep the hrefs in their manifests; lifecycle uses leaf IDs.
10. Update `server/services/ectd/qualification/golden-fixtures.ts` with the attributes; `index.xml` is validated by the stage 3 hook.

**Acceptance**
- The step-2 test is red at head and green after.
- A 3.2.S.4.1 leaf appears under `m3-2-s-drug-substance[substance, manufacturer] > m3-2-s-4-control-of-drug-substance > m3-2-s-4-1-specification`.
- Placing a 3.2.S leaf without a substance answers 400 from `PUT /api/submissions/sequences/:seqId/leaves`; packaging such a leaf throws `ValidationError`.
- A one-byte change to the vendored DTD fails the generated-table drift test.
- The golden package's folders follow the ICH folder names.
- `ci:migration-set-order` and `ci:migration-drop-safety` pass.

### Stage 6 — STF files that resolve and validate against their DTD (Phase 1 · M · engineering) — closes CAT2-04

1. Re-confirm CAT2-04 at the current head (statuses here are from 94b4f9238).
2. Failing first: a test runs `xmllint --valid` on the golden fixture's STF. It is red at head ("no DTD found"); commit that output.
3. In `stf-generator.ts`, accept a `dtdRelPath`, computed in `regional-packager.ts:1145-1150` the same way `indexRelPath` is (`${'../'.repeat(depth)}util/dtd/ich-stf-v2-2.dtd`), and write it in the DOCTYPE at `:232`.
4. Set `xmlns:xlink` (`:233`) to the vendored STF DTD's `#FIXED` value. If it matches the backbones, import `ECTD_XLINK_NS` from `ectd-packager/ich-headings.ts` (`:50`) instead of the literal.
5. Replace the recall `STF_DOCUMENT_FILE_TAGS` (`:133-149`) with the file-tag valid-values from the vendored ICH STF specification or FDA valid-values file, with source and checksum. Resolve "study-report" against "study-report-body" from that source and update the losers among `qualification/golden-fixtures.ts:147`, `ectd-packager/types.ts:58` and `AnaToolDefinitions.ts:1349`; the existing migration `20261012_submission_leaf_stf_study_tagging.sql` is not edited unless the source says its value is wrong (then amend in place with a dated header, Rule 1). For FDA, a tag outside the list is an error, not a warning. Stage 1's route validation now reads this list.
6. Typed categories: extend `StfStudyMeta` with `categories?: Array<{ name; value }>`, validated against the specification's category names, and write `<category name=... info-type='ich'>` in `study-identifier` (`:84-95`, `:272-278` today only warn). Record categories per study in a new table keyed by `organization_id` and `study_id`, in `public` with `organization_id INTEGER NOT NULL`, inserted before the final sweep pair — never as free text.
7. Stage 3 already adds `ICH_STF_DTD` to required DTDs when the package has STFs and validates every `stf-*.xml` in the packager and in `qualify.ts`; confirm both rows appear.

**Acceptance**
- The step-2 test is red at head and green after, using the bundled `util/dtd/ich-stf-v2-2.dtd`.
- The STF's `xmlns:xlink` equals the DTD's `#FIXED` value.
- The golden fixture's tag no longer warns, and a tag outside the sourced list is refused for FDA.
- `npm run qualify:ectd` shows an "xmllint DTD" row for each STF.

### Stage 7 — Sequence folder layout (Phase 1 · M · mixed) — closes CAT2-12

The archive layout is not settled by the repository. Settle it before transmission (stage 10) and before the importer (stage 9) fixes its own convention.

1. Re-confirm CAT2-12 at the current head (statuses here are from 94b4f9238).
2. Founder or regulatory lead (NEW decision below): record, with quoted source text from FDA's eCTD Technical Conformance Guide and ESG "preparing a submission" guidance, whether an ESG eCTD archive must contain `<sequence>/` alone or `<application>/<sequence>/`. File it under `docs/evidence/MR-10/<date>/`.
3. Failing first: add `server/services/submission-gateways/__tests__/sequence-folder-layout.test.ts`. Package FDA 0000 with `packageEctdSubmission` and assert every entry starts with `0000/` and that `0000/index.xml` and `0000/index-md5.txt` exist. Package 0001 against 0000's manifest, extract both into one tree, and resolve every `modified-file` in `0001/index.xml` and `0001/m1/us/us-regional.xml` against 0000's files, reusing the approach of `__tests__/lifecycle-packaging.test.ts` (f79c6db26). Record the head failure.
4. In `regional-packager.ts`, apply one `const root = \`${input.sequence}/\`` prefix at zip-write time only: the `zip.file` calls at `:1209`, `:1214`, `:1249`, `:1259`, `:1298`, `:1306`, `:1307`, plus any DTD/XSL writes. Leave `href`, `relPath`, md5 entries and `leafManifest` values sequence-root-relative; backbone contents and md5s do not change. If step 2 requires an application folder, prefix `${applicationId}/${sequence}/`.
5. Move every reader that assumes a root `index.xml` onto `<extract>/<sequence>/`: `ectd-structural-validator.ts`, `bundle-leaf-security.ts`, `external-validator/fda-criteria-adapter.ts` (`relSet.has('index.xml')` `:101`), the lorenz-adapter input dir, `orchestrator-real-package.ts`, `qualification/qualify.ts` and `golden-fixtures.ts`, `assemble-from-core.ts`, `routes/ectd-compile.ts`, `export/ReleaseHashGenerator.ts`, and the `emitUnzipped` branch (`regional-packager.ts:1328-1346`). Use `grep -rn "'index.xml'" server` as the checklist.
6. Run the lifecycle, packager and transmit test files that touch these modules one at a time; fix expectations that encoded the root layout, with a dated note citing CAT2-12. Run `xmllint --noout` on the extracted `0000/index.xml`.

**Acceptance**
- The step-3 test is red at head and green after; every `modified-file` in 0001 resolves to a leaf ID in 0000's backbone within the combined tree.
- The FDA-criteria fallback adapter, the structural validator and `bundle-leaf-security` pass on the new layout and each fails on a deliberately root-level archive.
- The ESG layout requirement is filed with its quoted FDA source.

### Stage 8 — Deterministic FDA PDF technical preflight (Phase 1 · L · engineering) — closes CAT2-11

1. Re-confirm CAT2-11 at the current head (statuses here are from 94b4f9238).
2. Failing first: under `server/services/ectd/__tests__/fixtures/pdf-preflight/`, add (generated with pdf-lib in the test, or vendored with sha256) a PDF 2.0 file; a PDF with an unembedded TrueType font; a 6-page PDF with no `/Outlines`; a PDF with an absolute `file:///` link and one with a link to a missing relative target; an 11x17 page. `server/services/ectd/__tests__/leaf-pdf-preflight.test.ts` asserts each yields an error finding. Record that at head the module is missing and packaging accepts all five.
3. Create `server/services/ectd/leaf-pdf-preflight.ts` with one pure function, `assessLeafPdfConformance(bytes, { relPath, region })`, returning findings with corpus rule ids. Using pdfjs-dist and/or pdf-lib (`package.json:604`), check: header version outside 1.4–1.7 fails unless a PDF/A-1/2 claim is present (reuse `pdfa-detect.ts`); every non-standard-14 font has `/FontFile`, `/FontFile2` or `/FontFile3`; documents of 5+ pages have `/Outlines`; each `/Link /A /URI` or `/GoToR` target is relative and resolvable against the package tree; MediaBox sizes; `relPath` length within the market spec's `maxPathLength`. Settle the path limit from FDA's eCTD TCG text and record the source: `market-specs/market-submission-specs.ts:205` says 230 for US while the corpus and guide say 150/180.
4. Wire it into `regional-packager.ts` next to `assessLeafPdfSecurity` (import `:42`, use ~`:250`), after PDF/A conversion so the shipped bytes are judged. Error findings throw `PackagerValidationError`, like LEAF-ENCRYPTED. No production env bypass. Mirror it in `ectd/ectd4/rps-packager.ts` only if v4 stays reachable.
5. In `validation-rule-corpus.ts`, set PDF_VERSION (`:335-343`) and PATH_LENGTH (`:384-392`) to `'packager'`; add PDF_FONTS_EMBEDDED, PDF_BOOKMARKS, PDF_LINKS_RELATIVE and PDF_PAGE_SIZE as `'packager'`. In `server/services/ind/ctd/fda-technical-rules.ts:63-110`, mark `'enforced'` only what the code now refuses.
6. Report the same findings per leaf in Submission Readiness (`assess-dispatch-readiness.ts`) before freeze, calling the same function — not a copy.
7. Add a test that runs `pdfa-pipeline.ts` on a fixture with bookmarks and links and asserts both survive. If they do not, change the Ghostscript invocation or refuse conversion of such leaves.

**Acceptance**
- `leaf-pdf-preflight.test.ts` is red at head and green after; each fixture yields its named error.
- `packageEctdSubmission` on a sequence containing any fixture throws `PackagerValidationError` naming the rule; a clean Helvetica-only leaf from `leaf-pdf-renderer.ts` still packages.
- A path one character over the settled limit is refused at packaging.
- The corpus lists no `'external'` enforcement for PDF_VERSION or PATH_LENGTH.
- The Ghostscript preservation test passes, or the pipeline refuses the leaf.

### Stage 9 — Import sequences filed elsewhere (Phase 1 · L · engineering) — closes CAT2-07

Needs stage 5 (heading reverse map), stage 7 (folder convention) and Vault ingest of zip archives (MR-08).

1. Re-confirm CAT2-07 at the current head (statuses here are from 94b4f9238).
2. Failing first: with a 3-sequence FDA fixture (0000–0002) under `server/services/ectd/__tests__/fixtures/`, a test imports it and assembles 0003 replacing a 0001 leaf, asserting `operation='replace'` and `modified-file='../0001/index.xml#<ID>'`. At head it skips with "declared replace: no filed leaf"; record that.
3. Add `server/services/ectd/legacy-sequence-import.ts` with `parseFiledSequence(archive)`. Accept one sequence folder or zip (with or without the stage 7 folder prefix); refuse path traversal and symlinks per `bundle-leaf-security.ts`. Verify `index-md5.txt` equals md5(`index.xml`). Parse `index.xml` and `m1/us/us-regional.xml` with `@xmldom/xmldom` (`package.json:536`), external entities and DTD resolution disabled. For every `<leaf>`, emit a `SequenceLeafManifestEntry` (`sequence-manifest.ts:26-60`) with `ID`→`leafId`, backbone path, `xlink:href`→`href`, operation, checksum→md5, `modified-file`, title and `ctdSection` from the enclosing heading. Add the reverse map beside `ich-headings.ts` (from the stage 5 generated table) and `fda-regional-sections.ts` (from the stage 4 table); refuse unmapped headings by element name, never guess. Verify each leaf file's MD5. Read application number, sequence number, submission type and sub-type codes, and submission-id from `us-regional.xml`.
4. Add the governed act `importFiledSequences` in `server/services/ectd/filed-sequence-import.ts`, modelled on `filed-sequence-rejection.ts`. Inputs: orgId, submissionId, Vault document ids holding each archive, reason, meaning, verified re-auth. In one transaction: read each Vault document `FOR SHARE`; parse; refuse unless sequences are consecutive from 0000 or from a declared baseline the user signs as cumulative; refuse a number already on the submission, or an application number that differs from the program's (reuse APPLICATION_NUMBER_MISMATCH from d5176f241). Insert `ectd_sequences` rows (`dispatch_status 'acknowledged'`, status as filed) and `ectd_compilations` rows (`compilation_type 'imported'`, `leaf_manifest` from step 3). Write a governed sign row and an electronic signature binding the Vault content hashes.
5. Migration: add `origin TEXT` (`'platform'|'imported'`) to `ectd_sequences` with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, appended before the final RLS sweep pair; run `ci:migration-set-order` and `ci:migration-drop-safety`.
6. Package path: in the same act, or a sibling for `submission_packages`, append `FiledSequence` entries (`package-sequence-lifecycle.ts:57-75`) with leafId/backbone, state `'transmitted'` and origin `'imported'` under `withPackageMetadataLock`, so `planSequence` (`:430`) stops refusing NO_PRIOR_SEQUENCE.
7. Confirm `prior-sequence-loader.ts:138` folds imported rows unchanged, and that `regional-packager.ts:331-370` rebases `modified-file` to `../<seq>/index.xml#<leafId>` for imported leaves.
8. Route `POST /api/submissions/:id/filed-sequences/import` in `server/routes/submissions.ts`: editor plus signing authority (same check as the other signing routes), `verifyReauth`, and the 422/409 refusals from step 4.
9. UI: an "Import sequences filed elsewhere" action on the submission header in `SubmissionSeqWorkspaces.tsx`. It previews parsed sequences, leaves, checksum results and refusals, and only then asks for the signature. Honest empty and error states.
10. Negative tests: MD5 mismatch, a gap, an application-number mismatch, an unmapped heading and a duplicate sequence each refuse with nothing written.

**Acceptance**
- The step-2 test is red at head and green after; the emitted `index.xml` carries `operation="replace"` and a `modified-file` resolving to a leaf ID in the imported 0001 backbone, and `xmllint --valid` passes.
- Each refusal writes no `ectd_sequences`, `ectd_compilations` or signature row.
- The import is a signed governed act whose signature binds the Vault content hashes, visible in the audit trail.
- `planSequence` on a package with imported history no longer returns NO_PRIOR_SEQUENCE.

### Stage 10 — FDA ESG transport, MDN verification, center routing and ACK ingestion (Phase 1 build · Phase 2 test-endpoint acceptance · XL · mixed) — closes CAT2-05; CAT2-06 (side-effect write)

Needs F-8, an FDA ESG test account and certificates, MR-11 (CAT2-09, one transmit spine, so ACKs update the sequence the UI transmits) and stages 3–7 for FDA to accept the test sequence. Without the founder inputs, steps 2–9 can be built and tested against fixtures, but step 10 cannot run: report the order **blocked**, not done.

1. Re-confirm CAT2-05 and CAT2-06 at the current head (statuses here are from 94b4f9238).
2. Founder (F-8): record the transport choice in `docs/decisions/` — (a) AS2 S/MIME in-house, (b) ESG NextGen API, (c) a certified transmission partner — and obtain an FDA ESG test account, AS2 identifier and certificate for the pilot sponsor (client mode in `gateway-accounts.ts`) or the platform as transmission agent. Steps 4–6 below are option (a); for (b) or (c), replace them with that channel's verified envelope and receipt and keep steps 3 and 7–10.
3. Failing first, against head's classifier and transmit: (i) a test decrypts the wire body of an FDA ESG transmit with a test FDA key (`openssl smime -decrypt` or the CMS library), verifies the inner `multipart/signed` signature with the sponsor test certificate, and asserts Content-Type `application/pkcs7-mime`; (ii) `classifyAs2Delivery` returns non-RECEIVED for an unsigned MDN, a MIC mismatch and a wrong signer; (iii) `server/services/submission-gateways/__tests__/fda-esg-client-account.test.ts` sets `FDA_ESG_STAGING_*` at temp PEMs, spies on `pool.query`, calls `getGatewayUnguarded('fda','esg').isConfigured(1,'staging')` and asserts no INSERT is issued. All red at head.
4. Add a pinned CMS library at an exact version (pkijs + asn1js, or node-forge). In `as2-transport.ts`, add `buildSmimeAs2Message({ body, filename, signerCertPem, signerKeyPem, recipientCertPem })` returning `{ headers, wireBody, mic }`: an `application/octet-stream` entity with Content-Disposition filename; `multipart/signed; protocol=application/pkcs7-signature; micalg=sha-256` with a detached SHA-256 CMS signature; `application/pkcs7-mime; smime-type=enveloped-data` encrypted to FDA's certificate with the content-encryption algorithm in FDA's current ESG AS2 guide; and the base64 SHA-256 MIC. Migrate `ind-lifecycle/icsr-gateway-transport.ts` onto it and delete `signAs2Body` (`as2-transport.ts:486`) in the same change.
5. In `fda-esg.ts:732-748`, replace the `buildAs2Headers({ contentType: 'application/octet-stream', signaturePem: signAs2Body(...) })` call with `buildSmimeAs2Message`, post the enveloped body, and set Disposition-Notification-Options (`as2-transport.ts:477`) to `signed-receipt-protocol=required, pkcs7-signature; signed-receipt-micalg=required, sha-256`.
6. In `parseMdn` (`as2-transport.ts:317`) and `classifyAs2Delivery` (`:929`), return RECEIVED only when the MDN is `multipart/signed`, its signature verifies against `fdaCertPem`, Received-Content-MIC equals the computed mic, Original-Message-ID equals our messageId, and the disposition is `processed`. Anything else is DELIVERED_UNCONFIRMED (`in_transit`, inside the lock), never `received` — replacing the unconditional mark at `fda-esg.ts:768`.
7. Routing: derive the center (CDER/CBER/CDRH) and ESG submission type from the application type and program record, never a default. Refuse pre-wire with `ValidationError` and NOTHING_TRANSMITTED when it cannot be derived. Send it in the AS2 header attributes FDA's current ESG User Guide specifies, citing the section in a code comment.
8. ACK ingestion: (i) a new table `submission_transmittal_acks` in `public` with `organization_id INTEGER NOT NULL`, `transmittal_id`, `ack_kind` (`'ack1'|'ack2'|'ack3'`), `core_id`, `raw bytea`, `raw_sha256`, `received_at`, in a migration inserted before the final sweep pair (`ci:migration-set-order`); (ii) `POST /api/as2/inbound` in a new `server/routes/as2-inbound.ts`, authenticated by the FDA certificate rather than a session: it verifies FDA's signature, decrypts with the sponsor or platform key, parses the ACK, matches `submission_transmittals` by Message-ID or core id, stores the raw bytes verbatim, and moves status to `ack1_received` / `ack2_received` / `ack3_received` / `validation_failed`; (iii) propagate to `ectd_sequences.dispatch_status` via `toDispatchStatus` (`submission-service.ts:1766`); (iv) rewrite `FdaEsgGateway.checkStatus` (`fda-esg.ts:782-805`) and `downloadAcknowledgment` (`:807`) to read the latest stored ack with provenance `'agency'`. This also lets `filed-sequence-rejection.ts:13` drop "There is no Ack3 ingestion" once true.
9. Credential hygiene (CAT2-06 part): delete the `void pool.query(INSERT INTO submission_gateway_credentials ...)` block in `loadFdaCredentials` (`fda-esg.ts:195-210`). Record identity at send time instead: after `credentialsFor` (`fda-esg.ts:~668`), extend the object already stamped at `submission-gateways/index.ts:260` with the sending AS2 id and the SHA-256 fingerprint of the certificate DER, never the path. Keep the `submission_gateway_credentials` table (`mdx-health.service.ts:155` requires it; removing it would mean amending its creating migration in place, Rule 1).
10. SFTP: add `ssh2-sftp-client` at an exact version and a test driving `transmitViaSftp` (`fda-esg.ts:556-612`) against a local SFTP fixture — or, if the founder de-scopes bundles over 1 GB, keep the typed refusal and say so in FDA_ESG_NOT_PROVEN. `transmitViaNextGenRest` (`fda-esg.ts:290-310`) keeps throwing `UnverifiedTransportError` unless F-8 picks it.
11. Phase 2: run `scripts/fda-esg-uat-smoke.ts` against FDA's ESG test environment with a DTD-valid sequence produced by stages 3–7. File ACK1–ACK3 verbatim under `docs/evidence/D7/`. Only then change `transport-refusals.ts:21` FDA_ESG_NOT_PROVEN, `market-support.ts:282`, and the gap notes in `fda-esg.ts:18-35` and `as2-transport.ts:14-25`. Do not put FDA production ESG credentials on staging.

**Acceptance**
- (a) The S/MIME round-trip test is red at head and green after.
- (b) `classifyAs2Delivery` returns non-RECEIVED for an unsigned MDN, a MIC mismatch and a wrong signer; each case shown failing first.
- (c) An inbound ACK2/ACK3 fixture stores raw bytes in `submission_transmittal_acks`, moves `submission_transmittals.status` to `ack3_received`, and sets `ectd_sequences.dispatch_status='acknowledged'`; a forged unsigned ACK is refused and stores nothing.
- (d) A transmit with no derivable center is refused pre-wire with NOTHING_TRANSMITTED.
- (e) The `isConfigured` no-INSERT test is red at head and green after.
- (f) `docs/evidence/D7/` holds ACK1–ACK3 from FDA's ESG test environment for one test sequence, and that sequence's status was moved by them.

### Stage 11 — Submission-grade gates required in production, verdict shown in the UI (Phase 2 · S · mixed) — closes CAT2-08

Merge in the same release as the first production transmit, and only after stage 3 (DTDs plus xmllint as an assemble gate) and F-9 (a licensed validator or a declared FDA-criteria fallback). Flipping earlier blocks every production assembly. Until then, production sets `ECTD_GATES_ACCEPT_REPORT_ONLY=true` explicitly and visibly.

1. Re-confirm CAT2-08 at the current head (statuses here are from 94b4f9238).
2. Failing first: in `server/config/__tests__/`, an ectd-gate posture test — `NODE_ENV=production` with flags unset gives required=true for all four gates (red at head), and an explicit `'false'` without the accept flag throws. In pre-transmit-check tests, a production bundle with `dtdStatus.selfContained=false` and env unset is blocked (red at head).
3. Add `server/startup/ectd-gate-posture.ts` with `readEctdGate(name, env)` for DTD, EVALIDATOR, REGIONAL_BACKBONE and XREF. Outside production, unset stays report-only. In production, unset or `'true'` is required; `'false'` is honoured only with `ECTD_GATES_ACCEPT_REPORT_ONLY=true` (the `AUDIT_SEAL_ACCEPT_UNSEALED` shape), logged once at error level; any other value throws. State in the header that PDF/A is excluded by the 2026-10-01 decision.
4. Make `dtdRequiredFromEnv` (`dtd-bundler.ts:226`), `regionalBackboneRequiredFromEnv` (`regional-backbone-readiness.ts:138`), `xrefRequiredFromEnv` (`cross-reference-resolver.ts:132`) and `evalidatorRequiredFromEnv` (`external-validator/config.ts:23`) delegate to `readEctdGate`. Leave `pdfaRequiredFromEnv` and `pdfa-requirement.ts` unchanged. Update `server/services/ectd/__tests__/submission-gate-posture.test.ts` once, here.
5. Add `assertEctdGatePostureForProduction()` and call it from `server/config/environment.ts` directly after `assertRlsEnforcementForProduction()` (`:294`), with the same fire-on-import contract.
6. In `.github/workflows/deploy-aws.yml`, beside the RLS_ENFORCE preflight (~`:514-549`), fail the deploy when any `ECTD_REQUIRE_*` is `'false'` without `ECTD_GATES_ACCEPT_REPORT_ONLY='true'`.
7. In `GatewayTransmittals.tsx` (assemble toast ~`:736`) and the sequence Dispatch tab in `SubmissionSeqWorkspaces.tsx`, render `bundle.dtdStatus.selfContained`, `regionalBackbone.regionConformant`, `dtdValidation` and whether an agency validator ran. When any is false or absent, show "Not agency-validated".

**Acceptance**
- With `NODE_ENV=production` and all `ECTD_REQUIRE_*` unset, the server boots with all four gates required; `evaluatePreTransmit` blocks a bundle that is not DTD self-contained and `assessSequenceDispatchReadiness` blocks when no validator report exists — both red at head.
- `ECTD_REQUIRE_DTD=false` in production without the accept flag refuses to boot, and the deploy preflight refuses the task definition.
- Staging and local behaviour and PDF/A behaviour are unchanged (existing tests pass).
- The UI shows "Not agency-validated" for a package whose `dtdStatus.selfContained` is false.

### Stage 12 — Review the Form FDA 1571 and 3674 templates (Phase 2 · S · founder) — closes CAT2-27

P3 on severity, scheduled before the pilot sequence because an IND sequence 0000 carries both forms.

1. Re-confirm CAT2-27 at the current head (statuses here are from 94b4f9238).
2. Failing first: show the current manifests in `templates/forms/acroforms/` for the XFA 1571 and 3674 forms with `reviewedBy:null` and `assetTrusted:false`, and the fill path's resulting trust state.
3. A named reviewer compares the 1571 and 3674 XFA fills (field maps in `official-field-maps.ts`) against the current FDA forms and records `reviewedBy`, the review date and `assetTrusted:true` in the two manifests, with the comparison filed under `docs/evidence/MR-10/<date>/`.

**Acceptance**
- Both manifests carry a named `reviewedBy` and `assetTrusted:true`, backed by filed comparison evidence; all five official form manifests are reviewed.

### Stage 13 — Device filing as the official FDA eSTAR (Phase 2 if the pilot is medtech, otherwise Backlog · M · engineering) — closes CAT2-10

Do this stage only if F-10 puts 510(k) in pilot scope. Otherwise stage 2's refusal stands and this stays in the backlog.

1. Re-confirm CAT2-10 at the current head (statuses here are from 94b4f9238).
2. Extract the official fill behind `POST /api/510k/estar/official` (`server/routes/510k-estar-routes.ts:1086-1300`) into `server/services/device-assembly/official-estar-bundle.ts`. Have the `submission-ops` assemble route call it for format `'estar'` and persist the filled official PDF as the bundle: sha256, size, a single-entry `leafManifest`, and `officialEstar` evidence with the template sha256 from the vendored manifest in `assets/estar-templates/`. The fill keeps failing closed when the template or field map is unverified.
3. Delete `buildECTDZip`: remove `server/src/services/ectd.ts`, the import at `submission-ops.ts:53`, and update the comment in `server/services/ectd/package-leaf-bytes.ts:6`. The commit message names the replacement for the device assemble outcome (`510k-estar-routes.ts` `POST /official` and `official-estar-bundle.ts`) and the gate proving reachability (stage 2's device-format tests, updated to expect the official bundle). If this stage is deferred but `buildECTDZip` is deleted anyway, the commit says device filing is refused with stage 2's reason.
4. Route an `'estar'` bundle to FDA ESG with the CDRH center designation from stage 10 step 7. Until that exists, refuse production transmit of `'estar'` with a message naming the CDRH Portal as the sponsor's manual path.

**Acceptance**
- `grep -rn buildECTDZip server client shared` returns nothing.
- Assembling a 510(k)-family package persists a bundle whose bytes are the filled official eSTAR PDF, whose sha256 equals what `POST /api/510k/estar/official` returns for the same program, and whose descriptor carries `officialEstar` evidence.
- A stored `'estar'` bundle without `officialEstar` evidence is still blocked by the pre-transmit check.

### Stage 14 — Gateway key custody and transmission-agent authorization (Phase 3 · M · mixed) — closes CAT2-06

P2; rises to P1 if the pilot sends under the platform account without a sponsor-signed letter of authorization on file with FDA (F-8 recommends a customer-owned account, which avoids this).

1. Re-confirm CAT2-06 at the current head (statuses here are from 94b4f9238). Stage 10 step 9 must already have removed the side-effect INSERT.
2. Failing first: a production-mode environment test without `CREDENTIAL_KMS_KEY_ID` throws at config load (red at head); a round-trip test with a KMS mock.
3. Add `server/services/security/kms-envelope.ts`: encrypt via AWS KMS `GenerateDataKey` (key id from `CREDENTIAL_KMS_KEY_ID`), storing `kms1:<keyId>:<b64 encDataKey>:<iv>:<tag>:<ct>`; decrypt that format via KMS `Decrypt`, falling back to the legacy `iv:tag:ct` format through `credential-cipher.decryptCredential`. Use it in `gateway-accounts.ts` `writeGatewayAccount` and `resolveGatewayAccount`. Assert `CREDENTIAL_KMS_KEY_ID` in production beside `assertRlsEnforcementForProduction()` (`server/config/environment.ts:294`) and in the `deploy-aws.yml` preflight (~`:514`).
4. Add `scripts/ops/rotate-gateway-credentials.mjs`: re-encrypt every `organization_gateway_accounts.credentials_ciphertext` under the current KMS key, one transaction per org, as the runtime role so RLS applies, with a chained audit row per org.
5. Load platform `FDA_ESG_*_CERT/KEY` from AWS Secrets Manager ARNs (`FDA_ESG_CERT_SECRET_ARN` etc.) in `loadFdaCredentials` (`fda-esg.ts:175-229`); keep path variables only outside production.
6. If F-8 makes the platform a transmission agent: require an explicit `organization_gateway_accounts` row with `account_mode='platform'` and a Vault document id for the sponsor's authorization before a production platform-mode transmit. Add nullable `agent_authorization_document_id` via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in a new migration before the final sweep pair. In the guard (`submission-gateways/index.ts:247-251`), throw `CredentialError` pre-wire when it is missing; show that test failing first.

**Acceptance**
- The KMS boot assertion test is red at head and green after.
- Legacy ciphertext still decrypts; new writes carry the `kms1:` prefix (KMS mock).
- The rotation script re-encrypts and `resolveGatewayAccount` returns identical credentials.
- If step 6 is adopted, a production platform-mode transmit without an authorization document is refused with `CredentialError` and `refusedBeforeWire()` is true.

### Stage 15 — eCTD v4.0 (Backlog · L · engineering) — closes CAT2-14

1. Re-confirm CAT2-14 at the current head (statuses here are from 94b4f9238).
2. Until F-23 makes v4.0 a launch requirement: keep `server/routes/ectd-v4.ts` (mounted at `/api/ectd`, `register-document-routes.ts:139-140`) and `PublishingCenter.tsx:7-14` read/validate only, and labelled so. Add a test that fails if `PublishingCenter.tsx` gains an assemble or transmit call against `/api/ectd`, to keep the label honest.
3. When F-23 decides v4.0 is in scope: wire `ectd/ectd4/rps-packager.ts` into the canonical sequence build behind the same packager seams as v3.2.2 (stage 8's PDF preflight, stage 3's validation hook against the vendored v4 schema), not as a parallel submission path.

**Acceptance**
- Before F-23: the read-only label test exists and was shown failing on a deliberately added assemble call.
- After F-23: a v4 sequence is built through the canonical sequence path and validated against vendored v4 schemas; no second transmit path exists.

## Definition of done

- A golden FDA IND sequence 0000 containing Module 1, Module 3 and Module 4/5 study reports passes `xmllint --valid` for `index.xml`, `us-regional.xml` and every STF against checksummed vendored DTDs, and `npm run qualify:ectd` is green with no `dtdSkipped`.
- A tester can place, compile, freeze and dispatch that sequence from the Submission Center with no database edits, and every leaf passes the PDF preflight.
- `docs/evidence/D7/` holds ACK1–ACK3 from FDA's ESG test environment for one sequence, and the sequence's `dispatch_status` reached `acknowledged` from them.
- A follow-up sequence replaces a leaf from an imported, externally filed sequence and validates.
- Production boots with all four submission-grade gates required (or with an explicit, logged risk acceptance), and the UI says "Not agency-validated" whenever a verdict is absent.
- No unsupported format, region or adapter can assemble or transmit: device bundles are the official eSTAR or refused, non-FDA markets are author-only, and every unsourced adapter refuses before the wire.

## Founder decisions this order needs

- **F-8** — FDA transmission model and the ESG test account, AS2 identifier and certificates. Blocks stage 10 (step 11 cannot run without it) and stage 14 step 6.
- **F-9** — external eCTD validator licence, or a declared FDA-criteria fallback. Blocks stage 11.
- **F-10** — regions and formats at launch, including whether 510(k)/eSTAR is in pilot scope. Blocks stage 2 step 2 and decides whether stage 13 is Phase 2 or Backlog.
- **F-23** — eCTD v4.0 timing. Decides stage 15.
- **NEW: pilot customer's regulatory identity and product data.** The pilot sponsor's D-U-N-S number and regulatory contact (with phone type), and the substance, manufacturer, product name, dosage form and indication for its Module 3 and 5.3.5 headings. Blocks the end-to-end runs in stages 4 and 5, and stage 10 step 11.
- **NEW: FDA ESG archive layout determination.** A founder or regulatory lead records, with quoted FDA source, whether the archive contains `<sequence>/` or `<application>/<sequence>/`. Blocks stage 7 step 4 and therefore stage 10 step 11.
- **NEW: named reviewer for the Form FDA 1571 and 3674 templates, and a network-permitted machine (or person) to fetch the agency DTDs and valid-values files.** Blocks stage 12 and stage 3 step 2.

## Do not

- Do not flip `ECTD_REQUIRE_DTD` or any other gate to required before stage 3 lands and F-9 is decided; it blocks every production assembly. Do not, either, ship the first production transmit with the gates still report-only.
- Do not add a second validator, a second leaf-metadata path or a second transmit path: DTD validation lives in the stage 3 packager hook, study id and ICH attributes extend the one `UpsertLeafInput`, readiness calls the same PDF preflight function, and transmission goes through the one spine MR-11 establishes. Delete `signAs2Body` and `buildECTDZip` in the changes that replace them.
- Do not hand-edit generated heading tables or invent Module 1, STF tag or telephone-type codes from memory or from the v4.0 context-of-use list; derive them from the vendored, checksummed agency files and pin them with drift tests.
- Do not append a DROP to remove `submission_gateway_credentials`, the STF columns or any other object a migration in `C2C_MIGRATION_FILES` creates; amend the creating migration in place with a dated header (Rule 1). New tables (`submission_transmittal_acks`, the STF study-category table) go in `public` with `organization_id INTEGER NOT NULL`, before the final sweep pair.
- Do not fence, hide or delete the CMC / Module 3 composition path while fixing the ICH heading tree or the region fences. It is in the launch catalog under decision P-28, bounded by `services/cmc/composition-scope.ts` and `shared/constants/launch-scope.ts`; it is a source of 3.2.S/3.2.P leaves, and stage 5 must accept them.
- Do not put FDA production ESG credentials on staging, and do not remove the FDA_ESG_NOT_PROVEN and "unproven" labels until ACK1–ACK3 from the test environment are filed.

## How to run this order

- Claim it with one line in `docs/work-orders/README.md` §0 before starting; release it when you stop.
- Commit to `concept2cure-v2` only; merge, never rebase.
- Show each acceptance check failing on the current code before the fix, then passing; file that evidence under `docs/evidence/MR-10/<date>/`.
- When a finding closes, update its `statusAtHead` in `docs/work-orders/MR-findings-2026-10-13.json` with the closing commit.
