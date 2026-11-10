# F1: a person can replace a machine-written sentence in a section that holds a citation

**Package F1 (repairs). Launch rows D2 and D7.** Session `session_01QoxbLcnW5jPvJSjjKQtvTA`, 2026-11-10, the
founder-path lineage lane. The second of two repairs on the path a person takes with text a machine wrote (an AnA
draft, a workflow import); the first is `docs/evidence/F1/2026-11-10-registered-citation-grounds/`.

## What already exists

| Piece | Path | What it does | What it did not do |
|---|---|---|---|
| The lineage gate | `server/services/clinical-regulatory-evidence/lineage-gate.ts` `attributeMachineThenAuthor` | On every save, credits each clause to the machine that wrote it or to the person saving. When the content cannot be re-anchored by formatting, it refuses the save (422 `MACHINE_LINEAGE_FORMATTING_UNVERIFIED`) unless every prior machine span is carried exactly | It could not tell a machine clause a person **replaced** from one a person **kept and dressed** |
| The formatting readers | `machine-attribution.ts`, `machine-attribution-formatting.ts` | One markup scanner; which elements print something besides their text (a citation, a footnote, a cross-reference, an image's alt); strict re-anchoring of unchanged machine prose across formatting | Unchanged, and reused: no second scanner |
| The release gate | `server/services/authoring/governed-machine-claims.ts` `ordinaryMachineGenesisMayRelease` | Machine text is released only with a qualified generation receipt; the refusal tells the person to "replace it through the governed human editing path" | Unchanged |

Nothing new was built. One rule in the gate is narrower, and its helper sits in the existing split file.

## The defect

A citation prints text beyond its own words, so content holding one is never "safe" for formatting carry-forward. The
gate then required every prior machine span to be carried **exactly**. Run on trunk (`01-red-before-fix.txt`), each
refused with "unsupported markup prevents verification…":

1. **Rewrite a machine sentence and cite it, in one save.**
2. **Add a person's own cited paragraph after machine text**, when the machine span covers more than one paragraph.
   (The clause splitter cuts at white space, and `</p><p>` holds none, so one span often covers several paragraphs.)
3. **Rewrite a machine sentence in a section that already holds a citation.**
4. **Delete a machine sentence from a section that holds a citation.**

So once a section was cited, no machine sentence in it could be rewritten or deleted; and the release gate tells the
person to do exactly that. The only way through was to remove every citation, rewrite, and cite again.

## The fix

`lineage-gate.ts` `previousMachineSpansAccountedFor`. A prior machine span that is not carried exactly is accepted
only when both hold:
- the one obstacle, in the prior content and in the new, is a printing element (`printing-annotation`). Source mode,
  a place two readers may disagree and unsupported markup are refused as before;
- no sentence of the span is left in the part of the new content this save credits to its saver. Its words are then
  either still credited to the machine (an unchanged sentence, carried by formatting) or gone.

`machine-attribution-formatting.ts` `wordsKept` looks for each sentence of the prior span three ways, so words that
were **kept** are found however they were dressed:
- in the characters as saved, tags and attribute values included (words moved into a `title`, a citation's label);
- with the tags taken out (words wrapped or split by an inline tag);
- with the tags and every printing element taken out whole (a citation put between the words).

Tags are read both as nothing and as a space; character references are decoded; case, sentence punctuation and white
space are not compared. A span with no sentence long enough to compare is never called gone.

## What is still refused (each a test)

- A citation added at the end of a kept machine sentence, or in the middle of it.
- Kept words moved into a printed attribute, written with a character reference, or split by an inline tag.
- A kept and cited sentence beside an unchanged one of the same machine span.
- A replaced sentence when the obstacle is source mode or a place two readers may disagree.
- **The limit, pinned:** a deletion that would leave an unchanged machine sentence credited to the saver. One span
  covers two paragraphs; deleting the first leaves the second unmatched. Carrying it would need the re-anchoring to
  follow a removed block, which is not done here.

## Evidence

- `01-red-before-fix.txt`: the suite on trunk's gate, 4 fail and 20 pass. The four are the cases above (the pinned
  limit fails at its set-up step, which is case 2).
- `02-green-after-fix.txt`: 24 of 24.
- The 30 suites that use the gate or the attribution module: 557 of 557. Typecheck 0. The lint ratchet shows no file
  changed its warning count (the helper went into the split file because `machine-attribution.ts` is at its length
  limit).
- The founder-path walk is unchanged, 6 of 15: it stops earlier, at the independent check.

## Not done

- `tests/db/workflow-import-formatting-lineage.dbtest.ts` (real PostgreSQL) was not run here.
- Not walked in the running app: the editor's Cite and save were not exercised in a browser in this change.
