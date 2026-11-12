# The device demo pack: an independent reviewer, a filing with text, and no stray leaf (2026-11-12)

Package **DATA** (the demo seed), for launch row **D2**. Session `session_011DpxUyQmE1enma4gTjcfBy`. It closes three
items of the GA map's ledger (`docs/evidence/GA-READINESS/2026-11-10/ledger.json`), all in
`scripts/demo/launch-demo/packs/mdx.mjs`, which no session held:

| Item | Was | Now |
|---|---|---|
| `GA-DEMO-11` | The 510(k) Summary's review was asked of the second signer, who then froze and approved it. Where an organisation has more than one member, the person who reviewed a version does not approve it (P-95 as clarified 2026-11-09, P-116). The product does not refuse it yet (`GA-ADV-01`), so the seed worked, and would stop the day the product follows the decision. Handed to this session in `COORDINATION.md` ("→ the demo seed's owner"). | The third person (`OQ_APPROVER_*`, the Codespace's reviewer) is asked, signs the review and seals v1.0; the second signer (`OQ_SIGNER_*`) approves. With two people the second reviews and seals, and nobody approves: the step says why. |
| `GA-DEMO-10` | The seeded NeuroPanel-Dx export answered 422 `NO_AUTHORED_CONTENT`. The pack authored its documents as working documents of the project; none was the filing's editing copy, so the project's filing (its eSTAR outline, 38 sections) held no text. | The pack creates the filing's editing copy the way the editor's filing list does (`POST /api/authoring/docs` naming the filing, as `FilingMarkets.tsx`), and saves nine sections into it with a reason, which files them. Every section is filled from text the pack already authors (`mdx-content.mjs`); nothing new is written. The export answers 200. |
| `GA-DEMO-12` | The pack asks the leaf route whether it takes an eSTAR section code by placing a leaf. Since the route began to answer 200 that leaf stayed: a seventh, a second copy of the device description. | The probe's leaf is removed again, with a reason, and one an earlier run left is removed too. Six leaves, as the walkthrough says. |

## What already exists (RULE 3)

Nothing was built. Each change uses a route the product already offers and the editor already calls:
- `server/services/authoring/authoring-documents.ts` `resolveBinding`: a document is the filing's editing copy only
  when its create names the filing.
- `PATCH /api/authoring/sections/:id` with a `changeReason` commits the section to the filing
  (`server/services/c2c/commit-section-to-filing.ts`); its answer says `filing.committed`.
- `DELETE /api/submissions/sequences/:seqId/leaves/:leafId` with a reason.
- `lumen-vault.mjs` `connectApprover`: the third person, as the Lumen pack already uses it.

The filing step is split into `packs/mdx-filing.mjs` (RULE 6: a split stays in the folder it came from).

## Proof

- **Tests, red first.** `mdx-reviewer-is-not-approver.test.mjs` (three people, two, one) and `mdx-filing.test.mjs`
  (the copy names the filing; each section is saved with a reason; a second run writes nothing; a run stopped part
  way is finished; the probe leaves no leaf). Each was seen failing before the change; the reviewer test fails again
  when the old choice of people is put back. All 165 tests in `scripts/demo/launch-demo/` pass.
- **From an empty database**, with trunk's own `.devcontainer` scripts (a fresh Codespace state and database):
  - "request review, submit to workflow, freeze v1.0 … review → rhea.reviewer@concept2cure.pro … frozen v1.0 by
    rhea.reviewer@concept2cure.pro (REVIEWER)";
  - "e-sign the frozen 510(k) Summary as the second signer (APPROVER) … signed by ava.approver@concept2cure.pro";
  - "the dossier text is written into the 510(k) filing … 9 sections filed through … (created)";
  - "eSTAR section codes on the leaf route (probe) … the probe's leaf was removed again (1)"; "6 leaves".
- **A second run over the same data** (the Codespace restarting): "already approved on a previous run", "already
  signed", "9 sections already filed", "6 leaves (0 placed this run)".
- **Walked in the running app** (`k510-export.cjs`): on the seeded project's 510(k) screen, as Rhea Reviewer,
  "Export 510(k) package" answers 200 and downloads `_Demo_MDX_NeuroPanel-Dx_510_k__content-package-draft.zip`, "0
  formatting errors, 1 warnings to fix before submitting".

## Seen, not changed here

- The approval step's line reads "signed … over freeze vapproved": the signature's `covered_freeze_version` comes
  back as the word "approved", not a version number. The line was the same before this change.
- Between the first and the second run the frozen document's content hash differs (`05f03a2a2250…`, then
  `f8c24b818abc…`), with the approval in between. Whether the frozen read reports the approved version's hash by
  design is for the authoring lane to say.
