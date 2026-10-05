# b3-writing-gate-register — regulatory facts relied on

Step: the Writing Precision Gate's claims dimension gets a `submission` register
(default for `critique_draft`, `verify_revision`, `critique_document`) whose
terms-of-art table (`SUBMISSION_TERMS_OF_ART` in
`server/services/ana/promotional-screening.ts`) drops a lexicon hit only when the
hit lies inside a named regulatory term of art. Each entry carries an `E3Basis`.

Regulator sites are blocked for WebFetch in this environment. "regulator-text"
below means a regulator-hosted URL returned by WebSearch on 2026-10-04 whose
title or search extract carries the wording; it is not a full-text read.
"recall" is model knowledge, not verified against regulator text.
"platform-convention" is a drafting convention, not a regulatory requirement.

| Entry (category) | What it exempts | Basis | Confidence | Source |
|---|---|---|---|---|
| Breakthrough Therapy designation (superiority) | `Breakthrough Therapy designat…/status` | FD&C Act 506(a) as amended by FDASIA §902: Breakthrough Therapy is a statutory designation FDA grants | regulator-text, checked 2026-10-04 | https://www.fda.gov/regulatory-information/food-and-drug-administration-safety-and-innovation-act-fdasia/fact-sheet-breakthrough-therapies |
| BSC / BOR (superiority) | `best supportive care`, `best overall response` | FDA clinical review memorandum uses RECIST v1.1 best overall response (BOR) definitions; the verifier's 2026-10-04 search also found "best supportive care" usage in FDA review documents. My own search confirmed the BOR wording at this URL; BSC at this URL rests on the verifier's search | regulator-text, checked 2026-10-04 | https://www.fda.gov/media/194468/download |
| BCVA (superiority) | `best corrected visual acuity` | Standard ophthalmology efficacy endpoint | recall | none |
| Optimal dose (superiority) | `optimal dose/dosage/dosing` | FDA oncology dosage-optimization guidance ("Optimizing the Dosage of Human Prescription Drugs and Biological Products for the Treatment of Oncologic Diseases", 2024) and Project Optimus language about the optimal dose. The search returned the FDA radiopharmaceutical dosage-optimization page but the "optimal dose" phrasing came from non-regulator sources | recall | related regulator page: https://www.fda.gov/regulatory-information/search-fda-guidance-documents/oncology-therapeutic-radiopharmaceuticals-dosage-optimization-during-clinical-development |
| Superiority hypothesis (superiority, unsupported_comparative) | `superior` only within 80 characters (no `.`, `;` or `:` between) after a hypothesis or objective frame: `objective(s)/aim(s)/purpose/goal/hypothesis/designed/powered/intended (was/is/were/are) to demonstrate/show/establish/test (whether/that)`, `tested whether`, `hypothesized that`. A bare `objective` is not a frame ("objective response rate … superior" stays flagged), and neither is a stated result ("results continue to demonstrate that drug X is superior") | ICH E9 §3.3.1 "Trial to Show Superiority". The search confirmed the regulator-hosted E9 guidance and its §3.3 "Type of Comparison"; §3.3.1 wording was not visible | recall | https://www.fda.gov/media/71336/download |
| Cure endpoints (causal_overreach) | `clinical/microbiological cure` followed by `rate/at/endpoint/visit/assessment/was assessed…`, `rate/proportion of (patients with) cure`, `cure rate`, `test-of-cure`. "a clinical cure for hepatitis C" stays flagged | FDA cUTI guidance: clinical and microbiological response at the test-of-cure visit is the efficacy endpoint (found by the verifier's search 2026-10-04). My search confirmed the same endpoint at an FDA multidiscipline review (overall success = clinical cure plus microbiological eradication at the TOC visit) | regulator-text, checked 2026-10-04 | https://www.fda.gov/files/drugs/published/Complicated-Urinary-Tract-Infections---Developing-Drugs-for-Treatment.pdf ; https://www.accessdata.fda.gov/drugsatfda_docs/nda/2019/209445Orig1s000MultidisciplineR.pdf |
| Pathogen eradication (causal_overreach) | `(baseline) pathogen/organism/isolate/uropathogen(s) was/were (…ly) eradicated`, `microbiologic(al) eradication`. "Bacterial infections are eradicated by drug X" stays flagged | FDA guidance "Microbiology Data for Systemic Antibacterial Drugs" asks sponsors to correlate clinical cure with microbiologic eradication rates | regulator-text (search extract), checked 2026-10-04 | https://www.fda.gov/media/77442/download |
| PK elimination (causal_overreach) | `eliminated (…ly) (unchanged) by/via/through/in (the) renal/hepatic/biliary/urine/faeces/metabolism/excretion/kidney/liver`, `renal/hepatic/biliary elimination`, `elimination half-life/rate/constant`. "eliminated tumour recurrence in patients with renal impairment" stays flagged | Pharmacokinetic elimination route or clearance, not a curative claim | platform-convention | none |
| Diagnosis by method (causal_overreach) | `biopsy/histolog…/patholog…/cytolog…/culture/radiograph…-proven` | Eligibility criterion wording (diagnosis confirmed by a named method) | platform-convention | none |
| Consent statement (absolute) | `all/every patient(s)/subject(s)/participant(s)` + optional short locative (`in/at/from/of` + up to 3 words, no `and/or/who/that/which/were/was/had/have/has`) + `provided/gave/signed (written/oral) (informed) consent` | ICH E3 §5.3 "Patient Information and Consent": the CSR states how and when informed consent was obtained. Confirmed by the reviewer's WebSearch on 2026-10-04: §5.3 covers consent only | regulator-text, checked 2026-10-04 | https://www.fda.gov/media/84857/download |
| Disposition census (absolute) | same subject + `received/completed/were randomized/enrolled/included/dosed/treated/followed/will be followed/contacted/dosed/treated`, verb adjacent to the subject, and no outcome word later in the sentence, matched as stems (`without (any) relapse/recurrence/progression/disease`, `with no`, `none`, `successful…`, `respond…/response…/responder…`, `remission`, `cure(d)/cures`, `recover…`, `achiev…`, `improv…`, `benefit…`, `relaps…`, `recurr…`, `healed`, `survived`). Outcome verbs ("responded", "achieved", "works in"), any verb after a conjunction, and "All patients completed treatment without relapse / with no relapse", "were treated successfully", "received drug X and improved / benefited / none relapsed" are NOT exempt. Deliberate false positive (fail closed): "All patients completed the study with no protocol deviations" | ICH E3 §10.1 "Disposition of Patients" (accounting for all patients entered). Not regulator-verified here; earlier this row wrongly cited §5.3 as regulator-text for these verbs | recall | none |
| AE outcome (absolute) | `resolved completely`, `completely resolved`, intransitive only: the clause ends (`.`, `;`, `,`, `)`) or a time point or qualifier follows (`without`, `on`, `within`, `after`, `before`, `following`, `at`, `over`, `during`, `in <number>`, `by Day/Week/Month/Visit/Cycle`, `by the end/time/next/final/last`, `by <number>`). "Drug X completely resolved the disease", "resolved completely the symptoms" and "was completely resolved by drug X" (an object or an agent) are NOT exempt (review round 3, 2026-10-05) | Adverse-event outcome term | platform-convention | none |

## Composed lexicon (not new facts)

The submission register also calls
`server/services/clinical-regulatory-evidence/governance.ts` `detectUnsupportedClaims`
(pure; no DB, no LLM). Its hits become high `claims` findings tagged
`regulatory_outcome`. The gate fails closed on approval matches (`will/would/is
likely to (be) approv…`): it keeps every one unless its only approvers are named
protocol-governance bodies (a deny-list, platform-convention): the sponsor, an
IRB/IEC, an (independent/local) ethics committee or institutional review board, a
Safety Review / Data Monitoring / Data (and) Safety Monitoring / Steering / Dose
Escalation Committee or Board, an SRC, DSMB, (I)DMC, Medical Monitor or
(principal) investigator. For the passive form the agent after `by` must be such
a body, and any coordinated agent (`and`, `or`, `,`, `/` followed by `by`, a
determiner or a capitalised word) must be one too, and the rest of the clause after
the last body must not start with `'s`, `-` or `(`/`[` or hold a later `by`
("approved by the IRB, then by FDA", "by the sponsor's target date", "by the
sponsor-requested action date", "by the sponsor (FDA)" are kept; review round 3).
"approved by the IRB and FDA" is kept; "approved by the IRB and submitted to FDA" is dropped. For the active form
the subject right before the verb must be such a body, with the same rule for
coordinated subjects ("FDA and the sponsor will approve" is kept). Anything else is
kept, including a date ("by the end of 2027", "by Q3 2027", "by year-end"), a
regulator the platform has no list for ("by MHLW", "by the Food and Drug
Administration", "by CDER", "by Swissmedic") and a passive with no agent ("Drug X
will be approved for this indication."). The earlier version of this filter was an
allow-list of regulators and failed open on every one of those sentences (review of
2026-10-05; locked by tests in `writing-gate-regulatory-register.test.ts`).

Why MHLW matters: in Japan the PMDA reviews the application, and the Minister of
Health, Labour and Welfare grants the approval. Source: PMDA "Regulations and
Approval/Certification of Medical Devices" (WebSearch extract, regulator-text,
checked 2026-10-05), https://www.pmda.go.jp/english/review-services/reviews/0004.html ;
PMDA FAQ https://www.pmda.go.jp/english/about-pmda/0004.html .

Deliberate false positives (fail closed): "In Cohort B, the SRC will approve" (a
comma after a capitalised word reads as a coordinated subject); "Dose escalation
will be approved following SRC review" (no `by`); "approved by the investigator's
IRB" and "approved by the IRB by the end of 2026" (a possessive or a later `by`). Known fail-open edges: "Drug X
will be approved by the sponsor in 2027" (the sponsor is on the deny-list) and
"approved by the sponsor in consultation with FDA" (an agent that is not
coordinated by and/or/comma/slash is not read).

Narrowing the governance pattern itself
(`governance.ts:85`) would change post-processing too, so that belongs to the
evidence/reasoning lane.

## Not covered

- Lexicon gap, both registers, predates this step: `cured` and a bare `all` are
  not lexicon terms, so "All patients received drug X and all were cured." gives
  no claims finding (the census span correctly exempts only "All patients
  received"). Widening the causal-overreach lexicon is a separate change to the
  promotional register.

Left flagged:

- "Idarucizumab reverses the anticoagulant effect of dabigatran" (a labelled
  reversal-agent indication) still gives a high causal_overreach finding. The
  verified change did not list it, and an exemption for `reverses` needs its own
  basis.
