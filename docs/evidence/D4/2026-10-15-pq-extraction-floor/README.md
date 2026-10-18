# PQ-DRAFT-001 conditions 3 and 5: the extraction sample floor, and headroom above both floors (2026-10-15)

**Row:** D4 (only PQ-passed models serve high-risk regulatory drafting).
**Decision:** P-31, `docs/MODEL_GOVERNANCE_DECISION_2026-10-13.md`.

## What was owed

P-31 set six conditions for approving the drafting PQ protocol. Two were
fixed then. This change closes two more:

- **Condition 3.** Extraction had no sample floor, so the bank's 4 tasks per
  document type satisfied a protocol that asked for none. As
  `pq-verdict.ts` puts it, one scored item could qualify the component. The
  owed floor is 10 per document type.
- **Condition 5.** Generation sat exactly at its floor of 10. Retiring one
  task would have dropped the bank below it.

## What changed

**Gates.**
- `pq-protocol.json`: extraction `minTasksPerDocType: 10`, with its source.
  The protocol is `draft`, so no model has passed and amending it invalidates
  nothing.
- `pq-criteria.ts` `extractionCriteriaProblems`: a missing or non-whole floor
  is INCOMPLETE, never silently floorless.
- `pq-verdict.ts`: the floor is applied over tasks the pinned model
  verifiably answered. A fallback model's answer cannot make up the sample.
- `verify-pq-record.ts`: its private copy of the extraction-criteria check
  (minF1 only) is replaced by the shared reader. There is one reading of the
  criteria, not two.
- `gold-bank-floor.test.ts`:
  - the bank meets the extraction floor, counted as `run-pq` counts;
  - both components have headroom (retiring any one task leaves every type at
    or above its floor);
  - every expected extraction value is stated in its own source passage. The
    scorer matches by normalized containment, so a value the source does not
    contain is ground truth no faithful extractor can reach.

**Bank.** `gold-tasks.json` 0.4.0 → 0.5.0, additive only:

| docType | generation | extraction |
|---|---|---|
| 510k | 10 → 12 | 4 → 12 |
| cer | 10 → 12 | 4 → 12 |
| ind | 10 → 12 | 4 → 12 |

There are 30 new tasks: 24 extraction and 6 generation. They cover dossier
content the bank did not:
- **510(k):** Form 3881, the classification summary, the predicate table,
  detection capability and interference, biocompatibility, software and EMC,
  human factors, and cybersecurity/SBOM.
- **CE report:** classification and UDI, equivalence, the PMCF plan, revision
  and evaluators, state-of-the-art benchmarks, the GSPR mapping, the PSUR and
  the SSCP.
- **IND:** Forms 1571 and 1572, MRSD derivation, drug substance, drug product
  and container closure, previous human experience, a 15-day safety report and
  human PK with a food effect.

## How the tasks were made, and why they are not fabricated evidence

The source passages are **authored**: fictional sponsors, products and
identifiers, written to be regulatorily accurate. They follow the bank's
existing "Acme" tasks. Ground truth in an extraction task is defined by its
own passage, so it is constructed, not invented. **No captured candidate is
included**, because none was captured. That is the rule the bank states about
itself.

Each task went through these steps:
1. An SME author.
2. An independent SME reviewer told to break it: verbatim values, single
   faithful answer, real citations used correctly, no real names.
3. A repair of every must-fix finding.
4. A second review of the repair.
5. A final independent review of the full set.
6. A mechanical scan for values that match inside a wrong answer.

The fixes that came out of review, for the record:
- **Reformattable values.** Values a faithful extractor would reformat
  ("Over-The-Counter Use", "four", "Revision 04", "91.4%") were shortened to
  the substring every faithful answer contains.
- **Fields with two faithful answers.** MRSD in mg/kg vs mg, storage as
  "refrigerated" vs "2–8 °C", and the environmental-exclusion nature vs its
  CFR section were each resolved to one answer.
- **Real names.** A real company name ("Dunmore") and brand-like names
  ("Solace", "SpiroCheck", "Brightwater", "Northgate") were replaced with
  invented ones.
- **Unverifiable identifiers.** A notified-body number that could be real was
  replaced. A Basic UDI-DI whose GS1 check pair could not be confirmed was
  removed. GTIN-14 check digits were corrected.
- **Citations.** The Form 1571 environmental entry was moved to item 12. ICH
  Q3C is cited without an uncertain revision suffix. The FDA cybersecurity
  guidance is dated June 2025. The human-PK heading moved to the ICH E6
  "Effects in Humans" position.
- **Weak discriminators.** The fasted Tmax "1.5" sat inside the CI bound
  "1.53", and the safety factor "10" sat inside the rat NOAEL "100". The
  passages were changed so a wrong answer cannot match.
- **Over-broad forbidden patterns.** "no safety concerns" and "fda has
  determined" could appear in a faithful draft, so each was narrowed to the
  actual overclaim. Every generation task forbids "guaranteed", per the bank's
  convention, which `run-pq.test.ts` asserts.

## Verified by making it fail

With the gates in place and the bank unchanged, 5 tests went red
(`red-before-bank.txt`):
- `gold-bank-floor` extraction floor and headroom;
- `run-pq` "a perfect model is INCOMPLETE — and the reasons say why", "the
  sample floor is no longer one of those reasons", and the PASS control. Each
  failed on *extraction sample below the protocol floor of 10 per document
  type: 510k=4, cer=4, ind=4*.

The new `pq-verdict.test.ts` cases cover:
- no floor → INCOMPLETE;
- below the floor, where a fallback-answered task does not count →
  INCOMPLETE;
- `0`, `2.5`, `'10'` → named, not applied.

After the bank: `server/eval` passes, 16 files and 359 tests.
`typecheck:fast` exits 0. eslint shows no new warnings; the two present are on
trunk.

## What remains for approval

- **Condition 4.** Gold-bank coverage for CMC / Module 3 and Module 2.5–2.7.
  New document types start below both floors, so each needs 12 + 12 tasks.
- **Condition 6.** A product provider key, plus the RAG attribution items D4
  lists.

After that, approval is the system owner's signature, and the protocol stays
`draft` until it is given.
