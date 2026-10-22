# The medicines route question draws the same governed catalogue

Fifth slice of the founder's directive of 2026-10-12. The device and
diagnostics route question was put on the governed catalogue and keyed to the
regulator; this does the same for medicines, which is the other half of
*"across all medical device and diagnostics scenarios and all Biotech
scenarios"*.

## What was there

`project-setup`'s `submission_type`: ten hand-written labels in their own
vocabulary.

    ind · nda · bla · anda · 510k · pma · de_novo · maa · cta · jnda

FDA and EU filings mixed in one list; two of them device routes a medicines
project would never take and a device project was never shown; nothing said
about what any of them commits the programme to; no authority. Meanwhile the
governed catalogue held every one of those positions, annotated, and
`MODALITY_FRAME` already knew which pathways apply to which modality — and
nothing connected the two to the question a person answers.

## What this adds

**A governed bridge, both directions gated.**
`shared/regulatory/product-modality.ts` maps the interview's `product_type` —
the words a sponsor uses — onto the eleven modalities the frame reasons with.
A bispecific is an antibody as the frame reasons (one licence, one
comparability regime) and is listed separately in the interview because a
sponsor distinguishes them. A device or a diagnostic resolves to **nothing**,
on purpose: it is not a medicine and the device catalogue is where its routes
come from.

The gate found the asymmetry it exists to find: the frame holds `protein`
(CDER, licensed as a biologic, ICH Q5/Q6B) and **no `product_type` option could
say so** — a therapeutic protein had to be entered as something else. The
interview now offers "Therapeutic Protein", which is what makes the gate pass
rather than being baselined.

**The question is asked after the agency, in its own node.** The routes that
exist depend on the regulator, so a list drawn beside the agency question could
not know which regulator it belonged to — and a person who chose EMA would have
had to pick from FDA's routes to satisfy a required field. The flow is now

    regulatory_targets → submission_route → …

the same correction the device classification needed, for the same reason.

**The frame narrows the US list; the modality marks the EU one.** For the US,
`pathwayPositionsFor` asks the frame and offers what it allows, in the frame's
own order: a small molecule gets 505(b)(1), 505(b)(2) and the ANDA route; a
monoclonal antibody gets a biologics licence and nothing under section 505. For
the EU the frame holds nothing, so all four positions are offered and the
stated modality marks the ones it contradicts. That asymmetry is deliberate and
written down: the frame is the governed source for which US pathways a modality
may take, nothing holds its European equivalent, and inventing a second frame
would be worse than offering the four and saying which the answers speak
against — which is this platform's own rule.

**Four new caution rules, on which statute governs the product.** A biological
product is *licensed* under section 351 of the PHS Act; a chemical one is
*approved* under section 505 of the FD&C Act, and since the BPCIA transition of
23 March 2020 there is no 505 route for the products that moved:

| The answers say | Marked | As |
|---|---|---|
| a biological product | NDA, 505(b)(2), ANDA | `inapplicable` — PHS 351; FD&C 505; BPCIA § 7002(e) |
| a chemical product | BLA, 351(k), EU biosimilar MAA | `inapplicable` — FD&C 505; PHS 351(i) |
| biosimilar | a standalone 351(a) BLA | `needs_basis` — it means you are *not* claiming biosimilarity and owe the full programme, which some sponsors take deliberately |
| biosimilar | a full Article 8(3) MAA or conditional MA | `needs_basis` — the comparability exercise is not what carries it |
| a biological product | the Article 10(1) generic route | `inapplicable` — the route is a biosimilar application under Art 10(4) |

## A gate that was passing vacuously, now fixed

The availability gate held that **every position a rule names can be marked**.
Adding these rules showed its weakness: their positions were already reachable
through the region rule, so four new rules could have been added **without one
of them ever firing** and the gate would have stayed green.

Every rule is now **named** (`ruleId`), the name travels on the caution and
onto the record — so a reviewer can see which governed rule judged a choice —
and the gate is per-rule: every rule must fire on some fact a flow can state.
The mutation that adds a rule nothing can reach is red on that gate, which is
the check it exists to be.

## Two things the gates caught that the tests could not

- **The lint ratchet refused the file length**, and the fix is the split the
  file had been asking for: `pathway-positions.ts` lists the positions,
  `pathway-cautions.ts` holds the rules that mark them, and the dependency runs
  one way — the rules read the catalogue, never the reverse. `pathwayOptions`
  no longer attaches cautions at all; the engine composes the two halves
  (`withCautions` over the options), and the test composes them the same way.
- **The typecheck gate caught a dropped import.** Rewriting the test's import
  block replaced its `import { describe, expect, it } from 'vitest'` line, and
  every test still passed — vitest provides those as globals — while `expect`
  resolved to a one-argument signature, so 40 assertions carrying an
  explanatory message were type errors. Tests do not typecheck; that is why the
  gate is a gate. (This is the second time today: the earlier slice had a
  union member declared under one name and written under another.)

## Verification

- `product-modality.test.ts` (5): both directions of the bridge; a sponsor's
  word read onto the frame's; a device and a diagnostic resolving to nothing;
  and an unknown product resolving to nothing rather than a guess.
- `pathway-availability.test.ts` (26): the statute rules in both directions,
  each statute's own routes left alone, the biosimilar cases, the per-rule
  gate, and the rule name on the record.
- `pathway-question-uses-the-catalogue.test.ts` (29): the drawn medicines
  question — the frame's list in the frame's order for a small molecule, a
  biologics licence alone for an antibody, no device route among them, every
  position carrying its consequence and authority, the European four with the
  contradicted ones marked, and the question not asked of a device project at
  all; plus the question order through the new node.
- `mutations.txt`: **11 mutations, all red** — a modality unreachable from the
  interview, a product type resolving to a guess, a bispecific not read as an
  antibody, a biological product offered a 505 route, a chemical product
  offered a biologics licence, a biosimilar not asked to say so, **a rule
  nothing can state passing the gate**, the modality not read from the product,
  the medicines list ignoring the frame, the flow writing its own list again,
  and the route asked beside the agency again.
  One mutation first survived as written: adding a second `positions` key to a
  rule object, where the later duplicate wins in JavaScript, changed nothing.
  Rewritten to make the rule's own `when` return false, it is red on two cases.
- `green.txt`: **35 files, 634 tests** across the question engine, both
  catalogues, `tests/ana-intelligence` and the card.
- `ci:typecheck:no-regression` 0 errors; the design gates and the per-change
  lint ratchet pass.

## What is still open

- `APPLICATION_TYPES` in `types/submission-constants.ts` — nine bare labels —
  is consumed by seven surfaces outside the interview: project intake, eCTD
  compile, the CMC submission spine, the biostatistics filing placement and
  CrlLibrary. Migrating it is its own change with its own callers to check.
- The remaining question kinds: predicate strategy (which carries the explicit
  *no predicate* the marking rules still lack), device and IVD classification,
  designation — `shared/regulatory/special-designations.ts` already holds a
  governed taxonomy with each programme's basis, eligibility and incentives,
  so that question is an adapter rather than new knowledge — paediatric plan,
  and comparability.
