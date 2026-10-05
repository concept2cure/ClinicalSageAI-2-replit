# D2 round 2 — the depth of AnA's regulatory document intelligence (2026-10-04 →)

Lane: `…session_017d4r3CzS4BdBo5x7EpLdEt`, row **D2**, claimed in
`docs/work-orders/README.md` §0.

The product owner set the scope on 2026-10-04:

> "Don't rely on other sessions. You own everything. You are the product
> manager … producing the submissions to regulatory bodies, whether that be in
> Japan, Europe, or here in the United States to the FDA, across both biotech
> and medical device and diagnostic. She must be the all-everything expert
> across all of that."

Later the same day: *"make the best choice for our niche client base."* The
work is therefore ordered by where small and mid-size biotech, medtech and
diagnostics sponsors file first:

1. FDA, for drugs, biologics, devices and IVDs.
2. EU MDR/IVDR.
3. EMA medicines.
4. PMDA.

Within each, a wrong fact or a false "ready" is fixed before new depth is
added.

Round 1 is recorded in [`../2026-10-04/README.md`](../2026-10-04/README.md).

## Method

Each stage was a multi-agent workflow:

1. **Discovery.**
   - Sixteen independent surveys, each from one angle: US medicines and
     platform (8 angles); EU and Japan medicines with the cross-jurisdiction
     architecture and rejection criteria (4); devices and diagnostics with
     every round-1 hand-off (4).
   - The surveys returned 82 distinct findings after merging.
2. **Verification.**
   - Every finding was put to an adversarial verifier. The verifier read the
     cited code, ran probes and checked each regulatory claim against
     regulator-hosted text where search could reach it.
   - 72 findings survived, each with a corrected problem statement and
     proposal. One was refuted, as already fixed by this round. Nine were
     taken directly into implementation.
3. **Implementation.**
   - Implementation ran in file-disjoint lanes, in one checkout, with no
     branches (Rule 0).
   - Each step went through the same sequence:
     - an independent re-verification;
     - a test written first and run red against the old code;
     - the change;
     - green on the test and on every importer;
     - an adversarial review, with up to two fix rounds.
   - Agents never committed. The main session committed each step only after
     its review passed, ran the typecheck over the whole tree, merged trunk
     and pushed.

The facts each step relies on are in its `<step>-facts.md` file, each with
its regulator URL and check date or labelled as recall. Red and green runs
are in `<step>-red.txt` and `<step>-green.txt`.

## Landed

| Commit | What is now true | Evidence |
|---|---|---|
| `8183432b` | Authoring's AI section drafting is given the platform's canonical requirements for the section (prompt v1.1, `requirements` and `requirementsSource`), not the model's recall. A code nothing indexes says so and is never guessed. Every one of the 115 registered sections keeps its required elements in the drafting input. | `b2-drafting-requirements-*` |
| `5686b2d9` | The drafting prompt fields read by the IND and knowledge-base routes no longer contradict the guidance. The ISE and ISS are filed at 5.3.5.3; 2.7.3 and 2.7.4 summarise them. Narratives sit in the CSRs and are referenced from 2.7.4.2.2. The eCTD hyperlinks synopses rather than copying them. The IB is filed at 1.14.4.1 under ICH E6(R3). PREA's orphan exemption carries the 505B(k)(2) exception for molecularly targeted cancer drugs. | `b1-guidance-facts-*` |
| `bce88fa7` | `get_document_template` serves the ICH E3 CSR outline (one section off before), the ICH E2C(R2) PBRER (sections 12–14 were missing) and the regional cover-letter placement. | `b1-template-library-*` |
| `e7021b7b` | The consistency tools keep a confidence interval's sign and bounds. They no longer call a correct two-arm N a refuse-to-file risk, and they report "nothing was compared" instead of "clean". | `b1-consistency-defects-*` |
| `9045fc5f` | The US Prescribing Information format rules cite 21 CFR 201.57 correctly. The label check fails a PI with no Highlights or no Contents. The rules are reachable through `list_fda_technical_rules` (area `labeling`). FDA's Elsa record is current. | `b1-plr-rules-elsa-*`, `b1-plr-tool-area-*` |
| `b92f5edd` | The pre-NDA/BLA briefing places the ISS/ISE at 5.3.5.3. The 2.5.6 brief follows the ICH M4E(R2) benefit-risk headings 2.5.6.1–2.5.6.5. Its alignment with FDA's Benefit-Risk Framework is labelled a platform reading. 2.7 no longer lists 2.5 as drafted first. | `b3-guidance-presentation-*` |
| `dacbc67b` | The writing-precision gate fails a percentage that its own n/N contradicts at the stated precision. It also fails arm counts that do not sum to the stated total. The total is compared only within the same analysis population. | `b1-arithmetic-*` |
| `1275c890` | AnA gives the End-of-Phase-2 meeting package deadline as 50 days and drafts each FDA meeting package (pre-IND, EOP2, pre-NDA/BLA, Type A/C/D) from its own components. The DSUR follows ICH E2F, with §19 Summary of Important Risks and §20 Conclusions. Every E2F section is required, as E2F says. | `b3-meetings-dsur-*` |
| `30c576db` | The ISS, CSR §12.2 and 2.7.4 tell the writer how FDA now reads safety data: the OND Standard Safety Tables and Figures Integrated Guide (a reviewer tool, not a sponsor requirement) and the OND Custom Medical Queries. | `b3-safety-presentation-*` |
| `fb8ebaa1` | The writing-precision gate no longer forces "revise" on wording regulators require in submission documents: disposition census, superiority hypotheses, PK elimination, and adverse-event outcomes such as "resolved completely without sequelae". Each exemption is constrained so that the efficacy claims it resembles stay flagged, over four adversarial review rounds. The term-of-art check reads a 300 KB CSR in 22 ms, down from 5.9 s, with identical results. | `b3-writing-gate-register-*` |

## Decided not to ship: the cross-document clinical figure lexicon

Finding 15 proposed one lexicon and comparator for the clinical figures a
reviewer cross-checks between the CSR, 2.7.3, 2.7.4, 2.5, the ISS/ISE and the
label: N randomised and treated per arm, the primary effect and its CI,
deaths, SAEs and discontinuations.

It went through four adversarial review rounds. Each round found a new class
of false result in ordinary CSR wording:
- precision read from the parsed number rather than as written;
- "treated with rescue medication" read as the treated population;
- sub-rates after a comma read as arm rates;
- hazard ratios compared bound by bound against differences;
- per-arm death counts read as totals;
- subgroup and time-window rates read as overall rates;
- labels reported "consistent" when they were never compared.

Extracting clinical figures from free prose cannot be made reliably
deterministic. A checker that raises false conflicts on correct text, or
claims a consistency it never checked, fails the fail-closed rule.

**Decision (product owner's delegation, 2026-10-05):**
- The work is reverted. The diff is kept in the session scratchpad.
- Cross-document figure reconciliation will read structured outputs (TLFs and
  datasets) once the Vault can hold them; see the study-data steps of the
  record plan.
- The within-document arithmetic check (`dacbc67b`) is unaffected and live.

## Next: the regulatory record

The remaining 72 verified findings form one plan:
[`docs/design/ANA_REGULATORY_RECORD.md`](../../../design/ANA_REGULATORY_RECORD.md).
It extends `server/services/ind/ctd/` in place into one record covering FDA,
EMA and PMDA for drugs, biologics, devices and IVDs. It was chosen by a panel
of three independent designs and two judges, then checked by a completeness
critic. Its product decisions, and its evidence from here on, are in
[`../2026-10-05-record/`](../2026-10-05-record/).

## Owed and limits

- Primary regulator sites (`fda.gov`, `ema.europa.eu`, `pmda.go.jp`,
  `ecfr.gov`, `database.ich.org`) are blocked for direct fetch in this
  environment, and the Lawstronaut connector needs re-authorisation.
  - Facts marked `regulator-text` rest on search extracts of regulator-hosted
    pages, with the URL given.
  - Verbatim re-reads are owed, as listed in round 1's `research.md`.
- Follow-ups reported by implementers and reviewers are tracked into the next
  batches.
