# Protocol build — industry gaps closed (Tier 1 and the first three Tier 2 rows)

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
| USDM-shaped export, conformance **unverified** | CDISC USDM / TransCelerate DDF | `study-design/usdm-projection.ts` (+ `usdm-schedule.ts`, `usdm-types.ts`) | `…/:id/usdm` | `export_usdm_projection` |
| Decentralised-element profile | FDA DCT guidance (2024); EMA/HMA/EC (2022) | `study-design/dct-profile.ts` + `SoaActivity.location?` | `…/:id/dct-profile` | `review_dct_profile` |
| WHO Trial Registration Data Set | WHO ICTRP TRDS v1.3.1; ICMJE | `study-design/who-ictrp-registration.ts` | `…/:id/who-ictrp` | `review_who_ictrp_record` |
| Deviation trends and signals | ICH E6(R3) RBQM; TransCelerate KRIs | `protocol-deviations/deviation-trends.ts` | `GET /api/protocol-deviations/deviations/trends` | `review_deviation_trends` |
| Section redline between versions, or against the working copy | EU CTR 536/2014; 21 CFR 312.30 | `protocol-development/protocol-redline.ts` | `GET /api/protocol-development/documents/:id/redline?from=&to=` | `review_protocol_redline` |
| BOIN dose escalation from the design (Tier 2) | Liu & Yuan 2015; FDA dosage-optimization guidance (2024) | `study-design/dose-escalation.ts` over `stats/dose-finding-boin.ts` + `SafetyDesign.doseEscalation?` | `…/:id/dose-escalation` | `review_dose_escalation_design` |
| Enrollment forecast from the site plan (Tier 2) | Anisimov & Fedorov 2007 | `study-design/enrollment-projection.ts` over `stats/enrollment-forecast.ts` + `StudyDesign.accrualPlan?` | `…/:id/enrollment` | `review_enrollment_forecast` |
| Interim-analysis operating characteristics (Tier 2) | ICH E9 §4.5; FDA adaptive guidance (2019) | `study-design/interim-oc.ts` over `stats/group-sequential-oc.ts` | `…/:id/interim-oc` | `review_interim_operating_characteristics` |

Every design engine is also a `POST /api/study-design/<path>` for an unsaved
design. All eleven engines are in the Protocol Development surface's
**Projections of this design** pane (`ProtocolDevProjections.tsx` →
`ProtocolDevIndustryProjections.ts`), and every one downloads its engine output
as JSON byte for byte.

**One map drives the routes, the tools and the service:** `DESIGN_ENGINES` in
`protocol-development/protocol-industry-service.ts`. A path, a response key
and an engine cannot drift apart.

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
| `study-design/__tests__/usdm-projection.test.ts` | 25 |
| `study-design/__tests__/dct-profile.test.ts` | 44 |
| `study-design/__tests__/who-ictrp-registration.test.ts` | 24 |
| `protocol-deviations/__tests__/deviation-trends.test.ts` | 42 |
| `protocol-development/__tests__/protocol-redline.test.ts` | 45 |
| `study-design/__tests__/dose-escalation.test.ts` | 15 |
| `study-design/__tests__/enrollment-projection.test.ts` | 8 |
| `study-design/__tests__/interim-oc.test.ts` | 14 |
| `protocol-development/__tests__/protocol-industry-service.pglite.integration.test.ts` | 17 |
| `ana/__tests__/protocol-industry-tools.test.ts` | 8 |
| `client/…/__tests__/protocolDevIndustryProjections.test.ts` | 15 |

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
| USDM | a ScheduledActivityInstance pointing at a non-existent encounter | `every ScheduledActivityInstance points at an existing activity, encounter and epoch` |
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
| Service | CAPA join without its org anchor | `excludes other organisations' … CAPA` (`expected 1 to be 0`) — after strengthening the test so the only open action is another org's |
| Service | version lookup without its org filter | `a label not recorded for this org is NOT_FOUND — including one another org recorded` (`promise resolved … instead of rejecting`) |
| AnA tools | one handler unregistered | `review_protocol_redline handler registered: expected undefined to be type of 'function'` |
| Client pane | a null off-site share rendered as `0%` | `a null off-site share reads "not assessed", never 0%` |

---

## What is not done, and why

- **Adversarial review is running** (two independent lenses per engine,
  workflow `protocol-industry-engines-v2`); confirmed findings land as
  follow-up commits and are recorded in this file.
- **USDM conformance stays `unverified`.** Vendoring the CDISC USDM JSON schema
  and validating against it needs network access this environment does not
  have.
- **Nothing on screen edits a design's SoA activities**, so the new
  `location` attribute travels the channel SoA categories already travel (the
  design API and AnA drafting); the DCT profile reports every activity without
  one as `unstated`.
- **WHO item 9 (public title)** stays `missing` until the design carries a
  distinct public title (`publicTitle?` on the spine).
- **Tier 2 remaining:** MMRM sizing (needs a sponsor-assumption block:
  covariance, ρ, SD, δ, retention), external-control borrowing, multiplicity
  procedures, win ratio / RMST. **Tier 3** as listed in the design document.
- **The legacy `/api/protocol` optimizer** (model-generated figures outside the
  governed gateway) is entangled with `analytics-routes.ts`; its retirement is
  its own reviewed change under the deletion rule.
