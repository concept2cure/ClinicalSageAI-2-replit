# eCTD transmit path — operator runbook

Status: **live on `concept2cure-v2`.** Owner: Regulatory Operations (operation) + Platform (gates).
Touched code: `server/routes/submission-ops.ts` (assemble, preflight, regulatory identifiers),
`server/services/ectd/section-to-ctd.ts`, `server/services/ectd/regulatory-identifiers.ts`,
`server/services/ectd/package-leaf-bytes.ts`, `server/services/submission-gateways/{regional-packager,governed-transmit,pre-transmit-check,ectd-structural-validator}.ts`,
`server/services/ectd/regional-backbone-readiness.ts`, `client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx`.

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
Either clears a bundle assembled before the change; assemble again.

The assemble response returns the bundle descriptor with counts only; the findings
themselves are persisted on the package and served by
`POST /api/submission-ops/packages/:id/preflight`. The Dispatch surface shows them in the
findings card after an assembly that carries errors, and after any refusal.

`region` (FDA/EMA/PMDA) and `sequence` (exactly four digits) may be given in the body.
The format follows the region (`pmda_ectd` ⇔ PMDA; `ectd` ⇔ FDA/EMA; `estar` ⇔ FDA;
`eudamed_register` ⇔ EMA); a contradictory pair is a 400.

### 3. Transmit

`executeGovernedTransmit` refuses (422) a stored bundle with `errorCount > 0`, with no
validation evidence, or whose file lies outside the bundle namespace. The bundle that
passes is handed to the gateway with the packager's own evidence
(`submissionGrade`, `dtdStatus`, `regionalBackbone`), and the registry guard runs the
pre-transmit gate:

| Check | Posture |
| --- | --- |
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
