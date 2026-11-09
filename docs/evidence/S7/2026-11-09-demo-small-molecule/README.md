# The demo has a programme whose Module 3 this product composes

**Package:** DATA (demo data), with the composition case in S7's suite. **Date:** 2026-11-09.
Session `session_01GJidg5q1KFNfFT2VZyjcqw`. Closes **J5-13**.

## The gap

Both demo programmes with CMC data are biologics: C2C-101 is a humanised IgG1 monoclonal antibody, LMN-201 a
spirulina-expressed protein. Both are therefore outside the composition boundary this platform ships — small-molecule
US IND only (P-28, `services/cmc/composition-scope.ts`) — and both are refused. Those refusals are **correct** and
`demo-packs-composition-boundary.test.ts` pins them.

But with no programme **inside** the boundary, the demo could not show the Module 3 build at all. The human-test walk
reported it as J5-13: *"The build is refused, because C2C-101 is a monoclonal antibody (a biologic, P-28), so the
demo cannot show the build. → the CMC session / the demo pack: a small-molecule demo project would show it. The
refusal itself is correct."* (`docs/evidence/HUMAN-TEST/J5/README.md`.)

## What already exists (RULE 3)

| Path | What it does today |
|---|---|
| `scripts/demo/launch-demo/packs/biotech.mjs` | the fictional pack: `ensureProgram` / `createProgram`, then Vault, authoring, protocol, submission, QMS, work areas |
| `scripts/demo/launch-demo/packs/work-areas.mjs` | `ensureCmc` — materials, methods, specifications, stability, batches, all through the product's own API |
| `server/api/cmc/module3OperatingSystemRoutes.ts` | `POST /module3-os/compile/:projectId` — composes and persists every section, refusing a project with no canonical sources (409) and one outside the boundary by name |

Nothing new in the product: one more fictional programme in an existing pack, seeded by the existing helpers, and one
call to an existing route. `ensureProgram` and `createProgram` are **parameterised** rather than copied, so the two
programmes share one creation path.

## The change

- **C2C-201** — a fictional oral JAK1 inhibitor from the same fictional sponsor, which is an ordinary thing for a
  biotech to have beside a biologic. Its registers: a small-molecule substance with a stated four-step synthetic
  route, a film-coated tablet, four analytical procedures, six specifications, three stability studies and three
  batches.
- **Deliberately CMC-only.** No Vault, protocol, submission or QMS content: J5-13 is about the build, and a second
  full dossier would double the seed's runtime for nothing.
- **`ensureModule3Build`** runs `POST /module3-os/compile/:projectId` after the registers, and reports how many
  sections composed **with recorded data** rather than how many the composer returned — it returns one per section
  either way.
- **The modality is stated**, as the materials slice established, so the boundary rests on the record rather than on
  the absence of biological words in a free-text route.

The demo now shows **both halves**: a dossier that composes, and a refusal that names ICH Q6B.

## What the demo's own data composes

Run through the real engines (`server/services/cmc/__tests__/demo-small-molecule-composes.test.ts`), the pack's
records produce §3.2.S.1, §3.2.P.1, §3.2.S.4, §3.2.P.5, §3.2.S.7 and §3.2.P.8 **with lineage**, including:

- §3.2.S.4's acceptance-criteria table carrying the specification's own `98.0 - 102.0 %`;
- its Analytical Methods table naming `HPLC-UV assay and related substances` as `validated`;
- §3.2.P.8 reporting the 6-month accelerated total impurities — **0.61 against NMT 0.5 %** — as `OUTSIDE`, and
  withholding the stability conclusion.

That last one is on purpose. Phase 4's acceptance fixture pins that behaviour over canonical sources it builds itself
(`phase4-acceptance-fixture-tables.test.ts`); here the same behaviour shows on data a person clicks through, which is
what the plan means by a screen not being done until it was used.

## Verified by making each check fail

| File | Mutation | What it reported |
|---|---|---|
| `03-mutation-no-small-molecule-programme.txt` | the pack seeds no second programme — **the state as shipped** | the per-programme find case red |
| `04-mutation-build-before-registers.txt` | the build runs **before** the registers it compiles from | *"the build ran before the registers: … ensureCmc → ensureModule3Build → ensureCmc …"* — and the real route would answer 409, *"No canonical source objects for this project"* |
| `05-mutation-programme-is-a-biologic.txt` | C2C-201's substance is a biologic again | 2 red: *"expected { …(3) } to be null"* (the boundary refuses it) and the stated-modality case |
| `06-mutation-no-oos-point.txt` | the 6-month accelerated point is within its limit | *"the 6-month accelerated total impurities (0.61 against NMT 0.5 %) was not reported as outside: expected [] to have a length of 1"* |
| `02-green.txt` | — | 37 of 37 and 8 of 8 with every mutation reverted |

**The order mutation was first "proved" by a shell one-liner that read the source.** That is not evidence — it was my
assertion about the file, not the suite's. It is now a real case in `demo-recovery.test.mjs` that reads the fixture's
own record of which helper ran when, and the file above is that case failing.

## Three fixture updates, and why each was necessary

`demo-recovery.test.mjs` runs the real pack against stub modules in a temp root. Three of its fixtures had to learn
about the second programme, and each is a fact about the pack rather than a workaround:

1. Its stub of `biotech-work-content.mjs` had to export `BIOTECH_SM` / `BIOTECH_SM_CMC`, or the pack failed at import.
2. Its fake intake refused any `productType` other than `biologic`. The real intake takes `drug` too, and the
   assertion's point is that the class must be **stated** — so the fake now accepts both words and still refuses a
   create that states neither.
3. Two cases asserted "no POST to `/api/c2c/projects`" with only C2C-101 in the portfolio. With two programmes that
   is no longer idempotence, it is a missing project — so both now list **both** demo projects, and a new case says
   the find is per programme: with C2C-101 present and C2C-201 absent, exactly one create happens and it is the small
   molecule's. One further case that asserted "no POST at all" now names the project create, because the pack
   legitimately posts the compile.

## Gates

`npm run test:ci-scripts`: **759 of 759 pass**. CMC service suites: **1,516 across 65 files**. `tsc --noEmit` 0
errors. ESLint: no warnings on the new file.

## Not done here

The seed was not run against a live server in this container: the pack posts to a running product, and these cases
exercise the pack's data, its order and its composition through the real engines rather than a live run. A walk of
the CMC work area on C2C-201 in the running app is the next step, and is what J5-13 asked for in the end.
