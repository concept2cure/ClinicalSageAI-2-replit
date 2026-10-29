# D5: an author may not approve their own Authoring document (2026-10-29)

Session `…01E8btkB`. Found by the Part 11 audit of the CSR path, which was run
for the LMN-201 / RePreve CSR review (founder's request, 2026-10-29). A CSR's
sponsor approval must come from someone independent of its authors (21 CFR
11.10(g); ICH E6 sponsor oversight).

## What already exists

Searched: `assertSignerIsNotAuthor`, `requiresIndependence`,
`resolveTargetAuthors`, `checkMeaningAgainstAuthorship`, `SeparationOfDutiesError`
across `server/`; every handler that writes `authoring_signatures`.

| Exists | Path | What it does | What it did not do |
|---|---|---|---|
| The one separation-of-duties check | `server/services/governance/separation-of-duties.ts` `assertSignerIsNotAuthor` | Refuses an author (403), an unrecorded author (409) and a failed lookup (503). Authoring documents are modelled: their creator, the revision ledger and the visible-mutation audit | Was not asked by the authoring routes |
| The governed ceremony | `server/services/part11/governed-signature-ceremony.ts` `checkMeaningAgainstAuthorship` | Asks that check for every meaning but authorship | Not the path the editor signs through |
| Editor approval | `server/routes/authoring.router.ts` `POST /docs/:docId/e-sign` (APPROVER) | Checks signing authority, the document grant and password/TOTP, then approves and freezes the document and moves its bound filing sections to `approved` | Never asked whether the signer wrote the document. The creator is granted OWNER, which holds `approve` (`authoring-permissions.ts`) |
| Workflow signing | `POST /docs/:docId/sign` | Seals the document at the last cleared workflow step, for any meaning | The same gap |
| Later independence | `authoring-approval-carryover.ts`, `document-lifecycle.ts` | Check independence at Vault carry-over and Vault approval | Too late: the filing sections were already `approved`, and `leaf-source-resolver.ts` treats `approved` sections as transmittable |

Nothing was rebuilt. Both routes now ask the existing check.

## What changed

`signingRefused` (beside `sealRefusedForFiling` in `authoring.router.ts`)
runs the seal refusal, then `assertSignerIsNotAuthor` on
`authoring-document:<id>` for every meaning but AUTHOR. It runs before
re-authentication, so a refused signer spends no second factor, and inside
the signing transaction, so nothing is signed. `/e-sign` asks it for APPROVER.
`/sign` asks it for every meaning but AUTHOR, because any meaning can seal at
the last workflow step.

REVIEWER on `/e-sign` is not changed. Adopting an imported workflow draft is
a REVIEWER signature by the person who imported it, so refusing authors there
is a separate decision.

## Evidence: seen failing first

| Check | Red (trunk's router) | Green |
|---|---|---|
| `server/routes/__tests__/authoring-approval-independence.test.ts` | `independence-red.txt`: 5 failed / 7. The creator, a section contributor and an unrecorded author were each given an approval signature; `/sign` let the creator sign. The 2 that pass both ways are an independent approver and the author signing as AUTHOR | `independence-green.txt` |
| `node-status-follows-work.pglite.test.ts` (8 cases) and `filing-lock-write-through.pglite.test.ts` (1) on a real engine | These had the document's own author approve it: the harness seeded one user, "Avery Approver", who drafted and approved every document. They now fail with the check, which is the defect they encoded | With `APPROVER`, a second seeded member who drafted nothing: 25 / 25 |

`_filing-write-harness.ts` gains `APPROVER` and `signApproverToken`; the
suites sign approvals and the later review signature with that member, and
name that member as the workflow step's approver.

## Found, not this change's (red on trunk `8b58354af`, identical with and without it)

`route-suites-red-on-trunk.txt`: 11 cases in `authoring-atomic-mutations`,
`authoringApprovalNoWorkflow`, `authoringApprovalSealBinding` and
`authoringSignFreezeAndExportGate` answer 500. The cause is
`assertCsrScientificRelease` (`07857e3e3`, 2026-10-28). It validates the
saved snapshot (`fullVisibleAuthoringSnapshot`, UUID section ids) for every
document, CSR or not, before deciding whether the document is a CSR, and these
suites' fixtures use the ids "D1" and "S1". Production ids are UUIDs, so this
is a fixture defect, not a product one, but trunk's CI is red on it. Handed
on in `docs/work-orders/README.md`.
