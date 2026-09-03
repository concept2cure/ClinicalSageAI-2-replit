# CMC Capture → Analysis → Module 3: Coverage Evaluation

**Date:** 2026-08-31 · **Method:** five-lens adversarial code evaluation (workflow `wf_6af39bee-474`,
5 agents, every claim carries file:line evidence; full per-lens output in the run journal) plus a
direct audit of AnA's simulation tooling. Domain baseline: the `cmc-intelligence` entity model
(materials → process steps → CPPs → IPCs → CQAs → methods → specifications → stability) and the
ICH test universe (Q1/Q2/Q3/Q5/Q6/Q8–Q12).

## Verdict

**The PM's belief is correct.** The product is not close to "everything a CMC staffer needs, for all
tests they may conduct, captured, analyzed, and usable in Module 3." One register — **stability** —
achieves the full promise (structured capture → real ICH Q1E analysis → composed §3.2.S.7/§3.2.P.8),
and it is the model the rest must be brought up to. Everything else is somewhere between *partially
wired* and *absent*:

- ~~**9 of 19** composer-demanded source types have **no capture path a staffer can reach** (no table,
  no route, or no UI): reference standards, container closure, excipients, raw-material specs,
  impurity profile, dissolution profile, formulation record, manufacturing process,
  characterization.~~ **All nine closed** between 2026-09-01 and 2026-09-02 — see the source-type
  table below for what each one now has.
- **7 of 10** write-through mappers read **row keys their tables never had** — the exact defect class
  found and fixed on the stability mapper (commit `df45b808`) repeats across drug substance (11/16
  dead reads), analytical methods (11/14), process validation (6/8), drug product, specifications,
  batch records, change control. A staffer types the manufacturer, the synthetic route, the ICH Q2
  validation status — the save succeeds — and the compiled dossier still says *"not specified."*
- **8 of 15** CTD content sections are unsatisfiable or effectively so from the product's own UI:
  3.2.S.2, S.3, S.5, S.6, P.2, P.4, P.6, P.7.
- Of ~30 **test families** a CMC staffer runs, 3 have a full structured home (assay, water content,
  batch analyses); the rest can at best be buried in an unstructured JSON blob nothing reads.
- **Analysis** beyond Q1E is thin: no trending/OOT on recorded series, no Q6A spec-vs-batch-data
  justification (a Cpk engine exists but is stranded in the IVD route), Q3A/B/C/D calculators can't
  see captured data, comparability statistics have no lot data to run on, the Q1E extrapolation cap
  is not enforced, and the derived CPP→CQA linkage is computed then dropped.
- **AnA simulation against recorded data: 1 of ~9 engines connected.** Only
  `assess_recorded_batch_poolability` reads the stability register (org-scoped, deterministic,
  honest refusals — the correct pattern). Every other CMC tool (`estimate_shelf_life`,
  `validate_analytical_method`, `classify_impurity`, `set_specifications`,
  `assess_process_validation`, `assess_comparability_protocol`, `design_stability_study`) takes
  typed-in numbers only, and **no tool lists any register** — the one recorded tool's own
  instructions point at a listing capability that does not exist.

Three cross-cutting honesty defects sharpen the picture:

1. **The guided CMC intelligence flow interviews the staffer about exactly the missing sections**
   (container closure, E&L, polymorph screen…) **and then discards every answer** — nothing
   persists to any governed store.
2. **`batchAnalyses` gates section completeness but is never rendered** — recorded QC results turn
   the dashboard green while the actual §3.2.S.4.4/§3.2.P.5.4 batch-analyses tables are absent from
   the composed document.
3. **Write-through silently skips when a register save carries no projectId** — rows exist forever
   in the register and never reach any Module 3, with no signal to the staffer or QA.

## Coverage tables

### Source types (composer demand vs product supply)

| Source type | Status | The missing half |
|---|---|---|
| stability | **full** | — (capture + Q1E analysis + composition; the reference implementation) |
| qc_result | **full** | feeds completeness but results tables never render (see gap C3) |
| specification | full* | mapper emits validationStatus/impurityLimits from columns that don't exist |
| batch | full* | required `formulation` read from a column no migration creates; disposition never exported |
| change_control | full* | change number / filing category dropped by mapper |
| comparability | full* | status only — no lot data, so Q5E statistics can never run |
| drug_substance | partial | manufacturer/route/characterization reads dead → S.1/S.2/S.3 starve |
| drug_product | partial | container closure + process description reads dead |
| method | partial | method identity + entire ICH Q2 record dropped by mapper |
| process_validation | partial | CPPs/CQAs/control strategy captured, never mapped |
| manufacturing_process | **full** (closed 2026-09-02) | register on the EXISTING manufacturing_processes table (its two readers finally have a writer) + steps/CPPs/equipment + governed validation + §3.2.S.2.2 / §3.2.P.3.3 render, side-scoped |
| characterization | **full** (closed 2026-09-02) | register typed by what a study establishes + §3.2.S.3.1 render; three studies of one kind can no longer green all three fields |
| reference_standard | **full** (closed 2026-09-01) | register + routes + write-through + UI + §3.2.S.5/§3.2.P.6 render, side-scoped |
| container_closure | **full** (closed 2026-09-01) | register + E&L/integrity capture + §3.2.S.6/§3.2.P.7 render, and §3.2.P.2's containerClosureStudies |
| excipient | **full** (closed 2026-09-02) | one material register keyed on material_role + recorded origin + §3.2.P.4 render |
| raw_material_spec | **full** (closed 2026-09-02) | same register, filed under §3.2.S.2.3 — a starting material no longer completes §3.2.P.4 |
| impurity_profile | **full** (closed 2026-09-02) | register + ICH Q3A/Q3B assessment engine + §3.2.S.3.2 / §3.2.P.5.5 render, side-scoped |
| dissolution_profile | **full** (closed 2026-09-02) | register + per-timepoint profile + §3.2.P.2 / §3.2.P.5 render, purpose-scoped |
| formulation_record | **full** (closed 2026-09-02) | versioned batch formula, exactly one current, + §3.2.P.1 quantitative composition |

(*full capture loop, with the named field-level caveat.)

### CTD sections, as composable today from the product's own UI

| Fully servable | Partially | Effectively unservable |
|---|---|---|
| 3.2.S.7, 3.2.P.1, 3.2.P.8, 3.1, 3.3, 3.2.S.5, 3.2.S.6, 3.2.P.6, 3.2.P.7, **3.2.S.3, 3.2.P.5, 3.2.S.2, 3.2.P.4, 3.2.A.1, 3.2.A.2, 3.2.A.3** | 3.2.S.1, 3.2.S.4, 3.2.P.3, 3.2.P.2 | — |

The four sections marked on 2026-09-01 moved with the container closure and
reference standard registers (commit c9ed0979). 3.2.S.3 and 3.2.P.5 moved on
2026-09-02 with the impurity and dissolution registers (commit 4e489b38), which
also gave 3.2.P.2 its dissolution content. 3.2.P.4 and 3.2.P.1 moved with the
material and formulation registers, and 3.2.S.2 with the manufacturing process
register; 3.2.P.2 stays partial because a formulation record answers its
composition question but not its process-development or packaging-development
ones. The three 3.2.A appendices were never unservable for want of data — their
generators had existed since module3-extensions.ts was written and the product's
own compile path never called them, so a dossier could not produce the section
that declares an animal-derived excipient. The compile route runs the appendix
pass now.

## The build program to close it (ranked by value ÷ effort)

1. **Mapper fidelity sweep (small, high)** — fix the 7 mismatched mappers to their real row shapes,
   with the same failing-first test pattern used for stability. Recovers data staffers are typing
   TODAY into S.1, S.2, S.4, P.3, P.5 narratives. Includes the P.3 `formulation` and spec
   validationStatus column gaps.
2. **Render what is captured (small–medium, high)** — batch-analyses tables into §3.2.S.4.4/§3.2.P.5.4;
   change history, comparability rationale, and Q2 validation summaries into their sections. Data
   already exists; only generators are missing.
3. **AnA recorded-simulation twins (medium, high)** — a register-listing tool + `assess_recorded_*`
   twins per engine (shelf-life, impurity qualification, spec justification, comparability), on the
   `assess_recorded_batch_poolability` pattern: ids in, org-scoped read, deterministic engine, honest
   refusal, zero writes. Unblocks "AnA runs structured simulations against CMC results."
4. ~~**The missing registers (large, high)** — structured capture for the 9 absent source types~~
   **DONE (2026-09-02).** All nine: container closure (+E&L), reference standards, impurity
   profile, dissolution profile, excipients, raw materials, formulation record, manufacturing
   process, characterisation. Each landed table → routes → write-through → UI card → composer
   render, each with a stored scoping column so one section cannot green another (`scope` for a
   material side, `purpose` for a dissolution profile, `materialRole` for excipient-vs-raw-material,
   `processType` for a process side, `studyType` for what a characterisation study establishes),
   each visible to AnA through `list_cmc_registers`, and each a tenant-purge child. The
   manufacturing register writes the EXISTING `manufacturing_processes` table rather than a new
   one — that table had two live readers and had never had a writer.

   Three findings fell out of building it, each fixed where it was found:
   - The composer counted a **retired** record's fields toward section completeness. A retired
     impurity could satisfy §3.2.S.3's impurity requirement while appearing nowhere in the section
     it completed. Retirement is now honoured once, in the composer, for every source type.
   - §3.2.P.3 read `processSteps` through a first-match array helper across every matched source,
     so once the register emitted structured steps the drug product form's free-text list and the
     register's rows competed for one column mapping.
   - The **3.2.A appendix generators were unreachable**: they had existed since
     module3-extensions.ts was written and the product's own compile path never called them, so a
     product using an animal-derived excipient could not produce the CTD section that declares it.
5. **Persist the guided flow (medium, high)** — the intelligence interview's answers land as
   canonical source objects (they cover exactly the sections in #4), instead of evaporating.
6. **Analysis on the spine (medium)** — trending/OOT over recorded series; Q6A spec-vs-batch
   justification (re-home the stranded Cpk engine); Q3A/B qualification against captured impurity
   data (needs #4); enforce the Q1E extrapolation cap; keep the CPP→CQA trace.
7. **Plumbing guards (small)** — refuse or warn on register saves without a projectId link; make the
   canonical OOS flag computed, not self-declared; widen the OS source-objects enum to accept all
   composer-demanded types.

Item 1 is the same class of silent data loss already proven live once — it is the "stop the
bleeding" item and should land first.

## Progress against this program

| Item | State | Landed |
|---|---|---|
| 1. Mapper fidelity sweep | **done** | all 7 mappers rewritten to real row shapes, adversarially reviewed |
| 2. Render what is captured | **done** | batch analyses, change history, comparability, Q2 summaries |
| 3. AnA recorded twins | **done** | `list_cmc_registers` + `estimate_recorded_shelf_life` on the shared engine |
| 4. The missing registers | **done (9 of 9)** | container closure (+E&L), reference standards, impurities, dissolution, excipients, raw materials, formulation, manufacturing process, characterisation — plus the retired-record completeness fix and the unreachable 3.2.A appendix pass |
| 5. Persist the guided flow | open | |
| 6. Analysis on the spine | **started** | ICH Q3A/Q3B threshold assessment over recorded impurity levels, on the canonical tables (a duplicate, wrong copy deleted). f2 similarity next. |
| 7. Plumbing guards | open | partially anticipated: every new register stores `project_id` and reports `module3Linked` |
