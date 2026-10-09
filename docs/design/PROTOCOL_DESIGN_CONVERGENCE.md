# Protocol design — the leading-vendor capability is built, and unreachable

**Status:** binding design, 2026-09-22. **Prompted by:** the founder — *"the
protocol design solution is far from complete. Study what the leading vendors
in this particular space provide and add all you can add."*

## The finding

I surveyed the codebase before designing anything, because this repository has
now twice produced a capability nobody could reach. It happened again, and at
a larger scale.

**Concept2Cure already contains a complete design-as-data spine.**
`server/services/study-design/` is a USDM / ICH M11-aligned structured study
object with **five named projections** and an evidence layer. It is mounted at
`/api/study-design`, its tables are in the Drizzle schema `install-fresh`
pushes, and **165 tests across 13 files pass**.

| What it does | File |
|---|---|
| ICH M11-structured protocol, projected from the design object | `protocol-projection.ts` |
| Statistical Analysis Plan skeleton (ICH E9 / E9(R1)) | `sap-projection.ts` |
| Schedule of Activities | `schedule-of-activities.ts` |
| Trial-registry record — ClinicalTrials.gov under FDAAA 801, EU CTIS under Regulation 536/2014 | `registration-projection.ts` |
| Blank CRF set, built from the SoA | `crf-shell.ts` |
| Design gates — ICH E9 / E9(R1) / E10 / E3, M11 §2/§3/§4/§6/§7/§10/§17, estimands, multiplicity, power | `design-gates.ts`, `design-validation.ts` |
| Sample size | `sample-size.ts` |
| Operational feasibility from observed ClinicalTrials.gov base rates | `trial-feasibility.ts` |
| Study twin simulation, evidence priors, CSR evidence source | `study-twin-service.ts`, `evidence-prior.ts`, `csr-evidence-source.ts` |

That list **is** the leading-vendor feature set. Protocol digitisation feeding
downstream build is Medidata's pitch; design intelligence over the Schedule of
Activities is Faro's; structured study definitions are CDISC's Digital Data
Flow and TransCelerate's Study Definitions Repository. This platform has a
credible version of all three.

**The Protocol development surface uses none of it.** There are zero
references to `study-design` or USDM in `ProtocolDev*.tsx` or in
`server/services/protocol-development/`. The surface is built on a second,
unrelated store — `protocol_documents` plus its registers — which knows
nothing about estimands, projections, gates or feasibility.

So the honest statement of the problem is not "the protocol solution is
incomplete." It is: **there are two protocol stacks, and the founder is
looking at the weaker one.** Under this repo's first working rule — one
canonical implementation, the parallel path migrated onto it and deleted —
the answer is convergence, not construction.

## Decision

**The design object is the spine. The protocol document is its projection.**

`protocol_documents` remains what an author edits and what carries the
governed registers the spine has no opinion about — risks, milestones, team,
budget, deviations, reviews, consent, IRB. It gains a link to a study design.
Everything the spine can compute is read from the spine and never recomputed:

- the ICH M11 section set and its content, projected;
- the design gates' findings, rendered as findings on the protocol;
- the SAP skeleton, the CRF shell and the registry record offered as
  projections of the same object, not as separate documents to be written;
- feasibility and precedent shown against the design, sourced from observed
  registry base rates and never fabricated.

Two consequences follow, and both are wanted. A registry record becomes a
submission type in the unified Submission Center alongside eCTD and IRB, since
ClinicalTrials.gov registration under FDAAA 801 and a CTIS application under
536/2014 are filings. And the protocol that reaches an IRB is the projection
of the same object the statistician designed, so the two cannot drift.

## What is genuinely missing, measured against leading vendors

After the convergence, four gaps remain. All four are deterministic engines —
no model required, which is what this platform's rules demand of anything that
produces a number or a verdict.

1. **Protocol complexity and participant burden.** Nothing in the repo scores
   a design's burden (`complexity score` returns zero hits). This is the
   single clearest differentiator in the category: visit count, procedures per
   visit, invasive procedure count, total participant hours, site staff time,
   and the burden delta an amendment introduces. Computable entirely from the
   Schedule of Activities that already exists.
2. **Amendment impact and substantiality.** `protocol_amendments` records that
   an amendment happened. It does not classify it substantial or
   non-substantial under EU CTR 536/2014 Article 16, determine whether
   re-consent is triggered, or report which sites, documents and downstream
   projections the change invalidates.
3. **Eligibility criteria as data.** Criteria are free text, so nothing can
   count them, flag over-restriction, or compare them against the precedent
   trials the feasibility model already retrieves.
4. **Diversity action plan.** FDORA 2022 §3601 requires one for a pivotal
   trial, and FDA's draft guidance sets the expected content. Nothing in the
   repo addresses enrolment representativeness. This is a current, binding
   requirement that competitors are actively adding.

## Order of work

1. Link a protocol document to a study design, and surface the design gates'
   findings on the protocol. Read-only: nothing is generated yet, so the
   convergence can be proven before anything depends on it.
2. Offer the five projections from the protocol surface.
3. Burden and complexity engine over the SoA.
4. Amendment impact and substantiality.
5. Registry record as a submission type in the Submission Center.
6. Eligibility criteria as data; diversity action plan.

## Guardrails

The study twin and simulator already exist and are tested; this design does
not extend them, and `CLAUDE.md` Rule 2's exclusion of the *regulatory* digital
twin is a different subject and stays excluded. Every verdict named here is
computed by an engine. No projection may claim content the design object does
not carry — the projections are already written to be honest by construction,
and that property must survive being surfaced.
