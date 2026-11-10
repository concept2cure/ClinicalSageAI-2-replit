# A demo project records the substance and the product its Module 3 is about

**Package:** DATA (demo data), with the boundary case in S7's suite. **Date:** 2026-11-09.
Session `session_01GJidg5q1KFNfFT2VZyjcqw`. Closes the root cause of **J5-13**.

## The defect

`ensureCmc` seeded specifications, stability studies, batch records and — since earlier today — the analytical
methods those specifications name. It recorded **no drug substance and no drug product**: the two records §3.2.S.1
and §3.2.P.1 are written from, and the record `compositionRefusal` reads to decide whether a programme's Module 3 is
composed here at all.

So for every demo project:

- the composition boundary answered `CMC_MODALITY_NOT_ESTABLISHED` — *"This project records no drug substance, so
  whether its Module 3 is composable here is not established"*;
- §3.2.S.1 and §3.2.P.1 composed with no source.

The human-test walk reported this as *"the build is refused, because C2C-101 is a monoclonal antibody"* (J5-13,
`docs/evidence/HUMAN-TEST/J5/README.md`). That refusal is the right one for a biologic and is worth showing — but it
was **not the refusal the product was giving**, because the record that states the modality did not exist. The
reported symptom and the actual behaviour differed, and only the record closes the gap.

## What already exists (RULE 3)

| Path | What it does today |
|---|---|
| `scripts/demo/launch-demo/packs/work-areas.mjs` | `ensureCmc` → materials (new), methods, specifications, stability, batches; each through the product's own HTTP API, idempotent by name |
| `server/api/cmc/routes.ts` | `POST /drug-substances`, `POST /drug-products` — both ordinary writes, no ceremony |
| `server/services/cmc/substance-modality.ts` | `classifySubstanceModality` — states-biologic, states-small-molecule, a biological-signal heuristic, else a stated route with no biology reads as a small molecule |
| `server/services/cmc/composition-scope.ts` | the P-28 boundary, which reads the newest drug substance |

Nothing new: `ensureCmc` gains one step and the two content files gain the records it writes.

## The change

- **`substance` and `product`** on `BIOTECH_CMC` and `LMN201_CMC`, with the manufacturer and route §3.2.S.2.1 /
  §3.2.S.2.2 need, the composition and batch formula §3.2.P.1 / §3.2.P.3.2 keep apart, the container closure, and —
  for both, which are biologics — the origin, cell line or source organism §3.2.A.2 asks for.
- **`ensureMaterials`**, called by `ensureCmc` **first**: the rest of the dossier is about these two records, and the
  boundary is decided from the substance.
- **The modality is stated, not inferred.** `classifySubstanceModality` reads it from the manufacturing route when
  the record does not state it, so a demo that relied on the heuristic would change composition scope the next time
  someone reworded a process description. One case proves the statement is doing the work: strip the route and the
  refusal is unchanged.

## Verified by making each check fail

| File | Mutation | What it reported |
|---|---|---|
| `01-red.txt` | the change not yet made | 8 of 10 `node --test` cases red, and 4 of 5 vitest cases |
| `03-mutation-no-materials-step.txt` | `ensureCmc` loses its materials step — **the state as shipped** | 3 red |
| `04-mutation-modality-not-stated.txt` | the biotech substance does not state its modality | 2 `node --test` cases red, and the vitest heuristic case: *"expected undefined to be 'biologic'"* |
| `05-mutation-modality-not-establishable.txt` | the record states **no** modality, origin, cell line or organism, and a vague route | *"the boundary admitted a biologic: expected null not to be null"* |
| `02-green.txt` | — | 9 of 9 and 5 of 5 with every mutation reverted |

## Found by mutation 5, and worth a decision: a terse route reads as a small molecule

Mutation 5 was meant to show the boundary saying *"not established"*. It did something else: `compositionRefusal`
returned **null** — it **admitted** a monoclonal antibody into small-molecule Module 3 composition.

The reason is in `classifySubstanceModality`: after the explicit statements and the biological-signal heuristic, *"a
recorded chemical process, and nothing suggesting biology"* reads as a small molecule, and `'Proprietary process
(fictional).'` is a stated route with no biological words. The comment says this is the *"same rule §3.2.A.2 uses to
decide it may state an all-clear"*, and for §3.2.A.2 it is defensible. Reused for the composition boundary, the
consequence is that an under-described biologic is composed as a small molecule — applying ICH Q3A impurity reasoning
to a biologic, which is the exact harm `composition-scope.ts`'s own refusal message says the boundary exists to
prevent.

Not changed here, because the classifier is shared with §3.2.A.2 and tightening it would refuse real small molecules
whose route is terse — a product decision, not a session's. The options:

- **(a) Fail closed on the boundary only.** `compositionRefusal` treats a non-explicit small-molecule verdict as
  `CMC_MODALITY_NOT_ESTABLISHED` and asks for the modality to be recorded; §3.2.A.2 keeps the current reading. The
  smallest change, and it makes the boundary rest on a recorded fact rather than an inference.
- **(b) Require the modality on the drug-substance write.** Honest, and it would refuse every substance row already
  written without one until each is edited.
- **(c) Leave it.** The heuristic is documented, and the demo now states its modality — but any tenant whose
  substance record is terse is in mutation 5's position.

Recommendation: **(a)**. A boundary that decides what a filing may say should not rest on the absence of certain
words in a free-text field.

## Gates

`npm run test:ci-scripts`: **757 of 757 pass**. CMC service suites: **1,508 pass**. `tsc --noEmit` 0 errors. ESLint:
no warnings on the new file.

## One fixture lesson, recorded

Adding the materials step made the **other** demo test's fake throw *"Unexpected demo request"* — a test failing
because a sibling's fixture was the one that knew about the change. The fake is now one module
(`scripts/demo/launch-demo/cmc-demo-app.fixture.mjs`) that both suites use, so a new route is taught in one place. It
throws on an unknown request on purpose: a seeder that starts calling something nobody has thought about should fail
loudly, not receive an empty list.
