# Protocol build — industry gaps closed (Tier 1, six Tier 2 rows, two Tier 3 items)

**Date:** 2026-09-28 · **Binding design:** `docs/design/PROTOCOL_INDUSTRY_GAPS.md`
**Prompted by:** the founder — *"What is missing in our protocol build solutions
that the industry needs but we do not yet offer? Add all. Expand."* — and, when
the Rule 2 question was raised, *"You are approved to bypass that rule."* Rule 2's
other clauses stand: every number below comes from a deterministic engine; AnA
narrates.

---

## What a protocol author can now do that they could not

| Capability | Standard | Engine (pure) | Route | AnA tool |
|---|---|---|---|---|
| Trial schema figure | ICH M11 §1.2 | `study-design/trial-schema.ts` (+ `trial-schema-svg.ts`) | `GET /api/study-design/:id/trial-schema` | `review_trial_schema` |
| SPIRIT 2013 checklist, row by row | SPIRIT 2013 (33 items, 51 rows) | `study-design/spirit-conformance.ts` (+ `spirit-items.ts`) | `GET /api/study-design/:id/spirit` (design only); `GET /api/protocol-development/documents/:id/spirit` (design + sections) | `review_spirit_conformance` |
| Critical-to-quality factors from the design | ICH E6(R3); TransCelerate RACT | `study-design/ctq-derivation.ts` | `…/:id/ctq` | `derive_ctq_factors` |
| USDM v4.0.0-shaped export, conformance **unverified** | CDISC USDM v4.0.0 (DDF-RA v4.0.0) / TransCelerate DDF | `study-design/usdm-projection.ts` (+ `usdm-schedule.ts`, `usdm-types.ts`) | `…/:id/usdm` | `export_usdm_projection` |
| Decentralised-element profile | FDA DCT guidance (2024); EMA/HMA/EC (2022) | `study-design/dct-profile.ts` + `SoaActivity.location?` | `…/:id/dct-profile` | `review_dct_profile` |
| WHO Trial Registration Data Set | WHO ICTRP TRDS v1.3.1; ICMJE | `study-design/who-ictrp-registration.ts` | `…/:id/who-ictrp` | `review_who_ictrp_record` |
| Deviation trends and signals | ICH E6(R3) RBQM; TransCelerate KRIs | `protocol-deviations/deviation-trends.ts` | `GET /api/protocol-deviations/deviations/trends` | `review_deviation_trends` |
| Section redline between versions, or against the working copy | EU CTR 536/2014; 21 CFR 312.30 | `protocol-development/protocol-redline.ts` | `GET /api/protocol-development/documents/:id/redline?from=&to=` | `review_protocol_redline` |
| BOIN dose escalation from the design (Tier 2) | Liu & Yuan 2015; FDA dosage-optimization guidance (2024) | `study-design/dose-escalation.ts` over `stats/dose-finding-boin.ts` + `SafetyDesign.doseEscalation?` | `…/:id/dose-escalation` | `review_dose_escalation_design` |
| Enrollment forecast from the site plan (Tier 2) | Anisimov & Fedorov 2007 | `study-design/enrollment-projection.ts` over `stats/enrollment-forecast.ts` + `StudyDesign.accrualPlan?` | `…/:id/enrollment` | `review_enrollment_forecast` |
| Interim-analysis operating characteristics (Tier 2) | ICH E9 §4.5; FDA adaptive guidance (2019) | `study-design/interim-oc.ts` over `stats/group-sequential-oc.ts` | `…/:id/interim-oc` | `review_interim_operating_characteristics` |
| MMRM sample size from sponsor assumptions (Tier 2) | ICH E9(R1) | `study-design/mmrm-sizing.ts` over `stats/mmrm-design.ts` + `StatisticalPlan.mmrmAssumptions?` | `…/:id/mmrm` | `review_mmrm_sizing` |
| External-control borrowing plan (Tier 2) | FDA draft guidance on externally controlled trials (2023); ICH E10 §2.5 | `study-design/external-control-plan.ts` over `stats/external-control.ts` + `StudyDesign.externalControlPlan?` | `…/:id/external-control` | `review_external_control_plan` |
| Multiplicity control over the confirmatory family (Tier 2) | ICH E9 §5.6; FDA Multiple Endpoints guidance (2022) | `study-design/multiplicity-check.ts` over `stats/multiplicity.ts` | `…/:id/multiplicity` | `review_multiplicity_control` |
| Specimens and blood volume (Tier 3) | OHRP expedited category (2) reference points; ICH E6(R3) | `study-design/biospecimen-profile.ts` + `SoaActivity.specimen?` | `…/:id/biospecimens` | `review_biospecimen_profile` |
| Master-protocol structure (Tier 3) | FDA master-protocol guidance (2022; 2023 draft) | `study-design/master-protocol.ts` + `StudyDesign.masterProtocol?` | `…/:id/master-protocol` | `review_master_protocol` |

Every design engine is also a `POST /api/study-design/<path>` for an unsaved
design. All sixteen engines are in the Protocol Development surface's
**Projections of this design** pane (`ProtocolDevProjections.tsx` →
`ProtocolDevIndustryProjections.ts`), and every one downloads its engine output
as JSON byte for byte.

**One map drives the routes, the tools and the service:** `DESIGN_ENGINES` in
`protocol-development/protocol-industry-service.ts`. A path, a response key
and an engine cannot drift apart.

### Recording the planning inputs the engines read

Six engines read inputs only a sponsor can supply: the BOIN rules, the site
accrual plan, the MMRM assumptions, the external-control plan, the
master-protocol structure, and each SoA activity's location and specimen.
Until this change nothing on screen could record them, so those engines
could only ever report "not recorded".

| Piece | Where |
|---|---|
| Strict block schemas, one per block (unknown keys refused at every depth; cross-field checks such as a start dose that is a recorded level, retention never rising, a power prior with its a0) and the pure `applyPlanningInput` (null clears a block) | `server/services/study-design/planning-inputs.ts` |
| `POST /api/study-design/:studyId/planning` — `requireEditorAccess`; reason ≥ 8 and the block validated **before** a connection is taken; tenant context set; the design read `FOR UPDATE` by `study_id` **and** `tenant_id`; written back through the one writer (`persistStudyDesignTx`); a governed-action row carrying the reason, the block and whether it was cleared; 404 and 409 roll back | `server/routes/study-design-planning.ts`, mounted in `server/routes/study-design.ts` |
| One governed `C2CForm` per block and per SoA activity, prefilled from what the design records; list fields are one entry per line with line-numbered errors; a value that does not parse is refused, never coerced; a blank optional field is left out, never defaulted; "none" states there is no shared control | `client/…/surfaces/planningInputForms.ts`, `planningStructureForms.ts`, `ProtocolDevPlanningInputs.tsx` (mounted in `ProtocolDevDesign.tsx` above the projections pane) |

The panel re-reads the design after every write, so a block shows as recorded
only once the server has confirmed it.

### Registration titles: the official title is no longer used as the lay one

The ClinicalTrials.gov projection filled the required **Brief title** — which
the PRS data element definitions describe as "a short title … written in
language intended for the lay public" (at most 300 characters) — with the
protocol's official title, and called it rendered. WHO TRDS item 9 (Public
Title, "intended for the lay public in easily understood language") could only
ever be missing. The design now carries `publicTitle?` and `acronym?`
(`study-design-types.ts`), recorded by a person and never derived from `title`:

| Consumer | Now |
|---|---|
| ClinicalTrials.gov | Brief title from `publicTitle`, else missing with the reason (the official title is not reused); Official title from `title`; Acronym (optional); each checked against the PRS limits (300 / 600 / 14) — longer is `partial` with its length, never truncated |
| EU CTIS | Public title (optional, so `registrable` keeps its meaning — see `ctisPopulationFields`) |
| WHO TRDS | item 9 renders `publicTitle`; item 10 appends a recorded acronym ("include trial acronym if available") and stays rendered without one |
| USDM | one StudyTitle per recorded title, typed official / public / acronym with C2C-INTERNAL codes (not CDISC terms); the `StudyTitle.type` always-unfilled line is retired |
| SPIRIT 1 | a recorded acronym must appear in the title; without one the gap says the design does not record whether the trial has one |

A design with no public title is now **not registrable** on ClinicalTrials.gov
where it used to look complete: the brief title was never there.

### Withdrawn, not shipped: a second protocol DOCX renderer

A structured `GET /api/protocol-export/:id/docx` was built early in this session
and withdrawn before it was pushed (commit *"Withdraw the second protocol DOCX
path"*). While it sat unpushed, trunk landed the canonical export —
`ProtocolDevWorkspace.tsx` `exportProtocol()` renders MD, DOCX and PDF from one
assembled Markdown that carries the Part 11 §11.50(b) signature block. A second
renderer would have printed a finalized protocol without its signature.

---

## Boundary and security

`protocol-industry-service.ts` is the only place these engines meet the
database. A read-only security audit of the first cut found two defects; both
are fixed in this change:

1. **The ten tools were missing from `ana/tool-authorization.register.json`.**
   An unregistered tool is `confirm, unclassified`: every call would have been
   held for a human, so the "READ-ONLY" tools could never run, and
   `tool-authorization.test.ts` failed (`expected [ 'derive_ctq_factors', …(9) ]
   to deeply equal []`). All eleven are now `read`, and
   `protocol-industry-tools.test.ts` asserts `toolAuthorizationOf(name) ===
   { class: 'read' }` for each, so the suite checks the gate, not the prose.
2. **Reads used the shared pool.** They now run on the caller's connection —
   `requestPgClient(req)` in the routes, a `setTenantContextTx` read transaction
   in AnA (`industryRead`) — so RLS is the second tenant layer; every statement
   still filters `organization_id` (`tenant_id` for the design row). The bound
   design is read through that connection with the one mapper,
   `rowsToStudyDesign`, not through the global drizzle handle.

Audit items found clean: tenant provenance (org from the authenticated request
only), the CAPA join anchored on the scoped row, input bounds, route order
(`/deviations/trends` before `/deviations/:id`), no writes, the SVG path
(every string entity-escaped; rendered as an `<img>` data URI, never
`innerHTML`). Gates run by the auditor: `ci:session-scoped-rls-bypass`,
`ci:drizzle-tenant-scope`, `ci:tenant-isolation:no-regression`,
`ci:org-path-param-guards`, `ci:server-error-leaks`, `check:security-patterns`
— all pass, none grown.

---

## Tests

| Suite | Tests |
|---|---|
| `study-design/__tests__/trial-schema.test.ts` | 21 |
| `study-design/__tests__/spirit-conformance.test.ts` | 25 |
| `study-design/__tests__/ctq-derivation.test.ts` | 25 |
| `study-design/__tests__/usdm-projection.test.ts` | 34 |
| `study-design/__tests__/dct-profile.test.ts` | 44 |
| `study-design/__tests__/who-ictrp-registration.test.ts` | 24 |
| `protocol-deviations/__tests__/deviation-trends.test.ts` | 51 |
| `protocol-deviations/__tests__/deviation-trends-rows.test.ts` | 12 |
| `protocol-development/__tests__/protocol-redline.test.ts` | 57 |
| `study-design/__tests__/dose-escalation.test.ts` | 15 |
| `study-design/__tests__/enrollment-projection.test.ts` | 8 |
| `study-design/__tests__/interim-oc.test.ts` | 14 |
| `study-design/__tests__/mmrm-sizing.test.ts` | 11 |
| `study-design/__tests__/external-control-plan.test.ts` | 9 |
| `study-design/__tests__/multiplicity-check.test.ts` | 10 |
| `study-design/__tests__/biospecimen-profile.test.ts` | 9 |
| `study-design/__tests__/master-protocol.test.ts` | 8 |
| `protocol-development/__tests__/protocol-industry-service.pglite.integration.test.ts` | 19 |
| `ana/__tests__/protocol-industry-tools.test.ts` | 8 |
| `client/…/__tests__/protocolDevIndustryProjections.test.ts` | 20 |
| `study-design/__tests__/planning-inputs.test.ts` | 13 |
| `routes/__tests__/study-design-planning.route.test.ts` | 5 |
| `client/…/__tests__/planningInputForms.test.ts` | 9 |

Regression: `server/services/study-design/__tests__` + `protocol-development/__tests__`
+ the study-design and protocol-development route suites — 44 files, 833 tests,
green; AnA registry, governance and authorization suites (906 + 51) green;
`ci:launch-scope`, `ci:launch-scope-api` pass; `ci:pushed-lint-warnings` — no file
changed its warning count.

## Verify by making the check fail

Every row: the defect was injected into the engine, the named assertion went
red, the file was restored byte for byte, and the suite re-ran green.

| Engine | Defect injected | Caught by |
|---|---|---|
| Trial schema | (four, recorded by its builder in the first run) | — |
| SPIRIT | document-only rows reported `missing` instead of `not_assessable` without a document | `reports every document-only row not_assessable — never missing` (`expected 51 to be 22`) |
| SPIRIT | a document section allowed to override a design-evidenced row | `has a judge for every design-evidenced row…` — **not** by the dedicated "never lets a document override a design-evidenced row" test, which stayed green. Flagged for the review stage as a weak test. |
| CtQ | blinding factors emitted for an open-label design (factor with no trigger) | `fires blind-maintenance and emergency-unblinding rows for a blinded design only` |
| CtQ | a rating marked `assessed` instead of `default_seed` | `marks every rating default_seed…` |
| USDM | a ScheduledActivityInstance pointing at a non-existent encounter | `every ScheduledActivityInstance points at an existing activity, encounter and epoch` (since replaced by `every id is unique and every reference in the graph resolves, for every design shape`) |
| USDM | conformance flipped to `verified` | `reports status unverified… for every design shape` |
| USDM | ids counted across calls (module-level counter) | `ids are positional and identical across two calls` |
| DCT | `unstated` treated as `site` | 6 tests incl. `never counts an unstated activity as site` |
| DCT | empty stated set → share 0 instead of null | `is null — not 0 — with a stated reason…` |
| WHO | an invented sponsor for item 5 | `registration-only items are always missing with the exact gap` |
| WHO | 23 items | `to have a length of 24 but got 23` |
| WHO | public title reusing the scientific title | `public title is missing when the design carries no distinct one` |
| Deviation trends | empty input → share 0 instead of null | `empty input: … both shares null` |
| Deviation trends | spike declared on one prior month | `with only one prior month in the window nothing is declared` |
| Deviation trends | unknown CAPA counts reported as a number | `CAPA counts not supplied → … null with a note, not 0` |
| Redline | ops no longer rebuild the inputs | `edit between a common head and tail` (`expected 'intro\nold' to be 'intro\nold\noutro\n'`) |
| Redline | a same-length edit reported unchanged | `an edited section is modified, with a diff and exact counts` |
| Redline | silent truncation at the cap | `above the cap: modified, no diff, … and a note` |
| Dose escalation | λ replaced by the 0.6φ/1.4φ heuristic (not BOIN) | `reproduces the published BOIN boundaries for φ = 0.3` (`expected 0.056 to be less than 0.001`) |
| Dose escalation | an engine default labelled `design` | `labels φ1, φ2 and the elimination threshold as engine defaults` |
| Enrollment | an unreachable target reported as a raw number | `sites with no capacity are "not reached": null times…` |
| Enrollment | the provenance clock reading kept in the output | `is a function of the design alone: no clock reading` |
| Interim OC | recorded boundaries silently replaced by the solved ones | `recorded boundaries … evaluated` (`expected 'solved' to be 'recorded'`) and `a recorded boundary that departs…` (`expected 2.963 to be 2.5`) |
| Interim OC | unrecorded sidedness taken as one-sided without a gap | `unrecorded sidedness is solved at alpha/2 and said to be an assumption` (`expected 0.05 to be 0.025`) |
| MMRM | the engine's 0.90 power default allowed to stand in for an unrecorded power | `no target power: nothing is sized` (`expected { nPerArm: 179, … } to be null`) |
| MMRM | a planned-N shortfall reported as covered | `a planned N below the requirement is reported with the shortfall` (`expected 'rendered' to be 'partial'`) |
| External control | a fixed power-prior discount scored as a conflict plan | `a fixed power-prior discount is not a conflict plan` (`expected 'rendered' to be 'partial'`) |
| External control | a borrowing ratio approximated for a fully external control | `a fully external control has no ratio to compute` (`expected 'hybrid' to be 'fully_external'`) |
| Multiplicity | Holm silently replaced by testing each hypothesis at full alpha | `Holm holds the family-wise error at alpha…` and two allocation tests |
| Multiplicity | a graphical procedure approximated by Holm | `a graphical procedure without weights and a transition matrix is not approximated` (`expected 'rendered' to be 'partial'`) |
| Biospecimens | a missing blood volume defaulted to a "usual" 5 mL | `a draw with no volume makes totals lower bounds…` (`expected false to be true`) |
| Biospecimens | conditional draws counted as scheduled | `sums recorded volumes per visit… conditional draws only in the upper bound` |
| Master protocol | an absent shared control read as "none" | `absence of a shared control is not stated; null states there is none` |
| Master protocol | the arm-existence check disabled | `an arm the design does not carry, a duplicate id and a one-user shared control are defects` |
| Service | `assessed_at` not passed to the engine | `reads assessed_at: a pre-fix minor / false is an assessment only when one is on record` (`expected +0 to be 1`) |
| Deviation vocabulary | a severity admitted that the union does not have | `category "Consent" and severity "high" count as uncategorised / unassessed` and `an unassessed deviation is counted … never as minor` |
| Snapshot | `snapshotVersionTx` without the `section_key` tie-break | `sections tied on order_index are ordered the same way…` (`expected [ 'b_rationale', 'a_background' ] to deeply equal [ 'a_background', 'b_rationale' ]`) |
| Service | the working-copy read back on an `id` tie-break | same test (`reordered`/`moved` non-zero) — **survived at first**, when the fixture's id order matched key order; caught after writing the sections in the opposite order |
| Titles | CT.gov brief title from the official title again | `never shows the official title as the lay brief title…` and the length test |
| Titles | PRS length limits not applied | `a title longer than ClinicalTrials.gov accepts is partial with its length, never truncated` |
| Titles | WHO item 9 back to always missing; item 10 drops the acronym | `item 9 renders a recorded public title; item 10 carries a recorded acronym…` |
| Titles | USDM public title typed as official; an official title invented from the public one | `emits a recorded public title and acronym as their own typed titles…`, `no official title: no official StudyTitle is invented from the public one` |
| Titles | SPIRIT 1 ignores a recorded acronym | `checks a recorded acronym appears in the title…` |
| Service | CAPA join without its org anchor | `excludes other organisations' … CAPA` (`expected 1 to be 0`) — after strengthening the test so the only open action is another org's |
| Service | version lookup without its org filter | `a label not recorded for this org is NOT_FOUND — including one another org recorded` (`promise resolved … instead of rejecting`) |
| AnA tools | one handler unregistered | `review_protocol_redline handler registered: expected undefined to be type of 'function'` |
| Client pane | a null off-site share rendered as `0%` | `a null off-site share reads "not assessed", never 0%` |
| Planning write | the editor gate removed from the route | `refuses a viewer` (`expected 200 to be 403`) |
| Planning write | `FOR UPDATE` removed from the read | `reads the design FOR UPDATE, tenant-scoped…` |
| Planning write | the `tenant_id` predicate removed | same test — **survived at first** (the params were still asserted); caught after asserting the predicate itself |
| Planning write | the reason check skipped | `refuses a short reason and an invalid block… before a connection is taken` (`expected 200 to be 400`) |
| Planning schema | `.strict()` dropped from a nested dose level | **survived at first**; caught by the added `refuses an unknown key inside a nested entry` |
| Planning forms | a non-number coerced to 0 | four parser tests, incl. `refuses a non-number with its label` |
| Planning forms | a blank optional field defaulted to 0 | five tests, incl. `leaves a blank optional field out rather than defaulting it` |
| Planning forms | "none" kept as an arm name | `"none" states no shared control` (`expected 'none' to be null`) |

---

## Adversarial review of the Tier 1 engines

Every Tier 1 engine was reviewed by two independent agents with distinct
lenses — honesty/determinism/duplication, and regulatory-domain
correctness/test strength — each told to refute, to verify with probes, and to
report only what it reproduced. Every blocking and major finding went to a fix
agent, which reproduced it, fixed it, pinned it with a test seen failing, and
re-ran verify-by-failing. Landed so far:

| Engine | Blocking/major found | Notable | Tests after | Mutants caught |
|---|---|---|---|---|
| Trial schema | 13 | a shared epoch id drew visits in both epochs; crossover drawn as combination therapy through the washout; XML-illegal characters broke the SVG | 36 (was 21) | 19, incl. every mutant the reviewers showed survived |
| SPIRIT | 13 (+10 minor) | **SPIRIT 2013 superseded by SPIRIT 2025** — now stated on every output; title terms matched as raw substrings scored unrelated sections `met`; a DMC charter with no `present` read as "no DMC"; rows the engine admitted it could not see scored `met` | 68 (was 25) | 20 |
| CtQ | 5 blocking/major ×2 lenses | an unrecorded blinding produced two CRITICAL blinding factors; exclusion-criterion risk text pointed the wrong way; a second rating vocabulary contradicted the RBM catalogue (three rows now take the catalogue's rating; `ratingFrom` names the source) | 43 (was 25) | 10 |

| DCT profile | 10 (1 blocking) | duplicated activity ids took whichever location came last in the array — order-dependent and fabricated; a cell naming an undefined visit was dropped silently; an epoch "undefined" was invented; IMP, PK and consent rules covered only some off-site locations (`DCT-IMP-HOME` is now `DCT-IMP-OFFSITE`) | 61 (was 44) | 10 |

| WHO TRDS | 7 major (+ minors) | a name-only intervention rendered item 13 complete; every SoA visit — even an unresolved visit id — was presented as an outcome timepoint; the item list was frozen only shallowly; item 11 ignored the accrual plan's site countries; the phase and assignment fallbacks were untested | 47 (was 24) | 16 |

| Deviation trends | 8 (1 blocking) | **the replaced writer's defaults were read as assessments**: before 2026-09-24 it stored `minor` / `other` / `is_reportable false` when nobody had assessed, so ten such rows read as "0% reportable over 10 determined" and could manufacture a DEV-SEVERITY-RISE. They are now set aside, counted in `legacyDefaults`, kept out of the shares and named — and the service now passes `assessed_at` so an assessment on record is recognised; unrecognised categories and severities were passed through; rows dated after today were aged; a `Math.max` spread overflowed on large inputs | 63 (was 42) | 19 |

The deviation vocabularies (category, severity, status, CAPA status) had four
copies — the service's validators, the route's zod enums, the trend engine and
the logic module's types. The logic module now exports the one list of each,
Record-keyed against its union, and the others import it.

| USDM | 10 (blocking: crossover) | **a crossover was exported as both arms receiving both drugs throughout**: every arm got one StudyElement spanning every treatment epoch. Placement is now made only for a concurrent model (parallel, single-arm, factorial) with exactly one treatment epoch; otherwise no element is built and both ledgers say why. **The graph mixed USDM versions** — v3-era `studyPhase` on StudyVersion beside v4 classes; it is now aligned to v4.0.0 throughout, every emitted class pinned to the attribute names transcribed from DDF-RA v4.0.0 `USDM_API.json` (28 classes, checked by script, 0 mismatches). An absent estimand population matched an absent analysis population as `''`; two baseline visits anchored timing on the first; absent coded values became a Code for `"undefined"`; a missing blinding level became open-label | 34 (was 25) | 20 |

The USDM output shape changed with the move to v4.0.0 (interventions now live
on the StudyVersion, `interventionModel` is `model`, `studyPhase` is on the
design as an AliasCode). The one client consumer, `usdmView` in
`ProtocolDevIndustryProjections.ts`, reads interventions from the version; its
test pins that (`expected 'None exported.' to be 'StudyIntervention_1 — Drug X
10 mg'` when pointed back at the design).

| Redline | 9 major (2 fabrication) | **a cap note claimed a method that did not produce the counts**: counts found by the linear no-shared-line pass were described as "a minimal line diff found within 200 edits"; the note now names the method actually used. The tie warning ("this move may reflect row order") sat only on moved sections, and on ties with a section only one version has, which cannot move anything; it is now on every tied shared section and listed in `summary.positionsFromRowOrder`. The header said 21 CFR 312.30 requires a marked-up protocol; it says EU CTR 536/2014 Annex II asks for track changes and a 312.30 amendment must describe the change. Seven weak tests (titleless / statusless rows, NaN order, a missing version label, statusChanged, retitled > reordered, the capped budget boundary) now each fail under their mutant | 57 (was 45) | 15 |

**The redline's root cause, fixed at the source.** `snapshotVersionTx` and
`finalizeProtocolTx` read sections `ORDER BY order_index` with no tie-break, and
the working-copy read broke ties by `id`. An UPDATE writes the new row version
at the end of the heap, so two sections sharing an `order_index` could be listed
in opposite orders by a snapshot and the working copy, and the redline reported
a move nobody made. All three reads now order by `order_index, section_key, id`.
Pinned end to end through the real `snapshotVersionTx` (`sections tied on
order_index are ordered the same way in the snapshot and the working copy`),
which fails if either side loses the tie-break.

AnA's `review_protocol_redline` note said "a section carrying a note has no
diff"; a tie note sits beside a diff, so that was false. It now says what a note
can mean and to report `positionsFromRowOrder` beside any moved verdict.

## Adversarial review of the Tier 2/3 wirings and the planning-inputs path

Workflow `protocol-tier23-review`: five units, one reviewer each applying both
lenses (honesty/determinism/duplication; domain correctness, maths and test
strength — and security for the write path), then a fixer per unit for every
blocking and major finding. Defects the reviewers found inside the canonical
`server/services/stats/` engines were held for a separate fix-and-verify pass,
because those engines have other consumers.

| Unit | Blocking/major | Notable | Tests after | Mutants caught |
|---|---|---|---|---|
| Enrollment + MMRM | 14 (2 blocking) | **a site with no rate CV or activation time was forecast as the most favourable case** (no between-site variability, every site open on day 0) and called rendered — now a gap, no forecast; **an unrecorded allocation was sized at the engine's 1:1** — a 2:1 trial was reported covered at 358 when it needs 404; non-inferiority and equivalence frames were sized as two-sided superiority; a one-sided alpha ≥ 0.5 was clamped to 0.999; when some simulations never reached the target, conditional medians of 7.9e56 were shown as rendered; a 20,000-patient, 150-site plan blocked the event loop for 28 s (now a stated work budget) | 55 | 37 of 38 (the survivor differs only for one-sided alpha in (0.4995, 0.5); removing the guard is caught) |

## What is not done, and why

- **Adversarial review is complete** for all eight Tier 1 engines (workflow
  `protocol-industry-engines-v2`: 29 agents, two lenses per engine, every
  blocking and major finding reproduced, fixed and pinned). The Tier 2 and
  Tier 3 wirings have not yet had the same two-lens review.
- **A second line-diff engine exists**: `versionDiffService.ts` `diffText` uses
  the same line rule with an N×M LCS. Moving `splitContentLines` and the run
  counting into one pure line-diff module and making `diffText` delegate is its
  own change (it touches `document-analysis.ts` callers).
- **USDM conformance stays `unverified`.** Vendoring the CDISC USDM JSON schema
  and validating against it needs network access this environment does not
  have.
- **An activity's location and specimen are recorded one activity at a time**
  (the planning-inputs panel); the SoA grid itself is still edited through the
  design API and AnA drafting. The DCT profile reports every activity without
  a location as `unstated`.
- **A public title and acronym can be carried by the design but not yet
  entered on screen**: they travel the design API and AnA drafting until the
  planning-inputs panel gains a titles block (after that path's adversarial
  review lands).
- **Win ratio / RMST are deliberately not wired**: analysis-on-data engines have
  nothing to compute before data exist; see the design document's Tier 2 table. **Tier 3** as listed in the design document.
- **The legacy `/api/protocol` optimizer** (model-generated figures outside the
  governed gateway) is entangled with `analytics-routes.ts`; its retirement is
  its own reviewed change under the deletion rule.
