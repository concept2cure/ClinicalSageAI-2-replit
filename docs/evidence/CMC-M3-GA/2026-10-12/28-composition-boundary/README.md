# The composition boundary: small-molecule Module 3 for a US IND, and a 409 otherwise

Row **D2**. GA plan item 8 (decision 2026-10-05, P-28).

## The defect

The CMC module composes **small-molecule Module 3 for a US IND**. That is the
scope the launch decision ships and the scope the composer was built and
verified against. Everything outside it was composed anyway, with content that
is **wrong rather than merely incomplete**:

| Out of scope | What was composed for it |
|---|---|
| biologic / ATMP substance | ICH Q3A impurity reasoning applied to a biologic; no Q6B specification model, no Q5A(R2) viral safety, no Q5C stability, no cell-bank section |
| NDA / ANDA / BLA / MAA | 3.2.R location statements that are false for a marketing application, no §3.2.S.4.5 / §3.2.P.5.6 justification of specification, 3-level granularity where 4 is required |
| EU CTA | CTD Module 3, when an IMPD Quality part is not CTD Module 3 |
| Health Canada CTA | the same, and no QOS-CE |
| Japan CTN / J-NDA | no regional 3.2.R for the jurisdiction |

**The staff simulation's own program was a monoclonal antibody** — modality
`biologic`, route "CHO cell culture", INN `belantezumab` — and it composed
**twenty-one** small-molecule Module 3 sections for it, through the real server,
without a word of complaint. That is what the red run below prints.

## The fix

**One modality rule.** `substance-modality.ts` holds the rule §3.2.A.2 already
shipped, lifted out unchanged so the section and the boundary cannot disagree —
one saying "chemical synthesis" while the other composed a small-molecule
Module 3 is the failure extraction prevents. Explicit `modality` /
`molecularType` wins either way; otherwise any biological signal (recorded
origin, cell line, source organism, viral-safety or TSE statement, or a biologic
token in the name, route or process) reads `biologic`; a recorded chemical
process with no such signal reads `small_molecule`; **nothing recorded is
`unknown`**, which is not a statement that the substance is chemically
synthesised.

**`composition-scope.ts` is the boundary**, asked before anything is composed,
in this order:

1. **The product class the person recorded.** Since P-21 (QA 2026-10-08)
   `regulatory_programs.product_type` is NOT NULL and the person states it on a
   filing that covers both — it used to be derived, which recorded every IND as
   a biologic. It is the sponsor's own statement, so it is asked first:
   anything but `drug` is `CMC_PRODUCT_CLASS_OUT_OF_SCOPE`.
2. **The substance's modality.** `biologic` →
   `CMC_MODALITY_OUT_OF_SCOPE`; `unknown` →
   `CMC_MODALITY_NOT_ESTABLISHED`, which asks for the manufacturing route
   rather than assuming. Asked *as well as* the class: a program declared
   `drug` whose substance record is a CHO cell-culture mAb is a contradiction,
   and the record refuses it.
3. **The application: the program's own `program_type`.** Not the submission
   spine's, for two reasons. `resolveSubmissionSpine` returns null for a
   program with no `submissions` row, so a boundary that read "no spine" as
   "nothing contradicts a US IND" waved through exactly the filings this
   exists to refuse. And the spine can never disagree:
   `findProgramSubmission` only ever matches a submission whose
   `application_type` equals the program's `program_type`, so consulting it
   adds nothing here and would only make a failed spine read look like an
   unknown application. Not a US IND → `CMC_APPLICATION_OUT_OF_SCOPE`.

   The spine read now runs under **its own savepoint**, because
   `resolveSubmissionSpine` swallows its own lookup failures and returns "no
   spine" — leaving the caller's transaction aborted while reporting nothing.
   A failed spine read skips 3.2.R, as before, and the program's own fields
   stand either way.
4. **Fail closed.** A program row or spine that cannot be read is
   `CMC_APPLICATION_NOT_READABLE` — a distinct code, because nothing is wrong
   with the program; the read failed, and composing on an unestablished
   application type is how marketing text reaches an IND.

**Every refusal names the path that does author it** — *Document editor &
authoring* for the quality content, *Vault (DMS)* for the evidence, the
*Submission center* to file it — and the guidelines the composer does not model
(Q6B, Q5A(R2), Q5C). A refusal that only says "unsupported" sends the reader
nowhere.

**A refusal cannot be read as an empty result.** `composeProjectModule3` has
four callers; a refusal returned as "zero sections" would reach a screen as
*this program has no CMC data*, the empty-state-for-an-error the working
agreement forbids. It is a typed throw (`CompositionOutOfScopeError`) that every
caller handles: the compile and refresh routes and the build-section route answer
**409** with the shared body (`compositionRefusalBody`), and AnA's three build
commands and the record-composed QOS tool relay the refusal's own words so the
assistant repeats the reason rather than reporting a tool failure.

**The spine read moved ahead of the composition**, under its own savepoint, and
the regional pass now reuses its answer instead of reading it twice. A refusal
leaves the caller's transaction usable, which the database test proves by
committing after one.

## Red, then green

- **Through the real compose path on the real schema**
  (`composition-scope.pglite.test.ts`). With the boundary unwired
  (`red-compose-before.txt`) **4 of 7 fail**, and the first prints the GA
  blocker itself:

  ```
  refuses the simulation's monoclonal antibody, and composes nothing
    → a mAb composed {"composed":21}: expected false to be true
  ```

  …alongside an NDA program composing 21 sections, an NDA program with no
  submission row composing 20, and a substance with no recorded route composing
  21. After: **8 pass** (a product-class case was added once the boundary
  consulted it).
- **The rule** (`composition-scope.test.ts`): **26 tests** (34 across both files) — explicit modality
  both ways, each biological signal alone, an expression system in the route and
  an INN stem in the name, no false positive on "plasma etching" or "tissue
  paper", a recorded chemical process, nothing recorded, each out-of-scope
  application, each out-of-scope product class, the modality judged before the
  application, the newest substance judged, and the typed throw.
- **The whole staff simulation, against the real server**
  (`green-simulation.txt`): **158 passed, 0 failed.** Its program is now the
  small molecule the launch scope ships, and a new step 3c creates a second,
  biologic program, records the mAb with its full ICH Q5A(R2) register entry,
  and proves the compile answers **409 `CMC_PRODUCT_CLASS_OUT_OF_SCOPE`**,
  composing nothing, with a refusal that names Q6B and the authoring path.
  §3.2.A.2's assertion moved to the small-molecule branch: it answers for the
  substance only and certifies no raw material.
- **§3.2.A.2's behaviour is unchanged** by the extraction: the appendix,
  composer and section-honesty suites pass unchanged (54 tests).

## The fixtures the boundary caught

Three suites composed Module 3 for a program the boundary now refuses, and each
fixture was wrong in the way the boundary names rather than in a way the test
intended:

- `module3-lineage.pglite.integration.test.ts` had a `regulatory_programs`
  **table with no row** for its project, and a substance recorded with a name
  only. It now carries a US IND program for a drug, and a
  `modality: 'small_molecule'` substance — which is not an input to any section
  it asserts.
- `module3OperatingSystemRoutes.test.ts`'s refresh fixture answered the program
  read with `{ rows: [] }`. It now answers with the program row the boundary
  reads.
- `cmc-quality-summary-tool.test.ts` returned a program row carrying only an
  `id`. It now carries the type and class too.

`createIndPgliteDb`'s `regulatory_programs` gained `product_type`, which the
real table has as NOT NULL; it is defaulted in the harness only so the suites
that predate the column keep inserting without it.

`module3-command-handlers.ts` was at its 500-line cap, so the three
**deterministic quality-engine** handlers it carried — `ich_compliance`,
`control_strategy`, `variations_classify`, none of which composes, persists or
reads a Module 3 section — moved to
`quality-engine-command-handlers.ts`, and the `CommandContext` / `CommandResult`
interfaces each handler module had declared for itself became one
`command-types.ts`. `ci:unreferenced-modules` reports 81 against a baseline of
81.

## Two things found on the way, outside this change

- **A recorded application number can be rejected as "not recorded."** The
  simulation recorded `IND 161204` and the eCTD assembly refused with *"its
  project records no agency application number"* — because
  `REGULATORY_IDENTIFIER_PATTERN` admits no space, so the prose form is not a
  usable `<application-number>`. The value *is* recorded; what is wrong is its
  form, and the message says the opposite. The simulation now records the bare
  `161204`. The message belongs to the Submission Center / eCTD lane.
- **The eCTD compile returned a previous run's compilation.** On a database
  carrying several programs named `BX-701 IND`, `POST /api/ectd-compile/:id/compile`
  answered with a compilation built minutes earlier for a different program id.
  Recorded here because this run is the first thing to name it; also the eCTD
  Compile lane's.

## Not yet

§3.2.A.2's **biologic** branch is now unreachable from the compile path: any
substance that trips the biologic detector is refused before composition. It is
kept, not deleted — it is what the section needs the moment biologics come into
scope, and removing a composer branch is a product decision, not a cleanup. Its
register inputs keep their coverage in simulation step 3c, which records them
and asserts they persist.
