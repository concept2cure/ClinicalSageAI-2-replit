# W5 evidence — the sequence path to FDA, 2026-09-22

**Row moved:** D7 (one real sequence), workstream W5, engineering half. Eleven
defects on the path a real IND sequence takes from assembly to FDA's test
environment were closed. Each was written failing-first, and the before-runs
are filed here. One of them made the row unreachable outright: **the packager
refused the filled Form FDA 1571**, the m1.1 transmittal every IND sequence
carries.

**D7 stays not green.** `submission:preflight` read 2/15 both before and
after. The GA readiness report read 5/40 before and 5/41 after. The extra row
came from the upstream merge (a PQ row for high-risk drafting models), not
from this work. Every remaining row is a licensed agency artefact or a
credential: the ICH/FDA DTDs and stylesheets, the PreSTAR PDFs, and the FDA
ESG staging account and certificates. Code cannot supply them.
Re-run 2026-09-23, after rounds 2 and 3: still 2/15 and 5/41
(`round3/after/submission-preflight-2026-09-23.txt`,
`round3/after/ga-readiness-report-2026-09-23.txt`).

Base `e4a3f8981`. Commits, in order:
- `937c9d0e2`
- `6fed3840b`
- `b4e6aec94`
- `24bacf03b`
- `de03a85da` (manifest regeneration)
- `925f5aa38`
- `b3378c41a`
- `ec1e31e89`
- `98566b13f`
- `28138e698`
- `ba3ec90c6`
- `ddac6c9b4`

## What was wrong, and what changed

### 1. The filled Form FDA 1571 could not be packaged (a D7 blocker)
The vendored official 1571 and 3674 are FDA-secured: AESV2, an empty user
password, and `/Encrypt 47 0 R` in the cross-reference stream. The platform
fills them by incremental update, so the output is the FDA file byte-for-byte
plus an appended section. The packager refused every PDF with an `/Encrypt`
entry, so `form-fda-1571.pdf` at m1.1 raised LEAF-ENCRYPTED
(`before/fda-form-1571-refused.txt`).

FDA asks for its forms to be submitted with their existing security settings.
From FDA's *Electronic Submission File Formats and Specifications* (PDF
security): "FDA forms in PDF format available from the FDA website may contain
security settings that prevent changing the essential elements of the form …
these forms should be submitted with their existing security settings."

**Provenance caveat:** that sentence comes from a search-engine excerpt of
`https://www.fda.gov/media/110979/download`. Fetching the document itself was
refused by this environment's egress proxy (`EGRESS_BLOCKED`, www.fda.gov), and
nothing was routed around it. **Regulatory Ops should confirm the sentence
against the current FDA document before the first transmit.**

`server/services/ectd/leaf-pdf-security.ts` is the single rule. A PDF carrying
`/Encrypt` ships only when all of the following hold:
- the destination is FDA;
- the leaf begins with the exact bytes of a vendored FDA form whose pin
  matches (the IND forms' manifest sha256, or the eSTAR `checksums.txt`);
- nothing appended re-points `/Encrypt`, and nothing appended redefines FDA's
  encryption dictionary;
- **a reader agrees:** pdf.js opens it with no password, and sees the template's
  permissions and `/ID[0]`.

A form that ships this way is never run through Ghostscript, and the PDF/A
grade lists it separately from the not-converted set. After the fix, see
`after/fda-form-1571-packaged.txt`.

### 2. The encryption test missed secured files
- **The size band.** The test read a 512 KB head window and a 64 KB tail window,
  the tail only when it began past the head. A secured file of 513–575 KB had
  its trailer read by neither (`before/probe-encrypt-band.txt`).
- **Escapes and earlier sections.** A `#`-escaped `/Encr#79pt`, and an `/Encrypt`
  in an earlier incremental section, were missed at every size.
- **The fix.** `pdfNameOffsets` now scans the whole buffer for decoded name
  tokens. `/Encrypt` can only live in a trailer or an xref-stream dictionary,
  and neither may be compressed, so the scan is complete by construction
  (`after/probe-encrypt-band.txt`).
- **Byte-based detection.** The gate keys on `%PDF-` bytes, not the `.pdf` file
  name.
- **v4.0 packager.** The eCTD v4.0 RPS packager now refuses secured PDFs.
- **Transmit re-check.** The transmit guard re-reads the sha256-verified bundle
  and judges every PDF entry by the same rule. This applies to **every bundle
  format and every environment**; `staging` is FDA's test system, where D7 is
  judged.

### 3. A vault leaf was dropped and a draft was shipped, and transmit reported success
`package-from-core` omitted `documentUuid`. As a result every vault leaf landed
in `skipped` after being staged, never in `unresolved`, and transmit read only
`unresolvedLeaves`. Transmit also never read `unfinalized`. Now the uuid is
passed, and `assembledTransmitBlockers` states both causes. Transmit refuses on
them, and the assemble route reports them (`before/vault-uuid-failing-first.txt`).

### 4. Declared lifecycle acts were re-coded
Three acts were silently re-coded:
- a declared *replace* that could not bind was filed as *new*;
- a declared *append* was filed as *replace*;
- a *replace* with nothing on file shipped with no `modified-file`.

Each act now binds and names the filed leaf, or it goes to `skipped`, which
blocks transmit. Readiness says it did not assess the binding
(`LIFECYCLE_BINDING_NOT_ASSESSED`). See `before/d7c-failing-first.txt`.

### 5. The formatting check reported "nothing checked" as clean
Facts are now measured from bytes (`measureLeafFile`) or treated as claims.
Every applicable rule that could not be judged is listed in `notAssessed`, and
the verdict is `nonconformant`, `not_assessed` or `conformant`. The eSTAR build
measures its own bytes, and the client says when formatting was not checked
(`before/d7b-failing-first.txt`).

### 6. The sequence signature did not bind which document a leaf files
The Gate 1 / release-signature digest omitted `document_uuid` and
`document_content_sha256`. A signed vault leaf could therefore be re-pointed at
a different PDF and the signature still verified. Both columns are now bound.
Only `upsertLeaf` writes them, so the "survives the dispatch it authorized"
property holds (`before/signature-binding-failing-first.txt`).

### 7. A malformed Shadow Review read as a clean review
Three model outputs used to count as a clean review in transmit Gate 2:
- a reply with no `findings` array was completed as a clean run;
- a finding of severity `Critical` was never counted as critical;
- an unknown severity was accepted.

Replies are now validated; an uncountable reply fails the run
(`before/shadow-review-failing-first.txt`).

### 8. An unpinned leaf read as a verified one
Readiness now emits `DOCUMENT_CONTENT_NOT_PINNED` for a leaf with no content
pin (`before/unpinned-failing-first.txt`).

### 9. Failed but non-blocking package checks vanished on transmit
The DTD self-containment check fails on every package while no DTDs are
vendored. The transmit still returned `transmitted:true`, with no trace of the
failure. Such failed checks, and the guard's warnings, are now recorded on the
ECTD_TRANSMITTED audit row and in the response
(`before/pretransmit-checks-failing-first.txt`).

### 10. An MDN that names no message was taken as FDA's receipt
Such an MDN is now refused. The raw MDN is kept, and the sequence stays in
flight for a human to confirm at the agency (`before/mdn-no-id-failing-first.txt`).
*Superseded 2026-09-23 by round 3 (`62f57b83e`).* The first fix recorded the
transmittal 'rejected', which is outside the duplicate-send lock. One
classifier now decides every attempt, and an MDN that cannot be tied to our
message is held 'in_transit' until confirmed at FDA.

## Adversarial review

A five-lens review workflow ran over commits 1–4. **Only the security lens
completed** (the full review ran in rounds 2 and 3, below). The other four (over-refusal, transmit/assembly, formatting
contract, completeness) and the verification pass stopped when the account
reached its monthly usage limit, so those lenses were **not run**.

The security lens found four defects in the FDA-form exception, all now fixed
with failing-first tests (`before/fda-form-tamper-failing-first.txt`,
`before/estar-label-failing-first.txt`):

| Severity | What passed as "an FDA form as issued" but needed a password to open, or skipped the check |
|---|---|
| critical | FDA's encryption dictionary redefined as `047 0 obj`, as `47 00 obj`, or with a comment before `obj` |
| high | The dictionary redefined inside an object stream |
| medium | An appended trailer carrying a changed or missing `/ID` |
| low | A bundle labelled `estar`, which skipped the transmit check entirely |

## Round 2 review (2026-09-23)

The five-lens review re-ran over the whole D7 range, this time to
completion. The lenses were security, over-refusal, transmit/assembly,
formatting contract and completeness, and each had its own skeptic. Of 24
verdicts, 18 were confirmed and 6 refuted.

**Correction to the first version of this README.** It said every remaining
D7 row was a licensed artefact or a credential. That was wrong: there was one
code blocker. `transmitSequence` staged every package under `os.tmpdir()`.
Outside development and test, every gateway refuses a bundle outside the
submission-bundle root. So every staging and production transmit was refused,
including one to FDA's test environment, and the sequence was left
"transmitting". That was fixed in `4656e9619`. The claim is now true: every
remaining preflight row is an artefact or a credential.

Round-2 fixes, each with a test shown failing first
(`round2/before/*-failing-first.txt`, `round2/after/*-passing.txt`):

| Commit | What it fixed |
|---|---|
| `4656e9619` | staging inside the bundle root; a guard refusal before the wire frees the sequence |
| `cd76c7b67` | freeze and dispatch refuse a package that transmit would refuse, while it can still be changed |
| `59893f059` | a declared withdrawal ships no bytes |
| `91cd596da` | package spine: an unapproved artifact is refused at transmit (LEAF-UNAPPROVED) |
| `0d3535e13` | a declared format never narrows which formatting rules apply |
| `3985d9852`, `b71f5bde4` | FDA-form exception: the section a conformant reader starts from; embedded files judged |
| `678d935d9` | a vault leaf reaches the device technical file and the compile |
| `52fa14b39` | governed transmit records the pre-transmit checks that failed without blocking |

## Round 3: every round-2 fix re-checked by a skeptic (2026-09-23)

Seven of the round-2 commits had never had an independent skeptic, and the
first MDN and co-author fixes had been found unsound. Round 3 re-checked every
one. Six of the seven came back with confirmed issues. Only the formatting fix
was sound, and it still had three low findings. Each was fixed failing-first
and re-checked, with up to three repair rounds. A skeptic's bounded acceptance
counted only these as blocking:
- a regression against HEAD;
- a fail-open on a realistic input;
- a broken documented flow;
- a false statement;
- a test that passes with its clause reverted.

**Verification method.** No commit was verified only in the shared working
tree. Each one was exported from HEAD (`git archive`, a plain copy, not a git
worktree), only its own files were applied, and its suites and every suite
importing the changed modules were run there.

| Commit | What it closes | Isolated run |
|---|---|---|
| `d9fe27c1a` | package spine: an artifact is filed only at the version that was approved (and, when locked, locked); a revoked approval is drift; the guard sees the leaf manifest | 9 files, 130 tests |
| `81eb9dc0b` | formatting: the file name decides the type; a `.pdf` must hold a PDF; extensions up to 10 characters | 27 files, 251 tests |
| `24faac332` | co-author: a PUT cannot award a verdict status on either route; an approved copy cannot be edited (PUTs, batch-draft accept, apply-template); a sourced copy carries the sealed text, compared section by section; "finalized" reads "locked", not "signed"; the GA demo seeds write real seals | 60 files, 658 tests |
| `62f57b83e` | FDA ESG and ICSR: one classifier decides received / refused / delivered-unconfirmed / not delivered; ambiguous sends are held, never freed; a refused client certificate frees the sequence; an unconfirmed ICSR is locked against a resend to FAERS | 48 files, 795 tests |
| `760888fef` | freeze gate: bound to what is frozen; a sequence waits only for a sequence sharing a lifecycle key, so IND sequences freeze in parallel; classify places through the canonical upsertLeaf | 26 files, 427 tests |
| `6fe72bae4` | withdrawal: the packager sink never ships a delete's bytes; a withdrawn document is not approval-counted or read; bound by identity | 239 files, 3517 tests |

The before and after runs, and the mutant runs, are in `round3/before/`,
`round3/after/` and `round3/mutants/`. Each `*-failing-first.txt` is a new
test run against the code before its fix. Each mutant file shows a test
failing when the clause it pins is reverted.

**A skeptic reversed one of the lead's own instructions.** The MDN close
pass asked for "a 5xx that arrives before the upload finishes counts as not
delivered", keyed on Node's request `finish` event. The skeptic showed that
`finish` can trail a write the server has already read in full. A
separate-process server that reads the whole body and answers 502 while the
client is busy was classed "not delivered", and the sequence was freed for a
resend. The rule was withdrawn. Every 5xx/3xx, and every failure after an
authenticated server accepted the client, is held for confirmation at FDA.

### Founder decision, not made here
Any organization member can freeze an authoring document without a
signature, and a frozen document counts as finalized: filable at transmit,
complete in the IND and NDA checklists (now shown "Locked", not "Signed").
Options:
1. derive "finalized" only when an authoring signature covers the sealed
   version;
2. keep freeze a member action and stop counting it as filable or complete.

## Evidence in this folder

| File | What it shows |
|---|---|
| `before/submission-preflight.txt`, `before/ga-readiness-report.txt` | 2/15 and 5/40 before any change (HEAD `0d45e1fc3`, `before/head.txt`) |
| `after/submission-preflight.txt`, `after/ga-readiness-report.txt` | 2/15 and 5/41 after (one row added upstream) |
| `before/probe-encrypt-band.txt` / `after/probe-encrypt-band.txt` | 513–575 KB secured files read as unencrypted; then read correctly |
| `before/fda-form-1571-refused.txt` / `after/fda-form-1571-packaged.txt` | the filled official 1571 refused; then packaged byte-for-byte |
| `before/*-failing-first.txt` | every new test run against the code before its fix |
| `after/vitest-d7.txt` | the affected suites on the final merged tree |
| `after/eslint-changed-files.txt` | 0 errors; warnings are the pre-existing size/complexity rules |
| `after/tsc.txt` | `tsc --noEmit`: no errors in changed files; the remainder are modules absent from this checkout's `node_modules` |
| `round2/before/`, `round2/after/` | round-2 fixes: each new test against the code before its fix, then passing |
| `round3/before/`, `round3/after/`, `round3/mutants/` | round-3 fixes: failing-first runs, passing runs (including scoped tsc and eslint), and mutant runs |

## Not done, and why

- **The licensed artefacts and credentials** (13 of 15 preflight items). These
  are for Procurement or Regulatory Ops to obtain, from a network-permitted
  machine.
- **The unfinished review lenses.** Done: rounds 2 and 3 above.
- **A durable record of what each transmit filed.** Follow-up sequences bind
  declared acts against the preview-compile heuristic, so an act that cannot be
  bound is refused rather than mis-filed. The design critiques found blocking
  problems in the first proposal, so it was not built:
  - wrong-document binding;
  - staging→production cross-over;
  - "sent" treated as "accepted".
- **AS2 receipt checks.** `Received-Content-MIC` and the MDN's own signature are
  not verified. Both need FDA's certificates and a UAT round trip.
- **Held, never freed (by design):** these are held in transit until someone
  confirms at FDA:
  - a front end that answers 503 on the request head before reading the body;
  - a network drop mid-upload;
  - a TLS 1.3 server with no session tickets that refuses with a bare reset
    after 2 s.
  An operator confirms at FDA and rolls the transmittal back. An ICSR held
  `transmission_unconfirmed` has no release route; its agency ACK is
  accepted.
- **`ssh2-sftp-client`** (the FDA SFTP path for bundles over 1 GiB) is
  neither installed nor declared. A transmit on that path is refused before
  any connection, and the sequence is freed.
- **Filing order at transmit.** `transmitSequence` runs no filing-order
  check. A legacy pair of dispatched, unsent sequences sharing a lifecycle
  key can still be sent out of order.
- **classifyDocument** can still change a verdict co-author row's
  module_number.
- **AnA package tool (low):** a first sequence written `0` is not read as
  `0000`; an upper-case `DELETE` is not validated; a declared modified_file is
  not checked against the filed manifest.
- **Shadow Review coverage.** A run records no leaf manifest, so a run over an
  earlier leaf set still satisfies the gate.
- **FDA Module 1 elements outside the published table** (e.g. `m1-13`). These
  cannot be checked without the us-regional DTD, which is one of the licensed
  artefacts.
- **Readiness does not report unapproved leaves.** Transmit refuses them, and
  the assemble route reports them.
- **Pre-existing test failures, unchanged by this work.** Each fails
  identically with every change here reverted:
  - `pdfa-pipeline-ghostscript`: no sRGB ICC profile in this environment;
  - `sign-payload-kms-seam`: `@aws-sdk/client-kms` is not installed;
  - `markSubmissionReadyFailsClosed` and `authoringAiDraftNoProvider`: the
    vitest mock lacked the `ModelNotApprovedError` export that upstream added.
    Both pass on 2026-09-23 HEAD (7/7); upstream fixed the mock.
