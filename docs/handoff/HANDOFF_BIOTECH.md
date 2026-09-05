# Session Handoff — Biotech & Pharma Stream

**Commit to `docs/handoff/HANDOFF_BIOTECH.md`.**

**Scope:** IND, NDA, BLA. eCTD publishing, FDA forms, CTD authoring.
**Last verified:** 2026-09-04 on `concept2cure-v2` (§1 rewritten; the rest dates from 2026-09-03, commit `499f096`).

This file is self-contained. An agent working this stream needs no other handoff.

---

## 0. How a new agent starts

Paste exactly this as the first message of a new Claude Code session, and nothing else:

> Read `docs/handoff/HANDOFF_BIOTECH.md` in full before anything else. Then read only
> the files it names. Do not read the whole repo. Do not propose work. Report what you
> understand the current state and the single next authorized action to be, and stop.

---

## 1. READ THIS FIRST — partly unblocked as of 2026-09-04

**Superseded in part.** This section previously read "there is currently no authorized
coding work on this stream" and told an agent to stop. That was true when written. It is
no longer true, and an agent that stops on it today will idle in front of work that is
both possible and done.

### What is now vendored and working

| Asset | State | Evidence |
|---|---|---|
| FDA eSTAR nIVD + IVD templates | **vendored**, checksum-pinned | `assets/estar-templates/`, verified by `estar-fill.test.ts` |
| FDA 1571, 1572, 3454, 356h, 3674 PDFs | **vendored**, sha256 in sidecar manifests | `templates/forms/acroforms/` |
| Official fill, FDA 1571 + 3674 | **working** — dynamic XFA filled through the `datasets` packet | `ind-form-xfa-official.test.ts` |
| Official fill, 1572 / 3454 / 356h | **working** — AcroForm | their `*-official.test.ts` suites |
| US IND form backing | `getDocumentCoverage('US_IND').formsFullyBacked === true` | `tests/regulatory/registryCoverage.test.ts` |

The long-standing belief that FDA 1571 and 3674 could never be filled — recorded in
`docs/biotech/FDA_FORMS_FILL_STATUS.md` and in both sidecar manifests — was measured on
the AcroForm layer, which on those editions is genuinely empty. Their fields live in the
XFA packets: 1571 declares 283 of which 246 are fillable, 3674 declares 190 of which 178
are. Both documents have been corrected.

### What is still blocked, and on what

1. **eCTD DTDs and stylesheets.** `assets/ectd-dtd/` still holds only its README,
   `checksums.txt` and two fixtures — no `.dtd`. `www.fda.gov`, `www.ich.org` and
   `clinicaltrials.gov` are all refused by this environment's network policy
   (`CONNECT tunnel failed, response 403`). A 403 is an organisation policy denial: do
   not retry it, do not find a mirror, do not synthesize a DTD, do not approximate a
   stylesheet. The remedy is unchanged — acquire the files from a network-permitted
   machine and add them via PR.

2. **FDA 3455 and FDA 1574 have no vendored PDF.** Every other supported form does.
   Those two render the labelled draft, honestly, and will keep doing so until the
   official blanks are dropped into `templates/forms/acroforms/` with sidecar manifests.
   Same acquisition constraint as the DTDs.

3. **A named reviewer for the 1571 / 3674 manifests.** Both still carry
   `assetTrusted: false` and `reviewedBy: null`. Nothing depends on them today — those
   fields gate the manifest-carried AcroForm field map, which does not apply to a
   dynamic XFA form, whose map is code-reviewed in `official-field-maps.ts` and
   re-verified against the template at fill time. A person should still confirm the
   eight 1571 box assignments against the printed form before a real filing.

**So:** work that does not depend on the three items above is authorized. Work that does
is still blocked, and reporting that it is blocked remains the correct and complete
action for it.

### Audited, verified, and deliberately NOT changed (2026-09-05)

Two read-only audits of the eSTAR and eCTD chains produced 23 findings; 19 are
fixed on `concept2cure-v2` with revert-proven tests. These four were verified real
and left alone because each needs a decision or a vocabulary no agent should
guess:

1. **Non-FDA backbones carry the application type as the submission type.**
   `core-to-packager.ts` sets `submissionType: submission.applicationType` and the
   EMA `<procedure-type>`/`<submission-unit>`, PMDA `<application-type>`/
   `<submission-type>` and Health Canada `<regulatory-activity-type>`/
   `<submission-type>` elements read it directly, so an EU variation sequence
   ships `<submission-unit>maa</submission-unit>`. The FDA block already derives
   its type from the sequence. Fixing the others means a per-agency token
   vocabulary (EU submission-unit values are `initial`, `response`,
   `additional-info`, `closing`, …); wrong tokens are worse than the current
   ones. Needs the regional vocabularies confirmed against each agency's spec.
2. **Lifecycle diff compares a pre-PDF/A md5 to a post-PDF/A md5.** With
   Ghostscript present, an unchanged leaf never matches its prior and is
   re-shipped as `replace`. Safe direction (nothing changed is ever missed), but
   every follow-up re-supersedes unchanged content. Fixing it means hashing the
   converted bytes before the diff, i.e. converting before packaging.
3. **Applicant vs declarant on a multi-client tenant.** `estar_registrations`
   is one row per organisation; `applicantCompanyName` is per client workspace.
   A consultancy filing for two clients puts the org-level Declaration of
   Conformity name on both. Whether the registration should move to the
   workspace is a data-model decision.
4. **Applicant name falls back to the tenant organisation's name** when a program
   has no workspace anchor. Correct for a single-company tenant, wrong for a
   consultancy, and unknowable at runtime. Same decision as 3.

### Third audit — IND lifecycle and agency gateways (2026-09-05)

A read-only audit of the IND lifecycle services and the eleven agency gateways
produced 12 findings. Fixed on `concept2cure-v2`, each with a test that fails on
revert:

- Every gateway that took a 2xx with no receipt identifier as an accepted
  submission (minting `<agency>-<timestamp>` as the receipt and recording the row
  as received) now records the transmittal rejected and throws. PMDA is the
  tested exemplar; the other ten share the pattern.
- The governed-transmit ledger recorded the agency receipt under the wrong key
  (`transactionId`), so the Part 11 record of a transmission never carried it.
- Amendment placement per the FDA eCTD Module 1 vocabulary: protocol amendment
  summary to m1.2, Form 1572 to m1.1, IB to m1.14.4.1 (they were under pre-IND
  correspondence, request-to-charge and labeling). The auto cover letter is now
  keyed on document type, not section, so other m1.2 content no longer stands in
  for it.
- 312.33 annual report due date: 60 days after the most recent anniversary of
  the IND effective date, not 60 days after the effective date itself.
- ICSR acknowledgements: an ACK that names another message, cannot be read, or
  arrives for a report never transmitted is refused (422/422/409) and the row is
  unchanged. The route mapped every refusal to 404.
- `transmitSequence` refuses without an explicit staging/production environment
  and without a real agency application number; the UNASSIGNED placeholder was
  being sent.

- FDA ESG AS2: a 2xx was recorded as received on its own. The MDN is now
  read before anything is recorded — a `failed` or `processed/error`
  disposition, an MDN for a different message, or a body with no disposition
  records the transmittal rejected (raw MDN kept) and throws. The SFTP path
  refuses without an application number instead of filing under
  `APP-<packageId>`.
- Every eCTD gateway refuses without the four-digit sequence and a submission
  type (`requiredAgencyMetadata` in `submission-gateways/types.ts`), before a
  transmittal row exists. They defaulted to `0000`/`0001` and `initial`, so a
  follow-up whose caller forgot the metadata was announced as an original.
  FDA ESG applies this on the SFTP path only, where the sequence names the
  `/incoming/` directory; the AS2 envelope carries no sequence and an eSTAR
  has none.
- ICSR C.1.7 (expedited) comes from the event's classification; the
  transmission path hardcoded Yes.
- 312.33 draft: absent or unparsable period dates are refused (400
  VALIDATION) instead of coercing to 1 January 1970 and persisting.
- Cover letter: an absent date renders as the `[Date]` placeholder, not
  "01 January 1970".
- Safety classification: an event with no recorded expectedness is reported
  as unassessed (`determinations.expectednessRecorded`, rationale says so),
  not as "expected (listed in the IB)". Obligation unchanged: the clock never
  starts on an unassessed event.

One finding did not reproduce: the stored amendment plan keeps every leaf's
`documentId` and `parentLeafGuid` (the PGlite register test now asserts it).

### Fourth audit — ESG acknowledgement chain and IND initial assembly (2026-09-05)

Two read-only audits. Fixed on `concept2cure-v2`, each with a test that fails
on revert:

- `isConfigured()` on all 13 gateways answered true for any failure other than
  a missing variable, so an unreadable (unmounted, rotated-away) certificate
  showed the gateway as configured until the transmit failed. Any failure to
  load credentials is now "not configured".
- `checkStatus()` results carry `source: 'agency' | 'stored'` and, when a poll
  failed, `pollError`. Every gateway swallowed the poll failure and handed back
  the stored row as if it were the agency's answer; FDA ESG and EUDAMED have no
  live poll at all and were labelled "live poll" on the transmittals surface.
  The surface now says "last recorded state · the agency was not asked" for a
  stored result, and the status toast carries the server's reason.
- `POST /api/ind-generation/assemble` and `/generate-form` were removed (no
  callers). The first counted a section complete when any artifact existed,
  ignoring the `needsData` flag its sibling records, and answered "Ready for
  export" over a hand-rolled backbone with sequence 0000 and operation=new
  hardcoded; the second returned a one-paragraph summary named
  `FDA_Form_<n>.docx`. The toy `generateEctdXml`/`generateIcsrXml` builders are
  gone, and the ANA `generate_document` tool no longer offers `ectd_backbone`
  or `icsr` (it used to draft an ICSR around an invented report id and
  "Unknown" drug/reaction).

Still open from the ESG audit, a real feature not a fix: FDA ESG has no live
status poll (SFTP `/outgoing/` ack1/ack2/ack3 reconciliation). The stored row is
now labelled as such; the poll itself needs the ESG account and the ack format
verified against a live test account.

### Fifth audit — CTD Module 2/3 placement and the eCTD document gate (2026-09-05)

Two read-only audits. Fixed on `concept2cure-v2`, each with a test that fails
on revert:

- Module 2.5: the benefit-risk conclusion is no longer written by the builder.
  It printed "the benefit-risk balance is favorable" whenever one pivotal
  study existed, reciting the SAE and death counts in the same sentence
  without either gating the word. The counts are stated; the conclusion is a
  recorded open item for the sponsor's judgment.
- Module 2.4: "the safety profile supports the proposed clinical plan" is only
  drawn when no study category is open; it used to precede the list of the
  categories that were missing.
- Module 3 placement files a section already placed in an earlier sequence of
  the same submission as `replace` of that leaf (parent link), not `new`.
- 3.2.P.2 dissolution tables: the Batch column shows a batch number or a dash,
  never the product name.
- Leaf file names are composed within the 64-character eCTD rule (the label
  gives way; the source key stays whole), and `validateEctdPackage` — the
  validator the export route runs by default — refuses any packaged file name
  that breaks the rule.
- The packager refuses an encrypted/secured PDF leaf outright (`LEAF-ENCRYPTED`)
  instead of folding the detection into a PDF/A warning it then discarded.
- The parallel `/api/ectd-submissions` agent: an unverified PDF/A status is not
  a pass, a declared one says who declared it, and its file-name rule is the
  canonical one (it allowed `_` and had no length bound).

Decision item, not changed: `services/regulatory/ind-ectd-sections.ts` has no
`m5.2` (Tabular Listing of All Clinical Studies), so readiness can never flag
it. Early-phase INDs often carry nothing there; whether it belongs in the IND
required-section table is a regulatory call.

### Sixth audit — IND safety/annual-report chain and the filing client surfaces (2026-09-05)

Two read-only audits. Fixed on `concept2cure-v2`, each with a test that fails
on revert:

- A draft named on a `/file` call is the draft being filed: it must be this
  tenant's (404), for this submission and, for a safety report, this adverse
  event (409 DRAFT_MISMATCH), and not already filed (409 ALREADY_FILED). The
  routes only checked the tenant, so a 7-day fatal draft could be marked
  filed with a sequence whose content came from another event. An annual-
  report draft with open 312.33 sections is refused (409 DRAFT_INCOMPLETE)
  unless the caller sends `acknowledgeGaps: true`, and the filing response then
  records `filedWithOpenGaps`.
- The dashboard, cockpit and per-sequence dispatch gate count overdue safety
  reports from the register (`listOverdueSafetyReports`), never from the
  request body. Omitting the field, or sending 0, used to read as "no critical
  actions" while unfiled 7-/15-day reports sat past deadline. The pure
  calculators under `/compute` still take their inputs from the body; they
  have no submission in scope and say so.
- The annual-report overdue feed carries `overdueState`: `overdue`, or
  `deadline_unknown` for an unfiled draft with no IND effective date recorded.
  Those were dropped from the feed, reading identically to a report on
  schedule.
- PV cockpit: a failed compliance-matrix read is an error state ("could not be
  read, so it is unknown, not clear"), not "No compliance data yet".

Noted, not changed: the cross-reference register's `ready: true` is vacuous
when no references are recorded; `counts.total: 0` sits beside it, so a
caller reading the whole payload can tell.

### Seventh audit — ICSR (E2B(R3)) composition and transport (2026-09-05)

Read-only audit of the E2B composer, message wrapper, transport and
persistence. Fixed on `concept2cure-v2`, each with a test that fails on revert:

- C.1.3 (type of report) comes from the case's `reportType`; it was the
  constant "2 (report from study)" for every ICSR, spontaneous and literature
  reports included. An absent type is a gap, not a default.
- The country of occurrence is emitted as E.i.9; it was emitted under C.2.r.3
  (reporter's country). C.2.r.3 now takes a supplied `reporterCountry` on the
  ICSR envelope and is otherwise empty — the intake event has no reporter
  country field, and it is not in the mandatory set (a decision, not an
  oversight: making it mandatory would block every prepared ICSR with no
  intake path to supply it).
- C.5.1.r.1 (study registration number) is emitted for a study report and is
  mandatory for one; `studyRegistrationNumber` is carried on the ICSR envelope.
- `transmitIcsrTransmission` refuses unless the row is `prepared`
  (INVALID_STATE, 409). A second transmit used to send the same message
  number again and overwrite the receipt.
- The composer's docstring now names the tracked mandatory subset;
  `completeness` and `transmitReady` speak to that set, not to the full
  E2B(R3) mandatory-element list.

Verified and unchanged: the transport fails closed (production with no
gateway throws; the real client is not implemented and says so; a simulated
receipt is never recorded as transmitted), and every read is tenant-scoped.
The real FAERS/EudraVigilance client remains the open feature.

### Eighth audit — Module 2.7 / CSR / labeling chain and the FDA submission-type vocabulary (2026-09-05)

Two read-only audits. Fixed on `concept2cure-v2`, each with a test that fails
on revert:

- Modules 2.5 and 2.7: SAE and death counts that were never extracted are
  no longer folded into "0 serious adverse event(s) and 0 death(s) reported".
  `saeCount`/`deathCount` are optional on the study-report input and the
  canonical project reader (`loadCsrInputsForProject`) does not populate them,
  so every real project read as "no SAEs occurred". The summaries now say the
  counts have not been extracted for N of M studies, record it as an open
  item, and the 2.7 narrative prints its open items (they lived only on the
  sibling `gaps` field, which the authoring tool never renders). 2.7.3 no
  longer says "Efficacy was evaluated in 0 controlled study/ies".
- `fdaSubmissionTypeFor` refuses a `withdrawal` sequence. It fell through to
  "Original Application" (fdast1/fdasst1); the FDA vocabulary has no
  withdrawal type, and which type a withdrawal files under is a regulatory
  decision — recorded below.

Verified and unchanged: `csr-builder` (placeholders block completeness,
template fallbacks are not marked AI-generated), the labeling/SPL path (throws
on missing required content, label prose comes only from the org's stored
sections), the 5.3.5.x and m1.14 vocabulary, and the FDA application-type /
sequence-number / application-number handling (recorded, four-digit,
UNASSIGNED never sent).

Decision items, not changed:
- Which FDA submission type a withdrawal sequence files under (amendment to
  the original application, or product correspondence). Until recorded, a
  withdrawal cannot be packaged for FDA.
- Extracting SAE/death counts from CSR §12.2/§12.3 into the study-report
  input is a feature; the builders now say the counts are missing rather than
  inventing zeros.

### Note for the concurrent device stream

On 2026-09-04, at JM's direct instruction to complete the biotech/pharma workflow
"including the PDF or the Acrobat file from eSTAR", this session edited files §2 lists as
device-stream territory: `server/services/forms/fill-official-pdf.ts`,
`server/services/pathway-engines/estar/`. The changes are the XFA data-path resolver that
both streams' forms depend on, plus honesty fixes in the eSTAR fill and readiness. They
were rebased onto the device stream's own commits and its full suite passes. The territory
split in §2 otherwise stands.

---

## 2. This stream's territory

**You may edit:**
- `server/services/ectd/`
- `server/services/ind-forms/`
- `assets/ectd-dtd/`
- `templates/forms/acroforms/` and its sidecar manifests
- `scripts/ind-forms/`

**You may not edit:**
- `server/services/pathway-engines/estar/`, `server/services/forms/`, or
  `assets/estar-templates/` — that is the device stream, running concurrently
- `client/src/concept2cure/v2/Shell.tsx`, `V2App.tsx`, `ConversationThread.tsx`,
  `AnaActivity.tsx`, `styles/app-v2.css` — that is the platform stream

If your work appears to require a file outside your territory, **stop and report it.**

---

## 3. Ground rules

1. **Branch `concept2cure-v2` only.** Never create a branch.
2. **No file proliferation.** Refactor in place.
3. **The machine room is sacred.** Editor, artifact lifecycle, provenance, review,
   submission, vault, audit chain, tenant isolation.
4. **Fail closed, never fabricate.** No fake validation pass, no invented DTD, no
   plausible-looking package.
5. **Done means JM clicked it.** You report and stop.
6. **One click per session.**
7. **A blocked step is blocked.** Report it.
8. **Proof goes in `docs/reports/`.**

---

## 4. Where truth lives

| Source | Use it for |
|---|---|
| `docs/reports/wo9-phase1-ectd-unblock-2026-09-03.md` | **The authoritative state of this stream** |
| `docs/handoff/WO-09_BIOTECH_IND_ECTD_DEMO.md` | Click sequence — but see the warning below |
| `assets/ectd-dtd/README.md` | Vendoring policy |
| `CLAUDE.md` | Repo law. Current and clean. |

**Where WO-09 and the proof report disagree, the proof report wins.** WO-09 §1.2
contains a premise about FDA form XFA status that was later measured and corrected —
see §7 below. Do not act on it.

**Ignore `docs/design/ANA_CHATGPT_PARITY_UI_DESIGN.md`.** It names `ZenApp.tsx` and
`ZenSidebar.tsx` as canonical; both files no longer exist. Any root-level markdown
older than 2026-08 is a snapshot, not an instruction.

---

## 5. Phase 1 state

| Step | State |
|---|---|
| 0 — Branch sanity | Done |
| 1 — Read ground truth | Done — §6 below |
| 2 — Vendor eCTD supportive files | **Blocked — egress** |
| 3 — Fill checksum manifest | **Blocked** — depends on Step 2 |
| 4 — Prove the DTD gates | **Done. The gate was broken and is now fixed** — §8 |
| 5 — Corpus ingestion sweep | **Blocked** — egress + no `DATABASE_URL` |
| 6 — Proof report | Written |

Two stop conditions remain open, both on Step 2: `assets/ectd-dtd/checksums.txt` has
zero filled entries, and no package can be DTD self-contained.

---

## 6. Ground truth — what the code actually requires

**Filenames are load-bearing.** `dtd-bundler.ts` hard-codes them and the packager's
DOCTYPE declarations reference them verbatim.

| Constant | Value | Referenced by |
|---|---|---|
| `ICH_BACKBONE_DTD` | `ich-ectd-3-2.dtd` | `buildIndexXml` — `SYSTEM "util/dtd/ich-ectd-3-2.dtd"` |
| `REGIONAL_DTD.fda` | `us-regional-v3-3.dtd` | `buildFdaBackbone` — `SYSTEM "../../util/dtd/us-regional-v3-3.dtd"` |

For US-only scope, **two files** satisfy the DTD gate.

**Manifest format** (`checksum-manifest.ts`): `/^([0-9a-fA-F]{64})\s{1,2}(.+)$/` — 64 hex
chars, one or two spaces, filename. `#` comments and blank lines ignored.
`verifyChecksumManifest` reports `mismatched`, `missingFiles`, `unlistedFiles`; `ok` is
true only when all three are empty.

**The gate fails closed correctly. It is the data that is absent.** Measured on today's
empty directory:

```
listVendoredDtds()             -> 0 files
requiredDtdsForRegion('fda')   -> [ich-ectd-3-2.dtd, us-regional-v3-3.dtd]
production + requireDtd=true   -> selfContained=false  cleared=false  1 blocker
production + requireDtd=false  -> cleared=true   (report-only, as documented)
staging    + requireDtd=true   -> cleared=true   (report-only, as documented)
parseManifest(checksums.txt)   -> 0 entries
```

### Two gaps between the work order and the code

**The supportive-file list is wider than anything the code consumes.**
`bundleVendoredDtds` copies `*.dtd` only. Nothing reads `valid-values.xml`,
`form-type.xml`, or any stylesheet. Vendoring them satisfies no gate that exists today.

**Stylesheets are referenced but never bundled.** `regional-packager.ts:262` emits
`<?xml-stylesheet type="text/xsl" href="../util/style/us-regional.xsl"?>` into the US
regional backbone. There is no `assets/ectd-style/`, no `.xsl` anywhere in the repo, and
no code that writes `util/style/`. **Every FDA package references a stylesheet it does
not contain.** `assessDtdReadiness` only inspects `*.dtd`, so the DTD gate does not
catch it.

WO-09 Click 4's acceptance criterion — *"the compiled `index.xml` opens in a browser via
the ICH stylesheet"* — **cannot be met as built.** JM has ruled that the criterion
stands and that both `ectd-2-0.xsl` and `us-regional.xsl` are to be vendored into
`util/style/` on the same trip as the DTDs. **Bundling them will require a code change**
— a style bundler, or an extension to `dtd-bundler` — because nothing copies `.xsl`
today. That code change is authorized only after the files exist.

### Version pin — unverified

`dtd-bundler.ts` pins `us-regional-v3-3.dtd` (FDA US Regional v3.3) and
`ich-ectd-3-2.dtd` (ICH eCTD v3.2.2). **Neither was confirmed against the agency's
published page**, because the pages are unreachable. Do not assume v3.3 is still the
mandated production version. Confirm at acquisition time. If FDA publishes a different
version, that is a discrepancy to **report**, not to substitute silently.

---

## 7. FDA forms — the XFA question, resolved on measurement

An earlier premise held that all five vendored FDA forms were unfillable dynamic XFA.
That was measured with `pikepdf` and is **partly false**. The manifests' notes were
wrong; the real obstacle on two of them was encryption, not XFA:

| Form | `/Fields` | XFA in AcroForm | `/NeedsRendering` | Verdict |
|---|---|---|---|---|
| FDA 1572 | **740** | no | absent | Fillable AcroForm |
| FDA 356h | **1,348** | no | absent | Fillable AcroForm |
| FDA 3454 | 1 | yes | absent | Static XFA — fills after strip |
| FDA 1571 | 0 | yes | **true** | Dynamic XFA — reconstruction only |
| FDA 3674 | 0 | yes | **true** | Dynamic XFA — reconstruction only |

The 740 and 1,348 counts match the comments in
`server/services/ind-forms/official-field-maps.ts` exactly. The `/P -1036` permission
bits decode as: bit 9 fill-form-fields **allowed**, bit 6 annotate/fill **allowed**,
bit 4 modify denied, bit 11 assemble denied. **Filling is permitted by FDA.**

**JM's ruling:** onboard 1572, 356h and 3454 via the existing
`scripts/ind-forms/onboard-fda-form.ts` (it decrypts with pikepdf, hashes the decrypted
bytes, writes a manifest with `reviewedBy`/`reviewedAt`/`fieldMap`). For 1571 and 3674,
use reconstruction plus a sponsor-uploaded completed form placed as the Module 1.2 leaf.
Correct the false manifest notes. Record decrypted field counts, the `/P` decode, and
SHA-256 of both encrypted and decrypted assets in the proof report.

Status doc: `docs/biotech/FDA_FORMS_FILL_STATUS.md`.

**This work does not depend on egress** and may proceed if JM authorizes it as the
session's single click.

---

## 8. Step 4 — the DTD gate was broken and is fixed

Both fixtures were run through `validateDtdConformance`. The **conformant** fixture
failed:

```
index-valid.xml    3 findings (3 error)    expected PASS  -> GATE BROKEN
index-invalid.xml  11 findings (10 error)  expected FAIL  -> OK
```

**Root cause: the validator scanned XML comments as markup.** Every check is a regex
over the raw backbone string and comments were never stripped. `index-valid.xml`
documents `DTD_LEAF_MISSING_ATTR` using a literal `<leaf>` inside its own header
comment; the leaf scan matched it as leaf #0 with no attributes and raised three errors
against a conformant backbone. It also shifted `leaves[leafIdx]` at
`ectd-validator-hardening.ts:308`, so downstream indexing was off by one.

Fixed at `server/services/ectd/ectd-validator-hardening.ts:243` with a fixture test
loading both `assets/ectd-dtd/fixtures/index-valid.xml` and `index-invalid.xml`. Valid
must pass; invalid must fail.

---

## 9. Next authorized action

**None, unless JM says otherwise.**

Two things can unblock this stream, and both are JM's:

**(a) Vendor the files.** On a network-permitted machine, fetch from FDA and ICH — all
free — and add via PR:
- `ich-ectd-3-2.dtd`
- `us-regional-v3-3.dtd` (confirm the version is still current at acquisition)
- `ectd-2-0.xsl` and `us-regional.xsl` for `util/style/`
- then fill `assets/ectd-dtd/checksums.txt`

**(b) Authorize the FDA forms onboarding** (§7). It needs no network and is the only
substantive work available on this stream today.

If neither has happened: report the blockage, name what is needed, and stop.

---

## 10. Do not

- Retry, mirror, or route around an egress 403.
- Synthesize, approximate, or reconstruct a DTD or stylesheet from memory.
- Assume DTD v3.3 is current.
- Vendor `valid-values.xml` or `form-type.xml` expecting a gate to notice. No code
  reads them.
- Extend `dtd-bundler` to copy `.xsl` before the `.xsl` files exist.
- Create `config/ui-surface-registry.json`. It does not exist and is not the registry.
- Touch the eSTAR/device or client/v2 files. Two other streams are running.
- Write a new architecture document.

---

## 11. Session log — append one row, never rewrite

| Date | Account | Authorized click | What was proven | Report |
|---|---|---|---|---|
| 2026-09-03 | A | WO-9 Phase 1 Steps 0–6 + XFA decision | DTD gate defect found and fixed; vendoring blocked on egress; forms XFA status measured | `docs/reports/wo9-phase1-ectd-unblock-2026-09-03.md` |
| 2026-09-05 | A | Third audit fixes — IND lifecycle + gateways | Receipt-less 2xx refused on 11 gateways; ledger receipt key; amendment placement + cover letter; 312.33 due date; ICSR ACK refusals; transmit refusals — all revert-proven | §1 above |
| 2026-09-05 | A | Third audit, remainder | ESG MDN verified before acceptance; sequence/type required on every gateway; C.1.7 from the event; no epoch dates; unassessed expectedness stated as such — all revert-proven; finding 12 did not reproduce | §1 above |
| 2026-09-05 | A | Fourth audit — ESG acks + IND assembly | isConfigured honest on 13 gateways; status provenance (agency/stored + pollError) end to end; orphaned assemble/generate-form routes and toy backbone/ICSR generators removed — revert-proven | §1 above |
| 2026-09-05 | A | Fifth audit — M2/M3 placement + eCTD document gate | No automated benefit-risk / supports-the-plan conclusions; Module 3 replace lifecycle; 64-char leaf names composed and validated; encrypted leaves refused; agent PDF/A not-verified ≠ pass — revert-proven; m5.2 recorded as a decision | §1 above |
| 2026-09-05 | A | Sixth audit — IND filing chain + client surfaces | Draft-linked filing refusals (404/409); overdue safety count from the register; annual overdue feed carries deadline_unknown; PV matrix error state — revert-proven | §1 above |
| 2026-09-05 | A | Seventh audit — ICSR E2B composition + transport | C.1.3 from the case; E.i.9 vs C.2.r.3; C.5.1.r.1 mandatory for study reports; no re-transmit of a non-prepared ICSR — revert-proven | §1 above |
| 2026-09-05 | A | Eighth audit — M2.7/CSR/labeling + FDA submission types | Unextracted SAE/death counts stated as such in 2.5/2.7, 2.7 prints its gaps; withdrawal refused rather than coded as an original — revert-proven; two decisions recorded | §1 above |
| | | | | |

**Rule:** the last row with an empty "What was proven" cell is the open work.
