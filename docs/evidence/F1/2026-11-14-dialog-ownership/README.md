# F1: finish existing dialog focus and keyboard ownership — 2026-11-14

W1, launch D2, canonicalf4c1ef1dc. The project/team-sharing audit found no need to duplicate its existing sharing implementation. Its Team drawer, revoke confirmation and the global task/message form all use the same dialog hook; this continuation repairs only that shared existing behavior after concrete RED proof. AnA/provider setup remains untouched.

## What already exists

- `client/src/concept2cure/v2/useDialog.ts` is the one existing v2 focus trap, Escape handler and opener restoration. Its existing openDialogs stack lets only the top layer process keys. Cleanup still restores the removed layer's opener unconditionally; key handling does not check composing/default-prevented events. Audit those two precise failure families before source edits.
- Existing callers include `surfaces/ProjectTeamResponsibilities.tsx` Team drawer, `C2CForm.tsx` confirmation drawers and `surfaces/CollabLauncher.tsx` centered task/message modal. The global launcher can coexist with another surface's dialog. Preserve those callers and UI; no separate dialog/trap or new screen is added.
- `v2/__tests__/useDialogFocusTrap.test.tsx` already covers normal Tab wrapping/interior movement, no-focusable panels, opener restoration, topmost Escape and latest close handlers. `riskAndDialogA11y.test.tsx` and `taskBoardModalA11y.test.tsx` cover real consumer behavior. Add focused nested/unmount and composing/handled-Escape cases beside these existing tests, preserving normal controls.
- `.design/claude-convergence/D0.md` identifies this hook as canonical (§1.13–1.14); §scope explicitly sends any TypeScript dialog repair through F1. Existing C2CForm and CSS primitives are unchanged. Current coordination records no exact useDialog.ts hold.
- Existing editor find/search controls already own Escape locally, and native input methods use KeyboardEvent.isComposing. Respect an already handled key and preserve normal unhandled Escape/Tab; do not add a keyboard service or dependency.

Discovery searched useDialog/dialog/focus/Escape/composition names and callers/tests across v2, the D0 spec and current coordination; deleted history contains retired legacy Dialog components but no replacement for this live hook. Root instructions/plan/ledger are unchanged, F1 is open, and no deeper AGENTS.md is present in v2. Backend/source/admission/model policies and held project/editor/quality files remain read-only.

## Bounded proof and ownership

Two agents own disjoint focus-restoration and keyboard-event tests/read-only audits first, retaining genuine original source/test/logs and normal controls. One sole source owner follows both RED proofs; root owns controlled browser/runtime, integration/Git and the single full compiler. Only useDialog.ts and focused tests/design/evidence may change. No real message/task/sharing write or provider call is performed. Focus restoration must respect a still-open top dialog; input-method or already handled Escape must not discard a draft. Closing an ordinary top dialog and normal keyboard navigation remain supported.

## Confirmed baseline

Original hook SHA-2562fd1d3b4be3d766171f404c54d7ca3645f2772c4db4399b129d84479ba5e04c3. Genuine focus RED: four failures/eleven controls, including preserving whole-stack teardown and StrictMode. Genuine keyboard RED: five failures/six controls, preserving ordinary keys/topmost behavior/latest handler. The actual local Chromium UI independently reproduces draft loss after controlled composing or handled Escape and focus moving behind a surviving global Collaborate form when the underlying task detail is dismissed. No page errors or business write is forwarded. Source remains unchanged throughout these baseline runs.

## Result and verification

Only the existing useDialog hook changes production behavior. Existing stack entries retain their panel and opener. Retiring a lower layer preserves focus in the active top layer and repairs the opener chain; retiring the top returns to a connected opener in the remaining dialog or that dialog's panel, and the final layer returns to the surviving page opener. Composing or already-handled keyboard events remain with their input. Ordinary Escape, Tab wrapping, current close callbacks, enabled toggles, simultaneous teardown and StrictMode controls stay supported. This keeps D0's canonical drawer focus/Escape/opener contract; no second focus trap, UI, route, service or dependency is added.

Final60/60 across nine suites pass, including both hook suites and actual C2CForm, task/risk dialog, collaboration-intake and team-sharing consumers. Final source/tests/browser runner have zero lint errors/warnings. The first26/26 functional run exposed two complexity warnings; same-file private helper extraction removed them without behavior/test changes. Its actual log/lint and final frozen hashes are retained. Independent read-only review approves the bounded patch.

The actual local Chromium RED/GREEN runner exercises the existing global Collaborate form and Task detail. Both controlled composing and handled Escape now preserve the draft; an ordinary following Escape still closes it. Dismissing the lower Task detail keeps focus in the surviving global form. Page errors are empty; fictional responses are intercepted and business mutations/external requests blocked. These are controlled DOM KeyboardEvents, not a claim of OS/native-IME certification across platforms. Backend persistence, provider/model operation, hosted Codespace acceptance and clinical qualification are not assessed. The user-reported working AnA configuration is untouched.

Root publishes through all normal canonical gates and the full compiler, preserving concurrent changes and restarting only its own local verification app at the accepted commit. Source/tests stay frozen during those checks.

Canonical7579b804a adds trial-design reachability and source-selection evidence closure without changing this hook or its focused tests. The normal merge preserves both coordination entries and all upstream files. Because ProtocolDev is imported by the existing risk/dialog consumer suite, that suite is rerun on the merged candidate; its overlapping result is retained separately and not added to60. Frozen hook/test hashes remain exact.
