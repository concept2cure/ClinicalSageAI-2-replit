# P1-42, client half — the Pathway approval card offers the closed meaning vocabulary

**What was wrong.** P1-42 made `POST /api/esignature/sign` refuse a meaning outside
`GOVERNED_SIGN_MEANINGS` (§11.50(a)(3), DP-55). Its only UI caller, the approval card in
`client/src/concept2cure/mdx/surfaces/pathway/PathwayPanes.tsx`, took the meaning as free text
("e.g. Reviewed and approved") and seeded it from the approval feed's free-text `meaning`. Every
signature typed there would have been refused with a 400.

**What is true now.** The card offers a `<select>` of the five meanings the shared `EsignModal`
offers, read from one list, `client/src/concept2cure/_shared/esignMeanings.ts` (moved out of
`EsignModal.tsx`, which now imports it: one list, no copy). Free text from the feed is not a meaning;
the card starts on `approval`. The receipt line shows the meaning's label.

| Check | Before | After |
|---|---|---|
| `ApprovalCard.meaning.test.tsx`: a combobox named "Meaning of signature" offers exactly authorship, review, approval, responsibility, release; the sign call carries the selected id | red (`red/approval-card-meaning.txt`: no combobox; only a textbox) | green (`green/approval-card-meaning.txt`, with `DossierDrawer.history.test.tsx` from the same file) |
| `esignModalOpenReset.test.tsx` (EsignModal reads the moved list) | — | green |

`ApprovalCard` is now a named export so the card can be tested alone; nothing else changed in it.

```
npx vitest run client/src/concept2cure/mdx/surfaces/__tests__/ApprovalCard.meaning.test.tsx \
  client/src/concept2cure/mdx/surfaces/__tests__/DossierDrawer.history.test.tsx \
  client/src/concept2cure/_shared/components/__tests__/
```
