# eCTD transmit path — operator runbook

Status: **live on `concept2cure-v2`.** Owner: Regulatory Operations (operation) + Platform (gates).
Touched code: `server/routes/submission-ops.ts` (assemble, preflight, regulatory identifiers),
`server/services/ectd/section-to-ctd.ts`, `server/services/ectd/regulatory-identifiers.ts`,
`server/services/ectd/package-leaf-bytes.ts`, `server/services/submission-gateways/{regional-packager,governed-transmit,pre-transmit-check,ectd-structural-validator}.ts`,
`server/services/ectd/{package-content-fingerprint,package-content-change}.ts`,
`server/services/ectd/regional-backbone-readiness.ts`, `client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx`.

`package-content-change.ts` is the single implementation of "this package's content
moved": the package row lock, the content revision, the stale-bundle (and preflight)
clear, and the governed mapping operation. The mapping routes, the assemble store, the
identifiers route, the preflight persist, the artifact editor and the biostatistics
workflow all go through it — every partial copy of that rule has been a defect.

## What this runbook covers

How a submission package becomes agency-bound bytes and leaves the platform, which
gates refuse it and why, what the operator must record first, and what the platform
does **not** yet claim. Every refusal named here is one the platform will show as
a finding; nothing in this path guesses a placement, fabricates an identifier, or
reports conformance it cannot prove.

## The loop, on one package id

All three steps are governed (a reason of at least 8 characters is recorded with each)
and all three run from the Dispatch surface (**Agency gateways → Record identifiers /
Assemble bundle / Transmit**) or from the API. Every `/api/submission-ops/packages/:packageId/...`
route accepts either the package's numeric row id or its `pkg_…` text id; both are
scoped to the caller's organisation.

| Step | Route | Gate |
| --- | --- | --- |
| 1. Record identifiers | `PUT /api/submission-ops/packages/:id/regulatory-identifiers` | refuses a value the backbone or filesystem cannot carry; clears a bundle assembled under different identifiers |
| 2. Assemble | `POST /api/submission-ops/packages/:id/assemble` | package must be locked; builds through the canonical packager; records structural findings on the bundle |
| 3. Transmit | `POST /api/mdx/gateways/:region/:gateway/transmit` | §11 re-authentication; refuses any bundle with error-severity findings; then the pre-transmit gate |

### 1. Regulatory identifiers

The regional Module 1 backbone carries the agency application number and the applicant
identity. The package model has no columns for them, so they live in
`metadata.regulatory` and are recorded through step 1:

| Field | Contract |
| --- | --- |
| `applicationNumber` | starts alphanumeric, then up to 63 of `A-Z a-z 0-9 . _ -` (an EU procedure number must be recorded in its dash form — slashes are path separators) |
| `applicantId` | same character set (DUNS, PMDA applicant id) |
| `applicantName` | 1–200 characters, no control characters, nothing XML cannot carry |

Without all three, assembly still succeeds so the structure can be inspected, but the
backbone carries `UNASSIGNED-…` placeholders and a blocking
`REGULATORY-IDENTIFIER-MISSING` finding is recorded: transmit refuses. An internal package
id is never written into the backbone as an application number.

Changing the identifiers after assembly clears the stored bundle (its backbone carries
the old values); assemble again.

### 2. Assembly

Content is placed **per artifact**, never per section: each artifact mapped into a
package section becomes one leaf at its own CTD section. Placement resolves from, in
order, the artifact's declared `ctd_section`, a section key that is itself a CTD code,
and (FDA packages only) an unambiguous Module 1 heading named by the section key. Every
candidate must be a **placeable** heading: a terminal ICH heading for Modules 2–5, or a
published FDA Module 1 heading (or a descendant of one) for FDA. Bare modules and codes
the tables do not contain are never emitted.

Findings recorded on the bundle at assembly:

| Finding | Severity | Meaning |
| --- | --- | --- |
| `LEAF-UNPLACED` | error | no placeable section could be resolved for an artifact or an empty section; assign its CTD section |
| `LEAF-DECLARED-CODE-REJECTED` | warning | the artifact's declared code is not a placeable heading; a lower-precedence source placed it |
| `LEAF-MODULE-DISAGREEMENT` | warning | the artifact is filed in a different module than its section names; the explicit placement is kept |
| `LEAF-DUPLICATE-MAPPING` | warning | the same artifact is mapped twice; it ships once |
| `LEAF-FILENAME` | error | a leaf name breaks the eCTD rule (lowercase `a-z 0-9 . -`, at most 64 characters with extension) |
| `LEAF-MEDIATYPE` / `LEAF-CORRUPT` | error | not a PDF / not `%PDF-` |
| `SECTION-EMPTY` | warning | a placeholder leaf for a section with no mapped content |
| `MODULE-M1-MISSING` | warning | no Module 1 leaf |
| `REGULATORY-IDENTIFIER-MISSING` | error | see step 1 |
| `PACKAGER-REFUSED` | error | the canonical packager refused outright; the stale bundle is cleared and the response is 422 |

To correct a placement, map or unmap the artifact: `POST /api/submission-ops/artifact-section-map`
(one mapping per artifact and section — a repeat answers the existing row) and
`DELETE /api/submission-ops/artifact-section-map/:mappingId` (governed; reason required).

To correct the package's section list itself — the key routes each leaf to its ICH module,
the label becomes the placeholder leaf's title, and the sort order decides the order the
leaves appear in the backbone — use `POST /api/submission-ops/packages/:id/sections`,
`PATCH /api/submission-ops/packages/:id/sections/:sectionId` (key, label and/or order) and
`DELETE .../sections/:sectionId`. All three are governed and invalidate like a mapping
change. Removing a section that still holds artifacts is refused (`SECTION_NOT_EMPTY`)
rather than letting the cascade unmap them with no record of its own; unmap them first. A
PATCH that changes nothing is a no-op: it invalidates nothing and records nothing.
Either clears a bundle assembled before the change and bumps the package's content
revision; assemble again.

Concurrent changes are decided under the package row lock, never from the snapshot an
assembly started with. A mapping change commits in one transaction with the package's
content revision and the clearing of the stale bundle (and of the preflight summary that
described it), so a failure anywhere leaves neither a half-recorded mapping nor a stale
bundle behind. A bundle is not stored, its zip (local and durable copies) is removed and
the discard is recorded when, while it was being built, an artifact was mapped or
unmapped (`STALE_ASSEMBLY`, `gate: content_changed`) or the regulatory identifiers
changed (`gate: identifiers_changed`). The response is a 409; assemble again.
Editing an artifact through the artifact routes — its text, title, version (update or
rollback) or its declared CTD section (placement) — invalidates every package that
artifact is mapped into the same way, and the response says how many bundles it
invalidated (`bundleInvalidation`). That invalidation is fail-safe: the edit is never
rolled back over it, and a failure is reported rather than folded into a clean result,
because the transmit gate's content fingerprint (step 3) refuses such a bundle anyway.
A content change that reaches the database without passing through those routes is what
the fingerprint alone catches.

The assemble response returns the bundle descriptor with counts only; the findings
themselves are persisted on the package and served by
`POST /api/submission-ops/packages/:id/preflight`. The Dispatch surface shows them in the
findings card after an assembly that carries errors, and after any refusal. Preflight
persists its summary under the same lock and only while the bundle it evaluated is still
the stored one: a bundle cleared or replaced during the run answers 409
`gate: bundle_superseded` (run preflight again), and a summary that could not be written
is reported as `persisted: false` with the findings still returned. Preflight also runs
the content assessment transmit enforces (step 3), as the `content_integrity` validator:
`BUNDLE-CONTENT-DRIFT` is an error; `BUNDLE-CONTENT-UNPROVEN` (no fingerprint) is an
error wherever transmit would refuse the bundle and a warning where descriptor trust is
relaxed.

`region` (FDA/EMA/PMDA) and `sequence` (exactly four digits) may be given in the body.
The format follows the region (`pmda_ectd` ⇔ PMDA; `ectd` ⇔ FDA/EMA; `estar` ⇔ FDA;
`eudamed_register` ⇔ EMA); a contradictory pair is a 400.

#### 2a. The sequence lifecycle

An eCTD application is a sequence of filings. 0000 is the original; every later sequence
states, leaf by leaf, what it does to what is already on file. `planSequence`
(`services/ectd/package-sequence-lifecycle`) supplies the package-specific half of that —
the FILED history and its fold — and delegates the diff itself to the canonical
`lifecycle-operator`.

- **Filed means transmitted.** The history is appended by governed transmit when the
  gateway accepts the bytes, never at assembly. A bundle that was built and never sent is
  not at the agency and must not be a baseline. The append is shape-checked with the same
  guard the reader applies, so an unreadable inventory is never persisted: it is reported
  as `filedSequenceRecorded: false` with `filedSequenceReason: 'no-usable-manifest'`, and
  the response says to re-assemble before the next sequence. A descriptor assembled before
  the inventory existed is exactly this case. The governed `sign` row and its signature
  manifest both record which sequence the signature filed and whether the history took it —
  a lost baseline used to leave no durable trace beyond a server log.
- **The baseline is a fold, not the last sequence.** A leaf untouched since 0000 is still
  compared to 0000, and `modified-file` points at the sequence folder that actually holds
  the version being superseded. A leaf whose last operation was `delete` has been
  withdrawn and drops out.
- **A sequence carries what changed.** A leaf byte-identical to the one on file does not
  ship at all; the response reports it as `unchanged` with an `omittedCount`. This is why
  leaf rendering is reproducible (`services/ectd/leaf-pdf`): PDF timestamps come from the
  content's own dates, not the wall clock, so identical content renders to identical
  bytes. Without that every leaf differs from itself and every follow-up re-files the
  whole application as `replace`.
- **Absence is not withdrawal.** A leaf on file but missing from this assembly stays on
  file, unchanged and unmentioned.

Six refusals answer 409 with a `code` and `gate: sequence_lifecycle`, in preference to a
guess: `NO_PRIOR_SEQUENCE` (a follow-up on a package that has transmitted nothing),
`SEQUENCE_ALREADY_FILED`, `SEQUENCE_OUT_OF_ORDER` (the only ordering this knows is the
sequence number, so a gap or a backfill would be diffed against filings made after it),
`NOTHING_TO_FILE` (every leaf already on file, byte for byte — the zip would carry no leaf
and consume a sequence number to say nothing), `SUBMISSION_TYPE_REQUIRED` (only 0000 is an
original by definition) and `SUBMISSION_TYPE_UNKNOWN`. The last two carry
`acceptedSubmissionTypes`: FDA files from a fixed vocabulary and 'amendment' is not in it,
so the refusal names the terms that resolve rather than leaving the operator to guess —
the value used to reach the packager and fail there with the reason discarded. EMA, PMDA
and Health Canada take this field as free text on this path, so nothing is checked against
a list they do not have.

### 3. Transmit

`executeGovernedTransmit` refuses (422) a stored bundle with `errorCount > 0`, with no
validation evidence, or whose file lies outside the bundle namespace. The bundle that
passes is handed to the gateway with the packager's own evidence
(`submissionGrade`, `dtdStatus`, `regionalBackbone`), and the registry guard runs the
pre-transmit gate:

| Check | Posture |
| --- | --- |
| content integrity — the descriptor's fingerprint of what the zip was built from (each section's id, key, label and sort order; each mapping; each artifact's title, version, declared CTD section and a digest of its content), recomputed from the database with a database-side digest so no content is transported (`BUNDLE_CONTENT_DRIFT`) | hard whenever a stored descriptor carries a fingerprint of the current scheme, in every environment; a descriptor without one, or from an older scheme, is unproven (`BUNDLE_CONTENT_UNPROVEN`) and blocks wherever descriptor trust is enforced, exactly like missing validation evidence. The dev/test-only client-supplied descriptor is not a stored bundle and is not assessed. After the gateway accepts the bytes the content is assessed again: the governed `sign` row records the fingerprint the zip was proven against and the after-send state, and a change that landed during the send is returned as `contentAfterTransmit: 'drift'` with `contentWarning` — the agency has the assembled bundle; re-assemble before any further transmission |
| gateway size limit | hard, always |
| region identity — the region the bundle was built for (its regional backbone, or the region recorded on its descriptor) and its format tag (`estar` ⇔ FDA, `eudamed_register` ⇔ EMA, `pmda_ectd` ⇔ PMDA, `ectd` never PMDA) must match the target gateway | hard whenever the bundle records its region; a bundle assembled before region identity was recorded is reported as unprovable, never treated as matching |
| PDF/A submission grade | blocks in production only when `ECTD_REQUIRE_PDFA=true`; a grade without evidence is "cannot prove", never a pass |
| DTD self-containment | blocks in production only when `ECTD_REQUIRE_DTD=true` |
| regional Module 1 backbone conformance | blocks in production only when `ECTD_REQUIRE_REGIONAL_BACKBONE=true`; always surfaced |

Malformed evidence blocks on a stored descriptor are dropped, not forwarded: the gate
then warns "cannot prove" rather than reading an empty object as compliance.

## What the platform does not claim

- **Module 1 conformance is proven for FDA only.** The FDA backbone groups leaves under
  the published FDA Module 1 heading table inside the us-regional DTD tree. EMA, PMDA
  and Health Canada backbones have their own root element but file every Module 1 leaf
  flat under the container, and their envelopes are not the agency DTD structures. They
  are classified `regionConformant: false` with the gap stated; the eight widened
  regions reuse the EMA structure and are classified as placeholders. Building the real
  structures requires the licensed agency DTDs — see `ectd-dtd-vendoring.md`.
- **DTDs are not vendored**, so no package is DTD self-contained and local DTD validation
  runs in degraded mode. `ECTD_REQUIRE_DTD=true` in production therefore blocks every
  transmit until the DTDs land.
- **PDF/A conversion requires Ghostscript** on the host; leaves are finalised one at a
  time. Without it the grade reports unconverted leaves.
- **Structural validation is internal.** It is necessary, not sufficient: passing here is
  not an agency validator pass.

## Audit

Each step records a governed action with the caller's reason. When the ledger cannot be
written the action still completes (a bundle must not be lost over an audit outage) and
the response says so (`ledgerWriteFailed`, with a warning the Dispatch surface repeats
verbatim). Record such an event manually and raise it before relying on the audit trail.
