# S4: AnA asks the orphan designation one way, and reads every answer one way

Package **S4** ("AnA … asks the right questions"), 2026-11-02.

The founder's directive of 2026-10-12 asks for questions that offer actionable
positions, plus an Other where the person can write an alternative. It applies across
device, diagnostics and biotech. This change takes the first of the three designation
families named in the coordination hold (designation, paediatric plan, comparability):
FDA and EU orphan designation.

The work is a completion. It completes the IND's orphan question
(`flows/ind-submission.ts`) and converges the other four interviews onto it. Nothing
here is new capability.

## What already exists

The questions, before this change:

| Interview | Field | Shape | Read by |
|---|---|---|---|
| `flows/protocol-development.ts` | `orphan_designation` | yes/no for "FDA or EMA". The help said orphan status "affects study size". | natural-history gate (`eq true`); cross-node rule |
| same | `regulatory_pathway` 'orphan_drug', `ema_designations` 'orphan' | two more checkboxes asking the same thing | cross-node rule only (they opened no gate) |
| `flows/ind-submission.ts` | `orphan_designation` | select: granted / applied / not_applicable | natural-history gate (`in [granted, applied]`); cross-node rule |
| `flows/nda-submission.ts` | `orphan_designation` | the IND's select, copied (added in `S4-CROSS-NODE-QUESTIONS`) | natural-history gate; cross-node rule |
| `flows/bla-submission.ts` | `orphan_designation` | yes/no. The help promised a fee "waiver", and exclusivity on designation. | natural-history gate (`eq true`); `war-game/auditors/bla-auditor.ts` fee rule |
| `flows/labeling.ts` | `orphan_designation` | yes/no, asked of devices and IVDs too | nothing |
| `flows/csr-report.ts`, `flows/briefing-book.ts` | `expedited_pathways` 'orphan_drug', `expedited_designations` 'orphan' | a checkbox inside the expedited-programme list | nothing |

The readers, before this change:

- **The cross-node rule.** `cross-node-context.ts` `statesOrphanDesignation` read the
  designation six ways. Two of them were claims the designation should be *checked
  against*, not evidence of it: an exclusivity claim (`exclusivity_claims` 'orphan_7yr')
  and a PREA position (`prea_applicable` 'orphan_exempt'). The other four were the
  protocol's checkboxes and the two shapes of the field.
- **The gates.** The four natural-history gates read the designation two ways. So the
  rule waited on answers that could never open the question it needed.
- **The war game.** `war-game/auditors/nda-auditor.ts` `no_pdufa_user_fee` read no
  designation. Its finding is **critical** whenever the fee is not confirmed, including
  for an orphan-designated NDA, which is exempt.
- **The BLA fee rule.** `bla-auditor.ts` `user_fee_not_paid` advised "submit a fee
  waiver request for orphan designation". That request does not exist: the orphan
  provision is an exemption, claimed on the cover sheet. The rule also gave the same
  advice to a 351(k) biosimilar, which pays BsUFA fees.

Elsewhere, not changed here and listed so nothing is rebuilt beside it:

- **The orphan record:** `biopharma_orphan_designations`. It is created by
  `db/migrations/20260716_biopharma_specialty.sql`, read by `GET /api/biopharma/orphan`,
  and shown in `v2/surfaces/BiopharmaSpecialty.tsx`.
- **Eligibility screens:**
  - `shared/regulatory/special-designations.ts`;
  - `server/services/ana/special-designations.ts`;
  - `server/services/market-specs/pathway-eligibility.ts`;
  - AnA's `assess_orphan_designation`.
- **Request document types:**
  - `US_ORPHAN` and `EU_ORPHAN` in the global document registry;
  - pack `fda-orphan-request-v1.1`;
  - `shared/ana/orphan-drug-designation.ts`.
- **The EU Module 1 condition:** `shared/regulatory/regional-module1.ts` 1.7.
- **The Japanese orphan programme record:** `server/services/ind/ctd/jp-programs.ts`
  'pmda-orphan-drug'.

Searches run:

- `orphan_designation`, `orphan_drug`, `orphan_exempt`, `orphan_7yr` and `/orphan/` over
  `server`, `shared`, `client` and `tests`;
- every option value of every registered flow, scanned for `/orphan/`. The new test
  makes this scan permanent.

The clone is shallow, so `git log --all --diff-filter=D` is not reliable here. No
deleted orphan question was found in the history available.

## What changed

- **One vocabulary.** `flows/ind-submission-orphan-designation.ts` was split out of
  `ind-submission.ts` under RULE 6. It holds two lists:
  - the US list (FD&C Act §526; 21 CFR part 316);
  - the EU list (Regulation (EC) No 141/2000).

  Each list offers five positions: granted, applied, planned, refused, not requested.
  Each position states what it commits the programme to and its authority, and the
  person can add their own words. The US positions are:
  - **Granted.** The application fee exemption applies (§736(a)(1)(F)), and not for a
    351(k) biosimilar. PREA's orphan exception applies, and so does the exception to it
    for molecularly targeted cancer drugs (§505B(k), (a)(3)). Approval for the
    designated use may carry exclusivity (§527). Annual progress reports are due
    (316.30).
  - **Applied.** Nothing attaches until FDA grants the designation.
  - **Planned.** The request must precede the marketing application (316.23(a)).
  - **Refused.** No orphan consequence attaches (316.25, 316.29).
  - **Not requested.**

  The EU authorities carry a note. The 2023 Commission proposals would replace
  Regulation 141/2000, and their status is not verified here.
- **Every interview asks it from that one list:**
  - protocol (US and EU), IND, NDA and BLA;
  - labeling, now asked only where the product is a drug or biologic.

  The protocol's two duplicate checkboxes are removed.
- **One reader and one predicate.** `orphanReadingOf` reads every value any version of
  the question offered:
  - a saved `true`/`'yes'` reads `stated`, never `granted`;
  - a saved `false`/`'no'`/`'not_applicable'` reads `not_held`.

  `orphanProgrammeLeaves` is the predicate every natural-history gate carries.
  `statesOrphanDesignation` is that same predicate, so the gate and the rule cannot
  disagree. The rule's trigger list is now the two designation fields.
- **The fee findings.** Both read the designation through `orphanFeeStandingOf` and one
  `ORPHAN_FEE_NOTE`.
  - **NDA.** A granted designation turns the unpaid-fee finding from critical to info:
    confirm every indication is the designated one, and claim the exemption on Form
    FDA 3397. A pending or planned request, or a saved bare "yes", is still critical,
    with the reason.
  - **BLA.** A 351(a) BLA gets the same treatment. A 351(k) biosimilar is told BsUFA
    holds no orphan exemption.
- **Text the verifier found wrong:**
  - NDA `pdufa_fee_not_paid`. It called the orphan provision a "waiver". It is an
    exemption, and the small-business waiver is §736(d).
  - NDA exclusivity help. Exclusivity attaches on approval for the designated use, not
    on designation.
  - BLA user fee help. It is now scoped to 351(a).

Stored answers are not migrated (RULE 1). Interview sessions are JSON, and the
session-less `flow_state` path cannot be reached by a migration. Every saved value is
read through `orphanReadingOf` instead.

## The measurement

`__tests__/one-orphan-vocabulary.test.ts` (34 cases) holds four things:

- **The questions:**
  - exactly these five interviews ask `orphan_designation`, and only the protocol asks
    `eu_orphan_designation`;
  - each offers exactly the five positions, each with commits and authority, and the
    person's own words;
  - the labeling question is not asked of a device or an IVD.
- **No other list offers an orphan value**, except five, each named with a reason.
- **The gate and the reader agree**, in all four gated interviews, on each of 22 values.
  The values cover every position, Other, the legacy yes/no spellings, `not_applicable`,
  blanks and two near-misses. The PREA position, the exclusivity claim and the removed
  checkboxes do not count as the designation.
- **The war game's fee findings**, as above.

`__tests__/cross-node-mitigations-fire.test.ts` adds:

- the rule fires for granted, applied, planned, Other, `'yes'` and `true`;
- the rule is silent for refused, not requested, `'not_applicable'`, `'no'` and `false`;
- the rule fires on the EU designation alone.

Each check was shown failing on the defect it exists for, by reintroducing it:

| Reintroduced | Fails |
|---|---|
| The protocol re-offers `regulatory_pathway` 'orphan_drug' | "no other list" (1) |
| The gate drops the saved-yes leaf | gate/reader on `true`, `'yes'`, `'Yes'`, `' y '`, `'TRUE'`, `'1'`, plus four rule cases (10) |
| The old six-way cross-node reader | planned, Other and EU-only rule cases; gate/reader on planned, Other, `'granted '`, EU (7) |
| The old reader's exclusivity, PREA and checkbox readings | "does not take a PREA position or an exclusivity claim" (1) |
| The NDA fee finding ignores the designation | "a granted designation makes an unpaid fee … not a critical" (1) |
| The IND's old three-value list | "offers the same positions" (1) |

One assertion first written for this change could not fail: an NDA with only an
exclusivity claim stays silent. It also passed with the old reader and the old trigger
list. With the natural-history gate closed, the rule only waits, so the assertion could
not tell old from new. It was replaced by the direct reader assertion in the table's
fourth row.

Results on the merged tree:

- the interview and war-game suites: `server/services/ana/intelligence-questions` and
  `tests/ana-intelligence`, all passing;
- `ci:eslint-ratchet`: OK, the warning count did not grow;
- `typecheck:fast`: OK.

Four suites fail on `origin/concept2cure-v2` with this change stashed:

- `tests/regulatory/ich-e6r3-citations`;
- `ind-amendment-sql-guidance`;
- `requirements-resolver`;
- `shared/navigation/__tests__/demo-scripts`.

They fail identically, and none reads a file changed here.

## Deferred, with reasons

- **The NDA node's own critical check, `pdufa_fee_not_paid`.** It still fires on an
  exempt orphan application's "not paid". `IssueCheck.condition` holds a single field
  predicate (`shared/types/intelligence-questions.ts`), so the check cannot also read
  the designation. The fix that fits the founder's directive is to ask the fee as
  positions: paid / orphan exemption claimed / waiver granted / not paid. The war-game
  finding is already correct.
- **The CSR's and briefing book's orphan checkbox.** It sits inside the expedited
  programme list. That list is the expedited family's, and its verified design was
  unsound: it touches the project-setup route list, the filing registry ids and the
  stage mapping. The test names both as known exceptions.
- **Japan, Australia and HUD (us_hud):**
  - every Japanese and Australian citation the design carried was recall or unverified;
  - no device interview reaches a HUD question;
  - `project-setup` would need a `NOT_PROJECTED` entry and a caution rule in
    `shared/regulatory/pathway-cautions.ts`, which is outside this hold.
- **Orphan readings as programme facts (`programmeFactsFrom`).** These need
  `ProgrammeFacts` in `shared/regulatory/pathway-cautions.ts`.
- **A rule that checks a PREA orphan exemption or a 7-year exclusivity claim against
  the designation.** The paediatric and exclusivity families own those fields.

## Hand-offs (not this hold's files)

- **`shared/regulatory/special-designations.ts` and
  `server/services/ana/special-designations.ts`.** Both call the orphan provision a
  "PDUFA fee waiver". It is the §736(a)(1)(F) exemption.
- **`shared/regulatory/regional-module1.ts` 1.7.** The similarity condition is that an
  authorised orphan with market exclusivity exists for the same condition. It is not
  the applicant's own designation.
- **The BLA fee rule's title, "PDUFA User Fee".** It is wrong for a 351(k)
  application, which pays BsUFA fees.
