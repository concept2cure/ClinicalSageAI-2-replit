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

## Adversarial review

A five-lens review workflow ran over commits 1–4. **Only the security lens
completed.** The other four (over-refusal, transmit/assembly, formatting
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

## Not done, and why

- **The licensed artefacts and credentials** (13 of 15 preflight items). These
  are for Procurement or Regulatory Ops to obtain, from a network-permitted
  machine.
- **The unfinished review lenses.** Re-run the review workflow over the full
  range before the first live transmit.
- **A durable record of what each transmit filed.** Follow-up sequences bind
  declared acts against the preview-compile heuristic, so an act that cannot be
  bound is refused rather than mis-filed. The design critiques found blocking
  problems in the first proposal, so it was not built:
  - wrong-document binding;
  - staging→production cross-over;
  - "sent" treated as "accepted".
- **AS2 receipt checks.** `Received-Content-MIC` and the MDN's own signature are
  not verified. Both need FDA's certificates and a UAT round trip.
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
    vitest mock lacks the `ModelNotApprovedError` export that upstream added.
