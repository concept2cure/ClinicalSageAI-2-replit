# R1 reach: CAPA actions, their status, and the signed close of a deviation

**Package:** R1, with the F1 repair it needed committed just before it. **Date:** 2026-11-05.

## What already exists

- `server/routes/protocol-deviations.ts`:
  - `POST /deviations/:id/capa` and `PATCH /capa/:id/status`: governed, with a reason and a governed action.
  - `POST /deviations/:id/close`: an electronic signature through the platform's one ceremony,
    `server/routes/governed-signed-act.ts` (meaning, reason, password and any second factor, re-verified on the
    server). It sits behind the CAPA-closure gate `evaluateCapaClosure` in `closeDeviationTx`.

  All three are served in production, and none had a client caller (R1 inventory).
- The Deviations & CAPA tab (`ProtocolDevPanes.tsx` `DeviationsTab`) could report and assess a deviation. It could
  not record a corrective action, update one, or close the deviation.
- The protocol's signing modal (`ProtocolDevSigning.tsx`, the shared Part 11 `EsignModal`) already signs a
  protocol's finalization and a reviewer's disposition.
- F1, fixed in the previous commit: each CAPA action carried its deviation's id. The view now also carries the
  gate's `closeBlockers`.

## The change (no screen, route, service or table added)

- **`ProtocolDevWrites.ts`:** `addCapaAction`, `setCapaStatus` and `closeProtocolDeviation`.

  The close sends the shared ceremony's body: `password` and `mfaToken` at the top level. The first live walk sent
  the protocol routes' nested `reauth`, and the ceremony refused it with `ESIGNATURE_COMPONENT_MISSING`. The unit
  test had encoded my assumption, not the server's contract. It now asserts the ceremony's shape.
- **`ProtocolDevForms.tsx`:** "Add a CAPA action" (action, owner, due date, reason) and "Update CAPA status" (Open,
  In progress, Completed, Verified).
- **`ProtocolDevSigning.tsx`:** a third signed act, `close-deviation`. Its default meaning is approval.
- **`ProtocolDevPanes.tsx`:**
  - Each CAPA action gets "Update status", and its accessible name carries the action.
  - The deviation gets "Add a CAPA action".
  - "Close deviation" stays disabled while the gate would refuse. The gate's own reasons are shown and linked by
    `aria-describedby`.
  - A closed deviation offers nothing.
- **`ProtocolDevWorkspace.tsx`:** `DeviationsBody` passes the signing opener, so the tab switch keeps its complexity
  budget. It also adds the confirmation sentences.

## Evidence in the running app

Local database, project "LMN-201 RePreve — IND", protocol CDI02, Deviations & CAPA tab:

| Step | Request | Status | The screen |
|---|---|---|---|
| Report "Missed the day 28 visit window at site 104" | `POST /deviations` | 201 | Close held: "…not been assessed; assess it before closing." |
| Assess: major, safety not affected | `POST /deviations/1/assessment` | 201 | Close held: "No CAPA actions recorded…" |
| Add "Retrain site 104 staff on visit windows" | `POST /deviations/1/capa` | 201 | Close held: "1 CAPA action(s) are not yet completed/verified." |
| Set the action to Completed | `PATCH /capa/1/status` | 201 | Close enabled |
| Close, signed (meaning approval, reason, password) | `POST /api/esignature/verify-password`, then `POST /deviations/1/close` | 200, 201 | Closed; nothing more offered |

The database holds `protocol_deviations.status = 'closed'`. It also holds an `electronic_signatures` row for
`protocol-deviation:1`:
- meaning `approval`;
- the reason;
- `authentication_method = password`;
- a signature hash;
- a manifest linking the governed action and its audit-chain entry.

Screenshots: `1-reported-close-held.png`, `2-capa-added.png`, `3-capa-completed-close-enabled.png`,
`4-sign-close.png`, `5-closed.png`.

**Tests.** `protocolDeviationWrites.test.tsx` has 8 cases: the card's offers, held and enabled close, the closed
and reader states, the three routes and bodies, and a short reason refused. Six fail without the change. All 33
client protocol test files (304 tests) and the 8 server protocol files (182 tests) pass.
