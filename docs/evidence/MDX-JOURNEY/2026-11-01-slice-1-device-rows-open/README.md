# MDX journey slice 1: a device screen's document row opens its record, and AnA is told the truth (M1, M2)

From `.design/client-journey/MDX_JOURNEY_2026-11-01.md`. Plan: F1 (repairs shipped behaviour; no screen, mount or
table).

## What already exists (RULE 3)

- **The panel.** `mdx/components/DocumentsPanel.tsx` is the one "documents this surface owns" list. Each row's main
  area was a `<button>` calling `onOpenEditor?.(d.id)`.
- **The screens.** `EngineeringSurface.tsx`, `UdiSurface.tsx` and `PostmarketSurface.tsx` accept `onOpenEditor` and
  say "Tap any row to open in the editor" or "…in the label editor". `MdxSurfaceHost.tsx` passed none of them a
  handler.
- **The rows.** They name three kinds of record:
  - `art-<id>`: governed artifacts (`server/routes/mdx-engineering.ts`);
  - `swl-<id>`: IEC 62304 software items (same route);
  - labeling documents, `editor: 'label'` (`mdx-udi.ts`).
- **The canonical way to open a governed artifact in the one editor** is
  `resolveSurfaceAction('authoring.open-document', { title })` with `applySurfaceAction`. That is what Vault's
  "Open in editor" and the Artifacts center use (`v2/surfaces/Vault.tsx:2017`). This change reuses it and adds no
  second opener.
- **The screens the other rows open:** `device-software` (Software) and `labeling` (Labeling). Both are in the launch
  catalog. Neither takes a target for a single record, so a row opens the project's screen, and the subtitle says
  so.
- **What AnA is told** is `DEVICE_SCREEN_ACTIONS` in `MdxSurfaceHost.tsx`. The controls it described as absent
  exist:
  - `EstarFilingPanel` "Sign and file", which asks for the password;
  - `pathway/DossierAttachments` uploads;
  - `DeviceProfilePanel` save.

## The defect

**M1.** Every row on Engineering and UDI was a focusable button that did nothing. Postmarket's urgent-MDR button
would have done the same. Its documents read is switched off (`DOCUMENTS_READ_HERE = false`), so it never draws
today.

**M2.** AnA was told that signatures, uploads and profile changes happen "never through screen controls", and it
repeated that to users. It was not told that nothing on these screens sends a filing to an agency.

## The change

- `DocumentsPanel`: a row with no handler is content, not a button, and loses its trailing arrow. The handler receives
  the row as well as its id.
- `MdxSurfaceHost`:
  - `deviceDocumentDestination` names where each kind of row opens;
  - `openDocumentRow` opens it, through the canonical action for an artifact;
  - Engineering and UDI receive it;
  - `DEVICE_SCREEN_ACTIONS` names the real controls and says that nothing here sends a filing to an agency.
- Engineering's and UDI's subtitles say where a row opens. Postmarket's urgent button draws only when it has a
  handler.

## Proof

| | Result |
|---|---|
| red, before the fix (`red/before-the-fix.txt`) | 6 of 6 fail. Each Engineering and UDI row click does nothing, the subtitle promises the editor, and a handler-less row is still a button. |
| red, M2 (`red/m2-what-ana-was-told.txt`) | The text AnA was given, verbatim. |
| green (`green/the-test.txt`) | 8 of 8 in `mdx/__tests__/deviceDocumentRowsOpen.test.tsx`. |
| collateral (`green/collateral.txt`) | 151 files: 145 pass, 1,552 of 1,565 tests. |
| typecheck and lint | No type errors in the changed files, and no change in their ESLint warning counts. |

**Already failing before this change.** With the HEAD versions of the five changed sources restored in place, the
same 13 tests fail the same way:
- `mdx/surfaces/__tests__/OfficialEstarPanel.attachments.test.tsx` (8);
- `mdx/hooks/__tests__/useMdxPrograms.productType.test.ts`;
- `v2/__tests__/anaOperatesAuditTrail.test.tsx`;
- `auditTrailEventChainVerdict.test.tsx`;
- `cmcAuditRemediation.test.tsx`;
- `submissionCenterGovernedWorkspaces.test.tsx`.

None of them involves the changed files. They are recorded for their owners.

**Not yet shown in the running app.** RULE 4 asks for that, and it is slice 5 of the study (the journey walked in the
browser).

## Handed on, from the same slice

- **M4.** Every Submission Center device filing row says "Open 510(k) surface". The door's handler is in
  `SubmissionCenter.tsx` (`onOpenPathway`), which RIM holds. The fix is a per-row door by the filing's
  `programType`: `pma` to `device-pma`, an IVD variant to `device-diagnostics`, and otherwise `device-510k`.
- **M10.** The Plan title of a technical documentation project is in `v2/surfaces/ProjectMdxWorkflow.tsx`, which is
  under D3's glob. It waits on the coordinator.
- **M11.** Two registry note strings. `shared/constants/ui-surface-registry*.ts` changed today (`2523177a50`), so they
  wait a turn.
