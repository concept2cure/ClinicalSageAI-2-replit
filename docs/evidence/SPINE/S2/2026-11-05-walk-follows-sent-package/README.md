# S2 (LX-00): the founder walk follows the sent package where it is kept

**`Plan: F1`.** Session `session_01QoxbLcnW5jPvJSjjKQtvTA`, 2026-11-05.

## What already exists (RULE 3)

LX-12's bytes half was done on 2026-10-29 in `3cab286e12` ("keep the exact bytes sent to an agency, before they are
sent", `docs/evidence/D7/2026-10-29-sent-package-kept/`):

- `server/services/submission-gateways/sent-package-archive.ts` (`archiveSentPackage`) stores the verified package in
  the byte store's `sent-packages` namespace, as the guard's last step before the wire;
- the guard stamps `metadata.sentPackage = { storageVersionId, provider, sha256, sizeBytes }` on the transmittal.

The walk's `transmit/bytes-retained` check still read `submission_transmittals.bundle_path`, the staging file the send
removes by design. So it stayed RED in the baseline after the defect was fixed.

## The change

The check follows the recorded key, `metadata.sentPackage`, reads the package from a fresh provider instance, and
requires it to hash to the transmittal's `bundle_sha256` and to the bytes that left on the (stubbed) wire. The
baseline entry is removed, and the ceiling goes from 12 to 11.

To keep the file within the 500-line limit, the archive-reason check's query is written on two lines. Nothing it
checks changed.

## Evidence

- `01-red-on-a-missing-package.txt`: the same check pointed at an object id the store does not hold. It FAILS, and is
  not baselined.
- `02-green.txt`: 15 of 15. `ci:canvas-path` and its selftest pass.

## Still open (LX-12's other half)

`transmit/transmittal-names-sequence`: `submission_transmittals` has no `sequence_id` column. A transmittal joins its
sequence only through the `ECTD_TRANSMITTED` audit row. The submission service and its schema are held by RIM (see
`COORDINATION.md`).
