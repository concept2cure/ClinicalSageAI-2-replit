# Regulatory determinations — 2026-09-22

The founder asked for the open regulatory questions to be researched and settled
rather than handed back as "decisions for you". This file records what was
determined, **how strongly each determination is evidenced**, where it is
implemented, and what still needs a primary-text check. The raw research and
verifier output is in `research.json` (one entry per finding, with sources).

## How the research was done — and its limits

- **Method.** A workflow of six research agents, one per question, each told to
  quote regulatory text verbatim with its designation and sources, rate its own
  confidence, and name the code it affects. Then three adversarial verifiers,
  each covering two questions, told to re-search every clause independently and
  refute.
- **Direct access to primary sources was denied** by the organization's egress
  policy: eCFR, Cornell LII, Federal Register, govinfo, fda.gov, hhs.gov, ich.org,
  ema.europa.eu, eur-lex, legislation.gov.uk. Research ran on **web-search
  results only**. A result from the regulator's own domain counts as primary.
- **The session's web-search budget (200 searches) ran out partway through.**
  - The IRB-review, FDA-312.30, re-consent and EU-CTR questions were researched
    before it did.
  - The protocol-deviation and Part 11 questions were researched **from the
    agents' recall plus PubMed literature**, and rated medium/low.
  - **None of the verifiers could search.** Their verdicts are all
    "unverifiable". One of the three failed outright on a content-filter error.
    Their *logical* objections (overreach, guidance presented as regulation,
    confidence inflation) were applied to the code anyway. They are listed
    under each area.
- The Lawstronaut regulatory-text connector is attached, but it needs
  re-authorization in claude.ai connector settings, so it could not be used.

| Question | Findings | Verbatim text from a regulator-domain result |
|---|---:|---:|
| IRB review of amendments | 20 | 11 |
| FDA 21 CFR 312.30 | 19 | 18 |
| Re-consent | 17 | 15 |
| EU CTR substantial modifications | 14 | 11 |
| Protocol deviations | 17 | **2** |
| Part 11 / separation of duties | 18 | **0** |

**Rule for this record:** a product rule was implemented from a low-evidence
area only when the decision does not depend on the exact wording of a clause.
One example is "no regulation sets 3-day / 10-day deviation windows". Another is
"11.50(a)(3) lists *authorship* as a signature meaning". Each such rule is
marked below.

---

## 1. IRB review of a change to approved research

**Determination.**
- **No US path skips IRB review.** Every change to approved research is
  reviewed and approved by the IRB before it is implemented. The one exception
  is a change needed to eliminate apparent immediate hazards, which is made
  first and reported promptly. What varies is the procedure: expedited review
  for minor changes, otherwise a convened meeting. Whether a change is minor is
  the IRB's call, not the sponsor's.
- **The ICH E6 "logistical or administrative" carve-out is guidance** (FDA adopted
  E6 as guidance) and cannot override the regulations.

| Rule | Citation | Evidence |
|---|---|---|
| Review before implementation, immediate-hazard exception | 45 CFR 46.108(a)(3)(iii); 21 CFR 56.108(a)(4); 21 CFR 312.66 | verbatim, eCFR/LII (high) |
| Expedited review of minor changes; reviewer may not disapprove | 45 CFR 46.110(b)(1)(ii); 21 CFR 56.110(b)(2) | verbatim, eCFR/LII (high) |
| Convened review otherwise | 45 CFR 46.108(b); 21 CFR 56.108(c) | verbatim (high) |
| No regulatory "administrative, no review" category | 46.108(a)(3)(iii), 56.108(a)(4), 312.66 contain none | high (negative, from full text) |
| "Increases risk → not minor" | SACHRP 2011 (advisory) | medium — **labelled platform convention in code** |
| "Major → convened" | platform default; 46.110(b)(1)(i) still allows expedite of minimal-risk research | **labelled platform convention in code** |

**Implemented:** `server/services/protocol-amendments/protocol-amendments-logic.ts`
(`irbReview`).

**Verifier objections applied:**
- "No OHRP/FDA guidance exempts …" was overbroad (FDA adopted E6) and now reads
  "no US regulation exempts".
- CONVENED_BASIS now quotes what 46.108(b) / 56.108(c) actually say.
- Both conventions are labelled as the platform's.

## 2. Re-consent

**Determination.** Neither regulation uses the term "re-consent". The consent
element is a statement, given "when appropriate", that significant new findings
will be provided. **The IRB decides** whether and how enrolled subjects are told.
So an engine may report "IRB determination required", and must **never**
report "required" or "not required".

| Rule | Citation | Evidence |
|---|---|---|
| New-findings consent element | 45 CFR 46.116(c)(5) (2018; (b)(5) pre-2018); 21 CFR 50.25(b)(5) | verbatim, eCFR (high) |
| IRB may require additional information | 45 CFR 46.109(b); 21 CFR 56.109(b) | verbatim, eCFR (high) |
| IRB decides whether enrolled subjects are informed, and how | FDA, *Informed Consent* guidance (Aug 2023) | medium — two secondary sources; cited by title and date only |
| Document the communication | ICH E6(R2) 4.8.2 | high (E6(R3) 2.8.2 numbering is medium, so not cited) |

**Implemented:**
- `protocol-amendments-logic.ts` (`reconsent`)
- `pdev-view-assembler.ts` and `ProtocolDevPanes.tsx`: the badge reads "IRB
  re-consent determination needed"
- the AnA protocol-question help text

**Verifier objections applied:**
- The "confirmation of willingness" duty was dropped, because it rests only on
  E6(R3) (medium).

## 3. FDA protocol amendments — 21 CFR 312.30

**Determination.**
- **An IRB-minor change can still require an FDA amendment.** Examples: any
  increase in dose or exposure (b)(1)(i), a control group (b)(1)(ii), a safety
  test (b)(1)(iii).
- **The trigger is phase-dependent:** Phase 1 counts safety only.
- **A sample-size decrease is not the (b)(1)(i) example**, which covers
  increases only.
- A new investigator is **312.30(c)**, not (a).
- An amendment must be **prominently identified** as "Protocol Amendment: New
  Protocol / Change in Protocol / New Investigator" (312.30(d)).
- Phase 1 modifications not submitted go in the annual report under
  **312.33(e)**, not (d).
- FDA does not approve amendments and can still impose a hold (312.42).

Evidence: 18 of 19 findings verbatim from eCFR/govinfo (high).

**Implemented:**
- `protocol-amendments-logic.ts` (`fdaSubmission`)
- `substantiality.ts` (US indicators kept apart from the EU verdict; decrease
  no longer indicated)
- `ind-amendment-service.ts` (312.30(c); added protocol → 312.30(a); plan
  carries the 312.30(d) titles)
- `ind-cover-letter-service.ts` (uses them, or reports the missing subtype as a
  gap)

**Verifier objections applied:**
- "Administrative → not required" is conditioned on the sponsor's label.
- The major/risk → required mappings are labelled conservative defaults.
- Combined Phase 1/2 studies are flagged.
- The control-group indicator carries the Phase 1 caveat.

## 4. EU CTR — substantial modifications

**Determination.**
- **Definition:** a change "likely to have a substantial impact" (Art. 2(2)(13)).
  The classification is the sponsor's.
- **Authorisation before implementation is Article 15**, not 16. Article 16 +
  Annex II is how the application is submitted.
- **Non-substantial changes:**
  - relevant to supervision → update CTIS under Art. 81(9);
  - others → TMF + the next substantial modification's cover letter (CTR Q&A
    practice, medium).
- **Member-State changes are not substantial modifications:** adding a Member
  State is Art. 14; a trial ending in one is Art. 37.
- Annex I uses lettered **sections** ("D. PROTOCOL"), not "Part D".

Evidence: Art. 2(2)(13), 15, 14, 81(9) verbatim-matched (high). Articles 16–23
detail and the Q&A numbering are medium.

**Implemented:**
- `substantiality.ts`: EU_ACTION, Art. 15; the Member-State indicator is
  `eu_procedure` and not counted; the verdict is `substantial_indicators`.
- `protocol-rule-pack.ts`: section D.

**Verifier objections applied:**
- Q&A practice is attributed as practice.
- Pre-start Member-State withdrawal is flagged as a possibly different route.
- An unverified replacement rationale in the rule pack was made generic.

## 5. Protocol deviations — *recall-based area; product rules chosen accordingly*

**Determination.** Each rule stands however the clauses are worded.

- **An unassessed deviation is not a minor one.** Severity and safety impact are
  a person's assessment. Until both are recorded, reportability is
  *undetermined* and the deviation cannot close.
- **ICH E6(R2) 4.5.3 is "document and explain any deviation".** It has no
  "minor deviations need not be reported" carve-out.
- **No regulation, FDA guidance, ICH guideline or the EU Regulation sets 3-day
  / 10-day deviation windows.** Those are IRB or sponsor SOP windows.
  - The fixed regulatory clocks that exist are **conditional**: EU serious
    breach, 7 calendar days from sponsor awareness (Reg. 536/2014 Art. 52), and
    a device emergency deviation, 5 working days (21 CFR 812.150(a)(4)).
  - Everything else is "promptly" (21 CFR 312.66), with the timing set by the
    IRB's written procedures.
- 45 CFR 46.108(a)(4) is the IRB's procedure for unanticipated problems and
  serious or continuing noncompliance. It does not make "major" deviations
  reportable.
- The regulatory distinction is *important* / not important (ICH E3 Q&A (R1)),
  defined per trial. Minor/major/critical is an internal scale.

**Implemented:**
- `protocol-deviations-logic.ts` (rewritten)
- `protocol-deviations-service.ts` (no defaults; `assessDeviationTx`; closure
  requires the assessment; one closure read path)
- `POST /api/protocol-deviations/deviations/:id/assessment`
- the "Assess" drawer on the deviation register
- `migrations/20260922f` (nullable, assessment columns; legacy rows read as not
  assessed, no data rewritten)
- the AnA tool (severity only as stated by the user)
- `csr-auditor.ts`

**Needs primary-text confirmation before quoting verbatim:**
- 812.150(a)(4) wording
- Art. 52 wording
- 56.108(b)(1)–(3) paragraph mapping
- FDA's Dec 2024 draft deviations guidance (definitions and reporting
  recommendations)
- UK serious-breach rule after the 28 Apr 2026 regulations — **not cited in
  code**

## 6. Separation of duties and Part 11 — *recall-based area; one firm anchor*

**Determination.**
- **Part 11 does not require signer ≠ author.** 21 CFR 11.50(a)(3) lists
  *authorship* among signature meanings, alongside review, approval and
  responsibility. This is a well-known text; the anchor is firm.
- The four-eyes rule is **predicate-rule and governance**, for example 21 CFR
  211.186(a), 211.22, 211.192, 58.35(a). It is enforced as a Part 11 authority
  check (11.10(g)).
- Therefore the check applies to review, approval, release and lock, and
  **not** to an authorship signature.
- When the author cannot be determined, independence cannot be shown, so the
  signature is **refused (409)**, not allowed.

**Implemented:** `server/services/governance/separation-of-duties.ts`
(relabelled; meaning-scoped; authorship set from the version ledger,
`accepted_by` and the owner; unknown/unmodelled → 409).

**Found while implementing, and fixed:**
- `c2c_documents.owner_id` is the project scaffolder, and is NULL on backfilled
  documents.
- `c2c_document_sections.owner_id` is never written.
- `specification`, `batch` and `correspondence-issue` action targets were
  resolved **without tenant scope**.
- Pointer-only targets could be **signed**.

**Needs primary-text confirmation before quoting verbatim:**
- 11.10(d)/(e)/(f)/(g)/(j) wording
- the Part 211 second-person provisions
- EU GMP Annex 11 sections
- the 2025 Annex 11 revision

---

## Residual risks, stated plainly

- **FDA harmonization rule.** Neither the research nor the verifiers could check
  whether FDA's 2022 proposed rules conforming 21 CFR 50/56 to the 2018 Common
  Rule have been finalized. If they have, 50.25(b)(5), 56.108 and 56.110
  designations may have moved.
- **ICH E6(R3)** clause numbers are not cited anywhere in the new code, because
  none was verified.
- **A pre-existing failure on the branch:**
  `tests/schema-contract/esignature-verify-roundtrip.contract.test.ts` (Part 11
  §11.70 verification round-trip) fails 2/5 identically before and after this
  work. It is not caused by it, and it is not fixed here.

## To close the gaps

Any one of these closes most of them:

- raise `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION`;
- re-authorize the Lawstronaut connector;
- allow `ecfr.gov`, `eur-lex.europa.eu` and `database.ich.org` for this
  environment.

Then re-verify each "needs primary-text confirmation" item above against the
primary text, and record the verbatim clause and its retrieval date in
`research.json` next to the claim it confirms. The questions, claims and
verifier votes in `research.json` are the full input for that re-run; the
workflow that produced them ran in an ephemeral session and is not kept.
