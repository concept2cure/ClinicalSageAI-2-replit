# Surface consolidation — the never-3-of-anything pass the UI never got

**Status: awaiting a decision per cluster. Nothing here has been merged or deleted.**

The zero-duplication doctrine (D1–D11) was applied hard to services, routes and
tables. It was never once applied to surfaces. This document is that pass: it
names, per cluster, which surface should survive and what should fold into it —
so the decision is made deliberately rather than by whoever edits next.

## The number, honestly

| | Count |
|---|---|
| Registry ids in `surfaceViews.ts` | 118 |
| Distinct React modules backing them | 86 |
| Ids that are tabs over one host (16 device + 8 pdev) | 24 |
| Admin / shell / infrastructure screens | ~25 |
| **Domain surfaces** | **~60** |
| Destinations on the persistent rail | 12 |

118 was measured, not designed. The user-visible figure is 12 on the rail with
~106 behind a flat Apps catalog, which is not an information architecture — it
is the absence of one. That is the real finding; the cluster list below is how
it is repaid.

## How to read the tables

`ana:` is the count of AnA references in the file — `0` means the surface takes
the shell's conversation and discards it. Endpoint families come from the actual
`/api/...` strings in each file. "NO BACKEND" means the surface calls nothing.

---

## Recommended: consolidate

### 1. Reporting — 3 surfaces, 3 unrelated backends

| Surface | Lines | AnA | Backend |
|---|---|---|---|
| `insights` | 1,084 | 2 | insights-canvas, report-os |
| `report-engine` | 468 | 3 | analytics |
| `report-governance` | 182 | 0 | intelligent-reports |

The clearest violation in the product. Three ways to ask "what do the numbers
say", each over a backend the other two cannot see.

**Survivor: `insights`** — it is on the rail as "Reporting & analytics" and is
the largest. Fold the other two in as tabs. Note this is a *backend*
consolidation as well: three report stores is its own D-item, and the UI merge
should not paper over it.

### 2. Authoring — 4 surfaces

| Surface | Lines | AnA | Backend |
|---|---|---|---|
| `document-authoring` | 1,386 | 3 | authoring, c2c, ana-ri |
| `batch-draft` | 897 | 3 | batch-draft, claude |
| `ectd-coauthor` | 628 | 1 | coauthor, ana-ri |
| `authoring-engine` | 301 | 4 | **NO BACKEND** |

**Survivor: `document-authoring`.** The real duplicate is `ectd-coauthor` —
both are section editors, over two different document stores, which is D8's
identity problem showing through to the UI. `batch-draft` is genuinely
different (parallel multi-section drafting) and should stay.

`authoring-engine` is the L41 fixture screen. Its claims are fixed and it now
states it reads no data, but the structural question is yours: keep it as an
overview tab inside `document-authoring`, or delete it. It has navigational
value and zero data value.

### 3. eCTD assembly — 2 of the 3 overlap

| Surface | Lines | AnA | Backend |
|---|---|---|---|
| `ectd-compile` | 415 | 4 | ectd-compile |
| `ectd-publishing` | 273 | 0 | ectd |

**Survivor: `ectd-compile`.** Both assemble and emit a sequence.
(`ectd-coauthor` is an editor and belongs to the authoring decision above, not
here — it is only in this cluster by its name.)

### 4. Pharmacovigilance — 2 of the 3 overlap

| Surface | Lines | AnA | Backend |
|---|---|---|---|
| `pv-cockpit` | 229 | 5 | pharmacovigilance |
| `pharmacovigilance` (in `BiopharmaSpecialty`) | shared 996 | 29 | pharmacovigilance, biopharma, lifecycle |
| `safety-narrative` | 361 | 6 | safety-narratives, pharmacovigilance |

Two surfaces read `/api/pharmacovigilance`. **Survivor: `pv-cockpit`** — it is
purpose-built and carries the compliance matrix, the disproportionality
screener and the deadline calculator. Keep `safety-narrative`: authoring a
narrative is a different act from monitoring a signal.

### 5. Biostatistics — 2 surfaces, 2 backends

| Surface | Lines | AnA | Backend |
|---|---|---|---|
| `biostatistics` | 734 | 4 | ana-biostats, authoring |
| `biostat-workbench` | 470 | **0** | biostat, statistical-defensibility |

**Survivor: `biostatistics`.** Fold the workbench in as a tab; it has no AnA at
all today.

### 6. Quality — 2 surfaces

| Surface | Lines | AnA | Backend |
|---|---|---|---|
| `quality` | 20 (adapter → `concept2cure/quality`) | 3 | via the mounted module |
| `qmp` | 185 | **0** | quality/plans |

**Survivor: the `quality` module.** It already has a tab bar (SOP register ·
change control); a quality *plan* is a third tab, not a second application.

### 7. Lineage — 2 of the 3 overlap

| Surface | Lines | AnA | Backend |
|---|---|---|---|
| `decision-lineage` | 531 | 3 | decision-lineage, authoring |
| `source-tracer` | 254 | 6 | source-tracer |
| `doc-journey` | 351 | 3 | doc-journey |

**Survivor: `decision-lineage`.** `source-tracer` asks the same question at
section granularity and should be a view inside it — this matters more than the
others, because "trace this back to the source document" is the question you
raised directly, and answering it in two places means neither is complete.
`doc-journey` is a lifecycle/status view rather than provenance; keep it.

### 8. Submission — 2 of the 6 fold

| Surface | Lines | AnA | Backend | Verdict |
|---|---|---|---|---|
| `submission-center` | 785 | 5 | submissions, c2c, 510k | **survivor** |
| `dispatch-readiness` | 365 | 4 | submissions | fold — same backend, later stage |
| `gateway-transmittals` | 270 | **0** | mdx | fold — the transmission log |
| `registrations` | 349 | 10 | registrations, rim | **keep** — registration lifecycle ≠ submission |
| `submission-twin` | 272 | **0** | submission-twin | **keep** — drift/change-impact is its own capability |
| `filings-catalog` | 267 | 6 | **NO BACKEND** | **keep, reclassify** — a 113-type reference index, not a workspace |

Six looked indefensible from the name alone; on the evidence only two are.
`dispatch-readiness` and `gateway-transmittals` are consecutive stages of
`submission-center`'s own journey over its own backend.

---

## Recommended: keep as-is

### 9. Labeling — 3 surfaces, and all three are correct

| Surface | Lines | AnA | Backend |
|---|---|---|---|
| `labeling` | 441 | 2 | mdx (device labeling) |
| `labeling-pi` | 164 | 4 | labeling-pi (US Prescribing Information) |
| `labeling-smpc` | 182 | 3 | labeling-smpc (EU SmPC) |

**Do not merge.** A USPI under 21 CFR 201.57/PLLR and an EU SmPC are different
regulatory artifacts with different structures, owners and review paths, and
device labeling is a third thing again. Merging them would be a real regression
dressed as consolidation. A shared parent with region tabs would help
discoverability without collapsing the artifacts.

### 10. Research & intelligence — needs its own pass

`deep-research` (783), `precedent-intelligence` (728), `global-ri` (800),
`intelligence-catalog` (308), `evidence-search` (248, **AnA 0**).

Five surfaces over five backends. `evidence-search` is the weakest and most
likely folds into `deep-research`, but the other four are large and plausibly
distinct. Not enough evidence yet for a survivor call — flagged rather than
guessed.

---

## What this would net

Folding the recommended clusters removes **9 surface ids** (report-engine,
report-governance, ectd-publishing, biostat-workbench, qmp, source-tracer,
dispatch-readiness, gateway-transmittals, and either folding or deleting
authoring-engine), plus `ectd-coauthor` if the authoring duplicate is resolved.
That is 118 → ~108 with no capability lost, and — more to the point — ten fewer
places where the same question gets two different answers.

## Surfaces that still discard AnA

Found while measuring, listed because it is the same audit: `report-governance`,
`submission-twin`, `gateway-transmittals`, `biostat-workbench`, `qmp` and
`evidence-search` all declare `SurfaceViewProps` and drop `onAsk`. Four of the
six are proposed for folding above, which resolves them; the other two need the
affordance regardless of how the clusters land.
