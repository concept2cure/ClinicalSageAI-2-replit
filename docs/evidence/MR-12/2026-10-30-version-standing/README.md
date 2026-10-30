# CAT2-18 completed: the version history says which version is in force, and what superseded the rest

Row: D2 (W1), workstream MR-12, Stage 2 (CAT2-18). 21 CFR 820.40 and ISO 13485 §4.2.4 (obsolete documents identified).

## CAT2-18 re-confirmed at head (4e0a3efa8)

The finding said, at 94b4f9238, that QMS controlled documents had no version history. At head, most of it is fixed.

| Point | At head | Where |
|---|---|---|
| Immutable version store | Done | `qms_document_versions`, created by `db/migrations/20261014_qms_controlled_authoring_content.sql` and on the applier. Trigger `qms_signed_version_immutable` refuses UPDATE and DELETE. |
| Approved version kept, with the signed digest | Done | `persistQmsSignedVersion`, written by the approval with the digest its signature binds (`tests/db/mdx-qms-request-rls.dbtest.ts`: `bound_payload_digest === content_digest`). |
| v1.0 in force while v2.0 is drafted | Done | `readInForceReleases`, `server/services/qms/in-force-release.ts`. It is used by training, compliance, readiness, review-due, the register, periodic review, the controlled copy and the compliance report (`tests/db/qms-in-force-during-revision.dbtest.ts`). |
| One revise | Done | `reviseControlledQmsDocument`, called by both the route and the AnA tool. |
| v1.0 superseded when v2.0 is approved | **Was open** | No reader said so. The history dialog listed versions and never said which governed. A comment in `mdx-qms.ts` said `'superseded'` was set by the revise route, which sets `'draft'`. |

## What already exists

| Piece | Path |
|---|---|
| Version store and route | `qms_document_versions`; `GET /api/mdx/qms/documents/:id/versions` (`server/routes/mdx-qms.ts`) |
| In force | `readInForceReleases` / `resolveInForceRelease`, `isPendingEffective` (CAT2-19) |
| History dialog | `client/src/concept2cure/quality/ControlledDocumentHistory.tsx`, opened from `SopRegister.tsx` |

## What changed

- **`qmsVersionStandings(live, versions, inForce)`** (`in-force-release.ts`). Each recorded version gets one standing:
  - **in force**, when the in-force reader resolves to this version;
  - **pending effective**, when it is approved for a later day;
  - **superseded by version X from date D**, the next signed version and its effective date;
  - **retired**, the newest signed version once the document is retired. A draft retired with the document is not a
    successor.
  - **not in force**, when none of these applies.

  The standing is read, not recorded. The store is immutable, and supersession follows from the successor's signed
  approval. `compareQmsVersions` orders versions as numbers, so 1.10 comes after 1.9.
- **The route** returns `standing` on each row. It is computed by the same `resolveInForceRelease` that every other
  in-force reader uses.
- **The dialog** prints it in the version summary, for example "Version 1.0 · approved 2026-01-10 · Superseded by
  version 2.0 from 2026-06-01". When the server gives no standing, it prints nothing.
- The stale comment in `mdx-qms.ts` now says that nothing sets `'superseded'`.

## Proof

- `green.txt`: `server/services/qms/__tests__/version-standings.test.ts` passes. It resolves in force through
  `readInForceReleases`, as the route does, and covers four cases:
  - superseded, with the takeover date;
  - in force under revision;
  - pending effective with its predecessor in force;
  - retired from effective and retired from draft.
- `mutation-retired-draft-as-successor.txt`: with the retired-from-effective condition removed, the retirement
  case fails. The file was restored.
- `ci:typecheck:no-regression` reported 0 errors. The ESLint ratchet and `ci:surface-text-ramp` passed.

## Still open, named

- A legacy registry entry (`metadata.sections`, no authored document) gets no snapshot when it is approved. Its
  approved row is kept as a `legacy-registry` version only when a revision opens. While it is effective, the row
  itself is the approved version, so nothing is lost. Whether to snapshot at approval is part of the legacy-entry
  retirement, not this change.
