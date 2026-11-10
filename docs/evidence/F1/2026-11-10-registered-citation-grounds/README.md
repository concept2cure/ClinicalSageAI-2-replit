# F1: a registered citation grounds the figure it is cited for

**Package F1 (repairs). Launch rows D2 and D7:** an AnA-drafted document reaches review, seal and filing only
through its independent check, and the check refused the product's own citation. Session
`session_01QoxbLcnW5jPvJSjjKQtvTA`, 2026-11-10, the founder-path lineage lane (COORDINATION, "→ Spine data room and
lineage", path (b), its checker half).

## What already exists

| Piece | Path | What it does | What it did not do |
|---|---|---|---|
| The grounding rule | `server/services/ana/grounding-core.ts` `assessGrounding` | Finds quantitative claims and asks each for a citation marker in its own sentence | Its markers were typed forms only: `[12]`, `(Smith, 2021)`, `p. 12`, an NCT or K number, "per the SAP". The product's own citation was not one |
| The saved-document reader | `server/services/authoring/authoring-read-render.ts` `runText` | Renders a citation run (`data-cite`) as `[citation: <name>, <locator>]` for a checker or for AnA | Unchanged here |
| The independent check | `server/services/ana/saved-document-critique.ts` `evaluateSavedIndependentCheck` | Re-reads the saved sections, runs the deterministic checks, and holds a critical or high grounding finding as **hard**. Separately holds a citation that does not resolve to a source registered to its section as hard (`citation_unavailable`) | Unchanged here |
| The release gate | `server/services/authoring/workflow-import-governance.ts` `assertIndependentCheckRelease` | Refuses a review signature, a freeze or an approval with 409 `INDEPENDENT_CHECK_REQUIRED` while the receipt is not current or a hard finding is open. A hard finding the latest check still reports cannot be marked resolved | Unchanged here |
| The check's action | `server/services/authoring/peer-review.ts` `runAuthoringIndependentCheck` | The existing review action that runs and records the check, with no model | Unchanged here |

Nothing new was built. One function and one pattern list changed.

## The defect

A person cites a Data Room source in the editor (Cite). The figure's sentence then reads, to the checker,
`Oral bioavailability of C2C-101 was 62% [citation: Biopharmaceutics: Study report].`

Two things went wrong, both in `grounding-core.ts`:
1. No citation pattern matched `[citation: …]`.
2. The sentence splitter cut the label apart. It breaks after `.`, `:`, `;`, `!` or `?` before a capital, a digit,
   `(` or `[`. So `citation:` before a capital name was a break, and so was `p.` before a page number. The claim's
   sentence became `… was 62% [citation:` and the rest was a second sentence.

So a registered, resolvable citation grounded nothing, and the check held the figure as a hard finding that nobody
could resolve. A typed `[1]` grounded the same figure. Observed directly on trunk:

```
false  "Oral bioavailability of C2C-101 was 62% [citation:"            (name starts with a capital)
false  "Oral bioavailability of C2C-101 was 62% [citation: study report, p."   (a page locator)
true   "Oral bioavailability of C2C-101 was 62% [1]."
```

## The fix

`server/services/ana/grounding-core.ts`:
- `RENDERED_CITATION` (`[citation: <non-empty>]`) is a citation marker.
- `splitSentences` does not take a break that falls inside a rendered citation. With no rendered citation in the
  text it splits exactly as before.

The bar is not lowered:
- The same-sentence rule holds. A citation in the next sentence grounds nothing (tested).
- An unclosed or empty label grounds nothing (tested).
- A citation that does not resolve to a source registered to its own section is still a hard finding of the saved
  check (`citation_unavailable`; the existing cases in the same suite, unchanged and passing).

## Evidence

- `01-red-before-fix.txt`: the new cases on trunk's checker. 5 fail (the four positive cases on the pure checker and
  the saved-document case over real SQL); the three negative controls pass.
- `02-green-after-fix.txt`: the same two suites with the fix, 61 of 61.
- The 26 suites that use the checker (`grounding-core`, `writing-precision-gate`, `check_grounding`, the saved-document
  critique and the independent check's callers): 686 pass, 1 fail. The failure is
  `server/services/ana/__tests__/sub-agent-toolset.test.ts` "no input of any child tool or check names a path, a
  directory or a folder", which fails the same way on trunk without this change (run with the fix stashed).
  **→ Anna runtime (`01KZK3…`).**

## What this does not fix

The founder-path walk (`tests/lineage/founder-path-lineage.pglite.test.ts`) is still 6 of 15. Its seal hop needs
more than this, and the larger blocker is not a defect:

1. **No model has passed PQ.** Every entry in `server/services/ai-governance/approved-models.ts` reads
   `pq: { status: 'pending' }`. By design (RULE 2, `governed-machine-claims.ts` `ordinaryMachineGenesisMayRelease`),
   text a model wrote is released only with a gateway receipt naming a PQ-passed model pin. So today no document
   holding AnA-written text can be signed for review, frozen or approved, and production refuses high-risk drafting.
   `npx tsx server/eval/pq/run-pq.ts --preflight` lists what stands before a PQ run:
   - `PROTOCOL_NOT_APPROVED` (PQ-DRAFT-001; the founder's signature, P-31);
   - the RAG bank: 18 of 30 positive items, none with reviewed source evidence, 5 open gold checks;
   - 18 source versions unverified and 4 publishers' terms unverified. The corpus manifest
     (`server/eval/rag/guidance-corpus-manifest.json`) records why: every issuer host is refused by the session's
     network policy. Seen again on 2026-11-10: `CONNECT tunnel failed, response 403` for `database.ich.org`,
     `www.fda.gov` and `www.ema.europa.eu`.
   - a product provider key.
2. **A person cannot cite inside a sentence AnA wrote.** The save is refused 422
   `MACHINE_LINEAGE_FORMATTING_UNVERIFIED` (`lineage-gate.ts`, `printing-annotation`): a citation prints text beyond
   its own words, so the machine's clause can no longer be matched, and the gate refuses rather than attribute the
   machine's words to the person. That is deliberate. With this fix, a sentence the person writes and cites passes
   the check.
3. **LX-06's source half.** `draft_authoring_document` takes Vault receipts (`sourceReferences`) and records each
   verified figure as a `vault_document` span, but the check reads text only, so a figure AnA verified against its
   source still reads as uncited.
