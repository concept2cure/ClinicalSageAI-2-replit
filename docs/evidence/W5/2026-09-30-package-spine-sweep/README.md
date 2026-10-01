# W5 evidence — package-model spine: FDA-acceptance sweep, 2026-09-24 to 2026-09-30

**Row moved:** D7 (one real sequence), workstream W5, engineering half.
**Session:** `…session_01LjrcEe8y3zUQxwX91zzTaM` (lane: package-model spine, `docs/work-orders/README.md` §0).

This file is the durable record of an adversarial sweep of what the package-model
spine (`POST /api/submission-ops/packages/:id/assemble` → `executeGovernedTransmit`)
hands FDA. It is committed before the findings are verified because two container
resets destroyed the sweep's working files, and the findings are the input to the
next round of work. **Every finding below is UNVERIFIED unless its status says
otherwise.** A finding is not a defect until a skeptic has reproduced it at HEAD
and tested its spec claim; several claims rest on the reviewers' recollection of
ICH/FDA specifications that this sandbox cannot fetch (agency hosts are refused).

## How the sweep ran

Six independent finder lenses over the spine: ICH backbone, FDA Module 1 regional
backbone, sequence lifecycle, ESG transmission, validation parity, honest state.
Each finder read the code and ran probes against the real route, PGlite and the
real packager. Four lenses completed (22 raw findings, 20 after merging two pairs
that described one defect). **Validation parity and honest state did not run** —
both finders, and every verifier, were cut off by account usage limits
(2026-09-25 and 2026-09-26). They are owed.

## Findings

| ID | Lens | Claimed | Finding | Status |
|---|---|---|---|---|
| F00 | backbone | high | The ICH heading tree stops 1–3 levels short of v3.2.2 (e.g. `m3-2-s-4-1-specification`, `m5-3-5-1-…` are never emitted), so deep Module 2–5 leaves file under their parent heading; a non-existent code such as `3.2.S.4.9` is accepted and filed under 3.2.S with 0 errors. | unverified |
| F01 | backbone | high | `index.xml` and `us-regional.xml` declare `xmlns:xlink="http://www.w3.org/1999/xlink"`; the ICH 3.2 and FDA 3.3 DTDs fix it (`#FIXED`) to `http://www.w3c.org/1999/xlink` — every backbone would be DTD-invalid. The repo's own `docs/ectd/SPEC_DIGEST.md` shows the w3c.org value. | unverified |
| F02 | backbone | high | `m3-2-s-drug-substance`, `m3-2-p-drug-product`, `m5-3-5-…` (and the 2.3.S/2.3.P/2.7.3 counterparts) are emitted without the attributes the DTD requires (substance, manufacturer, dosageform, indication); multiple substances/products/indications merge under one heading. | unverified |
| F03 | backbone | medium | This spine can never produce a Study Tagging File: `LeafBytes` has no study fields, so 4.2.x / 5.3.x study reports ship untagged. | unverified |
| F04 | m1-regional + lifecycle | high | Every follow-up is declared the Original of a new regulatory activity: `submission-id` is always the sequence's own number and sub-type always `fdasst1`; the assemble body has no field to say otherwise, and nothing checks submission type against application type (an IND accepts "Efficacy Supplement"). | unverified |
| F05 | m1-regional | high | `<application-number>` is written exactly as entered; the product's own example is `IND123456`, while FDA application numbers are six digits. | unverified |
| F06 | m1-regional | high | Module 1 headings are written flat under `<m1-regional>` in package order (no parent headings, not in section order), Form 1571 ships as a bare leaf with no `form-type`, and FDA is marked `regionConformant: true` by region alone. | unverified |
| F07 | m1-regional | high | `<applicant-info/>` is always empty on this spine although the recorded applicant id and name are required and described as carried by the backbone; `application-containing-files` is also absent. | unverified |
| F08 | m1-regional | medium | Submission-type words are matched by loose substring, so `IND` files as IND Safety Reports (fdast9), `report` as Annual Report, `supplement` as Efficacy Supplement, instead of being refused. | unverified |
| F09 | lifecycle | high | `modified-file` names a content file, not a leaf (`../0000/index.xml#<leafId>`). | **fixed upstream** in `09c4c15d` (IND lane, 2026-09-29) |
| F10 | lifecycle | high | A filed withdrawal never leaves the filed state: the delete entry carries no `leafKey`, so the fold keyed on `leafKey` drops nothing; the document can be withdrawn twice, replaced after withdrawal, and is refused ("already on file") when re-filed. | **confirmed** 2026-10-01; **fixed** — see "Fixed after verification" |
| F11 | lifecycle | medium | An empty-section placeholder PDF ("[EMPTY SECTION] …") is filed to the agency and never superseded: the real document later files as `new` beside it. | **confirmed** 2026-10-01 (medium: lifecycle and content, not a validation error) |
| F12 | lifecycle | medium | A document moved to another CTD section is filed `new` there while the filed copy stays current at the old section, with no finding. | **confirmed** 2026-10-01 (medium: a missing operator finding and a stale current copy, not a validation error) |
| F13 | lifecycle | medium | Cover letters and forms are diffed like dossier content: an unchanged cover letter is left out of a follow-up, and an edited one replaces sequence 0000's. | unverified |
| F14 | transmit | high | A send to FDA's ESG **test** environment (`staging`) is recorded as the package's real filed sequence. | **confirmed** 2026-10-01 (high) |
| F15 | transmit | high | The duplicate-send lock is keyed on the bundle's bytes, not its sequence; re-assembling while an earlier send of 0000 is unconfirmed sends 0000 a second time. | unverified |
| F16 | transmit | medium | The AS2 message: `AS2-To` defaults to `FDA-CESUB`, no Center/submission-type routing, no S/MIME signing or encryption (a signature is computed and dropped), and the MDN is not verified. | unverified |
| F17 | transmit | medium | The uploaded archive has no sequence folder: `index.xml` sits at the zip root and the payload is always `ectd.zip`. | unverified |
| F18 | transmit | low | Bundles over 1 GiB go to an SFTP path built from caller-typed sequence and application number, and a bare deposit is recorded as filed. | unverified |
| F19 | transmit + lifecycle | critical | A sequence is recorded FILED on the ESG's MDN (Ack1) or a bare SFTP deposit, and nothing un-files it when FDA rejects it at Ack3 or it is rolled back; a second bundle with the same sequence number also reports "recorded". | **partially confirmed** 2026-10-01: high, not critical — see "Verification round 1" |

## Verification round 1 — 2026-10-01 (F10, F11, F12, F14, F19)

One skeptic per finding, each told to refute it: reproduce at HEAD with PGlite, the
real route and the real packager, test the spec claim, check scope, and give the
smallest fix. All five reproduced. Corrections the skeptics made to the claims:

- **F19 is high, not critical, and the claimed fix was wrong in one part.**
  `rollbackTransmittal` must NOT un-file a sequence: a rollback is a retraction
  recorded on the platform, and its own result says the agency still holds the
  bytes; an eCTD sequence the agency loaded is permanent in its lifecycle. Only
  evidence that the agency did not load it (a failed Ack3 or a technical-rejection
  notice) may un-file it. "Whatever `result.status` is" has no practical
  non-success case, because every gateway throws on failure. The second-bundle case
  needs a race (re-assembling while the first send is in flight). What holds: the
  history is appended at the transport receipt and nothing can ever revise it, so
  after a technical rejection the number cannot be reused (`SEQUENCE_ALREADY_FILED`),
  skipping is refused (`SEQUENCE_OUT_OF_ORDER`), and the next sequence diffs against
  content the agency never loaded. Ack3 ingestion does not exist and is blocked on
  ESG procurement; the rejection path and the conflict refusal are not.
- **F11 and F12 produce valid, truthful backbones.** The defect is content
  currency: a placeholder that says a section is empty stays current beside the
  real document (F11), and a moved document stays current at its old heading with
  no finding (F12). Neither is a validation error. F12's remedy, an explicit
  withdrawal, did not clear the old copy from the product's own record until F10
  was fixed.
- **F14:** the duplicate-send lock half (keyed on bytes, not environment) is real
  but fails safe; rollback and re-assembly clear it.

Hand-offs to the sequence spine (IND lane, `…01TtwRHm`), not edited here:
`transmitSequence` sets `dispatch_status` from the gateway result whatever the
environment, and `prior-sequence-loader.ts` folds `'sent'` sequences as filed, so a
staging send there probably files too (F14's analogue); the same "transport receipt
counts as filed, never revised" gap exists there (F19's analogue); and
`foldManifestRows` keys on `leafKey ?? path`, the asymmetry F10 was, latent until
that spine keys its leaves.

## Fixed after verification

**F10 — a filed withdrawal never left the filed state.** The assemble route filed
every withdrawal without a `leafKey` while the document it withdrew was folded
under one, so the fold's delete removed nothing. After one filed withdrawal the
product filed a second delete of the same leaf, filed the document's return as a
`replace` of a deleted leaf, and refused re-filing it unchanged as "already on file,
byte for byte". Fixed in `foldFiledState` (a filed leaf now acts on the document
the operator matched when planning it: identity first, else the path, so histories
already written that way are read correctly) and forward (`planSequence` returns
the withdrawn document's `leafKey`; the route passes it to the packager, which
already recorded it on withdrawn manifest entries).

```
WITHOUT the fix: 5 failed | 32 passed (37)   [lifecycle unit + package-spine e2e]
  × foldFiledState > a withdrawal filed WITHOUT the document's key still takes the keyed document off file
  × planSequence > a withdrawal names the identity of the document it withdraws, so the filed history records which one left
  × e2e > the filed withdrawal records WHICH document left, by its identity
  × e2e > withdrawing the same document again is refused: it is no longer on file
    → a second delete of a withdrawn leaf: {"summary":{…"delete":1,"unchanged":2}}: expected 200 to be 409
  × e2e > the withdrawn document, filed again unchanged, is NEW — not "already on file", not a replace
    → {"code":"NOTHING_TO_FILE", "error":"Sequence 0002 would file nothing: all 3 of this package's leaves are already on file, byte for byte. …"}: expected 409 to be 200
WITH the fix:    37 passed (37); with the operator unit and assemble-route suites, 115 passed (115)
```

## What this sweep produced that is already fixed

**Lifecycle diff compared two stages of one document (found while building the
sweep's harness; not one of F00–F19).** With Ghostscript in the production image
(`Dockerfile.optimized`), the packager converts every leaf to PDF/A and the filed
manifest records the md5 of the CONVERTED bytes, while both spines plan the next
sequence against the md5 of the bytes they rendered or staged, BEFORE conversion.
Ghostscript stamps dates and a random document ID, so the two never matched: every
follow-up re-filed every unchanged document as `replace`, `NOTHING_TO_FILE` could
not fire, and the operator was told "0 left unchanged on file". This container has
no `gs`, so no suite could see it. Fixed in `ca636c7f` by recording the digest of the bytes the
packager was handed (`sourceMd5`) whenever it changed them, carrying it through
both spines' manifest readers, and comparing like with like in the shared
operator.

Failing first, on the real route, PGlite and the real packager with a stand-in
Ghostscript that the real `finalizePdfA` path runs against
(`tests/submission-ops-package-spine.pglite.e2e.test.ts`,
`server/services/ectd/__tests__/stand-in-ghostscript.harness.ts`):

```
WITHOUT the fix: 2 failed | 2 passed (4)
  × WITH the production PDF/A toolchain: a follow-up in which nothing changed still files nothing
    → a sequence re-filing {"summary":{"new":0,"replace":3,"append":0,"delete":0,"unchanged":0},"omittedCount":0} unchanged documents: expected 200 to be 409
  × WITH the production PDF/A toolchain: only the edited document ships, as a replace of the leaf on file
    → expected { new: +0, replace: 3, … } to match object { replace: 1, new: +0, unchanged: 2 }
WITH the fix:    4 passed (4)
```

The no-toolchain control passes both before and after, which is exactly why the
defect was invisible.
