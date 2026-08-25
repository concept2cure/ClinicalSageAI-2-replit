# BP-W2-1 — Differentiate or merge the Biotech and Pharma lanes

**To:** JM Smith · **From:** Claude Code · **Date:** 15 August 2026
**Status:** RECOMMENDATION ONLY. Nothing implemented. The work order says
"This is a decision for me, not for you… No implementation until I choose."

---

## What the code actually says

The work order reports the two lanes as byte-identical. Measured, they are:

| | Biotech | Pharma |
|---|---|---|
| Surface ids in `SEGMENT_MODULES` | 57 | 57 |
| Same **set** of ids | — | **yes** |
| Same **order** | — | **no — one swap** |

The single ordering difference is at positions 7–10, and it is the accidental
one you found:

```
position 7:  biotech='cmc'          pharma='labeling-pi'
position 8:  biotech='nonclinical'  pharma='cmc'
position 9:  biotech='csr-workflow' pharma='nonclinical'
position 10: biotech='labeling-pi'  pharma='csr-workflow'
```

`labeling-pi` moved from position 10 to position 7 in Pharma and pushed three
modules down. Nothing else differs. The hero chips differ in first entry
(Biotech opens on *2.5 Clinical Overview*, Pharma on *2.7.1 Biopharmaceutic
Summary*), which is the extent of the lane-specific content.

So the product currently ships **two navigation entries for one experience**.

---

## The recommendation: MERGE, and put modality on the axis instead

### Why the split is on the wrong variable

"Biotech" and "Pharma" are descriptions of a **company**, not of a **submission**.
The regulatory work is decided by modality and pathway, and those cut straight
across the company label:

- A company that calls itself biotech files an **NDA** for a small molecule, or a
  **505(b)(2)** for a reformulation.
- A large pharma files **BLAs** through CBER for its vaccine portfolio and NDAs
  through CDER for everything else — simultaneously, in one organisation.
- An **ADC** is a biologic with a small-molecule payload and needs both Q3A
  impurity control and Q5E comparability.
- An **oligonucleotide** is regulated as a drug (CDER, NDA) while being
  manufactured like a biologic.

Every genuine difference in your own table — pathway, review centre, user-fee
programme, CMC core, bioequivalence relevance, exclusivity clock — is a function
of **modality × pathway**, not of which lane the customer clicked. Splitting
navigation on the company label means:

1. A customer with a mixed portfolio has to know which lane holds their program,
   and the answer is "either, they're the same".
2. Any real capability you build has to be built **twice** or made lane-aware,
   and lane is the wrong key to make it aware of.
3. The moment modality lands (BP-W2-2), the lane becomes redundant — modality
   already tells you CBER vs CDER, BsUFA vs PDUFA, Q5E vs Q3A.

### The reclaimed slot is the second argument

Merging returns a top-level navigation entry. On the evidence of your own gap
list (BP-W2-3), the two things most obviously missing a home are **Generics**
(ANDA, BE design, RLD identification, Orange Book, GDUFA — an offered filing
type with no supporting capability) and **Biologics CMC** (comparability,
immunogenicity, potency, lot release). Neither is served by a lane that is a
duplicate of another lane.

This also aligns with the shared-module-registry recommendation in the MDX work
order rather than pulling against it.

---

## Option A — Differentiate

Keep two lanes and make them genuinely different.

**Scope**
1. Land modality and product characterisation (BP-W2-2) — it is a prerequisite,
   not an accompaniment. Without it there is no field to drive differentiation from.
2. Split `SEGMENT_MODULES.biotech` / `.pharma` into real, divergent lists, and
   decide the fate of every one of the 57 surfaces: shared, biotech-only,
   pharma-only, or shown-but-different.
3. Build the lane-specific capability that justifies the split:
   - Biotech: comparability (ICH Q5E), immunogenicity, potency/bioassay,
     cell-bank characterisation, lot release (21 CFR 610.2), 351(k) biosimilarity.
   - Pharma: synthesis route and ICH Q3A/B impurities, polymorphism, dissolution,
     ICH M7, BE for 505(b)(2) bridging, Orange Book and exclusivity.
4. Make ~20 surfaces lane-aware in their copy, defaults and section models.
5. Route CBER vs CDER, BsUFA vs PDUFA vs GDUFA through the fee and timeline logic.

**Effort:** large. Steps 3–5 are the bulk and are mostly *new regulatory
capability*, not refactoring — they are the same work as BP-W2-3 whichever
option you choose.

**What you get:** two lanes that earn their place — *if* the customer's company
type reliably predicts their submission type. It does not.

**Cost you keep paying:** every future capability is a lane decision, and mixed
portfolios stay awkward forever.

---

## Option B — Merge (recommended)

One lane, "Pharma & Biotech", with modality as a filter and a driver.

**Scope**
1. Land modality and product characterisation (BP-W2-2) — same prerequisite.
2. Collapse `SEGMENT_MODULES.biotech` and `.pharma` to one list. Since the sets
   are already identical this is a deletion, not a merge — and it removes the
   accidental `cmc`/`labeling-pi` ordering divergence as a side effect rather
   than as a separate fix.
3. One navigation entry; modality becomes a filter chip on the module list and
   the program header.
4. Modality drives what is currently imagined as lane behaviour: CMC section
   model, comparability strategy, centre routing, fee programme.
5. Redirect the retired route so existing links and bookmarks do not 404.
6. Spend the reclaimed slot on Generics or Biologics CMC.

**Effort:** small-to-moderate for steps 2–5 — genuinely smaller than Option A,
because step 2 is deleting a duplicate rather than authoring a divergence. Step 1
is shared with Option A and step 6 is the real investment either way.

**What you get:** one experience to maintain, differentiation on the variable
that actually determines the regulatory work, and a navigation slot for a
capability gap you have already identified.

**Cost:** customers who self-identify as "a biotech" no longer see their word in
the navigation. Mitigated by the lane label ("Pharma & Biotech") and by modality
being visible on every program.

---

## What is shared either way

Both options require BP-W2-2 first, and both leave BP-W2-3's gap list untouched.
**The choice does not change how much regulatory capability you have to build —
only how many places you have to build it.** That asymmetry is the whole
argument for merging.

---

## The decision I need from you

- [ ] **A — Differentiate.** I add modality, split the module lists, and build
      lane-specific capability.
- [x] **B — Merge (recommended).** I add modality, collapse to one lane with a
      modality filter, redirect the retired route, and we pick a capability for
      the reclaimed slot.

## Decision record — 2026-08-17

JM delegated both calls ("Both but you decide"). Taken as recommended:

**B — Merge.** Executed on `concept2cure-v2`:
- BP-W2-2 landed first (`shared/regulatory/modality.ts` + program record +
  Mission Control identity strip) — the prerequisite both options shared.
- `SEGMENTS` now carries one `biopharma` lane ("Biotech & Pharma"); the
  `pharma` duplicate in `SEGMENT_MODULES` is DELETED, which removes the
  accidental `labeling-pi` ordering divergence as a side effect.
- The redirect: `SEGMENT_ALIASES` resolves the retired `biotech`/`pharma` ids
  everywhere a segment id arrives (getSegment, getSegmentContext,
  getSegmentModules, getCoauthor, and stored-preference reads in V2App), so a
  pref or deep link from before the merge lands on the merged lane instead of
  falling back to medtech. Pinned by test.
- The one hero action pharma had that biotech did not (Draft USPI label) is
  folded into the merged coauthor set; nothing else was lane-specific.
- The module-list modality FILTER is deferred, with the reason recorded: it
  needs a per-module modality-relevance model that does not exist yet, and
  inventing one ad hoc would be a guess — the same doctrine that keeps
  `normalizeModality('biologic')` returning null. The program-header half of
  the filter shipped with BP-W2-2.

**The reclaimed slot: Generics** — per this memo's own reading of BP-W2-3.
ANDA is an offered filing type today with nothing behind it, and BP-W1-3
corrected its module assignment so it can carry its own bioequivalence
evidence. `frameFor('small_molecule')` already names `ANDA 505(j) (GDUFA)` as
a pathway, so the frame layer is ready for it. Scope for the capability build
(BE design, RLD identification, Orange Book, GDUFA fee logic) is the next
work order to write — it is the "real investment either way" this memo named.

Either way, please also confirm which capability takes the slot / next
investment — my reading of BP-W2-3 is that **Generics** is the sharpest gap,
because ANDA is an offered filing type today with nothing behind it, and
BP-W1-3 has just corrected its module assignment so it can at last carry its own
bioequivalence evidence.
