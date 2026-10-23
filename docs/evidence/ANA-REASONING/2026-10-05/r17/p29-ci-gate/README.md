# The gate that keeps P-29.2 true — and what it found on its first run

Rows **D5** and **D1**. Decision **P-29**, increment 3
(`docs/EXIT_ATTESTATION_DECISION_2026-10-18.md`). Round 17.

## Why it is third and not last

P-29's own closing paragraph: *"without that, this decision degrades into a
comment."* The review's decide phase was more specific — the eighth exit is
added by someone who never read the document.

And the evidence is from this week, not hypothetical. Round 16 shipped the
agreement check **at the freeze** and left `POST /e-sign` as APPROVER — the path
a client actually uses to approve a document — passing no check at all, for a
round, with every test green. That is the failure mode this gate is for: not a
broken gate, an **absent** one at the next door, invisible because every door
that has it keeps working.

## Discovery, not an allowlist

`check-lineage-save-gate.mjs` learned this the hard way (its own header: three
content writers had shipped prose with no lineage for as long as they existed,
because an allowlist only guards what someone remembered to add). So this gate
finds the doors itself, from the writes and reads that constitute them:

- **SEAL** — a file that writes `INSERT INTO frozen_documents`,
  `INSERT INTO authoring_signatures`, or an
  `UPDATE authoring_documents SET … 'APPROVED'` stamp.
- **PACKAGE** — a file that loads device/IVD content from the filing
  (`loadDeviceContentLeaves`, `resolveDeviceContentScope`) to build a
  deliverable. These are the device exits P-29.3 put on the list and that no
  candidate exit list contained.

Guarded means a call to `filingAgreesWithEditing`, or the router's two wrappers
(`filingBlocksSeal`, `sealRefusedForFiling`), in the same file. The two modules
that *define* what is guarded are exempt — a definition cannot call itself into
compliance — and every caller of them is still scanned.

## What it found, that nothing else had

`server/routes/authoring.router.ts` does **not** appear: it is guarded.

Three files do, 6 sites, all baselined with written reasons:

| File | Sites | |
|---|---|---|
| `server/routes/510k-estar-routes.ts` | 3 | the device exits P-29.3 names |
| `server/services/pathway-engines/device-assembly/assemble-device-submission.ts` | 2 | **not previously enumerated** |
| `server/services/qms/document-approval-signature.ts` | 1 | **a fourth seal, not previously enumerated** |

The second and third are the gate's own earnings, and they are the argument for
writing a gate rather than a list:

- **`assemble-device-submission.ts`** — named in no part of the P-29 decision
  and in no dimension of the five-way review behind it.
  `loadProgramDeviceAssemblyInput` reads the filing through the same device
  loaders, and `assembleDeviceSubmission` computes the readiness verdict and
  `artifactKind` from it. So a diverged or mis-keyed section inflates the figure
  a client reads as "what can honestly be produced".
- **`qms/document-approval-signature.ts`** — a fourth seal. It stamps
  `authoring_documents SET status = 'APPROVED'` after writing its own signature
  and ledger pair, with no cross-store check. A QMS controlled document is
  usually unbound, in which case the check is a no-op — but nothing refuses it
  from being bound, so the check belongs there. Held: that file was written
  2026-10-17 16:02 −0700, inside this session's 24-hour hold on another lane's
  work.

The device entries carry the decision's **ordering** in their reasons: the
vocabulary fix lands before an agreement gate on the device lane, because after
a mis-keyed write the two stores agree, so a gate there would certify a
mis-filed package.

## Shown failing, three ways

1. **The selftest**, `check-filing-exit-agreement.selftest.mjs`, builds a
   miniature tree in a temp dir and runs the real gate in it — 8 cases: a new
   unguarded seal fails by name; the same seal passes once guarded; a new device
   package door fails; a baseline entry whose reason is not a reason fails; a
   baseline allowing more than exists fails (shrink only); a properly baselined
   door passes; the defining module is not a door; an empty tree passes.
2. **The wiring**, by removing one baseline entry and running the npm script:
   exit 1, naming `document-approval-signature.ts:395 (seal: approval-stamp)`.
3. **The selftest found a defect in the gate itself.** The empty-tree case
   crashed it with an unhandled `ENOENT` on a missing `server/` directory —
   which in this repository would only ever have surfaced as a stack trace in
   CI with no verdict attached. Fixed, and the case kept.

## Wired

- `package.json` — `ci:filing-exit-agreement`, `ci:filing-exit-agreement:selftest`
- `.husky/pre-push` — selftest first, then the gate, beside `ci:sign-ceremony`
- `.github/workflows/ci.yml` — same order, same place

## One more mistake of the same shape as this morning's

The pre-push failure branch I first wrote put **backticks inside a double-quoted
bash echo** — command substitution. `bash -n` passed, because it is valid
syntax; at runtime it printed `different: command not found` and dropped the
word. Caught by running the branch rather than linting it. That is the second
backtick-in-a-quoted-context slip today (the first ended a TypeScript template
literal and made a suite report "no tests"), which is worth recording as a
pattern rather than twice as an accident.
