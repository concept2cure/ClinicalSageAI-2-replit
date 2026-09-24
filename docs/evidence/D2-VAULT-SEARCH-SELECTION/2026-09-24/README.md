# D2 — selecting a Vault search hit opens that document

**Row:** D2 Launch catalog (Vault). **Date:** 2026-09-24. **Session:** `session_01KnUGoX3g4R4FWKWGc2sTbN`.
Found by the 2026-09-24 Vault-against-Veeva mapping (workflow `wf_7221b784-39b`, taxonomy mapper).

## 1. What was wrong

A search hit was keyed by the document's bare uuid, and a tree leaf by `up-<uuid>`
(`server/routes/c2c/project-vault.ts`, `uploadLeaf`). The detail pane resolved the selection
against the tree only and otherwise fell back to the first hit. So with two or more hits, clicking
any hit after the first highlighted its row, showed the **first** hit's details, and told AnA the
first hit was selected. A hit for a document in the filing cabinet also lost its filing actions
(Confirm, Move, Place into submission), because a hit carries no filing block. Every existing
test mocked a single hit, so none could see it.

## 2. What changed

`client/src/concept2cure/v2/surfaces/Vault.tsx`:
- a hit is keyed `up-<uuid>`, the same key as the tree leaf for that document;
- the selection resolves against the tree first. The tree's record carries the filing block, and
  while searching it shows the hit's matching excerpt. A document that only the search found is
  shown as its hit.

One existing test used a hit and a tree leaf with the same id but different titles, which cannot
happen in practice because both come from the same row. Its hit now has its own id, so it still
tests the path it was written for: a document that exists only as a hit.

## 3. Proof

| | |
|---|---|
| `red/search-selection.txt` | Old surface: **2 of 2 fail**. Clicking the second hit leaves the first selected; no filing block appears for a filed document's hit. |
| `green/search-selection.txt` | 2 of 2. Every client test file that mounts the Vault: 7 files, 39 tests. tsc 0, ratchet unchanged. |
