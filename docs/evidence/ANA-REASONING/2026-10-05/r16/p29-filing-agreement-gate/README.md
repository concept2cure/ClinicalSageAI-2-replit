# P-29.2, increment 1 — a freeze refuses a document whose filed copy is not its text

Rows **D5** (Authoring) and **D1** (the governed record). Decision **P-29**
(`docs/EXIT_ATTESTATION_DECISION_2026-10-18.md`). Round 16 of the AnA reasoning
lane.

## What was wrong

`POST /api/authoring/docs/:docId/freeze` read and hashed `authoring_sections`
and then sealed, with **no cross-store check of any kind**. So a document whose
filed copy had been rewritten outside the editor — the MDx filing-side save is
the shipped door that does it — could be frozen, signed, exported and
submitted, with the signature attesting to text the submission does not
contain. Nothing anywhere said so.

The seal is where the refusal belongs, and the remedy is the reason: saving the
section rewrites the filed copy (`commitSectionToFiling`), so the author clears
it on the surface they are already on. After the seal the remedy is narrow: a
QMS-controlled document can be revised into a new editing copy
(`reviseControlledQmsDocument`), and every other document has no path at all.
That is why a divergence must not be allowed to reach a seal.

(An earlier draft said "nothing un-freezes or versions an authoring document".
Both halves are wrong: that revise path versions one, and
`updateControlledQmsDocument` can move a frozen one to IN_REVIEW without
consulting the seal — filed as an open seal bypass in the decision document.)

## The change

**`server/services/c2c/filing-section-target.ts`** — `filingAgreesWithEditing`,
beside `signedFilingSectionTexts`, which already computes what each outline
node should hold "by the same rule a save writes". Using it is deliberate: a
new module would be a second definition of that, which the zero-duplication
rule forbids and which would drift from the writer the moment either changed.
It writes nothing, takes the caller's executor rather than the pool so the
comparison sees the seal's own snapshot, and treats an absent store as "not
applicable" through the same cannot-fail probe `commitSectionToFiling` makes.

**`server/routes/authoring.router.ts`** — the comparison runs on the freeze's
transaction client, after the unresolved-work census and before
`reverifyAuthoringSigner`, so a refusal spends no re-authentication code. A
node whose filed text **differs** refuses 409 `FILING_DIVERGED`, naming the
keys and the remedy. A node the filing holds **nothing** for is reported on the
success response as `filingUnfiled` instead.

### Why that split, which is not a soft landing

Six editing-layer writers do not commit to the filing at all (apply-template,
`createSection` with content, the genesis seed loop, reorder, the title
rename), so `empty` has a large and legitimate population today, and refusing
on it would block freezes across the product for a gap whose fix is to route
those writers. `different` has no legitimate population: something overwrote
the filed copy outside the editor.

Reported rather than silent, because an author told nothing would reasonably
believe the seal covers what ships.

## Scope of this increment, and what is still owed

This is increment 1 of P-29.2. Still owed, in order: the two approval seals
(`/e-sign` with `meaning: 'APPROVER'`, and `/sign` at the last cleared step);
file-to-vault, the one exit outside the seal cone; **the device/IVD exits**
(`POST /build`, `/official`, `/assemble`), which read the filing, consult no
seal and hash neither store (P-29.3); and the CI gate that fails when a new
seal, signature, export or filing path does not run the check — without which
the eighth exit added later is open by default, which is how six non-committing
writers accumulated.

No new storage is owed. An earlier draft of P-29.2 called for a digest column
beside the signature; the approval already persists the signed text verbatim in
`frozen_documents.frozen_content`, hash-sealed, in its own transaction, and
`GET /docs/:docId/frozen` already recomputes and refuses on mismatch. What is
missing is only that the exits do not ask — they gate on a status word. So the
remaining increments are call sites for this function, not a migration.

## Files

- `red.txt` — the three cases failing with the gate stashed, the three controls
  that pass either way, and a false red that was briefly mistaken for the real
  one.
- `mutants.txt` — six mutants, all killed; the two cases that exist because a
  mutant survived; and two properties pinned by assertions whose mutant cannot
  be constructed, stated as such.
