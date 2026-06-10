# Design handoff — the design-as-data spine and its projections

> From: backend (study-design module). To: design (Concept2Cure.RI design system).
> Scope: the surfaces the shipped `study-design` backend now requires. The backend is
> stable, tested, and honest by construction; it has no UI. This handoff is the contract a
> surface is designed against. Date: 2026-06-04.

---

## 1 · The one idea the UI exists to express

A study is **one structured object**, not a pile of documents. The protocol, the SAP, the
Schedule of Activities, the registration record, and the CRF are all **projections** of that
object. Edit the design once and every projection re-renders — they cannot disagree, because
they read the same object. That "the value agrees everywhere" property is the product, and
the UI's job is to make it legible.

The second idea is **honesty**. No projection ever fabricates content. Where the object is
silent, the projection says so — a section is `partial`/`missing` with an explicit gap, a
registry field is a gap, a CRF item is a `placeholder`. The UI must give every one of these
"not yet specified" states a calm, first-class treatment. A blank is never dressed up as done.

---

## 2 · What is backend-stable now

| Capability | Function | Standard | Status |
|---|---|---|---|
| Defensibility validation | `validateDesign` | ICH E9(R1), E10, M11 | shipped |
| Protocol projection | `projectProtocol` | ICH M11 | shipped |
| SAP skeleton projection | `projectSap` | ICH E9 / E9(R1) | shipped |
| Schedule of Activities | `projectScheduleOfActivities` | ICH M11 §7 / CDASH | shipped |
| Registration record | `projectRegistration` | FDAAA 801 (PRS) + EU CTR 536/2014 (CTIS) | shipped |
| CRF shell | `projectCrfShell` | CDISC CDASH | shipped |
| Probability of success | `simulateTrial` / study twin | seeded Monte Carlo + provenance | shipped |
| Sample size / assurance | `solveSampleSize` | power + Bayesian assurance | shipped |

All are pure and deterministic (same input → same output), carry `projectedFromObject: true`,
and run with no network or model.

---

## 3 · API surface

Mounted at `/api/study-design`, behind auth (every call is tenant-scoped). Read-only
projections take the design in the body and return the projection; the `GET /:studyId/*`
variants load a persisted design and project it.

| Method · path | Body | Returns |
|---|---|---|
| `POST /validate` | `{ design }` | `{ validation }` |
| `POST /simulate` | `{ design, plannedEffect?, observations?, useCsrEvidence?, seed?, … }` | `{ summary, provenance, … , evidence }` |
| `POST /sample-size` | `{ design, plannedEffect?, targetPower?, targetAssurance?, … }` | `{ sampleSize, evidence }` |
| `POST /protocol` | `{ design }` | `{ protocol }` |
| `POST /sap` | `{ design }` | `{ sap }` |
| `POST /schedule-of-activities` | `{ design }` | `{ scheduleOfActivities }` |
| `POST /registration` | `{ design, registry?: 'ctgov' \| 'ctis' \| 'both' }` | `{ registration }` or `{ registrations: { ctgov, ctis } }` |
| `POST /crf-shell` | `{ design }` | `{ crfShell }` |
| `POST /persist` | `{ design, reason }` (governed) | `{ studyId, …audit, validation }` |
| `GET /` | — | `{ designs: [...summaries] }` |
| `GET /:studyId` | — | `{ design, validation }` |
| `GET /:studyId/{protocol\|sap\|schedule-of-activities\|registration\|crf-shell}` | — | `{ <projection>, validation }` |

Types live in `server/services/study-design/` — import them; do not redeclare.

---

## 4 · Per-projection contract and what the UI must render

### 4.1 Validation (`DesignValidationReport`)
`{ riskLevel: 'low'|'medium'|'high'|'critical', canAdvance, blocksApproval, counts{critical,major,minor,info}, findings[], summary, standardsChecked[] }`.
Each finding: `{ code, section, severity, title, detail, standard?, endpointName?, suggestedFix? }`.

The UI needs: a risk badge; a findings list grouped by section (§2 Estimands, §3 Endpoints,
§4 Framework, §6 Sample size, §7 Schedule of Activities, §10 Statistical plan), severity-ranked
worst-first, each with its suggested fix; and a clear read of `canAdvance` / `blocksApproval`
(these gate `qc → approved`).

### 4.2 Protocol and SAP (`ProtocolDocument`, `SapDocument`)
Both are `{ title, sections[], completeness{rendered,partial,missing,total,percent}, standard, projectedFromObject }`.
Each section: `{ number, title, content, status: 'rendered'|'partial'|'missing', gaps[] }`.
Protocol is the ICH M11 order (sections 2–9); SAP is the ICH E9 order (12 sections). The
estimand section is **identical** in both — they share one renderer, so do not let the two
surfaces present it differently.

The UI needs: a section list with a per-section status chip, the rendered content, an inline
gap list per partial/missing section, and a document completeness meter (`percent`).

### 4.3 Schedule of Activities (`SoaProjection`)
`{ present, epochs: [{epoch, visitIds[]}], visits[], rows: [{activity, cells: (cell|null)[], scheduledCount}], footnotes[], counts{epochs,visits,activities,scheduledCells}, gaps[], completeness{satisfied,total,percent} }`.
Each grid cell: `{ state: 'performed'|'conditional'|'optional', mark: 'X'|'C'|'O', footnoteIds[] }`.

The UI needs: the time-and-events **grid** — visit columns grouped under epoch headers,
activity rows grouped by category, the body marking X / C / O with footnote superscripts, a
footnote list below, and the gap list (uncovered endpoints, integrity issues). `present:false`
is the empty state. The grid is the canonical artifact here; it deserves the most design care.

### 4.4 Registration (`RegistrationRecord`, per registry)
`{ registry, standard, modules: [{name, fields[]}], gaps[], completeness{requiredRendered,requiredTotal,percent}, registrable, projectedFromObject }`.
Each field: `{ name, value: string|null, status: 'rendered'|'partial'|'missing', required, gap? }`.

The UI needs: the registry record laid out by module, each field showing its value or its gap,
required fields visually distinct, and a completeness meter. **Framing note:** `registrable`
will read `false` for any design, because a registry record needs operational fields a design
object does not carry (sponsor, dates, sex/age, EU member states). Do **not** frame the meter
as "ready to submit." Frame it as "how much of the registry record the design fills" and treat
the gaps as the to-do list to finish in PRS/CTIS. CT.gov and CTIS render side by side from one
design — a useful "submit to both, once" story.

### 4.5 CRF shell (`CrfShell`)
`{ forms: CrfForm[], counts{forms,items,designDerivedForms,standardScaffoldForms,visitScheduledForms}, gaps[], completeness{satisfied,total,percent}, standard, projectedFromObject }`.
Each form: `{ name, origin: 'design'|'standard', cdashDomain?, visitIds[], items[], sourceActivityId?, sourceEndpointNames?, note? }`.
Each item: `{ prompt, type: 'text'|'number'|'date'|'boolean'|'category', cdashVar?, units?, derivedFrom, placeholder? }`.

The UI needs: a form tree (one node per CRF), each form tagged design-derived vs standard
scaffold, scheduled at its visits (cross-link to the SoA columns), with its items; `placeholder`
items and the gap list flag where the design must say more.

### 4.6 Simulation and sizing
`simulate` returns `summary.probabilityOfSuccess` (0–1) plus `provenance` (seed, method,
engine version, input hash). It returns **422 `CANNOT_SIMULATE`** for a design it will not fake
(single-arm, no sample size, no effect prior) and **400 `NO_PRIOR`** when no effect prior can
be formed. `sample-size` returns power-based and assurance-based n, with assurance ≥ power n.

The UI needs: the probability with its provenance (a "reproducible — seed N" affordance), and
honest empty/again states for the 422/400 cases — never a fabricated number.

---

## 5 · The honest states the design system must own

Every projection speaks the same small vocabulary. Design one calm treatment for each, reused
everywhere:

- **`rendered` / `partial` / `missing`** section and field states (chips, not red alarms).
- **Gap** — a one-line "what the design must add for this to be reviewer-ready." First-class,
  never hidden.
- **Finding** — a validation deficiency with a severity and a suggested fix.
- **`placeholder`** — a CRF item the design has not yet specified.
- **Completeness meter** — `percent`, framed per surface (document completeness; design-derived
  registry coverage; CRF grounding).
- **Provenance** — `projectedFromObject: true` and the simulation seed: the "this is computed,
  not authored / reproducible" badge.

---

## 6 · Constraints (from `README.md` / `CLAUDE.md`, non-negotiable)

Sentence case everywhere. No emoji, no exclamation marks, no cheerleading. Body 13px, titles
18–24px. Claude orange (`#d97757`) is the only strong color, one focal point per screen. 200ms
ease-out motion, no bounce. Lucide icons only. Second person ("you"). Numbers over adjectives.
All projection copy already follows this; match it.

---

## 7 · Open questions for the designer

1. **Edit vs view.** The design object is the single editable source; the six projections are
   read-only views of it. Where does editing live — a structured design editor with live
   projection previews, or per-projection inline edits that write back to the object?
2. **The SoA grid.** Is it a read-only rendered grid in v1, or directly editable (add visit,
   add activity, toggle a cell)? Editing implies write-back to the design object and a governed
   persist.
3. **"Agrees everywhere."** How do we show that one edit re-rendered five artifacts — a shared
   completeness rail, a diff-on-edit affordance, or just trust?
4. **Registry framing.** Confirm the `registrable`/completeness framing in §4.4 reads right.
5. **Density.** These are dense, professional artifacts (a 12-section SAP, a wide SoA grid).
   Confirm the density target against the home/MDX surfaces already shipped.

---

## 8 · Out of scope here

Persistence is a governed mutation (`POST /persist`, reason required, audited) — the write UX
(reason capture, e-sign) reuses the existing governed-action patterns, not new design. The
intelligence/ML surfaces (precedent benchmarking, the probability-of-success model output) are
gated on the corpus workstream in `GA_READINESS_PLAN_STUDY_PROTOCOL_2026-05-29.md` §4 and are
not part of this handoff.
