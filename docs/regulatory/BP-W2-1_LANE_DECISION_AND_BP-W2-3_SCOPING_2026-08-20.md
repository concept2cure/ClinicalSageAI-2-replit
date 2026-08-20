# BP-W2-1 — Lane decision (both options, scoped) · BP-W2-3 — Capability gaps, scoped as tasks

**Date:** 2026-08-20 · **For:** JM Smith · **From:** Claude Code session
**Status:** BP-W2-1's acceptance asks for a written recommendation with scope and effort for both options, and no implementation until you choose. The complication, flagged in the remediation report: an earlier session already *implemented* the merge (ledger L65). This document therefore scopes **ratify** and **reverse** — the two options that actually exist on today's trunk — and scopes BP-W2-3 against the merged architecture.

Effort legend: **S** ≤ 1 session · **M** 2–5 sessions · **L** multi-week.

---

## BP-W2-1 — the Biotech / Pharma question

### Where trunk stands

The lanes were merged into one `biopharma` lane (single 57-surface registry, aliases for old `biotech`/`pharma` deep links) on the reasoning your own comparison table implies: review centre, pathway, fee programme and CMC core are functions of **modality**, not of the company label. Since then, modality has been made to do that work (BP-W2-2): it drives CDER/CBER routing and the Module 3 section model, and the characterisation fields (INN, dosage form/route, ATC, application number, phase, orphan, expedited programmes) persist on the program.

### Option A — Ratify the merge · effort S · risk low

What remains is residue, not architecture:

| Item | Where | Effort |
|---|---|---|
| Biotech \| Pharma toggle still live | `BiopharmaJourney.tsx` — repurpose as a modality-group filter or remove | S |
| Company-type signup options | `ZenSignup.tsx` ("Pharmaceutical Company" / "Biotechnology Company") — collapse or keep as marketing labels mapped to `biopharma` | S |
| Server still splits the axis | `mission-control.ts` `customerTrack: z.enum(['biotech','pharma',…])` — add `biopharma`, alias the two legacy values on read, migrate stored programs | S |
| Biotech defaults | `Projects.tsx`, `BatchDraft.tsx` default `'biotech'` | S |

Ratifying also unblocks BP-W2-3 scheduling (below) and keeps the reclaimed navigation slot.

### Option B — Reverse to two lanes · effort L · risk high

Restoring `biotech` and `pharma` as separate lanes is cheap only in its dishonest form (duplicate the registry again — which recreates the UAT's byte-identical finding verbatim). The honest form requires making the lanes *actually different*, which means porting the modality-driven divergence into per-lane surface sets: fork the 57-surface registry, decide per surface what differs (CMC, journey, hero, quick actions), maintain two navigation trees, and keep the alias layer for a third URL generation. Estimate L, and the end state duplicates what modality now provides for free.

### Recommendation

**Ratify (Option A)**, schedule the four residue items as one S task, and record the decision in the ledger so the next session doesn't reopen it.

---

## BP-W2-3 — capability gaps, scoped as separate tasks

Scoped against the unified catalog (BP-W1-2) and the modality layer (BP-W2-2). Several rows already have their *catalog* half done — the gap is the capability behind the entry.

| # | Task | What exists today | What the task builds | Depends on | Effort |
|---|---|---|---|---|---|
| G1 | **Generics suite** — BE study design, RLD identification, Orange Book patents/exclusivity, GDUFA | ANDA/ANDS/DCP catalog entries corrected (M1–M5, BE in 5.3.1); biostat engines incl. power calculators | BE crossover design calculator wired to the biostat workbench; RLD/Orange Book lookup (external data feed — needs a source decision); GDUFA fee model | BP-W2-1 ratified; Orange Book data source | L |
| G2 | **Biologics CMC** — ICH Q5E comparability, immunogenicity, potency/bioassay, cell banks, 21 CFR 610.2 lot release | `cmcSectionModelFor` names all five per modality; catalog + blueprints exist | The workflows behind the names: comparability protocol builder (Q5E), lot-release register (610.2), cell-bank inventory | BP-W2-1 ratified | L |
| G3 | **SPL submissions, drug listing, NDC labeler code** | SPL exists as a labeling format only | SPL document generation + drug-listing submission type + NDC register | — | M |
| G4 | **Field Alert Report** (21 CFR 314.81(b)(1)) | Nothing | New filing type + the three-working-day clock in the PV deadline engine + intake form | — | S–M |
| G5 | **PADER** (21 CFR 314.80(c)(2)) | Filing type, blueprint and authority landed with BP-W1-2/W1-4 | The periodic scheduler (quarterly ×3y, then annual) + case aggregation from the PV store | — | M |
| G6 | **Expanded Access IND** (21 CFR 312 subpart I) | Nothing | Catalog entry + intake variant of the IND pack (single-patient / intermediate / treatment) | — | S–M |
| G7 | **DMF types II–V** | One generic `US_DMF` entry | Split into typed entries (II substance, III packaging, IV excipient, V other) with per-type blueprints | — | S |
| G8 | **ICH Q12 established conditions + PACMP** | CMC change-control tab exists | PACMP document type + established-conditions register bound to the change-control tab | G2 helps | M |
| G9 | **RTOR, Project Orbis, Priority Review Voucher, Pediatric Written Request** | Priority Review landed as a catalog designation entry (BP-W1-2) | Process models (timelines, gates, submission rhythm) — distinct from dossier types; suggest RTOR first | — | M each |
| G10 | **EUA for drugs and biologics** (FD&C §564) | `US_EUA` exists but device-segment | Pharma-segment EUA entry + request template + amendment lifecycle | — | S |

Suggested first wave once BP-W2-1 is ratified: **G7 + G10 + G4** (small, self-contained, close real regulatory obligations), then **G5** (the scheduler makes the PADER entry real), then G2/G1.

---

- [ ] BP-W2-1 decision recorded (ratify / reverse), date: ______________
- [ ] BP-W2-3 first wave approved: ______________
