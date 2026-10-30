# Independent final device attachment feedback review

D2 / W2, 2026-10-30. Verdict: **approved within the reviewed contract; no blocking issue or additional source/test change requested**. This reviewer read source/evidence and wrote only this review and its pin file. All runner results below are root-owned observed artifacts, not tests or browser/compiler jobs run by this reviewer. Normal full-program compiler and direct-publication results remain root-owned and pending.

## What already exists and what changed

The approved discovery inventory/contract remains the baseline. The existing attachment handler/tab/icon moved once from `PathwayPanes.tsx` into the adjacent `DossierAttachments.tsx`; the old handler, old tab/icon definitions and old uploader/store imports are removed. The parent drawer imports that one owner, keeps its existing attachment collection/count and supplies the existing `fmtTime` formatter. The shared uploader, receipt parser, transport, account/session and shell guards, local store, hydration, types and server behavior are unchanged.

The new source is 134 lines, with guarded visit orchestration, the moved upload handler and moved view. PathwayPanes decreases from 1236 to 1127 lines. CSS adds only readable wrapped outcome/pending presentation in the existing drawer. There is one production uploader call for this workflow and no additional message/receipt/auth/session/persistence engine or standalone app.

## Source correctness

- The original selected File array is copied synchronously; indexed stored callbacks remain the only local confirmation authority. A filename or repeated File-object reference cannot confirm another selection. All seventeen previous identity controls remain byte-identical.
- The busy ref is set before any await and cleared in finally. It prevents another input/drop request before React can repaint disabled controls. The view disables the native button/input and ignores pending change/drop/drag activation. Drop continues to prevent browser default navigation.
- Choose files stops bubbling into the retained drop-zone click handler, and the hidden input's click stops propagation as well. One keyboard or pointer gesture opens the chooser once, without starting an upload merely by opening it.
- The exact shared hook note appears as status or alert, with a clear uploading message and atomic live-region semantics. Deliberate new selections reuse the hook's existing note reset. Refusal versus uncertainty wording, no automatic retry and no false no-recording claim remain hook-owned.
- The attachment owner remains mounted inside the open drawer while its visible flag follows Document/Attachments/Activity tab changes. Upload ownership, pending state and results survive ordinary visibility changes; only the presentation hides.
- Program, backend document, pathway, section id/label and canonical account/session compose the context key. The captured visit pointer/generation, active cleanup and canonical shell guard retire old continuations after replacement, close/unmount and A-B-A, including batched shell A-B-A with unchanged final props. A replacement child starts fresh hook state. The post-await current check prevents late local metadata publication; old note/busy state cannot appear in the new keyed view.
- Ordinary same-account refresh does not change the canonical session revision/account snapshot or context key. The positive test invokes the actual refresh flow. Replacement sessions use the real revision-changing setToken path. No new authentication or server admission authority is granted.
- The existing store remains local display metadata and produces no audit event. The guard does not cancel/roll back an already-started server write, alter remaining shared-hook queued requests or create durable dossier association. Those behaviors are not claimed.

## Observed engineering evidence

The frozen feedback red run has 14 failures against unchanged source. The corrected visit red run has 10 failures and two valid-current positives. The earlier twelve-failure visit diagnostic failed in helper synchronization before XHR and is explicitly retained as non-product evidence. Its approved helper correction commits the attachment tab before entering the async upload act; cases, assertions, guards and original File checks remain intact.

The first browser attempt lacked the default executable and is infrastructure evidence, not semantic failure. The later actual Chromium baseline reaches the shipped drawer and fails on the absent Choose files button; the retained repeated frozen harness pins support that attribution. The final browser run passes eight checks with 32 selected inputs unchanged before/after, no unexpected requests and no browser errors. It uses the shipped drawer/hook/parser/store, real browser chooser/FormData/XHR, explicit synthetic network replies and native keyboard activation. Captures/layout records cover desktop/mobile light/dark views, measured drawer/page fit and a long-name wrapping case. They are component browser proof, not hosted authentication or native server/storage/agency proof.

The final regression log passes **385 tests in 28 suites**, zero failures/skips. The full client/server/audit-verifier build completes successfully. Explicit no-ignore lint reports zero errors and the seven existing PathwayPanes warnings; the new component, new tests and checked harness inputs have zero warnings. The initial RequestInfo type-annotation warning and unused parent import were corrected without suppression or baseline changes. All **43 qualification input hashes** match current files. Independent review also verifies the 21 baseline critical paths: only the approved parent/CSS changed and the other 19 remain exact. Existing receipt/drop suites retain all seventeen controls with exact baseline bytes.

## Evidence meaning and limits

The two new suites drive actual drawer/hook/XHR/parser/store behavior with controlled replies. Ownership tests use the real AuthProvider, authService revision guard and shell channel. The refresh control calls actual refreshToken with a synthetic HTTP reply and proves sameRevision remains true while the old bearer credentialsCurrent becomes false. No lifetime guard is mocked to always true. Existing exact request identity, metadata and no-local-Activity assertions remain intact.

A fetch parameter annotation refinement fixes lint without emitted runtime/assertion changes. Controlled mutable selection remains a consumer simulation, not a claim about every native FileList implementation. Browser account-transition proof belongs to the separate component/AuthProvider ownership cohort, not the null fixture account in the browser harness.

The retained settings/recorded-context, study/protocol and filing work at canonical `89b67685e582ff7a6f91487fa0877527f5ab6ea8` is not rewritten. This review does not certify complete platform readiness, durable attachment reload linkage, authenticated hosted acceptance, server byte admission/RLS, live signature ceremony, human OQ, deployment or agency acceptance. Normal compiler/publication gates must still pass without bypass; record their actual results separately.

## Pins

`final-review-pins.json` binds this verdict to the 43-input qualification manifest, **49 current source pins** and **32 current browser-input pins**. It records exact source sizes, preserved controls and red/green/build/lint/browser attribution. Review pins are frozen source observations, not a substitute for committed-blob and accepted-remote verification by the root.
