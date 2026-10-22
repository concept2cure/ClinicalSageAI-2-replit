# Every value a question offers is a value the engine reads

Seventh slice of the founder's directive of 2026-10-12. It came out of a
read-only sweep run before writing a classification question — five blind
searches over the same codebase for where a risk class is enumerated, where it
is asked, who consumes it, what IVDR knowledge exists, and whether the project
wizard's route list duplicates the governed catalogue.

The sweep found the classification question is a bigger job than it looked
(below). It also found that **two flows had already drifted out of the fact
reader's vocabulary**, silently disabling the marking rules landed earlier
today — which is this slice.

## The gate that was only half there

`cautioned-positions.test.ts` holds that every field the fact reader names is
still a field some flow asks, so a renamed field cannot leave the rules firing
on nothing. It said nothing about the **values**:

| Flow | Offers | The reader knew | Consequence |
|---|---|---|---|
| `cer-report` | the full seven MDR classes, including `class_is`, `class_im`, `class_ir` | four | a sterile, measuring or reusable-surgical Class I programme stated **no class at all**, so every route caution that reads the MDR class went unmarked for it |
| `device-pma` | `class_ii_pma` — "Class II (transitional — PMA required)" | `class_ii` | a PMA programme that picked it stated no class either |

Both are the same outcome as an unanswered question — and that is exactly why
they were invisible. The reader's honest rule is that an unknown value states
nothing, which makes a silent miss indistinguishable from a deliberate
non-answer. **The difference has to be written down.**

`DECLARED_NON_FACTS` is that writing-down: per field, each value that states no
fact and the reason it states none. `every-offered-value-is-read.test.ts` then
walks every option of every fact field in every registered flow and refuses a
value that is neither read nor declared — and a second case refuses a
declaration for a value no question offers, so the list can only shrink as the
flows change. A baseline with no reason is the thing that mechanism exists to
prevent.

The gate found **15** unread values. Each was then decided, not baselined:

- **The MDR Class I variants read as Class I.** Is, Im and Ir *are* Class I
  devices; the notified body is involved for the sterile, metrological or
  reprocessing aspects alone (MDR Art 52(7)) — which is what the Class I route
  position already says. The Annex VIII rules never *yield* Is/Im/Ir, which is
  why the platform's own rule engine types the class with four values while
  this reader needs seven keys; both are right, and the relation is now written
  where it is read.
- **The transitional Class II PMA device reads as Class II**, and the PMA
  caution now names the basis that answer asserts: a transitional or
  reclassified Class II device for which FDA has called for premarket approval.
  The caution asks for exactly what the answer claims, instead of nothing.
- **The class asked under the second field id is read.** Two flows (labeling,
  the medical-device SOP specialisation) ask `device_classification` rather
  than `device_class`; the class they state is the same fact, and reading it
  extends the marking to those programmes for free.
- **An answer that states a statute and no modality is read as the statute.**
  "Biologic (BLA)", "Other Biologic", "Prescription Drug (NDA)" name which
  statute governs the product without naming a modality. The frame has no view
  of "a biologic" — it reasons about monoclonal antibodies — but the statute is
  precisely what decides whether a section 505 route or a biologics licence is
  open, so five flows' product answers now mark routes where before they marked
  nothing. The two vocabularies are held **disjoint** by invariant, so one
  answer can never put two statutes on the record.
- **A stage of material is not a product.** The stability interview asks
  whether the material under study is the substance, the product or an
  intermediate; none of them says what the product is. Declared, with that
  reason.
- WHO prequalification and "a reference device only" were already deliberate
  non-facts; they are now declared as such rather than relying on a reader
  knowing the code.

## One empty select the gate exposed

Mapping labeling's `combination` to the frame's `combination` modality showed a
latent defect in the resolver landed earlier today: `MODALITY_FRAME.combination`
holds **no pathways** — the lead centre is assigned by primary mode of action
(21 CFR Part 3) — so the medicines route question resolved to an empty list and
drew *an empty select*. The resolver's "say why instead" branch covered only an
unknown regulator, not a regulator it knows for which the frame holds nothing.

It now covers both, and the reason is **the frame's own sentence**:

> AnA holds no route for combination: Lead centre is assigned by primary mode of
> action under 21 CFR Part 3 (RFD when unclear). Until that determination is
> made the route follows from it rather than from the product type, so describe
> the route you are taking and she will record it in your words.

## Verification

- `every-offered-value-is-read.test.ts` (8): the gate in both directions, the
  two drifted values, the statute-only answers, the modality taking precedence,
  a stage of material reading as nothing, and the second field id.
- `product-modality.test.ts` (8): the statute reader, and the disjointness
  invariant from both sides.
- `pathway-question-uses-the-catalogue.test.ts` (+1): the combination product
  offered nothing, told why in the frame's words, with the hatch.
- `mutations.txt`: **12 mutations, all red** — the seven MDR classes read as
  four, the transitional device stating no class, the second field id unread, a
  non-fact passing undeclared, a stale declaration surviving, **the gate
  reading no flow at all and still reporting success**, the statute unread, a
  stage of material read as a product, a product type stating a modality and a
  statute at once, an empty select where the frame holds no route, the frame's
  words replaced by a sentence of ours, and the PMA caution dropping the
  transitional basis.
  Two of them first survived as written, and both told me something. The
  "scans nothing" mutation had weakened the guard rather than the scan — rerun
  against the scan itself, it is red. The "statute read alongside a modality"
  mutation showed the precedence guard I had written was **unreachable**,
  because the two vocabularies are disjoint; the guard is gone and the
  disjointness is an invariant test instead, with its own mutation.
- `green.txt`: **38 files, 667 tests**; `ci:typecheck:no-regression` 0 errors;
  the per-change lint ratchet reports no file gained a warning.

## What the sweep found that is still open

Recorded here because it is measured, and because each item is a decision
rather than a task:

- **The classification question is not one question.** The US class is
  enumerated at least fifteen times across the repo (three with different value
  sets), the MDR class exists in two shapes that are both right — four values as
  the Annex VIII rules *yield*, seven as a sponsor *declares* — and the IVDR
  class A–D is enumerated eight times and **asked by no question anywhere**.
  The canonical pieces already exist and are good: `EU_MDR_RULES` (Annex VIII
  Rules 1–22) and `EU_IVDR_RULES` (Rules 1–7, with the Rule 2 marker table and
  the Rule 4(a) analyte table) in `server/services/market-specs/device-classification.ts`,
  the per-class Article 48 route statement in
  `server/services/regulatory/ivdr-classification.ts`, and a fail-closed
  `classify_device` tool that returns `class: null` plus `missingFacts` rather
  than guessing. A question must draw on those rather than become a sixteenth
  list, and the CER interview already asks the Annex VIII facts
  (`invasiveness_type`, `body_contact_type`, `duration_of_use`) that the engine
  needs — with nothing connecting them.
- **`server/routes/device-projects.ts:46`** validates against
  `['I','II','IIa','IIb','III']` — two regulatory regimes in one list — and
  **defaults `deviceClass` to `'II'`** when none is given, which writes a
  fabricated classification to storage.
- **Dead field ids, the same shape as the dead branches.** The PMA war-game
  auditor reads `answers.advisory_panel`, `answers.device_classification` and
  `answers.iec_62304_level`; `device-pma.ts` asks `review_panel` and
  `device_class`. The cross-node issue detector reads `flat['classification']`,
  `flat['clinical_data_available']`, `flat['risk_level']` and
  `flat['human_factors_study']`, none of which is a field id in any flow.
- `REGULATORY_PATHS` in the wizard's classification module has **zero
  importers** of its exported array, and two of its six values are unreachable
  in production.
