# Protocol intelligence — the bidirectional contract

**Status:** binding design, 2026-09-22. Extends
`docs/design/PROTOCOL_DESIGN_CONVERGENCE.md`, which specified one direction
only. **Prompted by:** the founder — *"leverage AnA and AI and all regulatory
rules as your guides and all the biostatistics module's abilities and all other
abilities in this entire code base that can enable the production of a robust
fully intelligent and compliant Study Protocol and this must then feed our
study design solution too."*

The operative words are **"must then feed."** The convergence document
specified design → protocol: the design object is the spine, the protocol
document is its projection. That is half a contract. A protocol a human edits
is a fact about the study, and today that fact dies on the page.

## The survey, before anything was designed

Same method as the two surveys that preceded it, for the same reason: this
repository keeps rebuilding capabilities it already has.

### What exists and is reachable

| Capability | Where | Reachable from |
|---|---|---|
| ~120 protocol/study AnA tools out of 748 total — create a protocol document, edit a section with source lineage, add objectives, eligibility criteria, generate and amend a schedule of events, set an SoA cell, review completeness, finalize, amend, create and review an IRB submission, stress-test a protocol | `AnaToolDefinitions.ts` + the `*-tool-defs.ts` set, handlers in `AnaToolExecutor.ts` | AnA, governed and audited via `recordGovernedAction` |
| Design spine, five projections, gates, sample size, feasibility, twin, evidence priors | `server/services/study-design/` | `/api/study-design` |
| **Design → deterministic stats → sample size written back into the design → tasks on the canonical board → filing placement** | `server/services/biostatistics-bridge/` | `/api/biostat-bridge`, `Biostatistics.tsx` |
| Deterministic computation and judgment engines, provenance-hashed | `server/services/ana-biostats/`, `server/services/stats/computation-provenance.ts` | the bridge, `compute_sample_size` |
| Estimand advisor (E9(R1)), design advisor, statistical narrator, RWE design, COA selection, reporting guidelines | `server/services/ana/estimands.ts`, `study-design.ts`, `statistical-narrator.ts`, `rwe-design.ts`, `coa-selection.ts`, `reporting-guidelines.ts` | AnA |

**`biostatistics-bridge` is the pattern.** It already closes the loop for
exactly one field: the deterministic engine computes a sample size, and
`applyPlanPatch` writes it back into the `StudyDesign` through
`persistStudyDesignTx` + `recordGovernedAction` on one transaction, with a
reason string and an audit row. It is proof the round trip is buildable here
and a template for what the protocol needs. It was built for one field and
generalises to the rest.

### What exists and is unreachable

| Capability | Where | Callers |
|---|---|---|
| Region design rules — 7 agencies, ICH E5 ethnic sensitivity, E17 multi-regional consistency, E14 thorough QT, post-Brexit UK separation, Swiss and Brazilian local submission, Project Orbis, **FDA diversity action plan** | `server/services/region-design-rules.ts` | one route. Takes a bespoke `RegionDesignInput` that nothing in the codebase produces from a `StudyDesign`. |

The diversity action plan was listed as a gap in the convergence document. It
is not a gap. It is built, tested, and disconnected — the same finding, a
fourth time.

### The three breaks

1. **Two unrelated stores.** `protocol_documents` (+ objectives, eligibility,
   schedule registers) and `cdisc_prm_studies` (+ arms, endpoints) describe the
   same study and share no key. Closing: the link migration and the read model.

2. **Nothing reads the protocol back into the design.** This is the founder's
   explicit ask and nothing in the codebase does it. Specified below.

3. **The clinical protocol's own content model is an approximation labelled as
   the standard.** `SECTION_TEMPLATES.clinical` is twelve sections, each
   stamped `basis: ICH_M11`. ICH M11 CeSHarP is a numbered thirteen-section
   hierarchy, and `study-design/protocol-projection.ts` — eight files away —
   already emits it. Meanwhile `evaluateCompleteness()` is five checks, and it
   is the entire deterministic compliance of protocol development: required
   sections complete, at least one objective, inclusion and exclusion present,
   at least one visit. A protocol can pass all five and be non-compliant with
   every standard its own templates cite.

## The contract

### Direction one — design → protocol (projection)

Already specified in the convergence document. The design object is the spine.
The protocol document renders its projections. Unchanged.

### Direction two — protocol → design (derivation)

**A protocol edit never silently mutates the design.** It produces a
*proposal*, the human approves it, and the approved patch is written through
the same governed writer the bridge uses.

```
protocol_documents + registers
        │  deriveDesignFromProtocol()      pure, total, no I/O
        ▼
  DesignDerivation {
    patch:        Partial<StudyDesign>          only fields the protocol evidences
    provenance:   per field → the protocol row it came from (table, id, excerpt)
    conflicts:    field → { designValue, protocolValue, why }
    unevidenced:  design fields the protocol says nothing about — untouched, never nulled
  }
        │  human reviews the field-level diff
        ▼
  applyDesignDerivation()
        persistStudyDesignTx + recordGovernedAction, one transaction,
        reason-for-change captured — exactly as applySampleSizeToDesign does
```

Binding rules for the derivation:

- **Silence is not a value.** A design field the protocol does not evidence
  goes in `unevidenced` and is left exactly as it was. It is never set to
  null, zero, or a default. This is the single most important rule here: a
  derivation that nulls a field because a section was blank destroys the
  design.
- **Conflict is not resolution.** Where the protocol and the design disagree,
  both values are reported with the reason and neither wins automatically.
  The human decides. No last-write-wins.
- **Provenance per field, or the field is not in the patch.** Every proposed
  value names the protocol row it came from. A value that cannot name its
  source is a fabrication and does not ship in the patch.
- **Structure over prose.** Derive from the structured registers — objectives
  and their endpoints, inclusion and exclusion rows, schedule visits, arms.
  Free-text section bodies may contribute only where the derivation states in
  the provenance that it was a text scan, and such a field is always
  `proposed`, never `confident`.
- **The governed write is the bridge's write.** `persistStudyDesignTx` +
  `recordGovernedAction` on one client, so the design change and its 21 CFR
  Part 11 audit row commit or roll back together. No second writer.

### Direction three — the rules, on both objects

Neither object is compliant because its sections are filled in. Two
deterministic rule layers run and their findings surface on both surfaces:

- **`protocol-rule-pack.ts`** — the protocol document against ICH M11, E8(R1),
  E9/E9(R1), E6(R3), 21 CFR 312.23(a)(6), 50.25, 56.111, 45 CFR 46 Subparts
  B/C/D, EU CTR 536/2014 Annex I Part D, FDORA §3601, and for the non-clinical
  kinds the 3Rs and the NIH Guidelines. One finding per rule, each citing its
  clause.
- **`region-rules-adapter.ts`** — the design object through the region engine
  that already exists, so E5/E14/E17, Project Orbis and the diversity action
  plan finally evaluate something.

Both obey the repository's standing rule: **a rule that cannot be evaluated
returns not-assessed, never met.** An unassessed protocol is not a clean one,
and a percentage computed over checks that did not run is the defect this
codebase has already been burned by.

### AnA's part

AnA does not decide anything here. The engines decide; AnA operates them and
narrates. What AnA gains is the ability to *reach* them conversationally:
bind a protocol to a design, run the derivation and present the diff, read the
gate and rule findings, and apply a projection into a section — each as a tool
call against the same routes the surface uses, never a parallel path, and each
governed exactly as the existing protocol tools are.

A tool that asks the model for a number is a defect (CLAUDE.md Rule 2). The
sample size comes from the computation engine. The findings come from the rule
packs. The model writes the sentences around them.

## What this does not do

- It does not make the protocol document the source of truth. The design
  object stays the spine.
- It does not auto-apply anything. Every write is a reviewed, reasoned,
  audited action.
- It does not claim a transmission to any authority. Same rule as
  `docs/design/IRB_SUBMISSION.md` D3.

## Order of work

1. Link the two stores; read model; projections on the surface. *(in flight)*
2. Burden and complexity engine, with `compareBurden` for amendment deltas. *(in flight)*
3. Protocol rule pack. *(in flight)*
4. Region rules onto the design spine. *(in flight)*
5. **The derivation — protocol → design, with provenance, conflicts and the
   reviewed diff.** The founder's explicit ask; nothing else delivers it.
6. Converge the clinical section model onto real ICH M11 numbering, with a
   migration for existing rows, so the projection and the document address the
   same sections.
7. AnA tools over the above.

## Guardrails

- Rule 0: `concept2cure-v2` only.
- Rule 1: the link migration is additive, registered in `C2C_MIGRATION_FILES`,
  its FK target verified present on the applier. The section-key convergence in
  step 6 amends the creating migration in place with a dated header note — it
  does not append a DROP.
- Zero duplication: one derivation, one rule pack, one region adapter, one
  governed writer. `server/services/ana/study-design.ts` holds a textbook
  sample-size approximation that is *not* the deterministic engine; it stays
  advisory prose and never reaches a protocol or a design as a number.
- Verify by making the check fail: every rule and every derivation branch is
  seen red before it is seen green.
