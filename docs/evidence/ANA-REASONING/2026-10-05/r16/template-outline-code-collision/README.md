# The seeded 510(k) template files its sections under other sections' headings

**Verified at the line, 2026-10-18.** Handed on by the P-29 review as a claim I
refused to file as fact (the claim named the on-disk templates, which are two
single-section files, so it did not hold there). Re-checked against the store
document genesis actually resolves — `intelligence.document_templates` /
`intelligence.template_sections`, seeded by
`server/services/intelligence/template-seeds.ts` — and it holds, with the four
codes the review named.

## The mechanism, in three files

1. **`shared/regulatory/filing-section-key.ts`** — `filingSectionKey(keys, code)`
   matches an authored section to a filing outline node **by code only**. It
   never compares labels. It is the one rule shared by the server's filing write
   (`server/services/c2c/filing-section-target.ts`) and the editor's outline.

2. **`server/services/intelligence/template-seeds.ts`** — the seeded template
   `fda_510k_se`, "FDA 510(k) — Substantial Equivalence package",
   `submissionType: '510k'`, carries eight sections coded
   `D1, SE1, SE2, B1, B2, S1, L1, C1`. It is seeded at **startup**
   (`server/startup/services.ts:414`), so it reaches deployed databases.

3. **`migrations/20261005c_k510_denovo_estar_outline_v1_1.sql`** — the shipped
   k510 outline `fda-estar-510k-v1.1`, 38 nodes, keys
   `A, A1…A9, B, B1…B3, C, C1…C2, D, D1…D6, E, E1…E8, F, F1, G, G1…G2`.

## What collides

| Template section | Files into node | Node means |
|---|---|---|
| `B1` Bench testing | `B1` | **Device description and principles of operation** |
| `B2` Biocompatibility (ISO 10993) | `B2` | **Indications for use statement** |
| `C1` Clinical performance (if applicable) | `C1` | **Predicate and reference devices** |
| `D1` Device description and intended use | `D1` | **Design and manufacturing information** |

Four of the eight collide, and **all four mean something different**. The other
four — `SE1` Predicate device identification, `SE2` SE comparison matrix, `S1`
Software documentation, `L1` Labeling — are single-segment codes, so
`filingSectionKey`'s nearest-ancestor rule returns null (`nearest.split('.').length < 2`)
and they reach **no node at all**. Among them are the predicate identification
and the substantial-equivalence comparison matrix: the substance of a 510(k).

So biocompatibility test data is filed as the **Indications for Use statement**
— the single most consequential sentence in a 510(k) — and bench testing is
filed as the **Device description**.

## Reachable end to end

`POST /api/authoring/docs` with `template_id` → `resolveTemplateSections`
(`server/services/authoring/authoring-template-sections.ts`) →
`globalTemplateSections` reads `intelligence.template_sections.section_code` and
`section_title` → seeds `authoring_sections` with `code = section_code`. A save
then commits through `commitSectionToFiling`, which calls `filingSectionKey`.

The "Start from" picker (`GET /api/authoring/templates`) merges the global
reference templates and does **not** scope them to the project's filing class,
so a 510(k) project is offered this template.

## Why no cross-store gate can catch it

This is the one that matters for P-29. After the mis-keyed write **the two
copies agree**: the filing node holds exactly the text the editing layer holds
for that code. `filingAgreesWithEditing`, the approval's text-equality
comparison, and every digest in the signing chain all pass. The defect is not a
divergence between stores — it is that both stores agree on the wrong heading.

A gate that compares text cannot see a mislabelled join. Only a check on the
**vocabulary** can.

## Also visible in the same sweep, and not yet sized

`fda_ind` ("FDA IND application") carries codes `1571, 1572, PROT, CMC,
PHARM_TOX, PRIOR_HUMAN, IB`. None of those is a CTD outline key, so a document
started from the product's own IND template appears to reach the filing not at
all. That is the safer failure — invisible work rather than misfiled work — but
it means readiness would read empty for an author who has written the document.
Being sized properly rather than asserted here.

`fda_pma` carries `P1…P7`, which needs checking against the PMA outline's keys.

## Status

Finding filed. The fix shape — re-coding the device templates to the outline's
vocabulary, what to do about databases that already hold the wrong codes, and
which guard keeps it from recurring without producing false refusals on an
ordinary rename — is under adversarial review before anything is changed,
because correcting seeded regulatory reference data is not a change to make
from one reading.
