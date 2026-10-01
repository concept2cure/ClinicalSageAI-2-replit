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

Also in this folder: [`VERDICTS.md`](VERDICTS.md), every skeptic's return verbatim
(probe output, the requirement and its confidence, scope, smallest fix, blast
radius), and [`PLANS.md`](PLANS.md), the two planning passes the open work is
built from (F19's agency-rejection action; F04, F05, F07, F08).

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
| F00 | backbone | high | The ICH heading tree stops 1–3 levels short of v3.2.2 (e.g. `m3-2-s-4-1-specification`, `m5-3-5-1-…` are never emitted), so deep Module 2–5 leaves file under their parent heading; a non-existent code such as `3.2.S.4.9` is accepted and filed under 3.2.S with 0 errors. | **confirmed** 2026-10-01 (high; misfiling made permanent by lifecycle, not a validation error) |
| F01 | backbone | high | `index.xml` and `us-regional.xml` declare `xmlns:xlink="http://www.w3.org/1999/xlink"`; the ICH 3.2 and FDA 3.3 DTDs fix it (`#FIXED`) to `http://www.w3c.org/1999/xlink` — every backbone would be DTD-invalid. The repo's own `docs/ectd/SPEC_DIGEST.md` shows the w3c.org value. | **confirmed** 2026-10-01 (high); **fixed** — see "Fixed after verification" |
| F02 | backbone | high | `m3-2-s-drug-substance`, `m3-2-p-drug-product`, `m5-3-5-…` (and the 2.3.S/2.3.P/2.7.3 counterparts) are emitted without the attributes the DTD requires (substance, manufacturer, dosageform, indication); multiple substances/products/indications merge under one heading. | **partially confirmed** 2026-10-01 (high): Module 3/5 headings lack #REQUIRED attributes; the Module 2 ones are never emitted (F00); `product-name` is optional |
| F03 | backbone | medium | This spine can never produce a Study Tagging File: `LeafBytes` has no study fields, so 4.2.x / 5.3.x study reports ship untagged. | **confirmed** 2026-10-01 (medium); the in-repo STF generator is not ICH STF 2.2 either |
| F04 | m1-regional + lifecycle | high | Every follow-up is declared the Original of a new regulatory activity: `submission-id` is always the sequence's own number and sub-type always `fdasst1`; the assemble body has no field to say otherwise, and nothing checks submission type against application type (an IND accepts "Efficacy Supplement"). | **confirmed** 2026-10-01 (high); **fixed** on the package spine (sub-type, submission-id, impossible pairs refused); the shared packager's defaults are a hand-off |
| F05 | m1-regional | high | `<application-number>` is written exactly as entered; the product's own example is `IND123456`, while FDA application numbers are six digits. | **confirmed** 2026-10-01 (high); **fixed** at the package-spine boundary (identifiers route, assemble gate, form) |
| F06 | m1-regional | high | Module 1 headings are written flat under `<m1-regional>` in package order (no parent headings, not in section order), Form 1571 ships as a bare leaf with no `form-type`, and FDA is marked `regionConformant: true` by region alone. | **confirmed** 2026-10-01 (high); **partly fixed** (order, honest `regionConformant`); nesting blocked on the us-regional DTD |
| F07 | m1-regional | high | `<applicant-info/>` is always empty on this spine although the recorded applicant id and name are required and described as carried by the backbone; `application-containing-files` is also absent. | **confirmed** 2026-10-01 (high); **fixed** (markup, and the contact is recorded and passed) |
| F08 | m1-regional | medium | Submission-type words are matched by loose substring, so `IND` files as IND Safety Reports (fdast9), `report` as Annual Report, `supplement` as Efficacy Supplement, instead of being refused. | **confirmed** 2026-10-01 (medium); **fixed**: an operator's term is matched exactly at the assemble boundary |
| F09 | lifecycle | high | `modified-file` names a content file, not a leaf (`../0000/index.xml#<leafId>`). | **fixed upstream** in `09c4c15d` (IND lane, 2026-09-29) |
| F10 | lifecycle | high | A filed withdrawal never leaves the filed state: the delete entry carries no `leafKey`, so the fold keyed on `leafKey` drops nothing; the document can be withdrawn twice, replaced after withdrawal, and is refused ("already on file") when re-filed. | **confirmed** 2026-10-01; **fixed** — see "Fixed after verification" |
| F11 | lifecycle | medium | An empty-section placeholder PDF ("[EMPTY SECTION] …") is filed to the agency and never superseded: the real document later files as `new` beside it. | **confirmed** 2026-10-01 (medium); **fixed** — an empty section files nothing |
| F12 | lifecycle | medium | A document moved to another CTD section is filed `new` there while the filed copy stays current at the old section, with no finding. | **confirmed** 2026-10-01 (medium); **fixed** — a move names the withdrawal it needs |
| F13 | lifecycle | medium | Cover letters and forms are diffed like dossier content: an unchanged cover letter is left out of a follow-up, and an edited one replaces sequence 0000's. | **confirmed** 2026-10-01 (medium); **fixed** — per-submission letters and forms file new; an IND follow-up without a 1571 blocks |
| F14 | transmit | high | A send to FDA's ESG **test** environment (`staging`) is recorded as the package's real filed sequence. | **confirmed** 2026-10-01 (high); **fixed** — see "Fixed after verification" |
| F15 | transmit | high | The duplicate-send lock is keyed on the bundle's bytes, not its sequence; re-assembling while an earlier send of 0000 is unconfirmed sends 0000 a second time. | **partially confirmed** 2026-10-01 (medium); **fixed** (sequence lock) |
| F16 | transmit | medium | The AS2 message: `AS2-To` defaults to `FDA-CESUB`, no Center/submission-type routing, no S/MIME signing or encryption (a signature is computed and dropped), and the MDN is not verified. | **confirmed** 2026-10-01 (medium); **`FDA-CESUB` default removed**; S/MIME, routing and MDN verification open |
| F17 | transmit | medium | The uploaded archive has no sequence folder: `index.xml` sits at the zip root and the payload is always `ectd.zip`. | **partially confirmed** 2026-10-01 (medium): no sequence folder; `ectd.zip` is not a defect |
| F18 | transmit | low | Bundles over 1 GiB go to an SFTP path built from caller-typed sequence and application number, and a bare deposit is recorded as filed. | **partially confirmed** 2026-10-01 (low); **fixed** (identifier rule, descriptor-authoritative metadata) |
| F19 | transmit + lifecycle | critical | A sequence is recorded FILED on the ESG's MDN (Ack1) or a bare SFTP deposit, and nothing un-files it when FDA rejects it at Ack3 or it is rolled back; a second bundle with the same sequence number also reports "recorded". | **partially confirmed** 2026-10-01 (high); **fixed** — one bundle per filed sequence, and a governed action records an agency technical rejection; Ack3 ingestion remains procurement-blocked |
| F20 | m1-regional | medium | The us-regional 3.3 admin block never carries `<form form-type="fdaft…">`; Form FDA 1571 ships only as an `m1-1-forms` leaf, sequence 0000 included (raised by the F13 skeptic). | unverified |

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

## Verification round 2 — 2026-10-01 (F01, F04, F05, F07, F08, F13)

Same method; all six reproduced at HEAD. What the skeptics added:

- **F01:** the repo's own structural gate encoded the wrong rule.
  `validateDtdConformance` raised `DTD_MISSING_XLINK_NS` unless the root said
  `w3.org`, so it passed every DTD-invalid backbone and would have refused a valid
  one; vendoring the DTDs alone would have failed every package at the
  qualification harness's xmllint step. The sequence spine is affected identically
  (its own evidence, `docs/evidence/W5/2026-09-29-ind-ectd/packages/0000-index.xml`,
  carries `w3.org`), and the shared fix covers it.
- **F04:** an IND protocol or information amendment is submission-type Original
  Application (`fdast1`), sub-type Amendment (`fdasst4`), submission-id the IND's
  first sequence. Supplements do not exist for an IND (21 CFR 314.70 and 601.12
  apply to approved NDAs and BLAs), so IND + Efficacy Supplement is a false
  statement. The skeptic's sketch ("every later sequence must state both") went
  too far: a supplement's first sequence correctly defaults to sub-type Original
  with its own number. The packager-side refusal must land together with the IND
  lane: `core-to-packager.ts` sends sub-type `amendment` with no submission-id and
  would be refused. Same defect class outside both spines:
  `ind-lifecycle/ind-ectd-envelope.ts` always writes submission-id = sequence.
- **F05:** `ectd-regional-rules.ts` FDA-ESG-002 enforces the opposite of the
  correct rule: it raises an error on `123456` and passes `IND123456`, which is
  probably where the product's example came from. `usableIdentifier` is shared
  with the IND lane and must stay charset-only; the six-digit rule belongs at the
  package-spine boundary (PUT identifiers, assemble).
- **F07:** passing contacts would not fix it: `fdaContactsBlock` writes no `id` or
  `company-name` and puts `email`/`telephone` directly under `applicant-contact`
  without the `telephones`/`emails` wrappers or `telephone-number-type`. Making the
  packager fail closed refuses every IND-lane assembly until that lane supplies a
  contact, so it needs a coordinated change.
- **F08:** the loose resolver is a deliberate choice that the other spine depends
  on (`core-to-packager.ts` feeds enum keys such as `ind_safety_report`), so the
  strict match belongs at the package-spine assemble boundary, not in `resolveV3`.
- **F13:** a Form FDA 1571 with every IND submission is firm; a cover letter per
  sequence is an FDA "should"; a cover letter filed as `replace` misfiles the
  lifecycle record (0000's letter shown as superseded) but raises no validation
  error that the skeptic knows of. **New, from this check (F20):** the package
  spine never emits the us-regional 3.3 admin `<form form-type="fdaft…">`; the 1571
  ships only as an `m1-1-forms` leaf, sequence 0000 included. Unverified.

## Verification round 3 — 2026-10-01 (F00, F02, F03, F06, F15, F16, F17, F18)

All eight reproduced. What the skeptics corrected or added:

- **F00:** the gap is 1–2 heading levels, not 1–3, and the backbone stays
  DTD-valid (every heading admits `leaf*`), so this is misfiling, not rejection;
  but lifecycle cannot move a filed leaf with `replace`, so each filed sequence
  makes it permanent. The repo's validator flags the real ICH elements
  (`m3-2-s-4-control-of-drug-substance`, `m3-2-s-4-1-specification`) as
  `DTD_UNKNOWN_ELEMENT`, because `ich-headings.ts:56-59` says the DTD has no
  `m3-2-s-4` element — it does. The fix needs the full ICH tree copied from the
  DTD (not from memory), so it waits on vendoring it; F00 and F02 land together.
- **F02:** `m3-2-s-drug-substance` (substance, manufacturer),
  `m3-2-p-drug-product` (dosageform, manufacturer) and
  `m5-3-5-reports-of-efficacy-and-safety-studies` (indication) are written bare;
  `product-name` is optional. Nearly every IND with CMC content is affected. The
  packager has no field to carry the values — a data-model change, shared with
  the IND lane.
- **F03:** an FDA requirement for Modules 4 and 5; the generator in the repo
  (`stf-generator.ts`) does not emit the ICH STF 2.2 structure either, so wiring it
  in would trade "no STF" for "a malformed STF".
- **F06:** no element names for the Module 1 parent headings (1.3, 1.4–1.17, …)
  are recorded in the repo, so nesting cannot be built without inventing them.
- **F15:** the normal path is already guarded (an MDN files the sequence, so
  re-assembly is refused `SEQUENCE_ALREADY_FILED`); the double send is real when
  the first send is still in flight or was delivered but unconfirmed. Medium.
- **F16:** S/MIME and MDN verification were known, documented gaps; the
  `FDA-CESUB` default and the missing `X-Cyclone-Metadata-FDACenter` /
  `FDASubmissionType` routing attributes were not, and the UAT runbook endorsed
  the default. `FDA_ESG_FDA_CERT_PATH` is documented as FDA's AS2 encryption
  certificate but used only as the TLS trust anchor.
- **F17:** FDA most likely expects `<application folder>/<NNNN>/…`; the exact
  application-folder name must be confirmed from FDA's guidance before the
  shared packager changes (22 test files read the zip at its root). The payload
  name `ectd.zip` breaks no rule.
- **F18:** the >1 GiB SFTP path is latent (`ssh2-sftp-client` is absent, so it
  refuses honestly before any connection); the sequence cannot carry unexpected
  characters (`requiredAgencyMetadata` enforces `^\d{4}$`); the application id
  could.
- **D1 hand-off:** none of `20260509_submission_gateways.sql`,
  `20260629_*_active_lock.sql`, `20260629_*_mdn_raw.sql` is in
  `C2C_MIGRATION_FILES`; a database built only by `deploy-migrate` may lack the
  transmittals table and its lock index.

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

**F01 — both backbones declared the W3C XLink namespace, which the DTDs forbid.**
`index.xml` and `us-regional.xml` now declare `xmlns:xlink="http://www.w3c.org/1999/xlink"`,
the value the ICH 3.2 and FDA 3.3 DTDs fix. It comes from one constant,
`ECTD_XLINK_NS` in `ectd-packager/ich-headings.ts`, which both the packager and the
structural validator import, so the value written and the value required cannot
drift apart. The validator now reports a wrong value as `DTD_WRONG_XLINK_NS`,
separately from a missing declaration (`DTD_MISSING_XLINK_NS`), and the vendored
`index-valid.xml` fixture uses the correct value. EU, JP and CA builders are
unchanged because no text of their DTDs is in the repo; neither is the STF
generator (`stf-generator.ts:130`), for which no STF DTD or example in the repo
corroborates the value.

```
WITHOUT the fix: 4 failed (2 files)
  × index.xml: <ectd:ectd> declares xmlns:xlink="http://www.w3c.org/1999/xlink"
  × m1/us/us-regional.xml: <fda-regional:fda-regional> declares xmlns:xlink="http://www.w3c.org/1999/xlink"
    → expected [ 'http://www.w3.org/1999/xlink' ] to deeply equal [ 'http://www.w3c.org/1999/xlink' ]
  × validateDtdConformance > reports the W3C spelling of xmlns:xlink as DTD_WRONG_XLINK_NS, naming the #FIXED value
  × validateDtdConformance > raises no xlink finding for the value the DTD fixes
    → "code": "DTD_MISSING_XLINK_NS", "fix": "Add xmlns:xlink=\"http://www.w3.org/1999/xlink\" …"
WITH the fix: 4 passed; server/services/submission-gateways + server/services/ectd + the
  orchestrator and validator suites: 111 files, 1397 tests passed
```

**F14 — a send to FDA's ESG test environment was recorded as the package's real
filed sequence.** Only a `production` send now appends to the filed history; a
send anywhere else returns `filedSequenceRecorded: 'not-applicable'` with
`filedSequenceReason: 'test-environment'`, and the Part 11 sign payload and
manifest say so. The check is `!== 'production'`, so an unexpected value files
nothing rather than something untrue. The filed-sequence block moved into
`recordTransmittedSequence`, which also lowers `executeGovernedTransmit`'s
complexity (68 → 58). The runbook's "Filed means transmitted" now says
"transmitted to production". Lifecycle testing in the test environment
(0000 then 0001 there) is not supported by this change: it needs a per-environment
filed history, which is a new capability. The duplicate-send lock still ignores
the environment; it fails safe.

```
WITHOUT the fix: 1 failed | 26 passed (27)
  × a send to the agency TEST environment (staging) puts nothing on file
    → expected true to be 'not-applicable'
  (the five tests switched to environment 'production' pass before and after:
   production behaviour is unchanged)
WITH the fix: 27 passed (27); gateway routes 40/40, AnA command handlers 43/43,
  all transmit/gateway suites 496 tests passed
```

**F15 — the duplicate-send lock was keyed on bytes, not the sequence.** A package
bundle's transmittal row now records the sequence from the stored descriptor,
and `findActiveTransmittal` also holds an active row of the same package,
sequence and environment, whatever its bytes; a staging send never holds
production, nor the reverse. Checked in code, not by an index: two simultaneous
sends can still both pass (a migration-backed index is the follow-up). Verified
against the real migration DDL on PGlite
(`active-transmittal-sequence-lock.pglite.test.ts`), and by mutation: dropping
the environment condition, the status filter, or the environment the transmit
passes each made a test fail.

**F18 — caller-typed values reached the SFTP path and the transmittal record.**
`sftpApplicationId` now applies the repo's one identifier rule
(`usableIdentifier`), and for a package bundle the sequence and application
number are the stored descriptor's and the package record's: a caller value that
disagrees is refused `422 METADATA_DESCRIPTOR_MISMATCH`, never silently replaced.
The refusal checks moved, with the refusal classes, into
`governed-transmit-checks.ts` (re-exported unchanged).

**F16, first part — AS2-To defaulted to `FDA-CESUB`.** The default is gone; an
unset `FDA_ESG[_STAGING]_AS2_TO` is a `CredentialError` before any connection,
as the ICSR transport already does. The runbooks describe the value as FDA's AS2
identifier issued at ESG registration; no identifier is invented.

```
WITHOUT the fixes: 21 failed (3 CredentialError, 5 unsafe SFTP ids,
  4 PGlite lock, 4 route lock, 5 descriptor mismatch)
WITH the fixes: all pass
```

**F07, the markup — `<applicant-info/>` was always empty.** The FDA backbone now
writes `<applicant-info><id>` (the DUNS, as text) and `<company-name>` from the
recorded identity, then `<applicant-contacts>` only when contacts are supplied,
each contact as name → `<telephones><telephone>` → `<emails><email>`; and
`<application application-containing-files="true">`. No placeholder contact is
written and no `telephone-number-type` code is guessed (FDA's list is not
vendored). Recording the regulatory contact on the package, and the FDA format
rules for the number and the DUNS, are the next step (F05, F07b).

**F06, in part — Module 1 order and an honest `regionConformant`.** Module 1
headings are written in section order whatever the package order, and
`regionConformant` is no longer true for FDA by region alone: it is true only
when the builder reports nothing it cannot stand behind (`fdaBackboneGaps`: a
missing contact, a phone with no number type, an undeclared 1.1 form, a form
leaf written twice under one ID, a heading that belongs inside a parent whose
element name is not recorded). Today every FDA bundle on both spines reports
false with its gaps named. This blocks a transmit only where
`ECTD_REQUIRE_REGIONAL_BACKBONE=true` in production, which nothing sets.
Nesting is blocked on vendoring `us-regional-v3-3.dtd`.

```
WITHOUT the fixes: 14 new tests failed (e.g. expected [] to deeply equal
  ['id','company-name']; expected null to be 'true'; headings in package order;
  expected true to be false)
Mutation: restoring "FDA is conformant because it is FDA" fails 10 tests.
WITH the fixes: server/services/submission-gateways + server/services/ectd and
  the route, transmit, AnA and ectd-compile suites: 132 files, 1732 tests passed
```

**F05 and F07b — FDA's forms for the identifiers, and the regulatory contact.**
`fdaIdentifierProblems` (`regulatory-identifiers.ts`, additive; the shared
charset rule is unchanged) is the one rule both boundaries apply to an FDA eCTD
package (`fdaEctdApplicationType`: the build is FDA/ectd and the family has an
`fdaat` code, so a 510(k)/eSTAR keeps its K-number and other regions are not
judged): the six digits FDA assigned, a nine-digit D-U-N-S number, and a
regulatory contact with name, telephone and e-mail. The identifiers route
refuses anything else `400 REGULATORY_IDENTIFIER_INVALID` and never rewrites it
(`IND123456` is not stored as `123456`); the assemble gate folds the same
sentences into the one `REGULATORY-IDENTIFIER-MISSING` finding for stored
values; the contact is recorded, passed to the packager as the us-regional
applicant contact, part of the stale-bundle comparison and of the store-time
drift check. The form's example is `e.g. 123456`, with the contact fields.
Not fixed here (hand-off): `ectd-regional-rules.ts` FDA-ESG-002 requires the
prefix this rule refuses; it is not on the package spine's path.

**F11 — an empty section files nothing.** No `[EMPTY SECTION]` placeholder
leaf is generated on the eCTD path; a `SECTION-EMPTY` warning names the section,
the validator's summary still counts it, and the content fingerprint still
changes when a section empties. A withdrawal of a section's only document files
the withdrawal alone. Three route tests that pinned the placeholder were changed
to the new behaviour (their mapped content is unchanged otherwise).

**F19, first part — one bundle per filed sequence.** `recordFiledSequence` says
what it did (`recorded` / `already-recorded` / `conflict` / `write-failed`)
instead of answering `true` for a different bundle under a sequence on file; a
production send of a different bundle under a filed sequence is refused before
the bytes leave (`409 SEQUENCE_ALREADY_FILED`, the code now carried in the
refusal's `details`); a conflict recorded during a send is reported as
`sequence-conflict` with the bundle the history holds. Filed entries carry
`state`; the reader skips `rejected` ones, so a rejected number can be reused —
but the governed action that records an agency technical rejection (evidence,
e-signature, latest-sequence-only) is not built yet.

```
WITHOUT the fixes (same tree, fixes absent): 8 failed
  × assemble: BLOCKS an IND package whose recorded application number carries a prefix … → expected [] to have a length of 1
  × assemble: hands the recorded regulatory contact to the packager … → expected undefined to deeply equal [ { type: 'Regulatory', … } ]
  × assemble: BLOCKS an IND package that records no regulatory contact …
  × assemble: a contact recorded while the bundle was being assembled makes it stale → expected 200 to be 409
  × e2e: us-regional.xml carries the D-U-N-S number as <id>, … and the contact
  × client: records regulatory identifiers … → expected 'e.g. IND123456' to be 'e.g. 123456'
  × e2e F11: ships no leaf for it … → expected [ '1.2', '2.5', '3.2.P.1' ] to deeply equal [ '1.2', '2.5' ]
  × e2e F11: withdrawing a section's only document … → expected { new: 1, … } to match object { new: 0, delete: 1 }
WITH the fixes: 12 files, 367 tests passed (lifecycle unit, package-spine e2e,
  assemble, identifiers, preflight, section and transmit-guard routes, gateway
  routes, AnA handlers, structural validator, bundle-invalidation contract, client)
```

**F12 — a moved document left its old copy current with no finding.** The
sequence plan now reports `staleOnFile`: each document this sequence leaves
current although the package no longer files it there. A document whose artifact
is placed at another CTD section now is `LEAF-RELOCATED-OLD-COPY-CURRENT`, an
error that blocks transmit and names the exact `withdraw` entry; filing at two
sections on purpose is not a move. A placeholder filed before F11 is
`PLACEHOLDER-ON-FILE`, a warning naming its `withdraw` entry. The move done
whole — new filing plus withdrawal in one sequence — carries neither.

```
WITHOUT the fix: 4 failed
  × moving a document to a DIFFERENT CTD section … the copy left on file is named → expected undefined to deeply equal [ { reason: 'relocated', … } ]
  × a document filed at TWO sections on purpose is not a move
  × names an empty-section placeholder still on file …
  × e2e: blocks the sequence that files it at the new section … → expected [] to have a length of 1
WITH the fix: lifecycle unit, package-spine e2e and assemble routes: 106 passed
```

**F13 — cover letters and forms were diffed like dossier content.** For FDA,
`planSequence` takes a `perSubmission` predicate (1.2, 1.1, 1.1.x): such a leaf
is never a `replace` — it files `new` when it differs from the one on file, and
is left out when it is that same document unchanged (the earlier submission's).
On an FDA follow-up the route then names what the sequence lacks of its own
Module 1: `M1-FORM-1571-MISSING` (error, IND packages — Form FDA 1571 accompanies
every IND submission) and `M1-COVER-LETTER-MISSING` (warning — FDA expects one
with every submission). Other regions are diffed as before. Sequence 0000's
completeness (an IND original without a 1571) is the readiness engine's, not
this check's. Three route tests that used the cover letter as their example of a
replace now use a dossier document, and the cover letter has its own case.

```
WITHOUT the fix: 3 failed
  × a new cover letter files as NEW, never as a replace … → expected [ { …(3) } ] to deeply equal [ { ctdSection: '1.2', …(2) } ]
  × e2e: a revised cover letter files as NEW in the follow-up … → expected { new: 0, replace: 1, … } to match { new: 1, replace: 0 }
  × e2e: an IND follow-up that carries no Form FDA 1571 is blocked … → expected [] to deeply equal [ ObjectContaining{…} ]
WITH the fix: lifecycle unit, package-spine e2e, assemble, preflight, transmit-guard and
  gateway routes, client: 247 passed
```

**F19, second part — recording an agency technical rejection.** `POST
/api/mdx/gateways/transmittals/:id/technical-rejection` (same re-auth ceremony
as rollback and transmit) runs `recordFiledSequenceRejection`
(`server/services/ectd/filed-sequence-rejection.ts`): keyed on the transmittal,
latest non-rejected filed sequence only, refused when the transmittal records
agency acceptance, evidence read from the Vault (tenant-scoped, not deleted),
and — in one transaction under the package lock — a governed `sign` ledger row
and an electronic signature bound to the evidence's content hash; the
transmittal moves to `validation_failed`, the filed entry is marked
`state: 'rejected'` and kept, and a stored bundle above it is cleared. The next
assembly reuses the number and diffs against what the agency holds. A rollback
still does not un-file (pinned by a test). The Submission Center's transmittal
log has the control; a transmit refused `SEQUENCE_ALREADY_FILED` shows the
server's sentence. `ci:sign-ceremony` carries one "proof across a boundary"
entry for the service, as it does for governed transmit and the eSTAR filing
signature: the route re-authenticates, the service refuses without that proof.
Ack3 ingestion does not exist (ESG procurement); there is no reinstate action.

```
Fail-first: the e2e cases could not import the module at HEAD; against a no-op
stub 5 of 6 e2e, all 25 unit and 10 route cases failed, and 5 client cases
(e.g. Unable to find role "button" and name /Technical rejection/). The
rollback pin passes before and after by design; a mutation that un-files after
a rollback makes it fail.
WITH the fix: 10 suites, 333 tests passed; ci:sign-ceremony OK, selftest 17 passed
```

**F04 and F08 — what an FDA sequence declares.** `resolveFdaSequenceIdentity`
(`server/services/ectd/fda-sequence-identity.ts`) decides, or refuses, the
submission type, sub-type and submission-id at the package spine's assemble
boundary: the term is matched exactly (`resolveSubmissionTypeStrict`; the loose
resolver stays for the other spine's internal keys); a follow-up must state its
sub-type; an Amendment or Resubmission names the activity it continues, a filed,
earlier sequence that opened an activity of the same type; an Original's
submission-id is its own number and a second Original Application is refused;
pairs that cannot exist are refused (a supplement on an IND or master file, IND
safety reports outside an IND). The codes reach the packager, the bundle
descriptor and the filed history (read back by the next sequence); other regions
refuse the two FDA fields. The assemble form asks for the sub-type and the
activity, and its example is now a term an IND can file. The route tests and
end-to-end cases that filed IND follow-ups as 'Efficacy Supplement' now file the
IND amendment tuple. The end-to-end harness moved to `tests/support/` so the suite
stays one implementation as it grows.

```
WITHOUT the fix (route, real packager, PGlite): 2 failed
  x an IND amendment declares the activity it continues ... -> us-regional.xml did not carry <submission-id submission-type="fdast1">0000</submission-id>
  x REFUSES what an IND cannot file ... -> IND + 'Efficacy Supplement' assembled: expected 200 to be 409
Mutation: the loose resolver back in the vocabulary -> "supplement: expected [Function] to throw"
WITH the fix: ectd + submission-gateways + route, transmit, AnA, client and ectd-compile
  suites: 1774 passed; 2 failures in transmit-guard-reports-checks.test.ts fail identically
  without this change (see hand-offs)
```

Hand-offs from F04, not changed here (the IND lane's or shared files):
`core-to-packager.ts` sends sub-type `amendment` with no submission-id, so its
amendments still declare their own number (the shared packager's default); the
packager-side refusal of that waits for that lane. `ind-lifecycle/ind-ectd-envelope.ts`
is a second us-regional envelope builder that always writes submission-id = sequence.
`ectd-regional-rules.ts` FDA-ESG-002 still requires the prefix F05 refuses.
Not this lane's, seen in passing:
`server/services/submission-gateways/__tests__/transmit-guard-reports-checks.test.ts`
fails at HEAD (`[tenant-rls] FAIL-CLOSED: pool.query requires an active tenant scope`)
since `b7bf25037` (gateway-account selection, D7) made the transmit guard query the
database in a test that does not mock it.

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
