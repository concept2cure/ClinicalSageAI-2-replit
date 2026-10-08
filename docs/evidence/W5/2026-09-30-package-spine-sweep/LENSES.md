# Package-spine sweep — the owed lenses: findings and verdicts, verbatim

The validation-parity and honest-state lenses (owed since 2026-09-26) and the F20 verifier ran on 2026-10-08 against `a8c2a8d22`, with the script in [`METHOD.md`](METHOD.md). Each finding was then put to one skeptic told to refute it. All fifteen reproduced: thirteen confirmed, VP-5 and VP-7 partial. F20 confirmed. Status of each is tracked in `README.md`, which wins where the two differ.

## F20 — verifier's return

**Verdict (notes).** confirmed. Confidence: about 0.95 that the code does this (reproduced at HEAD), about 0.8 that FDA's spec puts the 1571 in the admin `<submission-information><form form-type>`, and about 0.6 that leaving it out produces a High-severity FDA technical validation failure rather than a Medium one. The placement evidence: FDA's own Module 1 spec text, which I saw only as a web-search excerpt because fda.gov and accessdata.fda.gov were blocked by the egress proxy and WebFetch had no DNS; FDA's examples-document change history ('reference the Form FDA 356h in the Admin section'); a third-party quote of Table 10; and the repository's own docs/ectd/SPEC_DIGEST.md and fdaFormsBlock, which already encode that placement. I could not read the DTD 3.3 element declarations directly, so the content model of m1-1-forms (whether a bare leaf is DTD-valid) is unverified. I raised severity from medium to high for two reasons: the spine emits no admin form for any IND/NDA sequence, and the product's own governed gate, M1-FORM-1571-MISSING, is satisfied by any 1.1 leaf (a 3674 passed) and skips 0000. The product does disclose 'no declared form type' through regionConformant=false and a transmit warning. But every FDA bundle is already non-conformant because of the telephone-number-type procurement gap, so that disclosure does not single the form out. If FDA's validator turns out to find the 1571 by its leaf under 1.1 rather than by form-type, this drops to medium. The probe directory tests/zz-probes/f20 and the scratchpad download folders were deleted; git status is clean. Sources consulted by web search: https://www.fda.gov/media/159382/download (Module 1 backbone spec v2.6, excerpt only), https://www.fda.gov/media/83809/download (Example Submissions document, change history only), https://www.assyro.com/blog/ectd-module-1-structure-guide (third-party, Table 10 paraphrase), https://www.fda.gov/media/76444/download (Comprehensive TOC v2.3.3).

**Claim.** Confirmed at HEAD. The package-spine assemble route builds `fda: { applicationType, submissionType/SubType/Id, contacts }` (submission-ops.ts ~2956) and never passes `fda.forms`. So `fdaFormsBlock` (regional-packager.ts:418), which writes `<form form-type="fdaftN"><leaf/></form>` under `<submission-information>`, is never reached from this spine. A signed Form FDA 1571 mapped to 1.1 ships as a bare `<leaf>` directly under `<m1-1-forms>`, in sequence 0000 as in every later one. Nothing in the backbone tells FDA that the document is a 1571 (fdaft1).

What FDA requires. FDA's Module 1 backbone specification (v2.6, 2025-03-31, the current revision of the v2.3/DTD 3.3 line) says: "the 356h and 1571 forms are placed in their respective application's admin section and other forms are placed in the module 1 heading element m1-1-forms using the form element". I saw this sentence only as a web-search excerpt of fda.gov/media/159382; fda.gov was unreachable from here. Two other sources agree. FDA's examples document records a change that "modified example 7 to reference the Form FDA 356h in the Admin section". A third-party guide quotes Table 10 of the spec: 1571/356h use the form element within submission-information. The repository's own record agrees too: docs/ectd/SPEC_DIGEST.md, extracted from FDA's Module 1 examples, shows `<form form-type="fdaft2"><leaf .../></form>` inside `<submission-information>` after `<sequence-number>`, and `fdaFormsBlock` writes exactly that. FDA's validation criteria (digest #7, High) require the fillable 1571 on every IND submission. Criterion #5 (High) checks the form's application type and number against us-regional.xml, and to do that the validator has to identify the form, through form-type.

The product partly discloses this. `fdaFormGaps` adds "Module 1 forms leaf … has no declared form type" to `conformanceGap` and sets `regionConformant` to false, and the pre-transmit gate turns that into a warning. It blocks only in production with ECTD_REQUIRE_REGIONAL_BACKBONE opted in. But:
(a) the disclosure carries no weight. Every FDA bundle is already regionConformant=false because of the telephone-number-type gap (a known procurement gap), and the assemble findings list nothing about forms (only SUMMARY).
(b) the comment in `fdaFormGaps` says "where a form belongs is an open question the repository does not settle". That is contradicted by the repository's own SPEC_DIGEST and by `fdaFormsBlock`.
(c) the governed IND gate the product does present as a claim, M1-FORM-1571-MISSING (`fdaFollowUpModule1Findings`, submission-ops.ts ~2151), counts ANY 1.1 leaf as the 1571 and does not run at 0000 at all.
(d) the packager cannot emit the admin form correctly even when given one. `fdaModule1Block` writes the same leaf again under `<m1-1-forms>` with the same ID, which the packager already reports as a gap.

The same gap reaches NDA/BLA 356h through this spine. A further point that I could not verify (no DTD vendored): other forms (1572, 3674) should sit inside a `<form form-type>` wrapper under `<m1-1-forms>`, and the spine writes them as bare leaves. If the DTD 3.3 content model of m1-1-forms admits only `form` elements, those bare leaves are also DTD-invalid.

**Reproduction.** Probe tests/zz-probes/f20/f20.probe.test.ts (since deleted). It used the real submission-ops router, the real packager, PGlite and the template harness. It seeded the template IND package and added section 'form-1571' / artifact 'Form FDA 1571' (ctd_section '1.1'), then ran POST /packages/pkg_e2e/assemble for sequence 0000 and read m1/us/us-regional.xml. Status 200. Extract:
  <submission-information>
    <submission-id submission-type="fdast1">0000</submission-id>
    <sequence-number submission-sub-type="fdasst1">0000</sequence-number>
  </submission-information>
  ...
  <m1-regional>
    <m1-1-forms>
      <leaf operation="new" ... xlink:href="1-1/form-1571-f1571004.pdf" ... ID="leaf-1-1-form-1571-f1571004">
        <title>Form FDA 1571 — Form FDA 1571 (form-1571)</title>
      </leaf>
    </m1-1-forms>
The string '<form ' does not occur in the file (the expectation `not.toContain('<form ')` passed).
bundle.regionalBackbone = {regionConformant:false, conformanceGap:"applicant contact ... <telephone> carries no telephone-number-type ...; Module 1 forms leaf form-1571-f1571004.pdf (1.1) has no declared form type"}. validation.findings = [[info,SUMMARY]] only.
Two extra cases. (1) 0000 IND with no 1.1 leaf at all: status 200, findings [[info,SUMMARY]], no 1571 finding. (2) After filing 0000, follow-up 0001 (IND amendment) whose only 1.1 leaf is 'Form FDA 3674': status 200, findings [[info,SUMMARY],[warning,M1-COVER-LETTER-MISSING]]. M1-FORM-1571-MISSING was NOT raised; the 3674 stood in for the 1571.

**Fix.** 1) In the assemble route, classify each 1.1 leaf by form number. section-to-ctd already recognizes 1571|1572|356h|3674|3397|2253 in section keys, and the IND forms lane records document_type `form_<n>`. Pass 1571/356h (and 2252 for annual reports) as `fda.forms` so they land in the admin `<submission-information><form form-type>`.
2) Change `fdaModule1Block` to skip any leaf declared in `fda.forms`, which removes the double-write/duplicate-ID gap, and wrap the remaining forms as `<m1-1-forms><form form-type="fdaftN"><leaf/></form></m1-1-forms>`.
3) Replace the "open question" comment in `fdaFormGaps` with the spec citation.
4) Make M1-FORM-1571-MISSING require a leaf whose form type resolves to fdaft1, not any 1.1 leaf, and apply it to 0000 as well. Raise a blocking assemble finding when an IND/NDA bundle carries no admin form.
5) Pin it with an e2e case in tests/submission-ops-package-spine.pglite.e2e.test.ts asserting `<form form-type="fdaft1">` inside `<submission-information>` and the 1571 absent from `<m1-1-forms>`, and show that case failing at the current HEAD.
6) The m1-1-forms content model stays unverified until FDA's us-regional-v3-3.dtd is vendored (procurement).

## VP-1 — An IND sequence 0000 with no Form FDA 1571 assembles with 0 errors and clears the production transmit guard

Finder severity high; skeptic: **confirmed**, severity high, spec confidence high, reproduced True.

**Files.** server/routes/submission-ops.ts, server/services/submission-gateways/ectd-structural-validator.ts, server/services/submission-gateways/pre-transmit-check.ts

**Claim.** The M1-FORM-1571-MISSING error exists (submission-ops.ts:2147-2160), but it is only attached inside `if (packagerRegion === 'fda' && sequence !== '0000')` (submission-ops.ts:2835-2838). The original IND, which is the one submission that certainly needs the 1571, is never checked. validateEctdLeafs only reports a missing Module 1 as a WARNING (MODULE-M1-MISSING, ectd-structural-validator.ts:152-159), and evaluatePreTransmit has no forms check. Rule: 21 CFR 312.23(a)(1) requires Form FDA 1571 in an IND, and FDA's eCTD validation criteria treat a missing required fillable form (1571/356h/2252) as a High-severity error. The repo's own docs/ectd/SPEC_DIGEST.md §3 lists this as HIGH #7. Confidence: high on the requirement, medium-high that FDA's validator raises it as High.

**Skeptic's probe output.**

I reproduced this at HEAD a8c2a8d22. The probe was tests/zz-probes/verify-vp-1/vp1.probe.test.ts (now deleted). It ran the real assemble route, the real packager, PGlite and the e2e harness seed: IND, sequence 0000, package locked. Then it called evaluatePreTransmit with region 'fda', environment 'production', enforceExternal false and an empty env, which is how the gateway guard in submission-gateways/index.ts:220 calls it.

A, the unchanged seed (1.2 cover letter, 2.5, 3.2.P.1; no 1.1):
`A STATUS 200`
`A LEAVES ["1.2","2.5","3.2.P.1"]`
`A VALIDATION {"e":0,"w":0,"f":["info:SUMMARY"]}`
`A US-REGIONAL has <form false has m1-1 false`
`A PRETRANSMIT {"cleared":true,"blockers":[],"warnings":1}`
The backbone's regionConformant is false only because of a telephone-number-type gap. That gate blocks only when ECTD_REQUIRE_REGIONAL_BACKBONE=true, and no deploy file sets it.

B, the cover letter unmapped, so there is no Module 1 at all:
`B STATUS 200`
`B VALIDATION {"e":0,"w":2,"f":["warning:MODULE-M1-MISSING","info:SUMMARY","warning:SECTION-EMPTY"]}`
`B PRETRANSMIT {"cleared":true,"blockers":[],"warnings":1}`

C, the control: an IND follow-up 0001 with no 1.1:
`C VALIDATION {"e":1,"w":2,"f":["warning:MODULE-M1-MISSING","info:SUMMARY","error:M1-FORM-1571-MISSING","warning:M1-COVER-LETTER-MISSING"]}`
So the rule exists and fires for follow-ups only.

The cause is server/routes/submission-ops.ts:2835: `if (packagerRegion === 'fda' && sequence !== '0000')`. The enclosing `if (isEctdFormat)` block (line 2730) does run for 0000, so the only exclusion is that explicit sequence test.

governed-transmit.ts:581 blocks only when validation.errorCount > 0, and here it is 0. The external eValidator gate is opt-in (ECTD_REQUIRE_EVALIDATOR) and is skipped at the guard (enforceExternal false).

The sweep README's F13 note defers the original to another engine: "Sequence 0000's completeness (an IND original without a 1571) is the readiness engine's, not this check's". server/submission-ops/readiness-engine.ts has no forms rule. It computes a percentage of the mapped artifacts that are ready, over the package's own sections, and contains no '1571' or '1.1' logic. That engine is used only by the publish route (≥80%), so nothing on the path checks the 0000 1571.

The other spine also disagrees. server/routes/ectd-compile.ts:1742-1750 raises FDA_FORMS_MISSING as an error for any FDA compile with no 1.1, the original included.

**The requirement.**

The requirement is firm. 21 CFR 312.23(a)(1) says an IND "shall contain", first, a cover sheet on Form FDA-1571. Amendments, safety reports and annual reports are each also submitted with a 1571 (312.30, 312.31, 312.32, 312.33). This is the same rule the product already enforces as an error for follow-ups, and its own message says "Form FDA 1571 accompanies every IND submission". Leaving out the one submission that 312.23 names explicitly is backwards.

On FDA's validator I am only moderately sure. I recall FDA's eCTD Validation Criteria for v3.2.2 rating a missing required fillable form (1571/356h/2252) as High, and the repo's docs/ectd/SPEC_DIGEST.md §3 lists it as High #7, but I cannot quote the criterion number from memory. The verdict does not depend on it: a missing 1571 at 0000 is a defect under the regulation whatever the validator does.

Under CLAUDE.md, "fail closed, never fabricate", the operator is shown 0 errors and the production guard clears. That is a clean report on a package that cannot be a complete IND. The sweep's stated reason for excluding 0000 (the readiness engine covers it) is not true of the code. The other spine already treats this as an error, which supports calling it a defect rather than an invented rule.

This is not allowed-but-unusual behaviour. An operator can map a 1571 at 1.1 (section-to-ctd maps 'form-1571' / '1571' keys to 1.1), but nothing tells them to.

A caveat on the probe: the seed has no 1.1 by construction. In real use an operator who maps a 1571 is unaffected; only an IND original assembled without one passes silently.

**Scope.**

This is not fixed at HEAD a8c2a8d22: the line-2835 condition is unchanged, and no other gate on the assemble→transmit path checks forms.

It is not a procurement gap. It needs no DTD, credential or eValidator: it is a missing internal rule, and the same rule already exists one condition away.

It is not a duplicate. Sweep F13 (fixed) deliberately limited the 1571 rule to follow-ups and deferred 0000 to the readiness engine, which has no such rule. F20 (unverified) is about the `<form form-type>` element in the us-regional admin block, not whether a 1571 leaf ships at all.

Lane: docs/work-orders/README.md §0 row 70 is the "Package-model spine" lane. It claims the assemble route's lifecycle block, which contains this condition and fdaFollowUpModule1Findings, and it is held by this session (…01LjrcEe8y3zUQxw). So this is the lane's own file, not another lane's. ectd-compile.ts (the other spine) already behaves correctly and needs no change.

**Corrected claim.**

The finding stands as stated. Two additions:
1. MODULE-M1-MISSING is a warning, and with the unchanged seed even that does not fire, because the cover letter supplies a Module 1 leaf. The result is 0 errors and 0 warnings for an IND original with no 1571.
2. The sweep's documented reason for the exclusion is false. The F13 note says the readiness engine owns 0000 completeness, but server/submission-ops/readiness-engine.ts has no forms rule.
The FDA-validator High rating rests on recollection and the repo's SPEC_DIGEST (medium confidence). The regulatory requirement itself, 21 CFR 312.23(a)(1), is certain.

**Smallest correct fix.**

In server/routes/submission-ops.ts:
1. At line 2835, change `if (packagerRegion === 'fda' && sequence !== '0000')` to `if (packagerRegion === 'fda')`.
2. Make fdaFollowUpModule1Findings (lines 2147-2172) sequence-aware, for example by renaming it fdaModule1Findings. Its messages ("the form on file belongs to the sequence that filed it") are follow-up wording. For 0000 the 1571 message should say that an original IND must carry a signed Form FDA 1571 at Module 1.1 (21 CFR 312.23(a)(1)) and tell the operator to map it. The cover-letter finding stays a warning (FDA's "should"), so 0000 with no 1.2 also warns.
3. Correct the README F13 note: the readiness engine never covered 0000.

Prove it red first: probe A, i.e. e2e seed at 0000, must give errorCount 0 before the change and 1 (M1-FORM-1571-MISSING) after. Then add a 1.1 section and artifact to the e2e harness seed, for example section key 'form-1571', so the spine's own happy path assembles a complete IND original.

**Blast radius.**

Files changed: server/routes/submission-ops.ts (the condition and the findings function), tests/support/package-spine-e2e.harness.ts (seed gains a 1.1 Form 1571 section and artifact), and docs/evidence/W5/2026-09-30-package-spine-sweep/README.md (the F13 note).

Other spine: none. ectd-compile.ts already raises FDA_FORMS_MISSING for any FDA compile without 1.1. The packager, the lifecycle operator, the controlled vocabulary and governed-transmit are untouched.

Tests that pin the current behaviour:
- tests/submission-ops-assemble-routes.test.ts. Its lockedPkg is packageFamily 'ind' at sequence 0000 with no 1.1 section. Its exact errorCount pins (lines 558, 589, 617, 633, 649, 669, 716, 749, 769, 1243-1244, 1266, 1326, 1349, 1376) will each rise by 1 where the package is 'ind'. The 510k cases (480, 1176, 1279, 1283) are unaffected, because the rule is IND-only through fdaEctdApplicationType === 'fdaat4'. Either add a 1.1 section to the fixture or adjust the counts.
- tests/submission-ops-package-spine.pglite.e2e.test.ts. Its 0000 cases, and the follow-up cases that first file 0000, change once the seed gains a 1.1 leaf: the leafManifest length 3 at line 87 becomes 4, and the sorted-sections expectation `['1.2','2.5']` at line 197 gains '1.1'. In the "nothing changed" follow-up (NOTHING_TO_FILE), an unchanged 1571 is omitted as the earlier submission's document, so that test should still get 409. The F13 follow-up test (lines 238-249) still sees M1-FORM-1571-MISSING because the unchanged 1571 is not re-shipped.
- tests/golden-journeys/submission-export-package.journey.test.ts and tests/golden-journeys/submission-export-validation.journey.test.ts reference 'ind' and errorCount and should be run. I did not confirm that they go through this route.

## VP-2 — The 1571 gate accepts any PDF at Module 1.1, and on this spine that PDF can only be a pdfkit rendering of an artifact's text, never FDA's fillable form

Finder severity high; skeptic: **confirmed**, severity high, spec confidence high, reproduced True.

**Files.** server/routes/submission-ops.ts, server/services/ectd/leaf-pdf.ts, server/services/ectd/leaf-pdf-security.ts

**Claim.** M1-FORM-1571-MISSING is cleared by `shipping.some((l) => l.ctdSection === '1.1' || l.ctdSection.startsWith('1.1.'))`, which checks section membership only. Every leaf on this spine comes from buildLeafPdf(markdown) (submission-ops.ts:2589, 2696). So the '1571' is always a PDFKit text page with no AcroForm or XFA, and the artifact id and version are printed in its heading. The product can already recognise FDA's issued form (assessLeafPdfSecurity returns 'fda-form-as-issued' with a formId) and can fill the official form (server/services/ind-forms/ind-form-fill-service.ts, used by the IND lane), but this gate uses neither. Rule: FDA requires its fillable Form FDA 1571 itself, not a flattened or re-typed copy. FDA's validation reads the application number and type from the form and cross-checks them against us-regional.xml (High; SPEC_DIGEST §3 #5 and #7). Confidence: medium.

**Skeptic's probe output.**

I ran a probe at HEAD a8c2a8d22: tests/zz-probes/verify-vp-2/vp2.probe.test.ts. It used the real assemble route, the real packager and PGlite, through the harness in tests/support/package-spine-e2e.harness.ts. The directory has since been deleted and `git status` is clean. All 5 tests passed. Output:

CONTROL vendored FDA_1571.pdf security {"verdict":"fda-form-as-issued","formId":"FDA_1571","edition":"2025-03-28"} AcroForm true XFA false
0000 FORM LEAF m1/us/1-1/form-1571-f1571004.pdf hdr %PDF-1.3 AcroForm false XFA false security {"verdict":"unsecured"}
0000 us-regional <form form-type>: false; <m1-1-forms> <leaf operation="new" ... xlink:href="1-1/form-1571-f1571004.pdf" ...><title>Form FDA 1571 — Form FDA 1571 (form-1571)</title>
0000 submissionGrade.agencyFormsAsIssued []
0000 STATUS 200 {"e":0,"w":0,"f":["info:SUMMARY"]}
0001 FORM LEAF ... AcroForm false XFA false security {"verdict":"unsecured"}
0001 STATUS 200 {"e":0,"w":1,"f":["info:SUMMARY","warning:M1-COVER-LETTER-MISSING"]}
CTRL 0001 STATUS 200 {"e":1,"w":2,"f":["warning:MODULE-M1-MISSING","info:SUMMARY","error:M1-FORM-1571-MISSING","warning:M1-COVER-LETTER-MISSING"]}
3674 0001 STATUS 200 {"e":0,"w":1,"f":["info:SUMMARY","warning:M1-COVER-LETTER-MISSING"]} leaves ["1.1:form-3674-f1571004.pdf:new"]
NO1571 0000 STATUS 200 {"e":0,"w":0,"f":["info:SUMMARY"]}

What the output shows:
- The 0000 and 0001 lines: the shipped "1571" is a PDFKit page (PDF-1.3) with no AcroForm and no XFA. It is judged "unsecured", not fda-form-as-issued. It clears M1-FORM-1571-MISSING with 0 errors.
- The CONTROL line: the product already has FDA's official 1571 (templates/forms/acroforms/FDA_1571.pdf) and recognises it as fda-form-as-issued.

The code matches the claim:
- `fdaFollowUpModule1Findings` (server/routes/submission-ops.ts:2153) checks section membership only: `shipping.some((l) => l.ctdSection === '1.1' || l.ctdSection.startsWith('1.1.'))`.
- Every eCTD leaf comes from `buildLeafPdf({ title, markdown })` at :2696, with the heading `### <title> (<artifactId> v<version>)`. Line :2589 is the non-eCTD path.
- Nothing on the transmit path checks the form: a grep of governed-transmit*, pre-transmit*, mdx-submission-gateway.ts and GatewayTransmittals.tsx finds no 1571 check. `agencyFormsAsIssued` is only echoed into a summary string (pre-transmit-check.ts:183).

The probe also found three things the finding understated:
1. The gate does not check that the form is a 1571. A Form FDA 3674 text page alone at 1.1 clears M1-FORM-1571-MISSING (the "3674 0001" line).
2. On sequence 0000 there is no 1571 rule at all. An IND original with no 1.1 leaf assembles with 0 errors (the "NO1571" line). The sweep README says 0000 completeness is "the readiness engine's", but server/submission-ops/readiness-engine.ts contains no reference to 1571.
3. No `<form form-type="fdaft1">` is emitted. This is the unverified F20, a separate backbone defect, and it overlaps this one.

**The requirement.**

1. Form FDA 1571 is required with every IND submission (21 CFR 312.23(a)(1) and 312.30/312.31, plus the form's own serial-number field and its box listing the follow-up types). This is firm, and the F13 skeptic already confirmed it at high confidence.

2. In eCTD, the form must be FDA's fillable form, not a rendered or retyped copy. FDA's eCTD Technical Conformance Guide says to use the fillable forms from FDA's website, and not to scan or flatten them, because FDA extracts the field data automatically. The FDA PDF Specifications exempt FDA forms from the no-security rule precisely so they ship as FDA issued them. The repo's own digest, extracted from FDA eCTD Validation Criteria v4.5 (docs/ectd/SPEC_DIGEST.md §3), lists two High (blocks receipt) criteria: #7 "required fillable form (356h/2252/1571) missing" and #5 "application type/number mismatch between FDA form and us-regional.xml". Criterion #5 needs data read from the form's fields, and a PDFKit text page has none.

3. My uncertainty: I cannot quote the criterion numbers or wording from memory, and I cannot say exactly how FDA's validator detects a fillable form (by field data, or by the admin <form> element in F20). Either way, a page reading "Form 1571 - signed copy to follow." headed "(artifact_f1571004 v1)" is not Form FDA 1571 on any reading.

4. Repo rules: CLAUDE.md says to fail closed and never fabricate. A gate named M1-FORM-1571-MISSING that reports the form present with 0 errors, when what ships is a generated text page and possibly a different form (3674), is the product claiming a requirement is met when it is not. That makes this a defect, not a procurement gap: the official template is vendored, the product recognises it, and the IND lane's fill service produces it.

5. One nuance on the fix sketch. Requiring 'fda-form-as-issued' is fail-closed and somewhat strict: a genuine form re-saved in full (not incrementally) would be refused. That is acceptable under this repo's rules, and the refusal says why.

**Scope.**

Not fixed at HEAD a8c2a8d22. Not a procurement gap:
- the official 1571 template is vendored at templates/forms/acroforms/FDA_1571.pdf (edition 2025-03-28) and is judged fda-form-as-issued;
- server/services/ind-forms/ind-form-fill-service.ts fills it, and the tamper tests show its output is judged fda-form-as-issued.

Not already in the sweep:
- F13 added the gate.
- F06 covers the missing form-type.
- F20 (unverified) covers the missing admin <form> element.
- None of them covers what the 1.1 bytes are, or the 0000 gap.

Lane ownership (docs/work-orders/README.md §0):
- The gate and the leaf source are in server/routes/submission-ops.ts, which belongs to the package-model spine lane.
- Reusing the fill service is an import from the IND eCTD demo lane (`server/services/ind-forms/*`), and those files must not be edited.
- The other spine (ectd-compile / core-to-packager) already ships the official 1571 (agencyFormsAsIssued) and is out of scope.

**Corrected claim.**

The finding understates the defect in two ways.

1. M1-FORM-1571-MISSING checks section membership only, so any 1.1 leaf clears it, including a Form FDA 3674 text page, not just a 1571-titled one.
2. On this spine there is no 1571 rule for IND sequence 0000 at all. An original with no 1.1 leaf assembles with 0 errors. The readiness engine the sweep README defers to has no 1571 check.

Every leaf on this spine is a buildLeafPdf (PDFKit, PDF-1.3) rendering of artifact text, with no AcroForm or XFA, and it is judged 'unsecured'. The official FDA_1571.pdf the product vendors is judged 'fda-form-as-issued'. The rest of the claim holds as stated.

**Smallest correct fix.**

All changes are in server/routes/submission-ops.ts and stay within the lane.

1. Make the 1571 rule judge bytes, not section membership:
   - Pass the shipping leaves' bytes, or a precomputed verdict, into the 1571 check. `ctdLeaves` already carries `bytes`.
   - Clear M1-FORM-1571-MISSING only when some shipping 1.1/1.1.x leaf gets `assessLeafPdfSecurity(bytes, 'fda')` = `{ verdict: 'fda-form-as-issued', formId: 'FDA_1571' }`.
   - If a 1.1 leaf ships but none qualifies, emit a distinct error (for example M1-FORM-1571-NOT-FDA-FORM). It should say that the leaf is a rendered text page (or a different form), not FDA's fillable Form FDA 1571.

2. Run the rule for IND sequence 0000 as well as follow-ups (312.23(a)(1)), instead of leaving 0000 to a readiness engine that does not check it.

Until the spine has a leaf source carrying the filled official form's bytes unrendered, every IND sequence on this spine reports the rule as unmet. That is the honest state. That leaf source would be an artifact or section bound to `generateIndForm('FDA_1571', …)` output or to a Vault PDF, shipped as-is and not passed through `buildLeafPdf`. Building it is the follow-on, not the smallest fix.

**Blast radius.**

Code:
- Only server/routes/submission-ops.ts: `fdaFollowUpModule1Findings` (:2147) and its call site (:2837), plus the 0000 branch. It also needs an import of assessLeafPdfSecurity, which already runs in the packager, so there is no new dependency.

Tests that pin current behaviour:
- tests/submission-ops-package-spine.pglite.e2e.test.ts. The F13 test "an IND follow-up that carries no Form FDA 1571 is blocked" still passes. Any IND 0000 or 0001 case there, or in tests/submission-ops-assemble-routes.test.ts, tests/submission-ops-preflight-routes.test.ts and the transmit-guard and gateway route tests, that expects errorCount 0 or a transmittable bundle for a `packageFamily: 'ind'` package would gain an error. This applies to every such fixture if the rule extends to 0000, because no fixture ships a real 1571. Those fixtures need a vendored-template 1571 leaf. Using the IND lane's generateIndForm output works, but needs a source the route can ship unrendered. Without one, the tests must assert the new error.
- server/services/ectd/__tests__/section-to-ctd.test.ts only maps form-1571 to 1.1, so it is unaffected.

The other spine (ectd-compile / core-to-packager / IND lane) is unchanged; it already ships the official form. GatewayTransmittals.tsx needs no change, because it renders findings generically.

Related: F20, the missing admin `<form form-type="fdaft1">`, should be fixed alongside, because FDA's form/us-regional cross-check (criterion #5) reads both.

## VP-3 — The plain-PDF fallback ships PDF 1.3 with unembedded Helvetica and no bookmarks, while the guard's PDF check passes saying 'the agency accepts plain PDF 1.4–1.7'

Finder severity medium; skeptic: **confirmed**, severity medium, spec confidence medium, reproduced True.

**Files.** server/services/ectd/leaf-pdf.ts, server/services/submission-gateways/pre-transmit-check.ts, server/services/submission-gateways/ectd-structural-validator.ts, server/services/ectd/pdfa-pipeline.ts, server/services/submission-gateways/pre-transmit-findings.ts

**Claim.** leaf-pdf.ts creates PDFKit documents with default settings: header %PDF-1.3, A4 pages, standard-14 Helvetica with no FontFile, and no outlines. Every PDF/A failure branch in pdfa-pipeline.ts returns the input unchanged: no Ghostscript, Ghostscript failure, or output without a PDF/A identifier (missing ICC profile, lines 130, 155, 166). In each of those cases the 1.3 bytes ship. Nothing checks the version: validateEctdLeafs only tests the '%PDF-' magic bytes (it accepts %PDF-1.0 and %PDF-2.0), and checkPdfA (pre-transmit-check.ts:186-191) passes whenever PDF/A is not required, with the text 'PDF/A not required: the agency accepts plain PDF 1.4–1.7.', which is false for these bytes. The transmit record keeps only failed checks (pre-transmit-findings.ts), so the Part 11 sign record says nothing. The product's own catalogue disagrees with the pass: corpus PDF_VERSION is severity 'high' with the FDA criteria as source, and the market spec us-ectd pdfVersions is 1.4–1.7. Separately, a second renderer (leaf-pdf-renderer.ts: pdf-lib, US Letter, bookmarks, commented 'FDA eCTD guidance requires PDF bookmarks') exists while this spine uses the first one, which breaks the zero-duplication rule. Bookmarks and page size stay wrong even after Ghostscript conversion. Rule: FDA PDF Specifications accept PDF 1.4–1.7 and PDF/A-1/2, ask for embedded fonts and for bookmarks on documents of 5 or more pages, and lay pages out for 8.5x11. Confidence: high that 1.3 is outside FDA's stated range; medium that FDA's validator raises the version; low-medium that fonts and bookmarks are validator errors rather than review findings.

**Skeptic's probe output.**

HEAD a8c2a8d22. Probe tests/zz-probes/verify-vp-3/vp3.probe.test.ts (deleted afterwards; git status clean) ran the real assemble route, the real packager and PGlite, with no Ghostscript in this container. Artifact 3.2.P.1 held 400 paragraphs.
`C1 STATUS 200 validation 0`
`C1 GRADE {"total":3,"pdfLeaves":3,"pdfaConverted":0,"notConverted":["2-5-co000002.pdf","3-2-p-1-desc0003.pdf","cover-letter-cover0001.pdf"],"allPdfA":false,...}`
`C1 LEAF m3/3-2-p-1/3-2-p-1-desc0003.pdf {"hdr":"%PDF-1.3","pages":10,"outlines":false,"fontFile":false,"baseFonts":["/BaseFont /Helvetica","/BaseFont /Helvetica-Bold"],"mediaBox":"0 0 595.28 841.89"}` (the cover letter and 2.5 leaves are the same: %PDF-1.3, no FontFile, no Outlines)
`C1 PDF CHECK production {"name":"pdfa-submission-grade","passed":true,"detail":"0/3 PDF leaves are PDF/A; 3 plain PDF. PDF/A not required: the agency accepts plain PDF 1.4–1.7."} cleared true blockers []` (staging is identical)
`C1 RECORD failedChecks production ["dtd-self-contained: ...","regional-backbone-conformant: ..."]`: no PDF entry reaches the Part 11 record.
`C1 CORPUS PDF_VERSION {"severity":"high","source":"FDA eCTD Technical Conformance Guide; Specifications for eCTD Validation Criteria","enforcement":"external"}`
`B3 %PDF-2.0 {"errorCount":0}`, `B3 %PDF-1.0 {"errorCount":0}`, `B3 %PDF-1.3 {"errorCount":0}` (validateEctdLeafs called directly)
`R leaf-pdf {"hdr":"%PDF-1.3",...,"outlines":false,"fontFile":false,"mediaBox":"0 0 595.28 841.89"}`
`R leaf-pdf-renderer {"hdr":"%PDF-1.7",...,"outlines":true,"fontFile":false,"mediaBox":"0 0 612 792"}`: the second renderer does NOT embed fonts either. pdf-lib StandardFonts writes a bare Type1 reference.

Code read:
- leaf-pdf.ts:79-90 sets no pdfVersion (pdfkit 0.18.0 defaults to 1.3).
- pdfa-pipeline.ts returns the input unchanged at lines 131, 155, 166, 179 and 187.
- validateEctdLeafs checks only `%PDF-` (ectd-structural-validator.ts:46, 107-115) and runs on the rendered bytes before packaging (submission-ops.ts:2845).
- checkPdfA (pre-transmit-check.ts:186-194) passes whenever pdfa.required is false and prints that text without looking at the version.
- pdfa-detect.ts:156 already parses pdfVersion; nothing in the spine reads it.
- The market-spec pdfVersions (1.4-1.7) has no enforcing consumer.

Can it reach production? Dockerfile.optimized installs ghostscript. With the Debian ICC profile present, the leaves become PDF/A-1b at 1.4 with embedded fonts, which fixes version and fonts but not bookmarks. The .replit deployment (autoscale, ghostscript from Nix) has its ICC profile under /nix/store. That is not one of resolveSrgbIccProfile's three /usr paths, and PDFA_SRGB_ICC is set nowhere in the repo. So conversion probably throws there and 1.3 ships. That last step is inferred, not run.

**The requirement.**

- **Version (high on the spec, medium on validator severity):** FDA's "Portable Document Format (PDF) Specifications" list PDF 1.4-1.7, PDF/A-1 and PDF/A-2 as acceptable. 1.3 is outside that range, and FDA has said PDF 2.0 is not supported. The FDA eCTD Validation Criteria carry a PDF-version criterion. I am not certain of its current severity (High would mean technical rejection), so validator-level rejection is medium confidence. The repo's own corpus (PDF_VERSION, high, citing the FDA criteria) and market spec (1.4-1.7) agree that 1.3 is out of range.
- **False pass (high):** independent of FDA severity, checkPdfA states as fact about these bytes that "the agency accepts plain PDF 1.4–1.7" while it ships 1.3 bytes it never examined. That breaks CLAUDE.md's "fail closed, never fabricate". Because the check passes, the Part 11 sign record (pre-transmit-findings keeps only failed checks) carries nothing about it.
- **Page size (refuted):** FDA asks that the print area fit on 8.5x11 paper. A4 with 72pt margins gives a 6.27x9.69 inch print area, which fits. A4 is routinely accepted, and ICH Appendix 7 allows A4 or Letter. This is allowed-but-unusual, not a defect.
- **Fonts (low):** standard-14 Helvetica unembedded. FDA asks for embedded fonts, but whether base-14 fonts must be embedded in a non-PDF/A file is weakly specified, and I know of no validator error for it.
- **Bookmarks (low-medium):** FDA/ICH say documents of 5 or more pages "should" have bookmarks. I know of no high-severity validator criterion, so this is a review-quality finding.
- **Zero duplication:** the CLAUDE.md issue is real (two live leaf renderers), but it is a separate repo-rule issue and not part of the defect's severity.

**Scope.**

- **Not fixed at HEAD** (a8c2a8d22).
- **Not in the sweep:** README F00-F20 has no PDF-version item.
- **Not a procurement gap:** setting pdfkit's pdfVersion and reading the header need no vendored DTD, credential or tool; pdfa-detect already parses the version.
- **No lane claim:** docs/work-orders/README.md §0 has no lane claim on leaf-pdf.ts, pre-transmit-check.ts or ectd-structural-validator.ts (grep found none).
- **When it ships:** the 1.3 bytes ship on every no-Ghostscript / failed-Ghostscript / missing-ICC path, which likely includes the .replit Nix deployment. On the Docker image with a working ICC profile, the version and font parts go away, but the bookmarks gap and the unconditional check text remain.

**Corrected claim.**

Confirmed:
- leaf-pdf.ts renders %PDF-1.3, which is outside FDA's 1.4-1.7 / PDF/A range.
- 1.3 ships whenever the PDF/A pipeline does not convert (no gs, gs failure, missing ICC), which likely includes the Nix deployment.
- Nothing checks the version.
- checkPdfA passes, with text claiming the agency accepts these plain leaves without reading their version, so the Part 11 record says nothing.

Corrections:
- A4 is acceptable to FDA (the print area fits 8.5x11); it is not a defect.
- Unembedded base-14 fonts and missing bookmarks are review-quality issues (low to low-medium confidence), not established validator errors.
- leaf-pdf-renderer.ts also leaves its fonts unembedded, so moving the spine onto it would not deliver embedded fonts.
- A version check before conversion is sufficient, because Ghostscript always outputs 1.4.

**Smallest correct fix.**

1. **server/services/ectd/leaf-pdf.ts:** add `pdfVersion: '1.7'` to the PDFKit options. Optionally add `doc.outline.addItem(input.title)` (or headings) so documents of 5 or more pages carry bookmarks. Keep size A4 (acceptable). Font embedding would need a bundled TTF via registerFont and is optional at the evidence level.
2. **ectd-structural-validator.ts:** add an error rule LEAF-PDF-VERSION for PDF leaves whose header version (reuse pdfa-detect's parse; do not write a second regex) is outside 1.4-1.7, taking the range from the market spec. Checking before conversion is enough: Ghostscript always writes 1.4, and every fallback ships the input unchanged. The rule also catches uploaded vault PDFs at 1.3 or 2.0.
3. **pre-transmit-check.ts checkPdfA:** stop asserting "the agency accepts plain PDF 1.4–1.7" for unexamined bytes. Either have regional-packager record the shipped plain-leaf versions in submissionGrade and fail the check (so it reaches failedChecks and the Part 11 record) when one is out of range, or reduce the text to "PDF/A not required".
4. **Not recommended:** the finding's fix sketch (move the spine to leaf-pdf-renderer.ts for embedded fonts). That renderer embeds no fonts either (FontFile false) and renders HTML/plain text, not the markdown renderMarkdownToPDF handles. Consolidating the renderers is a separate change.

**Blast radius.**

- **Files:** server/services/ectd/leaf-pdf.ts; server/services/submission-gateways/ectd-structural-validator.ts (+ pdfa-detect reuse); server/services/submission-gateways/pre-transmit-check.ts; server/services/submission-gateways/regional-packager.ts (only if the grade records versions); pdfa-readiness.ts:114 carries the same wording.
- **Lifecycle hazard:** any change to leaf-pdf.ts output changes the md5 of every rendered leaf. For a package with a filed sequence (the filed-history sourceMd5), the next follow-up would re-file every unchanged rendered document as `replace`. This is the hazard leaf-pdf.ts's own header warns about for pdfkit upgrades, so it needs a stated re-baseline or acceptance (likely no production filed sequences yet, pre-launch).
- **Other spine:** IND lifecycle, the orchestrator, eSTAR and authoring use leaf-pdf-renderer.ts (already 1.7, Letter, outlines) and are not affected by the leaf-pdf.ts change. A new rule in validateEctdLeafs applies wherever that validator runs.
- **Tests that pin current behaviour:**
  - server/services/submission-gateways/__tests__/pdfa-requirement.test.ts:112 (blocker text)
  - server/services/ectd/__tests__/submission-gate-posture.test.ts:219 (comment)
  - server/services/submission-gateways/__tests__/pre-transmit-check.test.ts (pdfa detail)
  - server/services/ectd/__tests__/leaf-pdf.test.ts (determinism only; survives)
  - tests/submission-ops-package-spine.pglite.e2e.test.ts (md5 across sequences; survives if the output stays deterministic)
  - tests/ectd-structural-validator.test.ts and tests/submission-ops-assemble-routes.test.ts: about 10 test fixtures use a bare `%PDF-` header and would trip a version rule.

## VP-4 — validateEctdPackage says it verifies 'the eCTD checksum contract' but checks only the non-standard util/index-md5.txt; a wrong root index-md5.txt and a wrong leaf checksum are reported valid

Finder severity medium; skeptic: **confirmed**, severity medium, spec confidence high, reproduced True.

**Files.** server/services/submission-gateways/ectd-structural-validator.ts, server/routes/ectd-export.ts

**Claim.** The header (lines 19-20, 256-258) promises 'a full reopen-and-verify of util/index-md5.txt (the eCTD checksum contract)'. In ICH v3.2.2 the checksum contract is index-md5.txt in the sequence root (MD5 of index.xml) plus each leaf's checksum attribute; util/index-md5.txt is a platform convenience that the packager itself labels non-spec (regional-packager.ts:1237-1243). The validator verifies neither real artifact. It is the gate behind POST /api/ectd-export/:submissionId/validate, which takes a caller-supplied ZIP. Rule: index-md5.txt must match index.xml, and each leaf checksum must match its file (ICH eCTD v3.2.2; FDA validation criteria High). Confidence: high.

**Skeptic's probe output.**

Probe at HEAD a8c2a8d22: tests/zz-probes/verify-vp-4/vp4.probe.test.ts. It used the real submission-ops assemble route, the real packager and PGlite, then called validateEctdPackage on edited copies of the stored bundle. The probe directory was deleted afterwards and the tree is clean.

What the bundle contains:
- Files: ["m1/us/us-regional.xml","m1/us/1-2/cover-letter-cover0001.pdf","m2/2-5/2-5-co000002.pdf","m3/3-2-p-1/3-2-p-1-desc0003.pdf","index.xml","index-md5.txt","util/index-md5.txt"]
- The root index-md5.txt is "2de6cad5b16e59e422699398dcaa996e", which equals md5(index.xml). The packager writes it correctly.

Results:
- **C0, unedited control:** {"valid":true,"errors":[]} with warnings for the DTD, the stylesheet, and empty m4 and m5.
- **D1:** root index-md5.txt set to 32 zeros, the first us-regional.xml leaf checksum set to 32 'f's, and util/index-md5.txt rebuilt to match the edited files. Editing us-regional.xml also makes index.xml's m1-regional leaf checksum stale. Result: {"valid":true,"errors":[]}.
- **D2:** root index-md5.txt removed entirely. Result: {"valid":true,"errors":[]}.
- **D3:** an index.xml leaf checksum set to 32 'e's, with the root index-md5.txt and util manifest both made consistent with the edited index.xml. Result: {"valid":true,"errors":[]}.
- **D4:** no util manifest, root index-md5.txt zeros and the regional leaf checksum wrong. Result: {"valid":true,"errors":[]}. The only added warning was "Missing util/index-md5.txt (MD5 integrity manifest)".

Code: ectd-structural-validator.ts:364-391 is the only integrity check, and it reads util/index-md5.txt alone. Nothing reads the root index-md5.txt or any <leaf checksum=...>. The header at :19-20 and :256-258 and the step comment at :364-365 call util/index-md5.txt "the eCTD checksum contract". The packager itself says the opposite at regional-packager.ts:1237-1242: the root file is the spec artifact and util/index-md5.txt is "a platform convenience, not the spec artifact".

Callers: server/routes/ectd-export.ts uses this verdict in two places.
- POST /:submissionId runs it as the fail-closed gate when validateAfter is true (the default) and sets the X-ECTD-Valid header.
- POST /:submissionId/validate runs it on a caller-supplied zipBufferBase64 or raw ZIP body.

**The requirement.**

**ICH eCTD v3.2.2.** It requires an MD5 checksum file for the backbone, named index-md5.txt, in the same folder as index.xml (the sequence root). Every <leaf> in the ICH and regional DTDs carries a checksum attribute (CDATA #REQUIRED) and checksum-type md5. The checksum must equal the MD5 of the file the leaf's href points to.

**Agency validation.** FDA's eCTD Validation Criteria treat these as High-severity errors, which lead to technical rejection: a missing index-md5.txt, an index.xml checksum that does not match index-md5.txt, and a leaf checksum that does not match its file. The EU criteria have the same checks as pass/fail. I am confident of the substance and severity of these rules but not of the exact FDA rule numbers.

**The util file.** util/index-md5.txt is not part of the ICH folder structure, which defines only util/dtd and util/style. The repo's own packager comment agrees.

**Why this is a defect and not allowed-but-unusual behaviour:**
- The validator's header says it verifies "the eCTD checksum contract". It verifies only a non-standard file.
- It returns valid:true for packages a regulator would reject at High severity, and D4 shows it does so even when no integrity data is valid at all.
- Under CLAUDE.md's "fail closed, never fabricate", a "valid" verdict that is not backed by the check it claims is a fabricated assurance.

**What limits the impact.** The file does say it is internal and not an agency validator. On the product's own output the packager writes correct root and leaf checksums, which the e2e test pins. The util manifest is built from the same md5 values as the backbone, so a packager leaf-md5 regression would still be caught indirectly. It would not catch a missing or wrong root index-md5.txt. The real exposure is the caller-supplied ZIP path and the false claim. Severity medium stands.

**Scope.**

**Not already fixed:** the code at HEAD a8c2a8d22 reproduces the defect, and it is not in the sweep README's F00-F20 table (nothing there mentions index-md5 or leaf checksums).

**Not a procurement gap:** it needs only crypto md5 and JSZip, both already imported in the file.

**Lane:**
- ectd-structural-validator.ts was last changed in cea1f4450 (2026-10-01, the W5/D7 package-spine sweep lane itself).
- docs/work-orders/README.md §0 has no claim naming it.
- server/routes/ectd-export.ts was last changed by the IND lane on 2026-09-29 (954c2588, b801a663). The fix does not need to touch it.

**Spine:** strictly, this belongs to the other spine (ectd-export / assemble-from-core). The submission-ops package spine uses validateEctdLeafs, and governed-transmit has no checksum re-check.

**Related, not part of this finding:**
- server/services/ectd/external-validator/fda-criteria-adapter.ts:106 accepts either util/index-md5.txt or the root file and never compares the root file with index.xml.
- server/services/ectd/qualification/qualify.ts:120 falls back from util/index-md5.txt to index-md5.txt as if both had the same per-file manifest format.

**Corrected claim.**

The finding holds as stated. Two refinements:
1. The defect is broader than the reproduction showed. A package with no util/index-md5.txt, a wrong root index-md5.txt and a wrong leaf checksum is still reported valid (warnings only), and so is a package whose root index-md5.txt is missing entirely.
2. For packages the product assembles itself, the gap is latent. The packager writes a correct root file and correct leaf checksums, and the util manifest carries the same leaf md5 values. The live exposure is the caller-supplied ZIP on POST /api/ectd/export/:submissionId/validate (the finding's text omits the '/export' segment), plus the false "checksum contract" claim behind the export route's X-ECTD-Valid header.

**Smallest correct fix.**

Everything below goes in server/services/submission-gateways/ectd-structural-validator.ts, validateEctdPackage.

(a) After step 1, when index.xml exists, check the root checksum file:
- If 'index-md5.txt' is absent, add the error "Missing required file: index-md5.txt (MD5 of index.xml, ICH eCTD v3.2.2)".
- Otherwise, compare its trimmed lowercase content with createHash('md5') of zip.file('index.xml').async('nodebuffer'). Hash the bytes, not the string.
- Raise an error when the content is not 32 hex characters or does not match.

(b) For index.xml (hrefs relative to the root) and each REGIONAL_BACKBONE_RE file (hrefs relative to that file's directory), check every leaf:
- For each /<leaf\b[^>]*>/ that has an xlink:href, read checksum and checksum-type.
- A missing checksum is an error.
- A checksum-type other than md5 is an error.
- If the resolved entry exists, compare md5 of its bytes with the checksum, case-insensitively, and raise an error on a mismatch.
- Skip leaves with no href, such as a delete.
- Missing entries are already reported by steps 1 and 2.

(c) Reword the header (:19-20, :256-258) and the step-6 comment (:364-365). The eCTD checksum contract is the root index-md5.txt plus the leaf checksums. util/index-md5.txt is the platform's additional full-file manifest, so its absence stays a warning.

Prove it by making the check fail: put D1-D4 above in a unit test next to tests/audit-hi-8-ectd-export-hardening.test.ts and show each one goes from valid to invalid. Then assert the real packager's bundle is still valid.

**Blast radius.**

**Product code:** one file, server/services/submission-gateways/ectd-structural-validator.ts. The callers need no change: server/routes/ectd-export.ts POST /:submissionId (the validateAfter gate and the X-ECTD-Valid header) and POST /:submissionId/validate. No client surface calls /api/ectd/export/:id/validate (the v2 EctdCompile surface calls /api/ectd-compile/...).

**The other spine:** assembleSubmissionEctd (server/services/ectd/assemble-from-core.ts) feeds this validator through the same regional-packager, which writes a correct root index-md5.txt and correct leaf checksums. Its output should stay valid. tests/golden-journeys/submission-export-package.journey.test.ts asserts validation.valid on that output and must be re-run.

**The package spine (submission-ops assemble and transmit):** it does not call validateEctdPackage, so it is unaffected.

**Tests that build ZIPs without a root index-md5.txt or leaf checksums, and still pass because their assertions are scoped:**
- tests/audit-hi-8-ectd-export-hardening.test.ts: the HI-8 DTD and stylesheet cases assert warnings only. The util mismatch case already expects valid=false.
- server/services/submission-gateways/__tests__/ectd-package-file-names.test.ts: the conformant-name case asserts only that there is no 'file-name rule' error. Its leaf has no checksum, so it will gain a checksum error, but its assertions do not change.

**Tests that mock the validator, so they are unaffected:** tests/unit/ectd-export-routes.test.ts, tests/routes/ectd-export-governance.test.ts, tests/routes/export-governance-fail-closed.test.ts.

**Optional follow-up:** the same util-instead-of-root conflation in fda-criteria-adapter.ts:106 and qualify.ts:120.

## VP-5 — The packager emits an unreferenced util/index-md5.txt into every bundle while the rule corpus tells operators that orphan files, DTD validity and leaf titles are 'Enforced here'

Finder severity low; skeptic: **partial**, severity low, spec confidence medium, reproduced True.

**Files.** server/services/submission-gateways/regional-packager.ts, server/services/ectd/validation-rule-corpus.ts, client/src/concept2cure/v2/surfaces/DispatchReadiness.tsx

**Claim.** regional-packager.ts:1243 writes util/index-md5.txt, a file outside ICH's util/dtd and util/style layout (the repo's SPEC_DIGEST §1 lists util/ as dtd/ and style/ only) that no backbone references. The corpus entry NO_ORPHAN_FILES (validation-rule-corpus.ts:303-311: 'Files present in the sequence folder but not referenced by index.xml are orphans the agency will flag') is marked enforcement 'ectd-validator'. Its statement, shown to operators in DispatchReadiness.tsx:305 and :332, reads 'Enforced here — the eCTD validator checks it when the package is compiled and exported'. No validator in the repo implements an orphan check (grep for 'orphan' finds none). INDEX_XML_VALID and LEAF_TITLE_PRESENT carry the same 'Enforced here' claim, but the package spine runs neither, and no DTD is vendored that a validity check could use. The procurement gap becomes a finding here because the product claims otherwise to the operator. Rule: ICH v3.2.2 util-folder contents (confidence medium). FDA flagging an unreferenced util file: low confidence.

**Skeptic's probe output.**

At HEAD a8c2a8d22 I ran a probe, tests/zz-probes/verify-vp-5/vp5.probe.test.ts. It used the real assemble route, PGlite, the real packager and the stand-in Ghostscript. The probe directory has been deleted and the worktree is clean. Output:
- `C1 ENTRIES ["m1/us/us-regional.xml","m1/us/1-2/cover-letter-cover0001.pdf","m2/2-5/2-5-co000002.pdf","m3/3-2-p-1/3-2-p-1-desc0003.pdf","index.xml","index-md5.txt","util/index-md5.txt"]`
- `C1 UNREFERENCED ["index-md5.txt","util/index-md5.txt"]`
- `C1 util/ entries ["util/index-md5.txt"]`
- `C1 CORPUS NO_ORPHAN_FILES ectd-validator | Enforced here — the eCTD validator checks it when the package is compiled and exported.` The same line appears for INDEX_XML_VALID, LEAF_TITLE_PRESENT and STF_FOR_STUDIES.

No orphan check exists. I added the file m2/2-5/orphan-not-in-backbone.pdf to the real bundle and ran validateEctdPackage on it. This is the zip validator the ectd-export route runs. Result: `valid= true errors= []`. The warnings covered only the missing DTD and stylesheet and the empty m4 and m5 folders, and said nothing about the extra file.

No title check exists. I set all three `<title>` elements in the real index.xml to empty. validateDtdConformance then returned `findings= []`, the same as for the unmodified file.

One part of the claim is wrong: DispatchReadiness never shows these three rules. Probe C3 gave `NO_ORPHAN_FILES is dispatch finding code: false | is gate rule id: false`, and the same for the other two. DispatchReadiness.tsx:305 and :332 render a rule only through ruleView(f.code) on dispatch findings (assess-dispatch-readiness.ts:115) or DISPATCH_GATE_RULE_IDS (:95). No finding or gate ever carries NO_ORPHAN_FILES, INDEX_XML_VALID or LEAF_TITLE_PRESENT. The claim reaches people only through:
- Ana's `list_validation_rules` tool (AnaToolExecutor.ts:9920), which returns the raw `enforcement: 'ectd-validator'`.
- GET /api/submissions/validation-rules and GET /api/knowledge/validation-rules. Nothing in client/src fetches either route.

Other code facts:
- INDEX_XML_VALID is partly checked. validateDtdConformance is a regex structural subset (declaration, DOCTYPE name, root, namespaces, leaf attributes, heading catalogue). It runs only on the compile/export/sign paths (ectd-export.ts, submission-orchestrator.ts, submission-sign-release.ts). The package spine (submission-ops assemble, then governed transmit) runs only validateEctdLeafs, which has no title, orphan or DTD rule. No DTD is vendored for a real validity check.
- STF_FOR_STUDIES has the same over-claim. ectd4-validator checks leaf.studyId (MISSING_STUDY_ID) but never checks that an STF is present. The finding did not name this rule.
- util/index-md5.txt is read by validateEctdPackage (ectd-structural-validator.ts:367-387), qualification/qualify.ts:120 and fda-criteria-adapter.ts:106, and many tests pin it. It is a platform manifest that the packager comment (regional-packager.ts:1240) calls "a platform convenience". It is not dead output.

**The requirement.**

The finding has two halves, and they have different support.

(1) The corpus over-claims enforcement. Confidence: medium-high.
- The type comment for `enforcement` (validation-rule-corpus.ts:19) says it "states plainly whether the rule is checked HERE". The 'ectd-validator' statement promises that a check runs at compile/export time.
- For NO_ORPHAN_FILES and LEAF_TITLE_PRESENT nothing runs: the probe showed a planted orphan and emptied titles both pass. For INDEX_XML_VALID only a regex approximation runs, and only on a different spine.
- Under CLAUDE.md ("fail closed, never fabricate"; deterministic engines produce verdicts), claiming a check that does not exist is a defect. It matters most because Ana is told to use this corpus to "explain WHY a validation finding blocks dispatch".
- It is still low severity. No gate is weakened by it, and the misleading text is not rendered in any UI surface. It reaches the operator only through Ana's narration and an API.

(2) util/index-md5.txt as an orphan the agency will flag. Confidence: low.
- ICH v3.2.2 describes util/ as holding the dtd/ and style/ folders. I know of no provision that forbids other files there.
- Validators' unreferenced-file rules must exempt util/, because DTDs and stylesheets are never referenced by a leaf. As I recall, the EU criteria scope the rule to files under m1–m5. A file in util/ is therefore the least likely place to be flagged.
- I cannot confirm that FDA's criteria flag a util/ text file. Allowed-but-unusual behaviour is not a defect.
- By the corpus's own wording ("files present in the sequence folder but not referenced by index.xml"), the mandatory root index-md5.txt would also be an orphan. That says the rule's wording is loose; it does not show the packager breaks a spec.

**Scope.**

The DispatchReadiness.tsx part is out of scope. It is not affected by these three rules, as shown above.

Not already fixed at HEAD, and not listed in the sweep README (F00–F20). The over-claim is not a procurement gap: the missing DTDs explain why INDEX_XML_VALID cannot be fully checked, but not why the corpus says it is. The util-folder half rests on missing spec text more than on the code.

Lanes:
- validation-rule-corpus.ts is not claimed in any row of docs/work-orders/README.md §0. It is shared reference data used by dispatch readiness, Ana and two routes.
- regional-packager.ts is the shared packager. It is used by both the package-model spine and the compile/export spine, including the IND demo lane, so any change to bundle contents is a cross-lane hand-off.
- ectd-structural-validator.ts (validateEctdPackage) belongs to the export route, not the package spine.

**Corrected claim.**

Rules NO_ORPHAN_FILES, LEAF_TITLE_PRESENT and INDEX_XML_VALID (and also STF_FOR_STUDIES) are labelled enforcement 'ectd-validator' ("Enforced here — the eCTD validator checks it when the package is compiled and exported"). In fact no in-repo validator checks for orphan files or empty leaf titles: a planted orphan PDF passes validateEctdPackage with valid=true, and emptied titles produce zero validateDtdConformance findings. INDEX_XML_VALID is only a regex structural subset, and it runs only on the compile/export path, never on the package spine.

The claim reaches people through Ana's list_validation_rules tool and the /validation-rules API routes, not through DispatchReadiness.tsx. That surface never renders these rules, because none of them is ever a finding or gate code.

The bundle does contain an unreferenced util/index-md5.txt. It is a platform manifest that three in-repo readers use. Whether an agency validator would flag it, given that orphan rules normally exempt util/, has low-confidence spec support.

**Smallest correct fix.**

In server/services/ectd/validation-rule-corpus.ts, change `enforcement` from 'ectd-validator' to 'external' for NO_ORPHAN_FILES (:310), LEAF_TITLE_PRESENT (:167) and INDEX_XML_VALID (:147). Also STF_FOR_STUDIES (:390), which has the same over-claim. Each rule would then read "Requires the agency validator — its report decides this", which is true. Add a dated comment on each rule saying no in-repo check implements it. Tighten the NO_ORPHAN_FILES rationale so it does not cover index-md5.txt or util/.

Leave util/index-md5.txt in the bundle. Removing it has low-confidence spec support and a large blast radius. If the founder wants it out of the agency bytes, that is a separate change: move it next to the bundle as platform evidence, and move every reader with it in the same change.

Better, but more work: build the checks for real.
- Orphan check: in validateEctdPackage, every entry outside util/ other than index.xml and index-md5.txt must be referenced by some backbone href, resolved against that backbone's own directory.
- Title check: add a non-empty `<title>` check per leaf in validateDtdConformance.
- Run both on the package spine's pre-transmit gate. Only then may the label return to 'ectd-validator'.

**Blast radius.**

Relabel fix: one data file, server/services/ectd/validation-rule-corpus.ts.
- Visible effects: the corpusSummary().byEnforcement counts change (the 'ectd-validator' count drops to 0 if all four rules move). Ana's list_validation_rules output and GET /api/submissions/validation-rules and /api/knowledge/validation-rules change their `enforcement` values.
- Tests: none pin these rules' enforcement. server/services/ectd/__tests__/validation-rule-corpus.test.ts:174 checks only the statement mapping for 'ectd-validator' and still passes; :42-48 checks that totals agree and still passes. The shared/types/submission-api.ts:279 union is unchanged.
- No effect on DispatchReadiness.tsx or the dispatch gate, because these rules are not findings or gates.

Removing util/index-md5.txt from the bundle (not recommended):
- Code that reads it: regional-packager.ts:1243, ectd-structural-validator.ts:367-387, qualification/qualify.ts:116-120, fda-criteria-adapter.ts:106, and ectd4/rps-packager.ts:135 (a separate v4 path that writes its own copy).
- Tests that pin it: server/services/ectd/__tests__/package-leaf-bytes.test.ts, external-validator/__tests__/fda-criteria-adapter.test.ts, qualification/__tests__/qualification.test.ts, submission-gateways/__tests__/{regional-backbone-referenced,lifecycle-packaging,stf-packaging,regional-backbone-dtd-path}.test.ts, client/src/concept2cure/v2/__tests__/{ectdCompile.fixtures.ts,ectdCompileWithdrawal.test.tsx}, tests/audit-hi-8-ectd-export-hardening.test.ts, tests/golden-journeys/submission-export-{validation,package}.journey.test.ts, and tests/routes/ectd-compile-spine.{harness,test}.ts.
- Both spines (package-model and compile/export) are affected.

## VP-6 — The FDA gateway size check refuses packages over 4 GB and tells the operator to use physical media, while the gate's own header and the repo's spec digest say ESG is required up to 10 GB

Finder severity low; skeptic: **confirmed**, severity low, spec confidence medium, reproduced True.

**Files.** server/services/ectd/ectd-regional-rules.ts, server/services/submission-gateways/pre-transmit-check.ts

**Claim.** FDA_GATEWAY_LIMIT_BYTES is 4 GiB (ectd-regional-rules.ts, FDA-ESG-003, citing 'FDA ESG Technical Conformance Guide §4.5'). The header of evaluatePreTransmit says 'FDA Form 5640 v2.0: ESG for ≤10 GB, physical media above', and docs/ectd/SPEC_DIGEST.md §6 says ESG is preferred and REQUIRED for ≤10 GB. A 4–10 GB sequence is therefore hard-blocked, and the operator is sent to physical media, a channel FDA reserves for >10 GB. This is a rule FDA does not have, by the repo's own account. Confidence: medium on the 10 GB figure (recorded in-repo, not fetched).

**Skeptic's probe output.**

I ran a probe at HEAD from tests/zz-probes/verify-vp-6/vp6.probe.test.ts (1/1 passed; the directory is now deleted and the working tree is clean). It called the real evaluatePreTransmit, validateRegionalPackage and getGateway('fda','esg').transmit. Output:
`LIMIT US 4294967296 CA 4294967296`
`RULE {"id":"FDA-ESG-003",...,"description":"Total package size must not exceed 4 GB compressed (gateway limit)","citation":"FDA ESG Technical Conformance Guide §4.5"}`
`PRE 3.9GiB {"cleared":true,...}`
`PRE 4.01GiB {"cleared":false,"blockers":["Package is 4.01 GB, over the FDA gateway limit of 4.00 GB. Submit via the agency's large-submission channel (e.g. physical media) instead of the gateway."]...}`
`PRE 5GiB` and `PRE 9.9GiB` are both cleared:false with the same physical-media blocker.
`PRE staging 5GiB cleared= false`: the size check is hard in every environment.
`REGIONAL 5GiB {"ruleId":"FDA-ESG-003","severity":"error","message":"Package size 5.00 GB exceeds FDA ESG 4 GB gateway limit","fix":"Split the submission into multiple sequences"}`
`TRANSMIT 5GiB Refusing to transmit to FDA esg: package failed pre-transmit checks. Package is 5.00 GB, over the FDA gateway limit of 4.00 GB. Submit via the agency's large-submission channel (e.g. physical media) instead of the gateway.`

So any FDA package between 4 and 10 GB is hard-blocked at the transmit guard (submission-gateways/index.ts:220), and the operator gets two different remedies that disagree: physical media from the pre-transmit gate, and "split into multiple sequences" from the regional validator.

The repo contradicts itself. The pre-transmit-check.ts header (lines 9-11) says "FDA Form 5640 v2.0: ESG for ≤10 GB, physical media above". docs/ectd/SPEC_DIGEST.md §6 (lines 114-115) says ESG is preferred and required for ≤10 GB, with >10 GB going on USB physical media. A test fixture, governed-transmit-pretransmit-record.test.ts:70, even uses '10737418240 byte limit for FDA'. The 4 GB constant cites "FDA ESG Technical Conformance Guide §4.5", and that document does not exist: FDA publishes an eCTD Technical Conformance Guide and an ESG User Guide.

**The requirement.**

From what I know of FDA's transmission guidance ("Transmitting Electronic Submissions Using eCTD Specifications" and the eCTD Technical Conformance Guide), submissions of 10 GB or less are expected through the ESG, and only larger ones go on physical media. I know of no FDA rule that caps ESG eCTD submissions at 4 GB. I did not fetch the current guidance, so my confidence is medium, not high.

Three in-repo sources agree on 10 GB: the gate's own header, the spec digest drawn from the vendored transmission spec, and a test fixture. The only source for 4 GB cites a document title FDA does not publish, which looks invented.

The operator-facing harm goes beyond a refused send. The blocker sends a 4-10 GB package to physical media, a channel the repo's own digest says FDA reserves for >10 GB, adding that "Non-compliant transmissions are subject to rejection". That is a rule FDA does not have, and the advice leads to non-compliance. The regional validator's alternative fix ("Split the submission into multiple sequences") is not an FDA-sanctioned remedy for size either.

Blocking above 10 GB is defensible, because it matches FDA's channel split. The gate does fail closed, so this is wrong guidance and an over-restriction, not a fabricated success. For that reason I agree with low severity at launch scope: IND sequences, which are row D7's subject, are normally far below 4 GB. For NDA/BLA originals with datasets, which are often 4-10 GB, it would be medium.

Two things remain uncertain:
- Whether FDA means decimal GB (10^10 bytes) or GiB.
- Health Canada's CESG limit. CA currently shares the FDA constant and is not verified.

**Scope.**

Not fixed at HEAD, and not a procurement gap: it is a wrong constant and a wrong citation, not missing credentials or DTDs. It is not among sweep findings F00-F20: the sweep README has no size or gateway-limit entry.

Lane: the two files are not claimed by an active lane in docs/work-orders/README.md §0. The PDF/A lane (…01J935DZ) last touched pre-transmit-check.ts and is marked done 2026-10-01. The package-spine lane (this session, …01LjrcEe) owns the transmit path's FDA acceptability. ectd-regional-rules.ts was last changed by the region-vocabulary fold (89d44d61e), so check its last-24h history before editing.

The same constant also feeds:
- server/services/regulatory/workspace-config-enrichment.ts:73 (gatewaySizeLimitBytes shown in the workspace config)
- the CA region, through getGatewaySizeLimit's `case 'CA': return FDA_GATEWAY_LIMIT_BYTES`.

**Corrected claim.**

Confirmed as stated. One addition: the regional validator's FDA-ESG-003 also gives a second, conflicting remedy ("Split the submission into multiple sequences"), and the 4 GB constant also sets the CA (Health Canada) limit, which nobody has verified either.

**Smallest correct fix.**

All changes are in server/services/ectd/ectd-regional-rules.ts. Following CLAUDE.md, the operator-facing guidance must stay honest.

1. Change the FDA limit: `const FDA_GATEWAY_LIMIT_BYTES = 10 * 1000 ** 3;`. Use 10 GB decimal as the conservative reading of FDA's "10 GB", or 10 GiB if the vendored form5640 text says so; then the constant, the pre-transmit header and SPEC_DIGEST §6 all agree.

2. Change the FDA-ESG-003 rule entry:
   - description: 'Packages over 10 GB must be provided on physical media rather than through the ESG'
   - citation: 'FDA, Transmitting Electronic Submissions Using eCTD Specifications (Form 5640 v2.0) — docs/ectd/SPEC_DIGEST.md §6'

3. Replace the hard-coded '4 GB' in the two messages (lines 544 and 555) with a figure derived from the constant. Replace the fix text 'Split the submission into multiple sequences' with 'Over 10 GB: provide the sequence on physical media (USB) to the CDER/CBER document room, per FDA transmission guidance'. Then the regional finding and the pre-transmit blocker give one remedy.

4. Do not move CA silently. Give it its own `CA_CESG_LIMIT_BYTES = 4 * 1024 ** 3` with a "pending verification against Health Canada CESG guidance" note, and return that for `case 'CA'`. CA behaviour stays the same until a Health Canada source is cited.

pre-transmit-check.ts needs no logic change. Its blocker text stays correct once the limit is 10 GB; optionally name FDA's physical-media route there instead of "e.g.".

**Blast radius.**

Files:
- server/services/ectd/ectd-regional-rules.ts: constant, rule entry, two messages, fix text, CA split
- optionally docs/ectd/SPEC_DIGEST.md: no change needed, it already says 10 GB

Behaviour:
- getGatewaySizeLimit('US') rises. That changes evaluatePreTransmit at the transmit guard (submission-gateways/index.ts:220, both environments), validateRegionalPackage FDA-ESG-003 (via the submission-package-orchestrator totalSizeBytes callers at lines 583, 905, 1879, 2604, 2941), and the gatewaySizeLimitBytes enrichment shown in workspace config (regulatory/workspace-config-enrichment.ts:73).
- CA does not change if it gets its own constant.

Tests that pin current behaviour and must be edited:
- server/services/ectd/__tests__/ectd-regional-rules.test.ts:39 (`US: 4 * GB`). Line 40 (`CA: 4 * GB // shares the FDA gateway limit`) keeps its value but needs its comment fixed.
- server/__tests__/services/submission-orchestrator.test.ts:377-390 ('flags package size over FDA 4 GB gateway limit', using 5 GiB). It would stop finding FDA-ESG-003 and needs a size above 10 GB (e.g. 11 GiB), plus a new case asserting that 5 GiB is not flagged.

Unaffected:
- pre-transmit-check.test.ts (uses 999 GB)
- governed-transmit-pretransmit-record.test.ts (already a 10 GiB fixture string)
- ectd-regional-rules.test.ts:475-492 (unknown size and a 1 KB case)

The other spine (the IND demo / assess-dispatch-readiness path) reads the same getGatewaySizeLimit and gets the same correction; it has no separate constant.

## VP-7 — LEAF-FILENAME checks only the base name, and more loosely than the product's own US spec; folder names and path length are never checked

Finder severity low; skeptic: **partial**, severity low, spec confidence medium, reproduced True.

**Files.** server/services/submission-gateways/ectd-structural-validator.ts, server/services/ectd/ectd-regional-rules.ts, server/services/market-specs/market-submission-specs.ts

**Claim.** FILENAME_PATTERN (`^[a-z0-9][a-z0-9.-]{0,63}$`) accepts several dots, no extension, and any extension (x.exe). The product's own us-ectd spec says `^[a-z0-9-]{1,64}\.[a-z0-9]+$` with maxPathLength 230 (market-submission-specs.ts:159-162). validateEctdLeafs applies the pattern to the last path segment only, so folder names with uppercase, spaces or underscores, and any total path length, pass. On this spine the route builds folders from ICH codes and keeps names to 64 characters, so this is not reachable through assemble today. Any other caller of validateEctdLeafs gets the weaker check. Rule: ICH eCTD v3.2.2 Appendix 2 naming (lowercase a-z, 0-9, hyphen; one '.' before the extension; folders too; path-length cap). Confidence: medium.

**Skeptic's probe output.**

Two probes ran at HEAD a8c2a8d22, under tests/zz-probes/verify-vp-7/ (deleted afterwards).

A1: validateEctdLeafs with {region:'FDA', enforceFileNames:true} on 'm2/a.b.c.pdf', 'm2/noextension', 'm2/x.exe', 'BAD_FOLDER_Name With Space/ok.pdf' and a 309-character path returned `{"errorCount":0,"warningCount":0,"findings":["SUMMARY:"]}`.

A2 compared FILENAME_PATTERN with the us-ectd spec pattern `^[a-z0-9-]{1,64}\.[a-z0-9]+$`, maxPathLength 230:
- a.b.c.pdf: FILENAME_PATTERN true, spec false
- noextension: FILENAME_PATTERN true, spec false
- x.exe: FILENAME_PATTERN true, spec **true**. The product's own spec does not reject x.exe either.

A3: validateEctdPackage (the ZIP validator in the same file) on the same entries gave file-name errors `[]`.

B1 ran the real assemble route (PGlite harness, real packager) and captured what validateEctdLeafs received:
- status 200
- validated paths: `["m1/us/1-2/cover-letter-cover0001.pdf","m2/2-5/2-5-co000002.pdf","m3/3-2-P-1/3-2-p-1-desc0003.pdf"]`
- zip entries: `[...,"m3/3-2-p-1/3-2-p-1-desc0003.pdf",...]`
- longest zip path: 36

So on this spine every shipped name and folder already conforms, and paths stay far below any limit. But the route hands the validator a path with an UPPERCASE folder segment (`3-2-P-1`). The packager lowercases it through ctdFolderSlug, so that path is not in the zip. The comment at submission-ops.ts:2683-2686 says it is.

**The requirement.**

ICH eCTD v3.2.2 Appendix 2 sets naming rules for folders and files alike: lowercase, the characters a-z, 0-9 and hyphen, at most 64 characters including the extension, one extension separated by '.', and a cap on total path length. EU applies 180 characters. I am not sure whether ICH's own cap is 180 or 230, or how FDA's validation criteria grade the severity, so confidence is medium, not high.

The finding's requirement is right in substance: base-name-only checking is weaker than the rule. Parts of the claim are wrong, though:
- **"Any other caller of validateEctdLeafs gets the weaker check":** there is no other caller. The only one is submission-ops.ts:2845.
- **"x.exe" against "the product's own US spec":** the market-spec pattern accepts x.exe too. It also allows 64 characters plus an extension, which breaks the 64-including-extension rule. It is not the correct single pattern to adopt.
- **x.exe in validateEctdLeafs:** LEAF-MEDIATYPE / LEAF-CORRUPT already require application/pdf and %PDF- bytes there, so a wrong extension is the only remaining defect.

Nothing on this spine reaches the gap. Names come from leafFileName (always `[a-z0-9-]+.pdf`, 64 characters or fewer) and folders from ctdFolderSlug, which lowercases them. The gap is real but latent here. It is a rule-encoding gap, not a shipped defect. It is not a procurement gap.

**Scope.**

- **Not already fixed:** it is not among F00-F20 in the sweep README, and FILENAME_PATTERN is unchanged at HEAD.
- **Not a procurement gap.**
- **Lanes:** no lane in docs/work-orders/README.md §0 claims ectd-structural-validator.ts, ectd-regional-rules.ts or market-submission-specs.ts.
- **Where the gap is reachable:** on the other spine. server/routes/ectd-export.ts:886-898 runs validateEctdPackage on an operator-supplied zipBufferBase64. That validator has the same base-name-only check (probe A3), so an external package with uppercase or spaced folders, several dots in a name, or an over-long path gets no file-name error.
- **Third implementation:** market-formatting-validator.ts:222-254 checks fileNamePattern, maxFileNameLength and maxPathLength separately, which breaks the "zero duplication" rule.

**Corrected claim.**

validateEctdLeafs and validateEctdPackage apply FILENAME_PATTERN (`^[a-z0-9][a-z0-9.-]{0,63}$`) to the base name only. Multi-dot names, names with no extension, any folder name and any path length all pass.

On the assemble spine nothing reaches this: validateEctdLeafs has exactly one caller, and its names and folders always conform. The product's us-ectd spec pattern also accepts x.exe and allows names over 64 characters, so it is not the right replacement. The route validates `m3/3-2-P-1/...` while shipping `m3/3-2-p-1/...`, so adding a folder check without first fixing the route's path derivation would block every 3.2.S/P leaf.

The reachable instance is validateEctdPackage on the ectd-export validate route, for operator-supplied ZIPs. That is the other spine.

**Smallest correct fix.**

The order matters: step 1 has to land with or before step 3.

1. **server/routes/submission-ops.ts:2688.** Build the validator path with `ctdFolderSlug(placement.code)` (shared/regulatory/section-code.ts) instead of `placement.code.replace(/\./g,'-')`, or take `leafPackagePath(...).relPath`. The validated path then equals the zip entry. Without this, step 3 would raise a false blocking LEAF-FILENAME on every 3.2.S, 3.2.P, 2.3.S and 2.3.P leaf the real route assembles.
2. **server/services/ectd/ectd-regional-rules.ts:368.** Make FILENAME_PATTERN one dot, extension required, 64 characters or fewer including the extension: `/^(?=.{1,64}$)[a-z0-9][a-z0-9-]*\.[a-z0-9]+$/`. Add `FOLDER_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/`. Do not adopt the market-spec pattern; it allows names over 64 characters.
3. **ectd-structural-validator.ts:122-132.** Under enforceFileNames, test every folder segment against FOLDER_NAME_PATTERN and check `path.length` against a per-region cap. Take the cap from market-submission-specs maxPathLength (FDA 230, EU/other 180) rather than a new constant. Optionally flag an extension other than `.pdf` for an application/pdf leaf.
4. **Same file, :277-282 (validateEctdPackage).** Apply the same segment and length checks there. This is the reachable case, on the ectd-export spine.

**Blast radius.**

**Files:**
- ectd-regional-rules.ts: FILENAME_PATTERN is shared by checkAsciiFilenames for every region's regional rules (e.g. EMA-CESP-005), by ectd-submission-agent.ts:199 (whose hasExtension check becomes redundant) and by leaf-source-resolver.ts docs.
- ectd-structural-validator.ts: both validateEctdLeafs and validateEctdPackage.
- submission-ops.ts: the assemble path derivation, this spine.
- ectd-export.ts: the other spine, through validateEctdPackage.

**Tests that pin current behaviour or would go red:**
- tests/ectd-structural-validator.test.ts:94-110 (LEAF-FILENAME)
- server/services/ectd/__tests__/leaf-file-name.test.ts
- server/services/submission-gateways/__tests__/ectd-package-file-names.test.ts
- server/services/__tests__/ectd-submission-agent-validate.test.ts
- tests/submission-ops-assemble-routes.test.ts
- tests/submission-ops-package-spine.pglite.e2e.test.ts: goes red if the folder check lands without the route lowercasing fix.
- Regional-rules fixtures with multi-dot names may newly fail.

**UI:** none, since findings already render generically.

## HS-1 — Transmit success toast drops filedSequenceWarning: a filed-history write that failed or conflicted reads as a clean success

Finder severity high; skeptic: **confirmed**, severity high, spec confidence high, reproduced True.

**Files.** client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx, server/routes/mdx-submission-gateway.ts, server/services/submission-gateways/transmit-notices.ts, server/services/submission-gateways/governed-transmit.ts

**Claim.** POST /gateways/:region/:gateway/transmit returns filedSequenceRecorded, filedSequenceReason, filedSequenceConflict and filedSequenceWarning (mdx-submission-gateway.ts:280-294, transmit-notices.ts:54-80). filedSequenceWarning is set whenever the sequence was NOT added to the package filed history: 'write-failed', 'no-usable-manifest', or 'sequence-conflict', where two different bundles have now gone to FDA under one sequence number. The transmit handler (GatewayTransmittals.tsx:487-516) reads only transmissionId, ledgerWriteFailed/ledgerWarning and contentAfterTransmit/contentWarning. No file under client/src mentions filedSequence. So the operator sees an ordinary role=status success toast while the server is saying the next assembly will diff against a history that does not hold this filing, or that the agency now holds two bundles under one number. The route's own comment says this 'is said, not implied'. The surface implies it. The same handler also ignores result.status and result.message, so an SFTP deposit (status 'in_transit', 'awaiting FDA receipt') is announced as 'Transmitted via FDA / FDA ESG' just like an AS2 MDN receipt.

**Skeptic's probe output.**

I reproduced this at HEAD a8c2a8d22 with a probe at tests/zz-probes/verify-hs-1/hs1.probe.test.tsx, which is now deleted. The probe mounts the real GatewayTransmittals surface with only C2CForm and apiRequest stubbed. The transmit answer it feeds in is the route's 201 shape, and the warning text comes from the real transmitOutcomeNotices() in server/services/submission-gateways/transmit-notices.ts. Output:
  SERVER NOTICE (sequence-conflict) :: The transmission completed, but this sequence could not be added to the package filed history. The history already holds sequence 0001 on file as a different bundle, sent by transmittal 4100. Two different bundles have now been sent under one sequence number: the agency will load at most one of them...
  TOAST role=status :: Transmitted via FDA / FDA ESG · gateway ref MDN-1. Signed by you — meaning: release.
  × filed-history not recorded (write-failed) is surfaced -> warning text in toast: expected 'Transmitted via FDA / FDA ESG · gatew…' to match /filed history/; toast tone: expected 'status' to be 'alert'
  × (no-usable-manifest) — same two failures
  × (sequence-conflict) — same two failures
  SFTP case: TOAST role=status :: Transmitted via FDA / FDA ESG · gateway ref SFTP-1. Signed by you — meaning: release.  (the server message 'awaiting FDA receipt' is dropped)
  Tests 4 failed (4)
I also checked that the server really does send these warnings at HEAD. I ran two existing route tests: `npx vitest run tests/mdx-submission-gateway-transmit-bundle-guard.test.ts -t "WHILE this one was sending|leaf inventory is UNREADABLE"` gave 2 passed. Those tests assert that POST /api/mdx/gateways/fda/esg/transmit returns 201 with filedSequenceRecorded:false and filedSequenceWarning matching /transmittal 4300/, /at most one/ and /no readable leaf inventory/.
In the client, `grep -rn filedSequence client/src` finds nothing. In transmit(), GatewayTransmittals.tsx:491-516 reads only transmissionId, ledgerWriteFailed/ledgerWarning and contentAfterTransmit/contentWarning. The toast tone is raised to 'error' only for those two. This surface is the only client caller of the transmit route. The AnA path is not affected: mdx-command-handlers.ts:896 already includes notices.filedSequenceWarning in its notice text.

**The requirement.**

Main claim (filedSequenceWarning dropped). My confidence that this is a real defect is high, and it does not depend on an invented rule.
(a) The repo's own rules. CLAUDE.md says "Fail closed, never fabricate … An error is never rendered as an empty result". The server code states its own contract twice: mdx-submission-gateway.ts:285-286 says the filed-sequence result "is said, not implied", and transmit-notices.ts:21-24 says each notice "is reported, never folded into a clean success". The two sibling notices, ledgerWarning and contentWarning, are already shown as alerts and are pinned by client tests at lines 435 and 636. filedSequenceWarning is the third member of the same set and is the one left out. The operator gets a plain role=status success toast while the server is reporting a failure.
(b) Regulatory consequence. In eCTD v3.2.2 the lifecycle operations (new/replace/append/delete, with modified-file pointing to a leaf in an earlier sequence) and the next sequence number both depend on knowing exactly which sequences the agency holds.
- governed-transmit.ts:360-370 says a false here costs the baseline the next sequence is diffed against.
- The SEQUENCE_ALREADY_FILED guard (governed-transmit-checks.ts:132-142) reads the same filed history. So when the write fails ('append-failed'), the guard cannot stop a later bundle from going out under the same number.
- In the 'sequence-conflict' case, two different bundles are already with FDA under one sequence number. FDA processing will treat one of them as a duplicate sequence.
In all of these cases the warning is the operator's only notice at the moment it matters.
(c) Part 11. The server-side record is kept (the sign payload and the transmit manifest carry filedSequenceReason), so this is not a §11.10(e) audit-trail gap. It is a failure of the operator-facing display, which falls under the CLAUDE.md rules in (a).
Secondary claim (SFTP 'in_transit' shown as 'Transmitted'). This one is weak, low confidence. An SFTP deposit to ESG /incoming/ is a transmission. The toast never says the agency received or acknowledged anything, and after load() the log row shows status in_transit. Showing result.message ("awaiting FDA receipt") would be better, but leaving it out is information loss, not a false statement. It does not support the high severity on its own.

**Scope.**

It is not fixed at HEAD: nothing under client/src mentions filedSequence. It is not a procurement gap: the server already computes and returns the warning, and only the display drops it. It is not one of the sweep's findings either. F14 and F19 are the server-side fixes that created these warnings, and the sweep README never mentions the client toast.
GatewayTransmittals.tsx is inside the package-spine lane. In docs/work-orders/README.md §0, row 70 is claimed by session_01LjrcEe8y3zUQxwX91zzTaM (row D7, W5), and that lane last edited this file on 2026-10-01 (commits ae5396a25 and 723395ed4). No other lane is blocked.
Only the filedSequenceWarning part of the finding meets the bar. The SFTP-wording part should be treated as low severity or an optional wording improvement, not part of the high-severity defect.

**Corrected claim.**

The main claim holds exactly as stated: GatewayTransmittals ignores filedSequenceRecorded and filedSequenceWarning, so a failed write ('append-failed'), a 'no-usable-manifest' result, or a 'sequence-conflict' result is announced as a plain role=status success. The secondary claim is overstated. Calling an SFTP deposit 'Transmitted' is accurate, because the toast never claims agency receipt and the log then shows in_transit. Dropping result.message there is a minor information loss, not a misstatement.

**Smallest correct fix.**

Client only, in client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx, transmit() around lines 499-516. Add:
  const filedLost = dataOut.filedSequenceRecorded === false
    ? ' ' + String(dataOut.filedSequenceWarning ?? 'The transmission completed, but this sequence could not be added to the package filed history. Record it before assembling the next sequence.')
    : '';
Append filedLost to the fireToast text after contentChanged, and change the tone condition to `ledgerLost || contentChanged || filedLost ? 'error' : undefined`.
The server's sequence-conflict warning already names the conflicting transmittal ('sent by transmittal 4100'), so the client does not need to read filedSequenceConflict itself. Gate on `filedSequenceRecorded === false`, not on the warning string being present, so a missing warning still falls back to fixed text rather than a clean toast. 'not-applicable', which covers test-environment sends and non-eCTD sends, must stay silent.
Optional, low priority: when dataOut.status === 'in_transit', append String(dataOut.message), for example 'FDA ESG SFTP upload complete; awaiting FDA receipt'.
Add three client tests in client/src/concept2cure/v2/__tests__/gatewayTransmittals.test.tsx, modelled on the test at line 636: append-failed, no-usable-manifest, and sequence-conflict. Each should assert that the toast text matches /filed history/ (and /transmittal 4100/ for the conflict case) and that it sits inside [role="alert"]. Add a fourth test showing that 'not-applicable' stays a role=status success.

**Blast radius.**

Changed file: client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx (transmit callback only). Tests: client/src/concept2cure/v2/__tests__/gatewayTransmittals.test.tsx gains cases. No existing test pins the current silent behaviour. The default mock (line 95) returns no filedSequenceRecorded field, so `=== false` keeps the existing success-toast assertions at lines 110-126 and the meaning test at line 870 green. gatewayTransmittalsNames.test.tsx also calls the transmit route, so check that its mock does not return filedSequenceRecorded:false.
No server change is needed: transmit-notices.ts, mdx-submission-gateway.ts and governed-transmit.ts already produce the fields and are pinned by tests/mdx-submission-gateway-transmit-bundle-guard.test.ts (around lines 660-700 and 1086-1104). The AnA spine (server/services/ana-ri/mdx-command-handlers.ts:896, pinned by mdx-command-handlers.test.ts:679-695) already shows the warning and needs nothing. The assemble/packager spine is not touched.

## HS-2 — The pre-transmit gate's failed checks and its 'NOT an FDA-conformant Module 1 backbone' warning are returned on every FDA send and never shown

Finder severity high; skeptic: **confirmed**, severity medium, spec confidence medium, reproduced True.

**Files.** client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx, server/services/submission-gateways/index.ts, server/services/ectd/regional-backbone-readiness.ts, server/services/submission-gateways/regional-packager.ts, server/routes/submission-ops.ts

**Claim.** The transmit guard attaches preTransmit {checks, warnings} to every gateway result (index.ts:263-269), and the route spreads it into the 201 body. This includes checks that failed without blocking. For FDA today that means regional-backbone-conformant=false on every bundle: fdaBackboneGaps (regional-packager.ts:464-487) always reports '<telephone> carries no telephone-number-type'. The sweep's F06 fix made regionConformant honest precisely so the gaps would be named. It also means dtd-self-contained=false and external-evalidator 'did not run'. evaluateRegionalBackboneGate puts this warning on the result: '<file> is NOT an FDA-conformant Module 1 backbone … A regional validator will not accept it as FDA Module 1.' The client never reads preTransmit. The assemble response carries only counts (submission-ops.ts:3243-3275, no regionalBackbone or dtdStatus), and preflight does not report them either. So nothing on this surface ever shows the operator the non-conformance. Meanwhile the assemble toast promises 'the transmit gate still checks region, size and conformance opt-ins', and the transmit itself then ends in a clean success. The verdict lands only on the Part 11 sign record.

**Skeptic's probe output.**

Reproduced at HEAD a8c2a8d22 with two probes under tests/zz-probes/verify-hs-2/. The directory has been deleted and the git tree is clean.

Server probe. It ran the real assemble route on PGlite with the real packager, then the real getGateway('fda','esg') guard (only the AS2 wire and the account lookup were stubbed), then the real mdx transmit route (only executeGovernedTransmit was stubbed, returning the guard's real result):
  ASSEMBLE status 200
  ASSEMBLE body.data.bundle keys ["path","sha256","sizeBytes","format","leafCount","sequence","submissionType","lifecycle","storage","validation","assembledAt"]
  ASSEMBLE validation {"errorCount":0,"warningCount":0,"infoCount":1}
  STORED regionalBackbone {"region":"fda","file":"m1/us/us-regional.xml","regionConformant":false,"conformanceGap":"applicant contact \"Jane Q. Regulatory\": <telephone> carries no telephone-number-type, whose FDA code list is not vendored here"}
  STORED dtdStatus {...,"selfContained":false}
  STORED findings ["info:SUMMARY"]
  GUARD[production] failed checks [dtd-self-contained passed:false "missing: ich-ectd-3-2.dtd, us-regional-v3-3.dtd, ectd-2-0.xsl, us-regional.xsl"; regional-backbone-conformant passed:false]
  GUARD[production] warnings ["m1/us/us-regional.xml is NOT an FDA-conformant Module 1 backbone — applicant contact ...: <telephone> carries no telephone-number-type ... A regional validator will not accept it as FDA Module 1."]
  GUARD[staging]: the same checks and warnings.
  ROUTE status 201; body.data keys [...,"gatewayAccount","preTransmit","contentAfterTransmit","filedSequenceRecorded",...]; body.data.preTransmit.warnings = [the NOT-conformant sentence]

Client probe. GatewayTransmittals was fed that 201 body verbatim, and the real assemble response keys:
  TX TOAST role=status :: Transmitted via FDA / FDA ESG · gateway ref MDN-2. Signed by you — meaning: release.
  TX page mentions conformance? false
  ASM TOAST role=status :: Bundle assembled for pkg_e2e · 3 leaves · 0 warnings · sha256 aaaaaaaaaaaa. No error-severity findings; the transmit gate still checks region, size and conformance opt-ins.
  ASM page mentions conformance? false

The client never reads preTransmit (grep finds no client reference). The assemble response drops regionalBackbone and dtdStatus, which are stored on metadata.bundle (submission-ops.ts:3097-3098) but are missing from the response at 3256-3274. Assemble pushes no finding about either, so warningCount is 0. Preflight returns only the stored structural findings and the external-validator results.

"Every FDA send" holds on this spine. The assemble gate requires a contact with a phone (fdaIdentifierProblems), so fdaContactGaps always yields the telephone-number-type gap, and no vendored DTDs means dtd-self-contained always fails.

Corrections to the claim:
- No 'external-evalidator did not run' check appears in the guard's report on this path (enforceExternal:false). Only the DTD and backbone checks failed.
- AnA's transmit command does surface preTransmitFailedChecks and preTransmitWarnings (mdx-command-handlers.ts:864-913). The gap is specific to the GatewayTransmittals surface and its routes.
- The sweep's own PLANS.md:507 planned an assemble-time finding (FDA-ADMIN-VOCABULARY-MISSING) for exactly this. It was never implemented: grep finds no match in server, client or shared.

**The requirement.**

The requirement stands on three sources.

1. The repo's own rules. CLAUDE.md says "fail closed, never fabricate" and "an error is never rendered as an empty result". The gate's own contract (regional-backbone-readiness.ts:147-153) says a non-conformant backbone is "ALWAYS surfaced ... so no surface can read it as conformant". This surface reads it as a clean success, in status tone, after the gate concluded "A regional validator will not accept it as FDA Module 1".

2. The regulation substance. In FDA us-regional DTD 3.3, `telephone telephone-number-type` is #REQUIRED (recorded in the sweep's PLANS.md:262, and consistent with my knowledge of the M1 backbone specification). FDA's eCTD validation criteria treat a regional backbone that does not validate against its DTD as a high-severity error, which produces a technical rejection at Ack3. So the hidden verdict is materially true, not cosmetic.

3. The procurement exemption. The underlying gaps (FDA's telephone-number-type list and the vendored DTDs) are procurement gaps. However, the assemble toast tells the operator that "the transmit gate still checks ... conformance", and the transmit then confirms success. That implies the conformance check passed when the product knows it failed, which is the "product claims otherwise to the operator" exception.

21 CFR Part 11 does not itself require pre-sign display of warnings, so the case rests on the repo's own honesty rules and the signer's §11.50 meaning ("release"/"approval") being declared while the system withholds a known defect. Confidence is medium, not high: the specific DTD attribute is asserted without the vendored DTD, and the exemption is a judgment about what the toasts imply.

Severity is medium rather than high. Production FDA sends are gated today by the ESG procurement gap (no credentials, so a 412). The verdict is recorded on the Part 11 ledger and manifest. A technical rejection is recoverable, and F19 added the governed action that records one. It becomes high once a production ESG account exists.

**Scope.**

Not fixed at HEAD a8c2a8d22. Not purely a procurement gap: the gaps themselves are, but hiding the product's own computed verdict is not. It is not in the sweep's F00-F20 table: F06 made regionConformant honest but did not surface it, and PLANS.md:507's planned assemble finding was never built. It falls under the honest-state lens the sweep owes.

Lane: the package-model spine row in docs/work-orders/README.md §0 (row 70, claimed by session_01LjrcEe8y3zUQxwX91zzTaM, W5/D7). It names the assemble route and governed transmit. GatewayTransmittals.tsx is this spine's UI and no other lane claims it. The IND lane shares regional-packager.ts, but the fix needs no packager change.

**Corrected claim.**

Confirmed with two corrections:
- The guard's report on this path carries dtd-self-contained and regional-backbone-conformant as failed. It carries no 'external-evalidator did not run' check (enforceExternal:false).
- AnA's transmit command does surface preTransmitFailedChecks and preTransmitWarnings. The non-display is specific to the GatewayTransmittals surface: its transmit confirmation, its assemble response and toast, and preflight.

Severity is medium rather than high: production FDA sends are procurement-gated today, and the verdict is on the Part 11 record.

**Smallest correct fix.**

The fix needs no packager change and no gate-policy change.

1. Server transmit route, server/routes/mdx-submission-gateway.ts (~line 280). Add `preTransmitFailedChecks: outcome.preTransmitFailedChecks` and `preTransmitWarnings: outcome.preTransmitWarnings` to the created() body. executeGovernedTransmit already reduces them with the canonical preTransmitFindings, so the client does not duplicate that reduction. This is the same pair AnA's handler already returns.

2. Client transmit confirmation, GatewayTransmittals.tsx transmit() (~lines 491-516). Append the warnings and the failed checks to the toast, and use tone 'error' (role=alert) whenever failedChecks is non-empty or warnings is non-empty. When the fields are null (the guard reported nothing), say the gate reported nothing. Never imply "all passed".

3. Pre-sign visibility, at assemble in server/routes/submission-ops.ts. Where canonicalEvidence is set (~2981-2986), when regionalBackbone.regionConformant === false push a severity:'warning' finding (e.g. ruleId REGIONAL-BACKBONE-NOT-CONFORMANT, message from conformanceGap). When dtdStatus.selfContained === false, push a warning naming the missing files. Increment warningCount for each. Preflight reuses the stored findings, so it shows them too.
   - Use 'warning', not 'error'. Transmit refuses error-severity findings, so 'error' would block every FDA send until FDA's vocabulary is vendored. That is a founder or product decision, not a display fix.
   - Also add regionalBackbone {regionConformant, conformanceGap} and dtdStatus.selfContained to the assemble response's bundle.
   - In the client's assemble toast: when either is false, drop "the transmit gate still checks ... conformance" in favour of naming the non-conformance, in warning tone.

4. Pin with client tests: a 201 carrying failed checks gives an alert naming them; an assemble response with regionConformant:false names it. Add a PGlite e2e assertion that a real FDA assemble now carries the warning finding. Show each failing before the fix.

**Blast radius.**

Files: server/routes/mdx-submission-gateway.ts (two fields in the 201 body), server/routes/submission-ops.ts (assemble findings and response fields), client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx (transmit and assemble toasts). The canonical reduction already exists in server/services/submission-gateways/pre-transmit-findings.ts.

The other spines:
- AnA's transmit command (server/services/ana-ri/mdx-command-handlers.ts) already returns these facts. Unchanged, but its output becomes consistent with the HTTP surface.
- The sequence spine, transmitSequence in server/services/submission-service/submission-service.ts, records the same facts. A parallel review of its UI is out of scope here.
- The shared regional-packager.ts and the IND lane are untouched.

Tests that pin current behaviour and should survive:
- client/src/concept2cure/v2/__tests__/gatewayTransmittals.test.tsx: 'transmits ... reports the gateway ref', 'the success confirmation names the signer and the declared meaning' and 'assembles through the canonical packager ...' use prefix regexes that still match if text is appended. Their default 201 mock carries no preTransmit, so the null branch must not render "all passed" and must not flip the tone.
- tests/submission-ops-preflight-routes.test.ts asserts warningCount on fixtures it constructs itself, so it is unaffected.
- tests/submission-ops-assemble-routes.test.ts uses a PACKAGER_EVIDENCE fixture with regionConformant:true, so no new warning appears there. Any assertion on exact assemble warning counts for an FDA bundle with a non-conformant backbone would need updating.
- tests/submission-ops-package-spine.pglite.e2e.test.ts filters findings by ruleId, so it is unaffected.

## HS-3 — A pre-transmit gate refusal shows as 'Structural gate refused · 0 findings · did not include an itemized findings list. Assemble the package again'

Finder severity medium; skeptic: **confirmed**, severity medium, spec confidence medium, reproduced True.

**Files.** client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx, server/services/submission-gateways/index.ts, server/routes/mdx-submission-gateway.ts

**Claim.** When the guard refuses (size over the gateway limit, PDF/A, DTD or regional backbone required in production), it throws ValidationError(msg, pre.blockers) with the blockers as plain strings (index.ts:233-236). The route returns 422 {details:{findings:[...strings]}} (mdx-submission-gateway.ts:310-311). refusalFindings/sortFindings keep only objects, so every blocker is dropped. Because details.findings is an array, the state reads as 'assessed' with zero findings. The card is titled 'Structural gate refused the transmit', although this was not the structural gate. Its badge reads '0 findings' beside a message listing two blockers, and it says the refusal 'did not include an itemized findings list' and that the remedy is 'Assemble the package again, then transmit'. Re-assembly cannot shrink a 1.2 GB bundle or vendor DTDs.

**Skeptic's probe output.**

I reproduced this at HEAD a8c2a8d22 with two probes in tests/zz-probes/verify-hs-3/, deleted afterwards. The working tree is clean.

(1) Server probe. It ran the real router (server/routes/mdx-submission-gateway.ts) with supertest. Only re-auth, editor access and db were mocked. executeGovernedTransmit was replaced by a call to the real getGateway('fda','esg').transmit guard, the same call governed-transmit.ts:641 makes, using a 4.5 GiB bundle with builtRegion 'ema'. The result was the same in staging and production:
  STATUS 422
  BODY {"error":"Refusing to transmit to FDA esg: package failed pre-transmit checks. Package is 4.50 GB, over the FDA gateway limit of 4.00 GB. Submit via the agency's large-submission channel (e.g. physical media) instead of the gateway. Package was assembled for EMA (descriptor); it cannot be transmitted to FDA. Re-assemble the package for FDA.","details":{"findings":["Package is 4.50 GB, over the FDA gateway limit of 4.00 GB. Submit via the agency's large-submission channel ...","Package was assembled for EMA (descriptor); it cannot be transmitted to FDA. Re-assemble the package for FDA."]}}

(2) Client probe. The real GatewayTransmittals.tsx received that exact body as a thrown ApiRequestError(422), which is how the real apiRequest delivers it:
  CARD :: Structural gate refused the transmit Reload findings0 findingsRefusing to transmit to FDA esg: package failed pre-transmit checks. Package is 4.50 GB ... Re-assemble the package for FDA. The refusal did not include an itemized findings list. Assemble the package again, then transmit.
  TABLE ROWS :: 0
  TOAST :: "Not transmitted — the structural gate rejected the bundle: Refusing to transmit ..."
  × expected 'Structural gate refused the transmit …' not to match /0 findings|did not include an itemized/

How it happens:
- index.ts:233-236 throws ValidationError(msg, pre.blockers), where pre.blockers is a string[].
- mdx-submission-gateway.ts:310-311 maps it to {details:{findings: strings}}.
- sortFindings (GatewayTransmittals.tsx:92-98) keeps only objects, so both blockers are dropped.
- assessmentRan is true because details.findings is an array, so findingsState becomes 'assessed-clear'. The badge then shows '0 findings', and the else branch at :931 prints the "did not include an itemized findings list … Assemble the package again" text.

One detail in the finding is wrong: the FDA limit is 4 GiB (ectd-regional-rules.ts:370, FDA_GATEWAY_LIMIT_BYTES), not 1.00 GB. Its "1.20 GB vs 1.00 GB" body was hand-written. The mechanism is unaffected.

The guard path is reachable. On the route path, the guard is the only place that enforces size, region identity, PDF/A and DTD. governed-transmit.ts runs no equivalent check before getGateway.

**The requirement.**

No ICH, FDA or Part 11 text governs how a vendor UI displays a refusal, so the requirement comes from the repo's own CLAUDE.md rules: "fail closed, never fabricate" and "an error is never rendered as an empty result". The card breaks both, with three false statements:
- (a) It shows a count of "0 findings" for a refusal whose body itemized two findings.
- (b) It says "the refusal did not include an itemized findings list", but it did.
- (c) It names the structural gate (validateEctdLeafs or descriptor evidence) as the refuser, but the refuser was the pre-transmit guard (size, region identity, PDF/A, DTD). The toast repeats this ("the structural gate rejected the bundle").

The prescribed remedy, "Assemble the package again, then transmit", is wrong for the size blocker. evaluatePreTransmit itself says to use the agency's physical-media channel, which matches FDA practice: submissions over the ESG size limit go on physical media. Re-assembly cannot reduce the size. It also cannot fix a PDF/A or DTD blocker that comes from deployment configuration. For the region-mismatch blocker the remedy happens to be correct.

Two things limit severity:
- Nothing is sent: it fails closed, so there is no transmit-safety or Part 11 record impact.
- The full server message, including every blocker's text, is rendered at the top of the card, so the operator can read the true reasons. The defect is a card that contradicts its own message, not lost information.

That supports the defect at medium confidence, with severity at the low end of medium.

**Scope.**

Not fixed at HEAD a8c2a8d22. The sweep README has no F00-F20 entry covering itemized findings, string findings or pre-transmit refusal rendering. It is not a procurement gap: the defect is in rendering, whatever DTD or credential state the deployment has. Lane: GatewayTransmittals.tsx, mdx-submission-gateway.ts and submission-gateways/index.ts all belong to the W5/D7 package-spine lane that ran the sweep, and no other §0 claim row names them.

Adjacent defects of the same family, outside HS-3's claim:
- Other ValidationError throw sites send findings objects with no message, ruleId or severity, e.g. bundle-integrity.ts:38-59 and bundle-leaf-security.ts:53/77 send {check, path, error}. The card would count them and render "finding | — | —" rows.
- types.ts:530/534 and fda-esg.ts:324 send [] for a missing sequence, submission type or application number. The card then shows the same "Assemble the package again" remedy, where the real remedy is recording identifiers or choosing a type.

**Corrected claim.**

The mechanism is confirmed as described. Correction: the FDA gateway limit at HEAD is 4.00 GB (4 GiB), not 1.00 GB, so a reproduction needs a bundle over 4 GiB. A region-identity mismatch, which blocks in every environment, triggers the same rendering at any size. The card does print every blocker's text inside the refusal message. The defect is that the badge ("0 findings"), the sentence about no itemized list, the "Structural gate" title and toast, and the "Assemble the package again" remedy all contradict that message. Re-assembly is the wrong remedy for the size blocker and for configuration-driven PDF/A or DTD blockers, but correct for a region mismatch.

**Smallest correct fix.**

Server, one place: give the guard's refusal a typed, itemized shape. At index.ts:233-236, throw ValidationError(msg, pre.blockers.map((message) => ({ severity: 'error', ruleId: 'PRE-TRANSMIT', message }))). The route then carries objects the client already renders, and the "N findings" badge and table become true. Optionally also tag the source, e.g. send details.code 'PRE_TRANSMIT_BLOCKED' from the route, or add a code field on ValidationError.

Client, GatewayTransmittals.tsx:
- (1) In sortFindings, map a string entry to {severity:'error', message: s} instead of dropping it, so any string-carrying ValidationError still itemizes.
- (2) Choose the card title and toast by the refusal's source. Use "Pre-transmit checks refused the transmit" when ruleId === 'PRE-TRANSMIT' or code === 'PRE_TRANSMIT_BLOCKED', and keep "Structural gate refused" only for the structural-validation refusal.
- (3) For that source, replace the fixed "Resolve them, assemble the package again" / "Assemble the package again" remedy with the blockers' own text, which already names the remedy (large-submission channel, re-assemble for the target region, PDF/A or DTD setting).

Keep the existing "did not include an itemized findings list" branch for refusals with no details.findings at all, such as BUNDLE_NOT_ASSEMBLED, which client test :394 pins.

**Blast radius.**

Files to change:
- server/services/submission-gateways/index.ts (throw site at 233-236)
- client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx (sortFindings :92, the 422 branch :472-485, the card title and remedy at :907-933)
- server/routes/mdx-submission-gateway.ts, only if a code is added at :310-311

The other spine: the AnA k510 transmit and transmitSequence also reach the getGateway guard and see err.findings. Grep for consumers that read ValidationError.findings as strings before changing the element type.
- preTransmitFindings and pre-transmit-findings.ts read the guard's report, not err.findings. The probe did not show them affected; confirm by grep.
- The same shape change would apply to any ValidationError → 422 mapping on the AnA command path.

Tests that pin current behaviour:
- tests/mdx-submission-gateway-transmit-bundle-guard.test.ts:465 and tests/mdx-submission-gateway-routes.test.ts:424 assert details.findings length on the structural-validation path. They are unaffected but sit beside the change.
- server/services/submission-gateways/__tests__/transmit-guard-reports-checks.test.ts and pre-transmit-check.test.ts may assert on the guard's error findings and should be checked.
- client/src/concept2cure/v2/__tests__/gatewayTransmittals.test.tsx pins "Structural gate refusal" as the region's aria-label at :184 and :394, and the "did not include an itemized findings list" copy at :410. A source-dependent title must keep that label for the structural source or update those tests.

A new client test should feed the guard's 422 body and assert two rows, the badge "2 findings", no "did not include an itemized", and no "structural gate".

## HS-4 — With FDA_ESG_TRANSPORT=rest, FDA ESG is listed as 'configured' (transport 'as2'), and every transmit then ends in a generic 500 'INTERNAL_ERROR' toast

Finder severity medium; skeptic: **confirmed**, severity low, spec confidence medium, reproduced True.

**Files.** server/services/submission-gateways/fda-esg.ts, server/services/submission-gateways/index.ts, server/routes/mdx-submission-gateway.ts, client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx

**Claim.** isConfigured returns true for the REST transport once the REST credentials resolve. Its own comment says this 'does NOT mean the REST transport can transmit' and that 'gatewayConfigurationStatus() reports the transport so a surface can say which one' (fda-esg.ts:631-640). It does not: gatewayConfigurationStatus returns only {region, gateway, configured}, and listGateways reports the registry's static transport 'as2' (index.ts:287-309). The surface therefore shows a green 'configured' chip. AnA's context counts the gateway as one that 'holds credentials' and can transmit. Every transmit then throws UnverifiedTransportError (fda-esg.ts:290-302), which has no branch in the route's catch (mdx-submission-gateway.ts:297-319). It becomes a 500 {error:'INTERNAL_ERROR'}, and the client shows the enum token. The honest sentence ('nothing was transmitted; the NextGen contract has not been verified; use FDA_ESG_TRANSPORT=as2') is lost.

**Skeptic's probe output.**

I ran a probe at HEAD a8c2a8d22, in tests/zz-probes/verify-hs-4/server.probe.test.ts, deleted afterwards. It used the real route, the real submission-gateways registry and the real FdaEsgGateway. The DB pool, bcrypt, MFA and account standing were mocked, as in the existing route tests. The env was FDA_ESG_TRANSPORT=rest with all four FDA_ESG_REST_* variables set. Only executeGovernedTransmit's preparation steps were replaced: the stand-in calls the real FdaEsgGateway.transmit. That shortcut matches the code path. In index.ts:255 the gateway's impl.transmit runs outside the guard's try, and governed-transmit.ts:642 has no catch, so a gateway error reaches the route unchanged. Output:
  isConfigured=true gatewayConfigurationStatus={"region":"fda","gateway":"esg","configured":true} listGateways={"region":"fda","gateway":"esg","transport":"as2"}
  GET /gateways 200 fda row={"region":"fda","gateway":"esg","transport":"as2","configured":true,"environment":"production"}
  [mdx-submission-gateway] transmit failed: "FDA esg rest transport is configured but its wire contract has not been verified ...; nothing was transmitted. ... Use FDA_ESG_TRANSPORT=as2 ..."
  POST transmit -> 500 {"error":"INTERNAL_ERROR","message":"Something went wrong while transmit. The problem has been logged."}
  direct throw: UnverifiedTransportError | FDA esg rest transport is configured but its wire contract has not been verified ...
  client toast would read: Transmit failed (HTTP 500) — INTERNAL_ERROR.
The client line comes from applying the expression at GatewayTransmittals.tsx:486 to the real response body. The catch in mdx-submission-gateway.ts:296-319 has no UnverifiedTransportError branch; that class is not even imported there (lines 28-33). The AnA path does map it, to TRANSPORT_NOT_VERIFIED (mdx-command-handlers.ts:1004-1016). So the two ways into the same transmit disagree. The comment at fda-esg.ts:634-637 says gatewayConfigurationStatus() reports the transport. It does not: it returns only {region, gateway, configured} (index.ts:296-309). The surface table never shows a transport. Correction to the finding: the API's 'as2' comes from the registry's static default transport and is never rendered on screen. The visible falsehood is the green 'configured' chip (GatewayTransmittals.tsx:851). AnA's facts are affected too: gatewaysConfigured, and the 'Explain gateway posture' prompt, which equates 'hold credentials' with 'can transmit'. Further consumers of the same status: the AnA tool gateway_configuration_status (AnaToolExecutor.ts:9366, reporting 'N of M gateways configured') and GET /api/submissions/capabilities (submissions.ts:245).

**The requirement.**

No ICH eCTD, FDA M1 DTD, Technical Conformance Guide or Part 11 clause governs this; it is not a submission-content defect. Fail-closed holds: no bytes go out, no transmittal row is written, and the claim is released (refusedBeforeWire covers UnverifiedTransportError). The requirement comes from the repo's own rules and the product's own claims:
(a) CLAUDE.md, 'fail closed, never fabricate': the gateway is shown as 'configured', and AnA's tool and context treat it as able to transmit, when every transmit is refused.
(b) The surface header says refusals are 'surfaced with the server's own reason'. Instead a typed, deterministic refusal before anything is sent becomes an opaque 500 that does not say whether anything left the platform. On an irreversible regulatory send, that leaves the operator unsure whether FDA received the bytes. The client's own refusalReason helper names exactly that ambiguity.
(c) The code's own comment (fda-esg.ts:634-637) promises a transport report that does not exist.
(d) The repo's zero-duplication rule: the AnA path already maps this error and the HTTP route does not.
The unverified NextGen REST contract itself is a procurement gap. This finding falls under the stated exception because the product claims to the operator that the gateway is configured. I am highly confident of the behaviour and moderately confident it is a defect. Severity is lower than claimed: the precondition is a non-default setting (FDA_ESG_TRANSPORT=rest), scripts/ops/ga-readiness-report.mjs already reports it as BLOCKED, and nothing wrong is ever sent.

**Scope.**

Not fixed at HEAD a8c2a8d22. It is not among sweep findings F00-F20, and docs/evidence/W5 records only that the REST path raises UnverifiedTransportError and that the GA readiness report shows it as BLOCKED. Not a procurement gap in the sense excluded: the gap is the unverified NextGen contract, but the defect is how the product reports it, as 'configured' with a 500. All files are in the W5/D7 gateway lane (server/services/submission-gateways/*, server/routes/mdx-submission-gateway.ts, the GatewayTransmittals surface). I found no other lane's claim on them; I checked docs/work-orders/README.md §0 by grep only, not in full.

**Corrected claim.**

Confirmed, with two corrections. First, the 'transport as2' value appears only in the API body; the surface never shows a transport, so the visible falsehood is the 'configured' chip and the count of configured gateways in AnA's context and tools. Second, severity is low rather than medium. Fail-closed holds (nothing sent, claim released), the setting is non-default, and the GA readiness report already flags it as BLOCKED. The real cost is the misleading 'configured' state and an opaque 500 that drops the 'nothing was transmitted' sentence, a sentence the AnA path does keep.

**Smallest correct fix.**

1) Route, server/routes/mdx-submission-gateway.ts: import UnverifiedTransportError (index.ts re-exports types) and add a branch before the CredentialError check:
`if (err instanceof UnverifiedTransportError) return clientError(res, 412, err.message, { code: 'TRANSPORT_NOT_VERIFIED', transmitted: false });`
The code matches AnA's TRANSPORT_NOT_VERIFIED. clientError only accepts 400|401|403|404|409|412|422|423|428|502, so 412 is the fitting choice.
2) Client, GatewayTransmittals.tsx: the 412 branch (line 474) currently hard-codes 'gateway credentials are not configured', which would be false here. Change it to `'Not transmitted — ' + (serverMessage(raw) ?? 'gateway credentials are not configured for this environment.')`. Also make the generic branch (line 486) prefer serverMessage(raw) over raw.error.
3) Configured status: smallest fail-closed option is for FdaEsgGateway.isConfigured to return false in REST mode, because it cannot transmit, with the stale comment at fda-esg.ts:634-637 amended. The fuller fix is for gatewayConfigurationStatus to also return the resolved transport and a canTransmit flag. GET /gateways would pass these on, and the chip would read 'credentials present — transport unverified'. With only option 3a, AnA would list esg as awaiting credentials, which is conservative but slightly inexact.

**Blast radius.**

Files:
- server/routes/mdx-submission-gateway.ts (catch block and import)
- client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx (412 and generic toast branches; optionally the chip)
- server/services/submission-gateways/fda-esg.ts (isConfigured REST branch and comment)
- optionally server/services/submission-gateways/index.ts (gatewayConfigurationStatus and listGateways shape)
Downstream consumers of the configured flag, which change with step 3:
- AnA tool gateway_configuration_status (server/services/ana/AnaToolExecutor.ts:9366)
- GET /api/submissions/capabilities gatewaysConfigured (server/routes/submissions.ts:245)
- server/routes/gateway-accounts.ts:55
The other spine (POST /api/submissions transmitSequence, which uses fail() and errorClass, plus the AnA command handler) already handles this error and is unaffected.
Tests that pin current behaviour:
- server/services/submission-gateways/__tests__/fda-esg-rest-transport.test.ts:132 expects isConfigured true when REST credentials are present; it flips under step 3a.
- tests/mdx-submission-gateway-routes.test.ts and tests/mdx-submission-gateway-transmit-bundle-guard.test.ts mock the submission-gateways module without an UnverifiedTransportError export. The new import would come through as undefined there, and `instanceof undefined` throws a TypeError. Add MockUnverifiedTransportError to both mock factories.
- server/services/ana-ri/__tests__/mdx-esg-transmit-gateway.test.ts and refused-before-wire.test.ts pin the AnA mapping and the claim release; they are unaffected.
No route test currently covers UnverifiedTransportError → HTTP status, so a new case asserting 412 with code TRANSPORT_NOT_VERIFIED is needed. Check it fails at HEAD, where the result is 500.

## HS-5 — A bundle FDA may hold (delivered, receipt unconfirmed) is announced as 'Transmit failed', and the transmittal log is not reloaded, so the new in_transit row that holds the lock is invisible

Finder severity medium; skeptic: **confirmed**, severity medium, spec confidence medium, reproduced True.

**Files.** client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx, server/services/submission-gateways/fda-esg.ts

**Claim.** recordDeliveredUnconfirmed (fda-esg.ts:486-505) writes the row 'in_transit' and throws a GatewayError: 'The bundle was delivered … and FDA may hold it: transmittal N is recorded in transit, not rejected. Confirm receipt at FDA before any resend.' The route returns 502. The client's generic !ok branch (GatewayTransmittals.tsx:486) prefixes 'Transmit failed (HTTP 502) —' and returns without calling load(). The same happens for an AS2 refusal that wrote a 'rejected' row. The log keeps showing the pre-transmit state: no row for the possibly-delivered send, no Rollback or Technical-rejection control for it, and the header count is unchanged. The next transmit attempt is then refused by a lock whose holder the operator cannot see on screen. Every other success path calls load().

**Skeptic's probe output.**

I ran a client probe at HEAD a8c2a8d22: tests/zz-probes/verify-hs-5/client.probe.test.tsx, now deleted. It renders the real GatewayTransmittals with only apiRequest and C2CForm mocked. The transmit POST throws ApiRequestError(502, {error: <the exact recordDeliveredUnconfirmed sentence>}). After that, the transmittal-log GET returns the new in_transit row #4245 ahead of the old row #3. Output:
  log header count before: 1
  TOAST role=alert :: Transmit failed (HTTP 502) — ESG AS2 POST timed out. The bundle was delivered (HTTP 200, AS2 Message-ID <m@x>) and FDA may hold it: transmittal 4245 is recorded in transit, not rejected. Confirm receipt at FDA before any resend..
  transmittal-log GETs before transmit=1 after=1
  row #4245 visible after 502: false | in_transit chip visible: false
  log header count after: 1
  SECOND TOAST :: Not transmitted — transmittal #4245 is already active (in_transit). Roll it back first.
  row #4245 visible after 409: false | log GETs now=1
  × expected 1 to be greater than 1

Server side: server/services/submission-gateways/__tests__/fda-esg-ambiguous-delivery.test.ts passes 9/9 at HEAD. It pins that a timeout or reset after the body was written, an unconfirmed MDN, or a DB failure after a 2xx is written 'in_transit' inside the lock, and that the thrown GatewayError says "may hold it". governed-transmit.ts calls gw.transmit with no catch, so the error propagates. The route maps GatewayError to clientError(res, 502, err.message) at mdx-submission-gateway.ts:316-317. On the client, the generic !ok branch at GatewayTransmittals.tsx:486 prefixes "Transmit failed (HTTP 502) — " and appends ".", which gives the doubled period. It then returns without load(). load() is called only on mount, after a successful transmit (517), after a status check (533), and after rollback and rejection. The surface has no Refresh control (lines 829-892), so the row with its Rollback and Status buttons only appears after navigating away and back. The 409 branch does not reload either, so the lock toast names #4245 while the log does not show it.

Same root cause, beyond the finding: createTransmittalRow (fda-esg.ts:682) runs before credentialsFor (695). A 412 CredentialError has therefore also written a 'rejected' row that the log does not show. And for status 0 (network failure or timeout of the POST itself), the fallback text "nothing was sent" is asserted without evidence: the server may have completed the transmit.

**The requirement.**

This is not an ICH eCTD 3.2.2, us-regional 3.3 or FDA validation-criteria rule. The requirement comes from the repo's binding rules and from Part 11. CLAUDE.md says "fail closed, never fabricate" and "an error is never rendered as an empty result". The surface's own comment at lines 439-444 says the transmittal log "is exactly what a user checks to confirm what has or hasn't already been sent". 21 CFR 11.10(e) audit-trail practice expects the operator-facing record of a transmission to reflect the recorded state.

Two things the operator sees contradict the server's recorded state:
(a) The heading "Transmit failed" contradicts the server's own classification, "recorded in transit, not rejected … FDA may hold it".
(b) The log stays on the pre-transmit state after the server wrote a row that holds the duplicate-send lock.

The consequence: an operator scanning the alert and the unchanged log can conclude the send did not happen. The next attempt is refused with "Roll it back first", pointing at a row they cannot see. Rolling back frees the lock and allows a second send of a bundle FDA may already hold.

Mitigations, which keep this at medium rather than high: the toast body does carry the correct sentence, the server lock does refuse the immediate resend, and the row's error_message is correct once the log is reloaded. The doubled period is cosmetic. Confidence is medium because the harm depends on the operator acting on the heading over the body, but the stale log is an objective defect against the repo's own stated purpose for this screen.

**Scope.**

Not fixed at HEAD a8c2a8d22; GatewayTransmittals.tsx was last changed 2026-10-01 (ae5396a25), and line 486 is unchanged. Not in the sweep's F00-F20 table: F15 is the server-side sequence lock, not UI reporting. Not a procurement gap: the server half (in_transit plus "may hold it") is implemented and tested. It is a client reporting defect. Lane: GatewayTransmittals.tsx is not claimed in docs/work-orders/README.md §0. Its recent edits come from the W5/D7 package-spine lane (session_01LjrcEe8y3zUQxwX91zzTaM, the same lane as this sweep), so it is in-lane. No server file needs to change.

**Corrected claim.**

Confirmed as stated, with additions. After a 502 whose body says the bundle was delivered and is recorded in_transit, the surface shows "Transmit failed (HTTP 502) — … before any resend.." and does not reload the transmittal log. The row holding the duplicate-send lock is therefore invisible: the header count is unchanged, and there is no Status, Rollback or Technical-rejection control for it. A second attempt gets a 409 naming #N, and that branch does not reload either.

Two cases the finding did not mention share the root cause. A 412 CredentialError has also written a 'rejected' row (the row is created before credentials resolve) that is not shown. For status 0 (no response), the toast asserts "nothing was sent" when the server may have completed the transmit.

The finding's claim that the AS2 refusal path behaves the same also holds: REFUSED_BY_AGENCY writes 'rejected', and the client gets the same 502 branch with no reload.

**Smallest correct fix.**

The fix is in client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx, transmit() (lines 464-486). Make the log reload unconditional once the POST settles, except for 401, which is refused before any row exists. Reword the generic branch so it neither says "failed" when the server says the outcome is unconfirmed, nor asserts "nothing was sent" without evidence:

  const { ok, status, raw } = await readData('POST', ...);
  if (status !== 401) void load();   // a 409/412/502/500/0 may have written or be blocked by a row the log must show
  ...
  if (!ok) {
    setDialog(null);
    const said = String((raw as any)?.error ?? '').trim().replace(/\.+$/, '');
    fireToast(
      (status >= 500 || status === 0 ? `Transmit did not complete (HTTP ${status})` : `Transmit failed (HTTP ${status})`) +
      ' — ' + (said || 'the outcome is unknown; check the transmittal log before any resend') + '.',
      'error');
    return;
  }

Then remove the now-redundant `void load()` at line 517, or keep it; a double load is harmless. "Did not complete" is accurate for all three 502 sources: NOT_DELIVERED ("Nothing reached FDA … recorded rejected"), REFUSED_BY_AGENCY, and delivered-unconfirmed. The server sentence then carries the classification without a contradicting heading. Optionally, in transmitConflictMessage, avoid advising "Roll it back first" when the holder's status is in_transit; that is adjacent to this finding, not part of it.

**Blast radius.**

Only one file changes: client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx. No server change: fda-esg.ts, governed-transmit.ts and mdx-submission-gateway.ts stay as they are. The other spine (AnA's transmit tool or command path via executeGovernedTransmit) receives the server's error string directly and does not use this toast, so it is unaffected.

One existing test pins current wording: client/src/concept2cure/v2/__tests__/gatewayTransmittals.test.tsx:862 ("a network failure … still reads as a failure", expects /Transmit failed/ for status 0). It needs to accept the new status-0 wording, e.g. /Transmit did not complete/.

No test counts transmittal-log GETs, so the extra load() calls break nothing. One subtlety: load() sets state 'loading', which briefly blanks only the gateways card, not the refusal/findings card or the log rows. The new pin should be the probe's assertion: after a 502 (and after a 409 and a 412), the transmittal-log GET is re-issued and the in_transit row #N with its Rollback control is rendered, and the toast contains no "..".

## HS-6 — The 409 active-transmittal toast replaces the server's 'the agency may already hold it. Confirm receipt' with 'Roll it back first' — for a received or filed send, that leads to re-sending the same sequence

Finder severity medium; skeptic: **confirmed**, severity medium, spec confidence medium, reproduced True.

**Files.** client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx, server/services/submission-gateways/governed-transmit-checks.ts

**Claim.** transmitConflictMessage (GatewayTransmittals.tsx:385-392) uses the server's sentence only for SEQUENCE_ALREADY_FILED. For ACTIVE_TRANSMITTAL it composes 'transmittal #N is already active (<status>). Roll it back first.' That drops the server's 'and the agency may already hold it. Confirm receipt at the agency' (governed-transmit-checks.ts:178-186). When the holder is 'received' (FDA's MDN in hand, and in production the sequence is already filed), the advice leads to a duplicate submission. Rollback frees the lock (rolled_back is not an active status, fda-esg.ts:1110). assertSequenceNotFiledAsAnotherBundle returns early when the sha256 matches (governed-transmit-checks.ts:135). So the identical bundle goes to FDA a second time, recordFiledSequence answers 'already-recorded', and the surface reports another clean 'Transmitted'. The server's same-bytes variant (lines 188-193) gives the same rollback advice, also without the caveat.

**Skeptic's probe output.**

I ran this at HEAD with two probes in tests/zz-probes/verify-hs-6/. Both passed, and the directory has been deleted; the git tree is clean.

Client probe (the real GatewayTransmittals.tsx, given the server's verbatim 409 bodies as ApiRequestError):
  [sequence variant] SERVER :: Sequence 0001 of this package already has an active production transmittal (id=3, status=in_transit), sent as a different bundle, and the agency may already hold it. Confirm receipt at the agency, and roll that transmittal back via POST /api/mdx/gateways/transmittals/3/rollback before sending sequence 0001 again.
  [sequence variant] serverMessage(raw) -> null
  [sequence variant] TOAST alert :: Not transmitted — transmittal #3 is already active (in_transit). Roll it back first.
  [same-bytes variant (received)] SERVER :: An active transmittal already exists for this package (id=3, status=received). Roll it back via POST /api/mdx/gateways/transmittals/3/rollback before re-transmitting.
  [same-bytes variant (received)] serverMessage(raw) -> null
  [same-bytes variant (received)] TOAST alert :: Not transmitted — transmittal #3 is already active (received). Roll it back first.

Server probe (real assertNoActiveTransmittal, findActiveTransmittal, rollbackTransmittal and assertSequenceNotFiledAsAnotherBundle on PGlite):
  SAME-BYTES (A) while #3 received -> ACTIVE_TRANSMITTAL 409 … Roll it back via POST /api/mdx/gateways/transmittals/3/rollback before re-transmitting.
  DIFFERENT-BYTES (B), production, 0001 on file -> filed check first: SEQUENCE_ALREADY_FILED
  DIFFERENT-BYTES (B), active check alone (i.e. nothing on file) -> ACTIVE_TRANSMITTAL … status=received … the agency may already hold it. Confirm receipt at the agency …
  ROLLBACK of a RECEIVED transmittal -> received -> rolled_back | note: The agency still holds the transmitted bytes …
  AFTER ROLLBACK, same bundle A: filed check -> NO REFUSAL (same sha as on file) | active check -> NO REFUSAL

The existing test at tests/mdx-submission-gateway-transmit-bundle-guard.test.ts:1056 passes. It shows that a same-bundle re-send returns 201 with filedSequenceReason 'already-recorded'. GatewayTransmittals.tsx reads neither filedSequenceReason nor filedSequenceWarning (grep finds no match in client/src), so the toast reads as a clean "Transmitted via FDA / ESG".

**The requirement.**

ICH eCTD v3.2.2 gives each submission its own sequence number within an application. FDA's eCTD validation treats a reused sequence number as an error that leads to technical rejection. I could not verify that criterion's exact number, which is why confidence is medium rather than high. The FDA ESG MDN (Ack1) means the ESG has the bytes. A second delivery is correct only when the agency asks for it, for example when the ESG help desk requests a resend because Ack2 or Ack3 never arrived.

The repo's own sources agree that the right advice is "confirm with the agency first", not "roll back":
- The server's sentence says so in the sequence variant.
- The rollback result says "The agency still holds the transmitted bytes."
- docs/runbooks/fda-esg-production-uat.md §7 step 4 says to block any further transmit on the package until the WebTrader retraction is confirmed.

"Roll it back first", with no caveat, presents a rollback as the way to a re-send. A rollback is an audit-trail act only, and the transmit it leads to cannot be undone.

The worst case is not the one the finding leads with. The worst case is the sequence variant when the holder's filing is not on the history. That happens when the first send is still in flight, or when its history write failed or had no usable manifest. The operator is not told about either failure, because the surface drops filedSequenceWarning. In that case a rollback followed by sending a re-assembled bundle passes both the SEQUENCE_ALREADY_FILED check and the lock, so two different bundles go out under one sequence number. That is the F15/F19 hazard, and the server's caveat exists to prevent it.

In the same-bytes, received case, FDA most likely rejects the duplicate sequence, so the harm is agency noise plus a misleading clean "Transmitted". It is not a corrupted lifecycle.

Mitigation: the rollback dialog does state that the agency still holds the bytes. This is incomplete advice on an irreversible act. It is not fabrication, and no CLAUDE.md rule requires the server's own wording.

**Scope.**

Not fixed at HEAD. Not a procurement gap: no credentials, DTDs or Ack3 ingestion are needed. Not covered by F00–F20: F15 added the sequence lock and its server caveat, and F19 added the SEQUENCE_ALREADY_FILED toast, but the ACTIVE_TRANSMITTAL toast was left composing its own sentence. Both files belong to the package-model spine lane, which is this session (…01LjrcEe8y3zUQxwX91zzTaM, docs/work-orders/README.md §0 row D7/W5). Both were last changed by that lane on 2026-10-01 (F15, F19, F04/F08).

**Corrected claim.**

Two of the finding's statements need correcting:
- The client drops the server's caveat only in the sequence variant. For the same-bytes variant the toast matches the server, which itself says "Roll it back … before re-transmitting" with no caveat.
- In production, the sequence variant is reached only when the holder's sequence is not on the filed history: the first send is still in flight, or its history write failed or had no usable manifest. Otherwise SEQUENCE_ALREADY_FILED answers first. It is also reached in staging.

The client cannot simply pass the server's sentence through. serverMessage() returns null for both ACTIVE_TRANSMITTAL bodies because they contain '/api/' (the looksInternal check in queryClient.ts), so the server has to drop the route path first.

The fix sketch's server half goes too far. It would refuse every same-bytes production re-send unless a technical rejection is recorded. That blocks a resend the agency asks for: an MDN arrived but no Ack2 or Ack3, and there is no rejection notice to record. It also contradicts the documented recovery, which is pinned by test at tests/mdx-submission-gateway-transmit-bundle-guard.test.ts:1056.

Adjacent defect in the same surface: the success toast never shows filedSequenceWarning or filedSequenceReason. As a result 'already-recorded', 'write-failed', 'no-usable-manifest' and even 'sequence-conflict' (two bundles under one number) all read as a clean "Transmitted".

**Smallest correct fix.**

Wording only; no change to the lock or to the filed-bundle rule.

1. server/services/submission-gateways/governed-transmit-checks.ts, assertNoActiveTransmittal:
   - In both variants, remove the "POST /api/…/rollback" path and say "roll it back from its row in Gateway transmittals" instead. The SEQUENCE_ALREADY_FILED sentence already avoids naming a route.
   - Give the same-bytes variant the caveat too: the agency may already hold it; confirm receipt at the agency before sending again.
   - When active.status === 'received', say instead: "The agency acknowledged receipt of transmittal N, so this sequence is with the agency. A rollback does not retract it. Send it again only if the agency confirms it did not receive or load it." Do not offer the rollback as the way to re-send.

2. client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx, transmitConflictMessage: for ACTIVE_TRANSMITTAL, return 'Not transmitted — ' + serverMessage(raw). The composed fallback must also carry "the agency may already hold it — confirm with the agency before sending again". For status 'received' it must say receipt was acknowledged and leave out "Roll it back first".

3. Adjacent, recommended: the transmit success toast should show dataOut.filedSequenceWarning as an error-tone notice, the way it already shows ledgerWarning and contentWarning. For filedSequenceReason 'already-recorded' it should say that sequence N was already on file from an earlier transmittal and that this was a second delivery of the same bundle.

**Blast radius.**

Files:
- server/services/submission-gateways/governed-transmit-checks.ts: the refusal text also reaches AnA's transmit command through server/services/ana-ri/mdx-command-handlers.ts, which surfaces GovernedTransmitRefusal messages.
- client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx.

Only the package-model spine is affected. The IND sequence spine (transmitSequence) does not use assertNoActiveTransmittal's wording. The lock statuses in fda-esg.ts (findActiveTransmittal, rollbackTransmittal) and the filed-bundle check are unchanged.

Tests that pin the current wording and must be updated:
- tests/mdx-submission-gateway-transmit-bundle-guard.test.ts:750-753. It matches /transmittals\/4300\/rollback before sending sequence 0000 again/ and breaks once the route path is removed. Its /confirm receipt at the agency/i assertion stays.
- client/src/concept2cure/v2/__tests__/gatewayTransmittals.test.tsx:169-182 (/transmittal #3 is already active/, with a body that has no code).
- The same file at 806-821, which matches the exact /…already active \(transmitting\)\. Roll it back first\./. Those two fixtures send details without a code and a non-route error string, so they exercise the fallback path.

Unaffected:
- gatewayTransmittals.test.tsx:1000 (the SEQUENCE_ALREADY_FILED toast must not say "Roll it back").
- The same-bundle re-send pin at transmit-bundle-guard.test.ts:1056.
- tests/submission-ops-package-spine.pglite.e2e.test.ts:503 (a rollback does not un-file).

New tests should cover:
- the toast in both variants and for a 'received' holder (caveat present; no rollback remedy when received);
- the server sentence containing no '/api/' (serverMessage returns non-null);
- the adjacent case: the success toast shows filedSequenceWarning.

## HS-7 — A clean assembly's warnings (M1-COVER-LETTER-MISSING, PLACEHOLDER-ON-FILE, SECTION-EMPTY…) are reduced to a count, with no way to see them on the surface

Finder severity low; skeptic: **confirmed**, severity low, spec confidence medium, reproduced True.

**Files.** client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx, server/routes/submission-ops.ts

**Claim.** The assemble response carries only validation counts (submission-ops.ts:3264-3268). The client loads findings from preflight only when errors > 0 (GatewayTransmittals.tsx:690-703). The 'Reload findings' control lives only inside the refusal card, which a clean assembly never renders. The warnings the sweep added so the operator would be told — F13's M1-COVER-LETTER-MISSING (FDA expects a cover letter with every submission), F12's PLACEHOLDER-ON-FILE (naming the withdraw entry to add) and F11's SECTION-EMPTY — appear only as '· 2 warnings ·' in a transient toast, and the next step is a signed transmit.

**Skeptic's probe output.**

I ran two probes at HEAD a8c2a8d22, both under tests/zz-probes/verify-hs-7/ and both deleted afterwards.

(1) Server probe: real assemble route, real packager, PGlite, using the e2e harness. Section 3.2.P.1 was unmapped so the assembly is clean but carries a SECTION-EMPTY warning:
  ASSEMBLE status 200 body.data.bundle.validation = {"errorCount":0,"warningCount":1,"infoCount":1}
  ASSEMBLE response keys (bundle): path,sha256,sizeBytes,format,leafCount,sequence,submissionType,lifecycle,storage,validation,assembledAt
  ASSEMBLE response contains "SECTION-EMPTY": false
  STORED descriptor warnings: ["SECTION-EMPTY"]
  PREFLIGHT status 200 warnings: ["SECTION-EMPTY"]
The finding is stored on the bundle and preflight serves it, but the assemble response carries only counts (submission-ops.ts:3271-3275).

(2) Client probe: jsdom render of GatewayTransmittals with assemble returning 200 and {errorCount:0, warningCount:2}, and preflight mocked to return M1-COVER-LETTER-MISSING and PLACEHOLDER-ON-FILE:
  TOAST :: Bundle assembled for PKG-77 · 3 leaves · 2 warnings · sha256 aaaaaaaaaaaa. No error-severity findings; the transmit gate still checks region, size and conformance opt-ins. Sequence 0001: 1 new, 1 replaced, 2 left unchanged on file.
  Reload findings button present=false findings card present=false
  preflight calls=0
  text contains M1-COVER-LETTER-MISSING=false
  buttons :: Explain gateway posture | Record identifiers | Assemble bundle | Transmit

Why the warnings never show:
- loadFindings is called only when `errors > 0` (GatewayTransmittals.tsx:690).
- `setRefusal(null)` runs at the start of every assembly (L640).
- The only "Reload findings" button is inside the refusal card (L917-919).
- The toast clears itself after a timer (toast.tsx:100-103).
- No other client file calls /packages/:id/preflight or renders bundle.validation; grep finds only GatewayTransmittals and its test. EctdCompile reads a different pipeline (/api/ectd-compile).

So on a clean assembly the operator sees a warning count with no rule IDs or messages, and no control on the surface can show them. The next action on offer is the signed Transmit.

**The requirement.**

No ICH, FDA or Part 11 text requires a publishing tool to list warnings in its UI. A warning is not a rejection criterion, and FDA's validation criteria let a sponsor transmit over medium and low findings. So the requirement comes from the product itself and from CLAUDE.md, not from an agency rule.

That basis still holds, for three reasons:
- **The warnings are meant to be acted on.** The sweep added these findings so the operator would act on them. PLACEHOLDER-ON-FILE's only remedy is the exact `withdraw: [{ ctdSection, fileName }]` entry, and that entry exists only in the message text (submission-ops.ts:2192-2199). An operator who sees "1 warning" cannot recover it, so the fix F12 delivered is unreachable in exactly the case it was built for.
- **The cover-letter warning reflects real FDA guidance.** M1-COVER-LETTER-MISSING corresponds to FDA's expectation (a "should" in its eCTD guidance) that each submission carries its own Module 1.2 cover letter. The sweep record (README F13) treats it that way.
- **CLAUDE.md's honest-state rule applies by analogy.** Stating that N findings exist while giving no way to read them, then moving straight to an e-signed release, falls short of "say what was proven". It is not a fabricated result and not an error rendered as empty, so the CLAUDE.md violation is by analogy, not literal.

Confidence is medium, not high, because nothing forbids transmitting over warnings, and the operator could in principle call the preflight API directly. The severity of low in the finding is right.

**Scope.**

Not fixed at HEAD, and not reported before:
- The sweep's status table (F00-F20) does not cover it, and neither do VERDICTS.md or PLANS.md. VERDICTS only quotes warning counts.
- It is not a procurement gap; this is pure UI and response-shape behaviour.

Lane: docs/work-orders/README.md §0 row 70 gives the package-model spine to session_01LjrcEe8y3zUQxwX91zzTaM (this session), and the sweep's own commits edited GatewayTransmittals.tsx. Its last commits are from 2026-10-01 (F04/F08, F19, and D7's gateway-account change 723395ed4). By the row's own rule, the file's 24-hour history should be checked again before editing.

**Corrected claim.**

The finding holds as stated. One sharpening: on a clean assembly the warnings are not only absent from the response; the client also never fetches them, and no control on the surface can show them. The data is not lost: it sits on the stored bundle descriptor, and POST /packages/:id/preflight returns it, as the server probe showed for SECTION-EMPTY.

**Smallest correct fix.**

Client-only, in GatewayTransmittals.tsx `assemble`. Where it currently falls through to the clean toast (L705-708), add a branch for `errors === 0 && warnings > 0` that:
1. calls `loadFindings(id)`;
2. sets the card state with a new source, e.g. `source: 'assemble-warnings'`, plus the loaded findings, findingsState, fetchFailure and notSaved;
3. keeps the existing toast.

In the card (L907-934), branch the title, aria-label and footer on that source:
- **Title:** e.g. "Bundle assembled · N warnings to review", not "Bundle not transmittable".
- **aria-label:** not "Packager refusal".
- **Footer:** e.g. "These do not block transmit; review them, and add any withdrawal they name, before transmitting." This replaces "Resolve the findings, then assemble the package again".

The existing Reload findings button and severity column then work unchanged. This also brings back the honest not-assessed and fetch-failed states loadFindings already produces.

**Alternative:** return the non-info findings in the 200 response as `data.bundle.validation.findings` (submission-ops.ts:3271-3275) and render them the way the 422 path does (L664). This saves a round trip but touches the server response contract.

**Blast radius.**

Files:
- client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx: the `assemble` callback around L690-708, plus the refusal-card header and footer around L907-934, which gain a third source variant.
- server/routes/submission-ops.ts L3271-3275, only if the alternative is taken.

Other spine:
- None for the client-only fix. Preflight already serves stored findings, and the IND-demo lane does not render this card.
- The server alternative changes the assemble response that the spine's route tests read.

Tests that pin current behaviour:
- client/src/concept2cure/v2/__tests__/gatewayTransmittals.test.tsx L302-323, "assembles through the canonical packager and reports the bundle as ready to transmit". It uses warningCount 1 and mocks no preflight. Its toast regex should still pass, but with the fix a not-assessed card would render, so the test should mock preflight and assert the warning card.
- The same file's error-path tests (L345-374, L414+, L461, L498) assert the "Packager refusal" aria-label and "Resolve the findings" footer. They must keep passing, so the new variant has to stay separate from the error variant.

Server tests that would only matter for the alternative:
- tests/submission-ops-assemble-routes.test.ts
- server/routes/__tests__/governed-ledger-gap-surfaced.test.ts
- tests/submission-ops-package-spine.pglite.e2e.test.ts

These read `bundle.validation` from the stored descriptor or the counts, so adding a field should not break them.

## HS-8 — The transmittal log silently truncates at 100 rows, and the header count and AnA's 'N transmittal(s) logged' report the truncated number

Finder severity low; skeptic: **confirmed**, severity low, spec confidence medium, reproduced True.

**Files.** server/routes/mdx-submission-gateway.ts, client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx

**Claim.** GET /gateways/transmittals defaults to limit=100 (mdx-submission-gateway.ts:131) and reports meta.count = rows.length (line 155), with no total and no 'more' marker. The surface requests no limit (GatewayTransmittals.tsx:433). It shows rows.length as the log's count (line 857), and the AnA context derives transmittalCount, byStatus and awaitingAcknowledgement from the truncated page (lines 802-815). An org with more than 100 transmittals sees '100' and loses older rows, including any still in_transit or unacknowledged. That is the log 'a user checks to confirm what has or hasn't already been sent' (comment at lines 439-444).

**Skeptic's probe output.**

Ran at HEAD a8c2a8d22 with two probes, both deleted afterwards so the tree is clean. No tracked files were touched.

(1) Server probe (tests/zz-probes/verify-hs-8/server.probe.test.ts). It runs the real mdx-submission-gateway router and its real SQL against PGlite. The org holds 250 submission_transmittals rows. The 30 oldest are status in_transit with ack_received_at NULL. Output:
  status=200 db_total=250 rows_returned=100 meta={"count":100} body_keys=data,meta
  unacked_in_db=30 unacked_in_response=0
  with offset/page/cursor: status=200 rows=100 first_id_same=true   (zod strips unknown keys, so there is no way to page)
  limit=1000: status=422 ... "Number must be less than or equal to 500"
  limit=500: status=200 rows=250 meta={"count":250}
  × expected 100 to be 250
So the response has no total and no hasMore. Paging params are silently ignored. Row 501 and later can never be reached unless a region, program or status filter narrows the set.

(2) Client probe (client.probe.test.tsx, jsdom). It renders the real GatewayTransmittals with apiRequest emulating the route's default of 100, and captures usePublishSurfaceContext. Output:
  requested: GET /api/mdx/gateways/transmittals   (no limit is sent)
  header text: "Transmittal log100"
  table rows rendered: 100
  oldest row #1 rendered: false ; any "more"/"of" truncation marker: false
  AnA summary: Agency transmittals: 1 of 1 gateway(s) hold credentials; 100 transmittal(s) logged.
  AnA facts: {"transmittalCount":100,"byStatus":{"acknowledged":100},"awaitingAcknowledgement":0}
  × expected +0 to be 30
The surface's own "Explain gateway posture" button asks AnA "which transmittals are still awaiting acknowledgement". AnA is handed awaitingAcknowledgement=0 and byStatus with no in_transit entry, while 30 transmittals are in fact unacknowledged.

**The requirement.**

No ICH, FDA eCTD or ESG rule says how a sponsor-side transmittal list should be paged, so this is not an eCTD or regional conformance defect. Limiting a list to 100 rows is ordinary and allowed. The defect is that the limit is silent, and that partial-page numbers are presented as whole-log facts.

The requirement holds on three grounds:

(a) CLAUDE.md working agreement: "never fabricate" / honest states. The header shows 100 as the log's count. The AnA context publishes transmittalCount=100 and awaitingAcknowledgement=0 as facts when the true values are 250 and 30.

(b) CLAUDE.md RULE 2: "Numbers ... come from deterministic engines; the model narrates." Here the model is handed a number derived from a truncated page and will narrate it as the answer to "which are still awaiting acknowledgement".

(c) 21 CFR 11.10(b) and 11.10(e): records and audit trails must be available for review and copying in accurate and complete form. The transmittal log is the surface's record of what was sent. The surface's own comment, at lines 439-444, calls it what a user checks "to confirm what has or hasn't already been sent". Older rows are unreachable from the UI, and above 500 they are unreachable from the API without filters.

Mitigation: a duplicate send is still blocked server-side. governed-transmit-checks.ts (~line 151) reads active pending|in_transit|received rows straight from the database, independent of this list. So the harm is a misleading operator and AnA view, not a double transmission. That is why severity stays low and confidence is medium rather than high.

The 100-row threshold is realistic. Each eCTD sequence (IND safety reports, amendments, annual reports) and each failed or retried send is one row, so a sponsor with a few active applications passes 100 within about a year.

**Scope.**

Not fixed at HEAD: reproduced on a8c2a8d22.

Not among the sweep's F00-F20: docs/evidence/W5/2026-09-30-package-spine-sweep/README.md has no entry about the transmittal log, limit, paging or meta.count.

Not a procurement gap: it is pure application code, with no dependency on DTDs, ESG credentials, S/MIME or Ack3.

No lane claims either file: docs/work-orders/README.md §0 names neither server/routes/mdx-submission-gateway.ts nor client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx. It sits in the transmit/filed-history half of the package spine (W5), in launch-catalog scope (Submission Center).

**Corrected claim.**

Accurate as stated, with two additions:
- The API offers no way past the cap. Zod strips offset, page and cursor, and limit is capped at 500, so rows beyond 500 are unreachable without a region, program or status filter.
- The consequence is narrower than "what has been sent" in one respect. A duplicate transmit is still blocked server-side by the independent active-transmittal check in governed-transmit-checks.ts. The defect is a misleading count and a wrong awaiting-acknowledgement figure given to the operator and to AnA, not a missed duplicate-send guard.

**Smallest correct fix.**

Server, in server/routes/mdx-submission-gateway.ts, GET /gateways/transmittals:
- Add `COUNT(*) OVER () AS total_count` to the SELECT. The window is evaluated before LIMIT, so it counts every filtered row. Strip it from each row before returning.
- Add one aggregate over the same WHERE (no LIMIT): `SELECT status, count(*) n, count(*) FILTER (WHERE submitted_at IS NOT NULL AND ack_received_at IS NULL) awaiting FROM submission_transmittals t WHERE ... GROUP BY status`.
- Return `ok(res, rows, { count: rows.length, total, hasMore: total > rows.length, byStatus, awaitingAcknowledgement })`.
- Optionally add a keyset `before_id` (or `offset`) param to listQuery so older rows can be reached.

Client, in GatewayTransmittals.tsx:
- In load(), also keep `t.raw?.meta`; readData already returns raw. Leave the request URL unchanged, so the ~30 exact-URL mocks keep matching.
- Header (line ~857): render `${rows.length} of ${meta.total}` when hasMore. Show a visible "Showing the 100 most recent of N — older transmittals are not listed" note, or a "Load older" button using before_id.
- anaContext (lines ~802-815): take transmittalCount, byStatus and awaitingAcknowledgement from server meta, not from rows. Add a `logTruncated: hasMore` fact. If meta is absent, publish those facts as unknown rather than computing them from the page.

Add a test that fails today: route returns total=250/hasMore=true for 250 rows; surface shows "100 of 250" and publishes awaitingAcknowledgement=30.

**Blast radius.**

Files to change: server/routes/mdx-submission-gateway.ts (the list handler only) and client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx (load(), the header span, anaContext).

The other spine is not affected. The assemble route, packager and validators never read this endpoint. governed-transmit-checks.ts only references the rollback URL in a message and runs its own active-transmittal query.

Tests that pin current behaviour:
- tests/mdx-submission-gateway-routes.test.ts line ~246. Asserts the SQL matches /LEFT JOIN LATERAL public\.actor_name.../ and that data[0].submitted_by_name is returned. A second aggregate query would hit its queryFn mock, which returns rows:[] by default, so meta handling must tolerate an empty aggregate. The SQL regex still matches.
- client/src/concept2cure/v2/__tests__/gatewayTransmittals.test.tsx (~30 exact-URL mocks of '/api/mdx/gateways/transmittals' that return env(LOG) with no meta) and gatewayTransmittalsNames.test.tsx. Keep the URL unchanged and fall back gracefully when meta is missing, or these break. Any assertion on the header count or AnA facts would need meta added to the mock.
- No test asserts meta.count today.

Unaffected references: server/middleware/__tests__/launch-scope-api-gate.test.ts, tests/mdx-submission-gateway-technical-rejection.test.ts, scripts/seed/ga-demo.d/40-submission-udi.mjs and scripts/ci/sign-ceremony-baseline.json name the path only.

