# WO-9 — demo proof: the BX-512 IND, Clicks 1–6

**Date:** 2026-10-22 (the lane was claimed 2026-10-21). **Branch:** `concept2cure-v2`.
**Scope:** JM's *"WO-09 Biotech IND eCTD Sequence Demo"*: BX-512, Vorelinib, IND 000512, clicked end to end at head.
**Row:** D7, one real sequence (W5). D7 is **not green**.

## What this is, and what it is not

This report is written from a recording of the six clicks. The recording was
made in this sandbox:

- in headless Chromium;
- driving only the product's own controls;
- on a database built from empty the way a deploy builds one: `install-fresh`,
  `deploy-migrate` (418/418 files), and one seed. It was then brought forward to
  the pushed trunk (`892739bb7`) the way every later deploy is, with
  `deploy-migrate` again (421/421 files);
- on the tree this lane pushes: that trunk plus this change.

It is **not JM's recording**, in three ways:

- **The 1571 is a stand-in.** Click 2 files the platform's own render plus one
  appended comment line, not a sponsor-completed, signed form.
- **Nothing reached FDA.** 0000 was never filed, so 0001 is compiled as a
  **rehearsal**, bound against the unfiled 0000. Transmit would refuse those
  acts.
- **No validator has passed the packages.** The ICH/FDA DTDs are not vendored,
  and every package says its DTD validation is unverified.

| | |
|---|---|
| Recording | `wo9-bx512-clicks-1-6-2026-10-22.webm`. 215.20 s, 1440×900, VP8, 18,133,194 bytes, SHA-256 `809ed5e88af4e71abe9e7adf2b41290d24906802515d38d5e8d018a4f2dea8a8`. Delivered to JM in the session. Bulk artifacts stay out of the repository. |
| Transcript | `docs/evidence/W5/2026-10-21-ind-reference-lane/clicks-1-6-transcript.txt`, written by the driver while it recorded. Each heading carries its time into the recording. |
| Evidence | `docs/evidence/W5/2026-10-21-ind-reference-lane/` (its README holds the full record) |
| Lane record | `docs/reports/wo9-phase1-ectd-unblock-2026-09-03.md` §21 |

## 1. The six clicks, as the recording shows them

| Click | At | What is on screen |
|---|---|---|
| 1 | 0:00 | Projects → *Vorelinib · KIT-mutant GIST (IND)*. The program home shows Concept2Cure Therapeutics, Vorelinib · BX-512, KIT-mutant GIST 4L+, and IND 000512, all read from the program record. |
| 2 | 0:13 | The applicant identity is recorded: the sponsor, D-U-N-S 000000512, the regulatory contact and the authorized representative. Form FDA 1571 is built and checked ("required fields present"), rendered, then filed at m1.1 in sequence 0000 with the attestation recorded. |
| 3 | 1:06 | The approved authored 3.2.S.4 document is placed in 0000, server-confirmed. Then analytical procedures v1.0 is uploaded to the Vault, opened, its filing confirmed, and placed at 3.2.S.4.2. The dialog says the leaf will not be transmitted until the version is approved. |
| 4 | 1:40 | 0000 compiles. The screen states "Type initial · recorded on sequence 0000" and shows the leaf hierarchy. The package is recorded and downloaded as `000512-0000-fda.zip`: PDF/A on both converted leaves, the 1571 as FDA issued, and DTD validation "unverified". |
| 5 | 2:03 | Dispatch readiness on 0000 reads **"Dispatch blocked — 4 blockers"**: 7 error-severity validation findings, the unapproved Vault version (P-22), no Shadow Review, and no Part 11 release signature. It also states separation of duties: the creator cannot sign the freeze or the dispatch. |
| 6 | 2:16 | Sequence 0001 starts as an amendment. The authored 3.2.S.4 leaf is withdrawn. The revised analytical procedures file is uploaded under the same name; the Vault offers the check-in and records it as v2.0 of the same document. It is placed in 0001 as Replace. |
| 6, compile | 3:11 | The rehearsal compile of 0001 states "Type amendment · recorded on sequence 0001". Its lifecycle table holds **`replace` 3.2.S.4.2** against v1.0's filed leaf, and **`delete` 3.2.S.4** against the authored leaf, each by its ID in 0000's backbone. It downloads as `000512-0001-fda-rehearsal.zip`, every screen saying it is a rehearsal. |

## 2. What the recording proves

- **The demo path works end to end at head**, on the product's own controls, on a
  deploy-shaped database.
- **Sequence 0000 is a well-formed original.** It is not a complete IND: the
  compile screen counts 2 of 36 required sections placed and lists each missing
  one as an error (34 errors). Its three leaves (the 1571 at m1.1, 3.2.S.4 and
  3.2.S.4.2) are compiled, recorded and exported. The ZIP was read back by a
  reader that shares no code with the product, and all 5 checksum lines
  re-verify.
- **Sequence 0001 is the lifecycle the work order asks for**: a `delete` and a
  `replace`, each naming the leaf 0000 filed, by the ID in 0000's own backbone.
  The independent reader resolves both pointers, and all 3 checksum lines
  re-verify. Until this lane the `replace` could not be produced (§20's open
  decision, now P-42).
- **Every blocker says what blocks and why**: the unapproved version (P-22), the
  missing Part 11 release signature, the missing Shadow Review, and the count of
  open error-severity validation findings. The "not yet submittable" list after
  each compile does the same. None is a generic error.

## 3. What it does not prove

- **That an agency accepted anything.** There are no ESG credentials, so 0000 was
  never filed and 0001's acts are bound in rehearsal.
- **DTD validity.** The DTDs are not vendored. When they are, expect the
  validator to name D-3: the 3.2.S leaves sit directly under
  `m3-2-s-drug-substance`, without its `substance` and `manufacturer` attributes
  (CAT2-03, MR-10 Stage 5).
- **A signed 1571**, because the form filed is the stand-in.
- **An approved Vault version.** Both versions read "not reviewed", so freeze,
  dispatch and transmit refuse the sequence, as P-22 intends.

## 4. Fixed on the way, each with its test failing first

- **D-1.** The IND screen said "eCTD v4.0 (FDA)". The platform builds v3.2.2, and
  the screen now says so.
- **D-2.** The compile screen offered the sequence's type as a free selector
  defaulting to `initial`. It now states the recorded type, and the route
  records the sequence's own type, refusing a contradicting one.
- **P-42.** A later Vault version now files as the `replace` of the version on
  file, through the lineage the Vault records. Ambiguity is refused, never
  guessed (`docs/LAUNCH_DEFINITION_OF_DONE.md`, P-42).

The red and green runs for each, and the mutations that show every new test can
fail, are in the evidence README ("Red, then green").

## 5. For JM

1. **Record your own run** with your completed and signed 1571. The stand-in is
   the only thing on the path that differs.
2. **Run eValidator** on `packages/000512-0001-fda-rehearsal.zip`, and on a
   0000 package compiled in your run. Then import the report on the compile
   screen ("Import eValidator report").
3. **Two decisions are yours:**
   - how a revised *authored* document reaches a follow-up sequence (P-42,
     "Still open");
   - the two dispatch gates' disagreement about a clinical hold
     (`docs/work-orders/README.md`, "Found by the IND eCTD demo lane", item 1).
4. **Outside code:** the DTDs, the ESG test credentials, and an FDA test
   submission with its ack chain filed. Those finish D7.

## 6. Checks run

All on the pushed tree, trunk `892739bb7` plus this change. The full table is
in the evidence README, "Gates".

- `ci:typecheck:no-regression`: 0 errors.
- ESLint warning ratchet: flat. The new files lint clean.
- Repo-health size ceiling: passes.
- The lane's nine suites: 116 of 116 tests pass.
- Regression: 3,014 tests pass; the 26 that fail (7 files) fail identically on the base without this change, none in a file this lane touches (evidence README, "Failures met on the way").
- Every pre-push gate passed (the push landed through them).
- HawkScan was not run, because this environment has no `HAWK_API_KEY`.
