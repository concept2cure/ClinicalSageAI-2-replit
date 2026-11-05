# R1 reach: an amendment's changes and its status lifecycle

**Package:** R1, with the F1 defect it exposed committed just before it. **Date:** 2026-11-05.

## What already exists

- `server/routes/protocol-amendments.ts` already had `POST /amendments/:id/changes` and `PATCH /amendments/:id/status`.
  Both are governed: they need a reason of at least 8 characters, run as a transaction and record a governed action.
  The status route enforces the lifecycle in `setAmendmentStatusTx`:
  - its `TRANSITIONS` table;
  - submission needs at least one change (`evaluateAmendmentReadiness`).

  Both routes are served in production, and neither had a client caller (R1 inventory, confidence `none`).
- The Amendments tab (`ProtocolDevPanes.tsx` `AmendmentsTab`) could create an amendment through
  `ProtocolRegisterForms.tsx`. It could not itemise one or move it on.
- The view assembler reported a status derived from dates, and never read `affects_risk`. That was F1, fixed in the
  previous commit, which also returns `nextStatuses` from the server's transition table.

## The change (no screen, route, service or table added)

- **`ProtocolDevWrites.ts`:** `addAmendmentChange` and `setAmendmentStatus` call the existing routes through `send()`
  and `requireReason()`.
- **`ProtocolDevForms.tsx`:** two governed drawers.
  - "Add a change": what changed, section, previous text, proposed text and reason.
  - "Change status": its options are the amendment's own `nextStatuses`, shown in words.

  These cases have their own dispatch, `submitReviewAndAmendment`, so no switch exceeds the complexity budget.
- **`ProtocolDevPanes.tsx`:** the amendment card offers "Add a change" while the amendment is a draft, and "Change
  status" while the lifecycle allows a move. A reader who cannot write sees neither.

## Evidence in the running app

Local database. Project "LMN-201 RePreve — IND", protocol CDI02, Amendments tab:

| Step | Request | Status |
|---|---|---|
| Create Amendment 1 (existing form) | `POST /api/protocol-amendments/amendments` | 201 |
| Add the change: section 5.1, "Adults aged 18 to 65 years" → "Adults aged 18 years and over" | `POST …/amendments/1/changes` | 201 |
| Draft → Submitted. Offered: Submitted only | `PATCH …/amendments/1/status` | 201 |
| Submitted → Under review. Offered: Under review, Rejected | `PATCH …/amendments/1/status` | 201 |
| Under review → Approved. Offered: Approved, Rejected | `PATCH …/amendments/1/status` | 201 |

The run had no failed request and no page error.

- `1-add-a-change-form.png`
- `2-change-added.png`
- `3-change-status-form.png`
- `4-approved.png`

**Tests.** `protocolAmendmentWrites.test.tsx` has 7 cases:
- the card's offers by status;
- nothing offered to a reader;
- the status options taken from the server;
- the exact routes and bodies;
- a short reason refused with nothing sent.

Five of them fail without the change, and all pass with it. All 32 client protocol test files pass (296 tests).

## Not done here, and why

- **Substantiality** (`GET /amendments/:id/substantiality`, under EU CTR 536/2014) is still not called. Its module
  note says it never returns a non-substantial finding, so its screen must not present it as one. It needs its own
  slice, with that wording reviewed.
- **Informed consent** (`/api/protocol-consent`, 7 routes) is a document type's validation and approval. Under Rule 4
  it belongs in the one editor. It was handed to D4's owner on 2026-11-05.
