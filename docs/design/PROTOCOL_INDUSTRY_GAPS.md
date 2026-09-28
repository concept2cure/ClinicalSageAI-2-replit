# Protocol build — what the industry needs that Concept2Cure does not yet offer

**Status:** binding design, 2026-09-23. **Prompted by:** the founder — *"What is
missing in our protocol build solutions that the industry needs but we do not
yet offer? Add all. Expand."* **Companions:** `PROTOCOL_DESIGN_CONVERGENCE.md`
(the two stacks, converged), `PROTOCOL_INTELLIGENCE.md` (the bidirectional
loop and the rules). This document does not repeat either; it starts where
their order-of-work ends.

## The finding

I surveyed the protocol build before naming a single gap, for the reason
`PROTOCOL_DESIGN_CONVERGENCE.md` records: this repository has now three times
produced a capability nobody could reach, and a gap list written without the
survey would have asked for at least four things that already exist.

`protocol-dev` is in the launch catalog by founder decision (2026-09-21,
`shared/constants/launch-scope.ts`, `docs/evidence/WI/2026-09-21`), so this
work is enhancement of a catalog surface. Where it goes beyond that — new
engines and AnA tools while launch rows are not all green — the founder
approved it explicitly in the session that built it (2026-09-28: *"You are
approved to bypass that rule"*, answering the Rule 2 question this document's
author raised). Rule 2's other clauses are not bypassed: every figure comes
from a deterministic engine and the model narrates.

### What the protocol build is today

Twelve service subsystems, fifteen route files, eighteen client surfaces, ten
schema files, thirty-one AnA tools, forty-seven test files. Measured against
the standards a regulatory reviewer or a sponsor's clinical-development lead
would name, this is what exists and is reachable:

| Capability | Standard it answers | Where |
|---|---|---|
| Design-as-data spine: objectives, estimands, endpoints, framework (superiority / NI / equivalence; parallel, crossover, factorial, dose-ranging, single-arm, adaptive, platform, basket, umbrella, MAMS), population, arms, randomisation, statistical plan (alpha, power, multiplicity method, interim with spending functions, missing-data strategy), safety design, regulatory strategy, MRCT regions, pediatric flag | USDM / ICH M11 alignment; ICH E9, E9(R1), E10, E11(R1), E17 | `study-design/study-design-types.ts` |
| 39 design gates across estimands, endpoints, framework, power, multiplicity, population, methods, missing data, interim; composed into an advance/block defensibility report | ICH E9 / E9(R1) / E10 / E3; M11 §2/§3/§4/§6/§7/§10/§17 | `design-gates.ts`, `design-validation.ts` |
| 53-rule protocol pack over the protocol document and the design | 21 CFR 312.23, 50.25, 56.111; 45 CFR 46 incl. subparts B/C/D; EU CTR 536/2014; ICH M11, E6(R3), E8(R1), E9(R1) | `protocol-development/protocol-rule-pack.ts` |
| Region rules: 7 agencies, ethnic sensitivity, MRCT consistency, thorough QT, UK separation, Swiss and Brazilian local representation, Project Orbis, FDA diversity action plan (presence) | ICH E5 / E17 / E14; FDORA §3601 | `region-design-rules.ts`, `study-design/region-rules-adapter.ts` |
| Five projections of the design: ICH M11 protocol, SAP skeleton, Schedule of Activities, registry record (ClinicalTrials.gov, EU CTIS), CRF shell | M11; E9(R1); FDAAA 801 / 42 CFR 11; CTR 536/2014; CDISC CDASH | `*-projection.ts`, `schedule-of-activities.ts`, `crf-shell.ts` |
| Participant burden and complexity over the SoA, with the amendment delta | — (differentiator; no single standard) | `burden-model.ts`, `burden-delta.ts` |
| Amendment substantiality from what actually changed; IRB / re-consent / FDA consequences | CTR 536/2014 Art. 2(2)(13); 21 CFR 312.30(b); 45 CFR 46.110 / 21 CFR 56.110 | `protocol-amendments/substantiality.ts`, `design-delta.ts`, `protocol-amendments-logic.ts` |
| Eligibility criteria as data: threshold parsing, conflict checks, registry projection | — | `eligibility-model.ts` |
| Sample size for power and for assurance; seeded Monte Carlo study twin with evidence-grounded priors from CSRs and comparators | ICH E9; assurance literature | `sample-size.ts`, `trial-simulator.ts`, `evidence-prior.ts`, `csr-evidence-source.ts` |
| Operational feasibility from observed ClinicalTrials.gov base rates, with Wilson intervals | — | `trial-feasibility.ts` |
| Registry filing obligations and clocks | FDAAA 801; CTR 536/2014 | `registry-filing.ts` |
| Registers: 5×5 risk register, milestones, per-subject budget with F&A, review board consensus, informed consent elements and readiness, deviations with reportability and CAPA closure, templates, versions, Part 11 signing ceremony | ICH E6(R2) §5.0; 2 CFR 200.414; 45 CFR 46.116; 45 CFR 46.108(a)(4); 21 CFR Part 11 | `protocol-*/` |
| Protocol → design derivation with provenance, conflicts and a reviewed diff; AnA tools over all of the above, narrating only | `PROTOCOL_INTELLIGENCE.md` | `design-derivation.ts`, `ana/protocol-design-tool-defs.ts` |

That is a serious protocol product. The gaps below are real, but they are gaps
in a strong build, not the absence of one — and several of them are the
repository's recurring failure mode again: **the engine exists and the
protocol build cannot reach it.**

## What is genuinely missing, measured against industry standards

Each item names the standard or guidance a life-science client would cite, the
evidence it is absent (grep scoped to the protocol and study-design code, not
the whole platform, because platform-wide matches were noise — `docx` hit 172
files and none of them exports a protocol), and the honesty contract the engine
must keep. Every engine is deterministic: no model, no clock, no RNG, no DB.

### Tier 1 — built in this change

1. **Trial Schema (ICH M11 §1.2).** The harmonised protocol template requires
   a schematic of epochs, the randomisation point, arms and key timepoints in
   the Protocol Summary. Protocol-scoped grep for `schema|schematic|diagram`:
   **0**. Engine: `study-design/trial-schema.ts` — a structured model plus a
   deterministic, self-contained, accessible SVG. Refuses to draw epochs, days
   or windows the Schedule of Activities does not carry; an arm with no
   intervention is drawn and labelled, never omitted.

2. **SPIRIT 2013 conformance.** The protocol reporting standard journals,
   funders and many ethics committees expect. Present only as an eight-line
   advisory brief in `ana/reporting-guidelines.ts`; no per-item engine.
   Engine: `study-design/spirit-conformance.ts` — the 33 items as data, each
   judged from the design or the protocol document. Items evidenced only by
   the document are `not_assessable` when no document is passed — never
   `missing`.

3. **Critical-to-quality factors derived from the design (ICH E6(R3)).** The
   revised GCP expects CtQ factors identified at design, before monitoring is
   planned; TransCelerate's RACT starts from them. The RBM module carries a
   generic default catalogue (`rbm/rbm-engine.ts` `DEFAULT_CTQ_FACTORS`);
   nothing derives study-specific factors from endpoints, eligibility, the SoA,
   interventions, blinding, stopping rules or the interim design. Engine:
   `study-design/ctq-derivation.ts` — emits the RBM module's own `CtqSeed`
   vocabulary (zero duplication) with `derivedFrom` provenance on every factor
   and `ratingSource: 'default_seed'`, so a derived likelihood is never read as
   an assessed one.

4. **USDM export (CDISC / TransCelerate Digital Data Flow).** The interchange
   format the industry is converging on for digital protocols, piloted by FDA,
   consumed by Medidata, Veeva Vault Clinical, Certara and the TransCelerate
   SDR. The spine is *described* as USDM-aligned and exports nothing in USDM
   shape. Engine: `study-design/usdm-projection.ts` — a USDM-shaped object
   graph with deterministic ids. **Conformance is always reported
   `unverified`:** the CDISC JSON schema is not vendored, so the projection
   states what it maps, lists every design field with no USDM home and every
   USDM entity the design cannot fill, and claims nothing it has not checked.
   Vendoring the schema and validating against it is the next step and needs
   network access this environment does not have.

5. **Decentralised-trial profile (FDA DCT guidance 2024; EMA/HMA 2022).** A
   protocol with decentralised elements must say where each activity happens
   and address IMP shipment, remote consent, sample custody and safety
   oversight off-site. The SoA activity model has no location attribute;
   protocol-scoped grep: **0**. Engine: `study-design/dct-profile.ts` plus an
   optional `location` on `SoaActivity`. An activity with no stated location is
   `unstated` — never assumed to be at the site, and excluded from the
   off-site share's denominator.

6. **WHO Trial Registration Data Set.** The 24-item set every WHO primary
   registry (ISRCTN, ANZCTR, CTRI, jRCT, ChiCTR, DRKS) and the ICMJE policy
   require. The registration projection covers ClinicalTrials.gov and CTIS
   only. Engine: `study-design/who-ictrp-registration.ts` — sponsor, funder,
   contacts, dates, ethics approval, results and IPD statement are reported
   missing with the reason *"not carried by the study design; supplied at
   registration"*, never invented.

7. **Deviation trending and signals (ICH E6(R3) RBQM; TransCelerate KRIs).**
   Deviations are recorded and assessed one at a time; nothing trends them.
   Engine: `protocol-deviations/deviation-trends.ts` — monthly counts by
   category and severity, reportable and major-or-critical shares, ageing,
   CAPA closure lag, and three documented signal rules. `siteBreakdown` is
   reported unavailable with its reason: `protocol_deviations` carries no site
   linkage, and a site dimension is not faked.

8. **Section-level redline between protocol versions.** An amendment package
   (CTR substantial modification, 21 CFR 312.30, IRB amendment) needs a
   tracked-changes comparison. Versions are snapshotted; designs are compared;
   documents are not. Engine: `protocol-development/protocol-redline.ts` — per
   section `unchanged | modified | added | removed | reordered | retitled` with
   a line-level diff whose ops reproduce both inputs exactly, and an explicit
   note — never silent truncation — when a section is above 5,000 lines or its
   minimal diff would need more than 2,000 line edits (an edit budget, not a
   timer, so the result is deterministic); line totals are then null, not 0. The later side may
   be the working copy (`current`) — the comparison an amendment is drafted
   against — so a redline does not wait for a snapshot.

9. **Protocol export to DOCX — delivered on trunk, not by this change.** When
   this document was drafted `protocol-export` rendered Markdown only. Trunk has
   since landed the canonical export: `ProtocolDevWorkspace.tsx`
   `exportProtocol()` renders MD, DOCX and PDF from the ONE assembled Markdown
   (`GET /api/protocol-export/:id`), and that Markdown carries the Part 11
   §11.50(b) status line and finalization signature block, failing closed when
   the signature cannot be read. A second DOCX renderer was built in this
   session and withdrawn before it was pushed (commit "Withdraw the second
   protocol DOCX path"): it would have printed a finalized protocol without its
   signature and diverged from the screen. Zero duplication — the canonical
   path wins; improving the Word output means improving that one path.

### Tier 2 — exists, and the protocol build cannot reach it

The repository's recurring failure mode, again. These are wiring, not
construction, and each is a session of its own because each has a route, a
tool and a surface to land honestly:

| Engine that exists | Where | What the protocol build cannot do without it |
|---|---|---|
| BOIN dose-finding: boundaries, decision table, isotonic MTD selection | `stats/dose-finding-boin.ts` (exposed only at `/api/biostat-design-stats`) | **Wired in this change.** `SafetyDesign.doseEscalation` records the BOIN design on the spine; `study-design/dose-escalation.ts` projects it with every number from the engine (boundaries, per-cohort decision table incl. the elimination column), labels each engine default as one, and reports an escalation-phase design with no rules as `missing`. Reachable at `/api/study-design/:id/dose-escalation`, in the projections pane, and as AnA's `review_dose_escalation_design` |
| Enrollment forecasting: Poisson–Gamma accrual per site with staggered activation, dropout, seeded predictive intervals | `stats/enrollment-forecast.ts` | **Wired in this change.** `StudyDesign.accrualPlan` carries the sponsor's site plan (rates are sponsor inputs, never assumed); `study-design/enrollment-projection.ts` reports the engine's median, 80% interval, probability of reaching N and closed-form expectation, and "not reached" as null. Reachable at `/api/study-design/:id/enrollment`, in the projections pane, and as AnA's `review_enrollment_forecast` |
| Group-sequential operating characteristics and spending boundaries | `stats/group-sequential-oc.ts` | **Wired in this change.** `study-design/interim-oc.ts` computes type I error, power at the fixed design's alternative, expected information and sample size and per-look stopping probabilities for the boundaries the protocol RECORDS, solves the named spending function's, and reports every look where they differ as a discrepancy; `lan_demets` (a family) and unrecorded sidedness are gaps. Reachable at `/api/study-design/:id/interim-oc`, in the projections pane, and as AnA's `review_interim_operating_characteristics` |
| MMRM sample size and power | `stats/mmrm-design.ts` | Size the longitudinal continuous endpoint the SAP projection already names MMRM for |
| External-control borrowing: power prior, commensurate prior, tipping point | `stats/external-control.ts` | Single-arm and external-control designs the framework enum already admits |
| Multiplicity procedures: Bonferroni, Holm, Hochberg, fixed-sequence, graphical | `stats/multiplicity.ts` | Evaluate the multiplicity strategy the spine records instead of only naming it |
| Win ratio, RMST | `stats/win-ratio.ts`, `stats/rmst.ts` | Composite and time-to-event endpoint methods |

`sample-size.ts` solves continuous endpoints exactly and binary /
time-to-event on the normal approximation, with margins for non-inferiority
and equivalence reported as caveats rather than solved. The solvers above close
most of that; wiring them is the order of work below.

### Tier 3 — not built, in order

10. **Master-protocol gates.** `platform | basket | umbrella | mams` are in the
    structural-design enum; no gate reads them. FDA's master-protocol guidance
    (2022) expects sub-study independence, shared-control handling and
    interim-adaptation rules to be stated.
11. **Rare-disease and small-population design pack.** Natural-history
    controls, Bayesian borrowing, enrichment and adaptive elements as a
    coherent gate set (FDA rare-disease guidances; EMA small-populations
    guideline). The pieces exist in `stats/`; the design pattern does not.
12. **Lay summary projection.** CTR 536/2014 Art. 37 requires a plain-language
    results summary; a protocol-stage plain-language synopsis is standard
    sponsor practice and a readability gate is deterministic.
13. **Endpoint adjudication (CEC) charter** alongside the DMC charter the
    safety design already carries.
14. **Biospecimen model** — the SoA's `pk` / `biomarker` / `lab` activities
    have no specimen, volume, custody or retention attributes; the lab manual
    is derived from exactly those.
15. **Site payment schedule from SoA × budget** — the per-visit schedule a
    clinical-trial agreement needs, computable from what the budget register
    and the SoA already hold.
16. **Diversity action plan engine.** Presence is checked; representativeness
    is not measured. Measuring it needs reference epidemiology by indication
    and geography the repository does not hold. **Do not build this without
    the reference data — a representativeness figure without a denominator is
    a fabricated number.**
17. **Registry profiles over the WHO data set** (ISRCTN, jRCT, CTRI, ANZCTR
    field maps), once item 6 is on the surface.
18. **Consent versioning and re-consent tracking per participant** — the
    consent form has a version; nothing records which participants signed
    which. This is clinical-operations data and belongs with the site model,
    outside the Authoring catalog; it is listed so it is not mistaken for a
    protocol-build gap.

## A defect, not a gap

`server/routes/protocol_routes.ts` mounts `/api/protocol` (`/generate`,
`/optimize`, `/optimize-deep`, `/deep-analyze`) via
`register-clinical-intel-routes.ts`. It is the pre-spine protocol optimiser:
`protocol-optimizer-service.ts` produces an `improvementScore` and recommended
sample sizes through `openai-service` and `huggingface-service`, outside the
governed gateway, with no approved-model check. Under Rule 2 — *"a tool that
asks a model for a figure is a defect"* — and the zero-duplication rule, this
is a second protocol path that should be retired. No client code references
it. The deterministic spine is the replacement by path (`/api/study-design`,
`/sample-size`, `/validate`, the rule pack). Retirement follows the working
agreement's deletion rule — history search, replacement named in the commit,
the reachability gate — and is a separate change so it can be reviewed as one.

## Order of work

1. Tier 1, items 1–8, as pure engines with tests seen red before green
   *(this change)*, each reachable as a projection on the study-design router
   and, where it reads the protocol document, on the protocol-development
   router; each with an AnA tool that reports the engine's output verbatim
   (eight read-only tools, `ana/protocol-industry-tool-defs.ts`, all reading
   through `protocol-development/protocol-industry-service.ts` — the same
   function the routes call).
2. Item 9 — delivered on trunk by the canonical export; nothing to build.
3. The `location` attribute on `SoaActivity`, additive, so the DCT profile
   reads the design rather than an overlay *(this change)*.
4. Tier 2 wiring, one engine per session, in the table's order — dose-finding
   first because Project Optimus is the live regulatory pressure *(dose-finding
   enrollment forecasting and group-sequential operating characteristics done
   in this change; MMRM sizing is next)*.
5. Tier 3 in the order listed. Item 16 waits for reference data.
6. Retire `/api/protocol`.

## Guardrails

- Rule 0: `concept2cure-v2` only.
- Rule 2's exclusions stand: none of this is the regulatory digital twin, the
  epistemic or causal engines, federated learning or the manufacturing twin.
  Every engine here reads the design object and returns a deterministic
  result; the model narrates.
- Honest by construction, as the five existing projections are: a projection
  renders what the object carries and lists its gaps; `unverified` stays
  `unverified` until a schema is vendored and validated against.
- Zero duplication: the CtQ derivation emits `CtqSeed`; the WHO projection
  reuses the registration field vocabulary; the redline uses the `diff`
  library already in `package.json` rather than a hand-rolled LCS (the one in
  `versionDiffService.ts` imports `db` and allocates N×M); nothing
  re-implements a solver in `stats/` — dose escalation, enrollment and interim
  characteristics call the engines there for every number.
- Verify by making the check fail: every engine's test file carries at least
  two injected defects, each recorded with the assertion that caught it.
