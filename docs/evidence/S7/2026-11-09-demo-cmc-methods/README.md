# A demo specification names a procedure the demo also records

**Package:** S7 (CMC). **Date:** 2026-11-09. Session `session_01GJidg5q1KFNfFT2VZyjcqw`.

## The defect, and how today's own change exposed it

`ensureCmc` (`scripts/demo/launch-demo/packs/work-areas.mjs`) seeds three CMC registers — specifications, stability
studies, batch records. Each specification carries `testMethods: { method: <free text> }`, naming a procedure such as
*"Size-exclusion HPLC, UV 280 nm"*. **No pack seeded the analytical-method register at all.**

That was invisible until earlier the same day, when the approval route began refusing a limit whose procedure is not
shown fit to measure it (`docs/evidence/F1/2026-11-08-specification-method-gate/`). The gate resolves the named
procedure against the project's method register and answers `METHOD_NOT_IN_REGISTER` when the register does not hold
it. So after that change **every demo specification became unapprovable**, in the demo the founder walks.

The gate is right and the demo data was incomplete: a limit nobody can measure should not be approvable. But a
correct refusal over seed data that cannot satisfy it is still a broken demo, and it is this lane's to fix.

It is also the first of several reasons Module 3 cannot compose for a demo project (**J5-13**,
`docs/evidence/HUMAN-TEST/J5/README.md`): §3.2.S.4.3's Analytical Methods table had no source at all. The rest —
no drug substance and no drug product record, which is what `compositionRefusal` classifies — is the next slice.

## What already exists (RULE 3)

| Path | What it does today |
|---|---|
| `scripts/demo/launch-demo/packs/work-areas.mjs` | `ensureCmc` → `ensureSpecs` / `ensureStability` / `ensureBatches`, each through the product's own HTTP API, idempotent by title |
| `scripts/demo/launch-demo/packs/biotech-work-content.mjs` | `BIOTECH_CMC` — the fictional C2C-101 pack's CMC content |
| `scripts/demo/launch-demo/packs/lumen-content.mjs` | `LMN201_CMC` — the Lumen demo pack's CMC content |
| `server/api/cmc/routes.ts` | `POST /analytical-methods` (an ordinary write) and `POST /analytical-methods/:id/validate` (the governed act) |
| `scripts/demo/launch-demo/packs/biotech-shared.mjs` | `NOT_EXECUTED_NO_SIGNER` — the pack's own convention for a step that needs a signature it has no credential for |

Nothing new: `ensureCmc` gains one step, and the two content files gain the data that step records.

## The change

- **`methods: [...]`** on `BIOTECH_CMC` and `LMN201_CMC` — one entry per distinct `method` string the pack's
  specifications name, with the ICH Q2 characteristics and summary each procedure's validation signs for.
- **`ensureMethods`**, called by `ensureCmc` **before** `ensureSpecs`, because a specification names a procedure and
  the approval route resolves that name.
- **The governed validation.** `status` is never `validated` on the create: an ordinary write carrying that word is
  refused with a 409 (`ungovernedQualificationRefusal`), because §3.2.S.4.3's Validation Status column, the ICH Q2
  engine's `VALIDATED` set and the contradiction sweep's `method_validation_gap` all turn on it. Each method is
  recorded with its Q2 parameters — without which the ceremony itself refuses with *"nothing to sign"* — and signed
  through `POST /analytical-methods/:id/validate` when a signer credential is supplied. Without one the step reports
  `not executed — signer credential not supplied`, **and says that those specifications are refused at approval until
  a method is validated**, rather than leaving the walker to discover it.

## Verified by making each check fail

| File | Mutation | What it reported |
|---|---|---|
| `01-red.txt` | the change not yet made | 4 of 10 red: neither pack records a method, the seeder posts none, and no Q2 parameters reach the register |
| `03-mutation-no-method-step.txt` | `ensureCmc` loses its methods step — **the state as shipped** | 2 red (the seeder's two cases) |
| `04-mutation-methods-after-specs.txt` | the methods are recorded **after** the specifications that name them | the order case red |
| `05-mutation-created-as-validated.txt` | the create declares `status: 'validated'` | 4 red, incl. the fake boundary's own refusal — the real route answers 409 |
| `06-mutation-no-q2-parameters.txt` | the Q2 parameters are not recorded | the Q2 case red — the real `POST /validate` would refuse with *"nothing to sign"* |
| `02-green.txt` | — | 10 of 10 with every mutation reverted |

Two cases were strengthened after the first mutation run, because they passed **vacuously** when no method was
seeded (`0 === 0` validated, and idempotence over an empty set). Both now assert that something was recorded first,
so mutation A takes them red too. A case that cannot fail is not evidence.

## Found, not fixed: the product cannot record a method as *suitable*

The register form offers `METHOD_STATUSES = ['development', 'validation', 'retired']`, plus `validated` through the
signature (`client/src/concept2cure/v2/surfaces/cmcRegisterForms.ts`). But the approval gate admits a status in
`METHOD_VALIDATED` **or** `METHOD_SUITABLE` — `qualified`, `suitable`, `suitability confirmed`,
`phase-appropriate`, `fit for purpose` — and **no form in the product can write any of those words.**

So the `METHOD_SUITABLE` branch, which `q2Expectation` relies on to make suitability sufficient before phase 3
(`services/cmc/ich-compliance-q2.ts`), is unreachable today: in practice only a *validated* method lets a
specification be approved. That means a phase-1 programme must fully validate its procedures before approving any
limit — the outcome I argued against when the coordinating session asked for `validated`-only, and which the product
has in fact had all along.

This is a founder-shaped decision, not a session's, because it changes what a staffer may assert in a GxP register
without a signature:

- **(a) Make suitability a declarable status.** Add `qualified` to `METHOD_STATUSES`. Cheapest, and consistent with
  what the engines already read — but it lets suitability be claimed by an ordinary edit, where validation needs a
  signature.
- **(b) Make it a second governed act.** A `confirm-suitability` ceremony beside `validate`: signed, weaker than
  validation, phase-appropriate. Most faithful to how FDA and the EU ask for phase 1, and the costlier change.
- **(c) Leave it.** Only validated procedures support an approved limit. Defensible, stricter than ICH asks at phase
  1, and then `METHOD_SUITABLE` should be deleted rather than left as a branch nothing can reach.

Recommendation: **(b)**, with **(a)** as the interim if phase-1 programmes need it before (b) can be built. Either
way the demo above is unaffected: it validates under signature.

## Gates

`npm run test:ci-scripts`: **748 of 748 pass** (10 of them new). No server or client file is touched by this slice.
