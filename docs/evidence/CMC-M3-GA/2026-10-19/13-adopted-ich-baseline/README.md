# "Which documents govern this?" — answered for every regulator, through the baseline they adopted

## What was audited, and why

The CMC module's standing goal includes AnA being the expert on CMC across the
global regulators. So the knowledge layer was audited the way a client uses it:
**13 authorities × 7 CMC topics = 91 questions**, asked of the two tools that
answer them (`probe-every-regulator.ts`, `measure-guidance.ts`).

Most of what was found is that it works. Every one of the 91 questions is
answered by `get_cmc_requirements`, with the authority's own requirement where
it has one and the ICH baseline it adopts otherwise, each tied to a cited
source. The 18-issuer record (FDA, ICH, EC/EMA, NMPA, Health Canada, TGA,
MHLW/PMDA, ANVISA, MHRA, Swissmedic, HSA, WHO, MFDS, CDSCO, PIC/S, EDQM, USP,
peer-reviewed literature) resolves the names a client actually types — *Japan*,
*China*, *UK*, *Australia*, *Canada*, *Brazil*, *Singapore*, *Korea*, *India* —
and an authority it does not know is refused **by name**, with the list of those
it holds, rather than answered as "none".

One tool disagreed with the other:

```
91 questions (13 authorities × 7 topics)
  get_cmc_requirements answers   91/91
  find_cmc_guidance answers      49/91
```

`findCmcRequirements` had always included the ICH baseline — its own comment
says *"the named authority's own requirements before the ICH baseline it
adopts"* — and `findCmcGuidance`, the tool that answers **which documents
govern a question**, filtered strictly by authority. So *"which documents govern
stability for an EU CTA?"* found nothing, and AnA was instructed to answer **not
indexed** about ICH Q1A(R2): a guideline the record holds, under ICH, and the EU
has adopted. Forty-two of the ninety-one questions were in that state.

The pathway each authority receives the quality dossier through is in the
record too, by its own name (`every-regulator.txt`):

```
  FDA             IND - Investigational New Drug Application (CMC section per 21 CFR 312.23(a)(7))
  EMA             CTA under EU CTR (Regulation (EU) No 536/2014) via CTIS - IMPD quality part
  PMDA            Clinical Trial Notification (治験計画届, CTN) | Marketing approval application (J-NDA)
  NMPA            Drug Clinical Trial Application (药物临床试验申请) | Drug Marketing Authorization…
  ANVISA          DDCM (Dossiê de Desenvolvimento Clínico de Medicamento) + DEEC…
  MFDS            Clinical Trial Plan Approval (임상시험계획 승인, Korean IND) | Product approval (품목허가)
  CDSCO           Clinical trial permission – Form CT-04 (application) / Form CT-06 (permission)
  …
```

## The change

`findCmcGuidance` now includes ICH when an authority is named, and ranks the
authority's own documents first — the same arithmetic as its sibling. Each
returned ICH document carries `adopted_by`, and the result carries one line
telling AnA to cite it as ICH and say it applies through adoption, not as the
authority's own text.

**The flag is per document, not one note about the list.** `fit` drops entries
from the end to meet the result budget, so a note saying "includes the ICH
baseline" could outlive the document it described. That case failed on the first
run and is now a test.

**An unknown authority is still refused.** `resolveAuthorities` answers `[]` for
a word the record does not know, and no baseline is lent to an empty list — so
`No authority "Atlantis Medicines Agency" in the record` still fires instead of
a list of ICH documents answering a question about nobody.

## The measurement moved for the wrong reason first

The first attempt added `own * 5` to the rank as a flat bonus. Coverage read
**91/91** and looked finished. It was wrong: a flat bonus gives every document
of the named authority a positive rank, so the topical filter below kept all of
them — *"which documents govern container closure for ANVISA?"* returned
ANVISA's whole shelf.

`own` is now a **tie-breaker among documents that already match**, never a match
of its own, and the honest number is:

```
91 questions (13 authorities × 7 topics)
  get_cmc_requirements answers   91/91
  find_cmc_guidance answers      80/91

11 question(s) for which the document search finds nothing:
  · EMA / container closure      · ANVISA / container closure
  · MHRA / container closure     · Swissmedic / container closure
  · NMPA / container closure     · HSA / container closure
  · Health Canada / container…   · MFDS / container closure
  · TGA / container closure      · CDSCO / container closure
                                 · WHO / container closure
```

**49 → 80 of 91**, not 91. Every remaining silence is one topic: no document's
code, title or scope is written for *container closure* — ICH Q6A governs it
inside its requirement statements — and three authorities hold their own
document for it while fourteen do not. `get_cmc_requirements` answers all
fourteen, so **no question is one neither tool can answer**, which is the claim
the test makes.

## Shown failing first, in both directions

`adopted-ich-baseline.test.ts` (14 cases).

Against the **strict filter** — the defect — 6 fail:

```
× answers the questions that were answered as "not indexed"
× leaves no question both tools are silent about
× ranks an authority’s own stability document above the ICH baseline
× still lets a materially better topical match win, whoever issued it
× names the issuer in every citation, so a baseline is never read as the authority’s own text
× marks each adopted document as adopted, by the authority that adopted it
```

Against the **flat bonus** — my own first attempt — 3 fail:

```
× leaves no question both tools are silent about
× is silent about the one topic no document is titled for, where it is
× does not return a document that matches the question in no way
```

The last of those is the guard that catches the regression directly:
`findCmcGuidance('xyzzy plugh nothing', 'TGA')` must return nothing.

## What the tests assert, and what they deliberately do not

They assert **properties that stay true as the record is updated**: the nine
named authority/topic pairs that were silent now answer; no question is silent
in both tools; a returned document always matches the question in some readable
way; an unknown authority matches nothing; the authority's own documents come
first; an adopted document is cited as ICH and marked adopted.

They do **not** assert the counts 49 and 80, or which three authorities hold
their own container-closure document. Those are facts about today's record, and
a test that pins them fails the next time the record is refreshed — telling
nobody anything about the retrieval it was written to protect. The first draft
of this test did pin a shape (`expect(silent.length).toBe(ADOPTERS.length)`) and
was wrong about it within a minute: FDA holds its own container-closure
document, so the silence was 14 of 17 and not 17 of 17.

1379 tests green across the knowledge, AnA tool and CMC service suites.
