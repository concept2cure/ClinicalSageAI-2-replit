# Independent final canonical-owner convergence review

D2 / W2, 2026-10-30. Verdict: **approved converged implementation; no scoped blocker or additional source/test change or qualification run requested before normal publication gates**. This reviewer read source and root-owned artifacts, and wrote only this review and its pin file. No production/test edits, runners, Git mutation or publication were performed by this reviewer. Full compiler and accepted-publication results remain root-owned and pending.

## What already exists and is preserved

The revised discovery inventory and convergence contract identify `v2/vaultUploadVisit.ts` as the sole reactive upload/session/header/program/caller/busy/note/queue owner. The current `useVaultUpload.ts` delegates to it and enforces current dispatch, callback and actionable-outcome boundaries. Both files, the existing mutationOutcome owner, receipt parser and transport are byte-identical to canonical `d79abdf9f4dd1a30091247bce2fdab2081a1e188`. The canonical archive route is also exact. No server/shared/script/package source differs from that canonical base.

The converged attachment workflow is one extracted implementation: the parent imports DossierAttachments and passes its existing formatter; old inline handler/tab/icon definitions are removed. Relative to d79, only three production paths and the two unique caller test files differ. The new component is 129 lines; the parent decreases from canonical 1250 to 1127 lines. The shared hook/API, auth guards, server admission, store persistence/audit, dependencies and entitlements are not changed by this convergence.

## Implementation assessment

- The earlier private reactive auth/session wrapper and private busy latch are removed. The canonical `useVaultUpload(programId, fullCallerKey)` alone owns reactive upload and credential decisions. Its existing batch ticket supplies same-tick overlap prevention; the caller's rendered uploading check is only supplemental UI admission.
- The remaining local view record contains scope, generation, active state and a canonical captured shell guard. Its scope includes program, backend document, pathway and section id/label; its generation fences shell A-B-A. It is ordinary caller-view liveness, not another session, note, ticket or upload owner. The full scope/generation is passed to the existing optional visit-key API.
- The component stays mounted across ordinary Document/Attachments/Activity changes. Only the presentation follows visibility, so the canonical pending state and result survive same-view tab switches. Parent close/unmount retires both the local view and the canonical upload owner.
- The handler captures the original ordered File array, retains indexed stored selections and captures the existing canonical authoring session once per action. After the outer await it requires current local/shell view, that captured session's sameRevision and a nonempty recorded outcome. This closes the caller's final publication gap without duplicating the shared reactive owner.
- The recorded guard is preserved from canonical. An earlier index may settle before a later request retires; the shared hook then intentionally returns no actionable records, and the caller must publish none of those old local associations. The local check does not substitute the accepted index Set for this returned-outcome decision.
- Server storage/audit remain server-owned. Local metadata is added only from the original accepted indexes, with `{ who: 'You' }`; the historical hardcoded Reg Lead role is not restored. No local audit event or durable dossier link is invented.
- Errors use only the shared MDX ErrorState inline, its canonical note, redaction and Dismiss action. No Retry prop, private error paragraph or dormant private error-color branch remains. Compact pending/ok status text is separate from the shared error owner.
- Native Choose files is the single keyboard chooser. The drop div retains pointer/drop behavior and aria-disabled without a nested role-button/tab stop. Button/input propagation guards preserve one chooser activation; disabled input/button and pending drop/change checks supplement the central busy ticket. Drop still prevents browser default navigation.
- Canonical unknown/refusal handling, including ambiguous 408/500/502/503/504 outcomes and explicit OUTCOME_UNKNOWN precedence, remains exact. Account/session/header/caller retirement, queued dispatch suppression, empty retired outcomes and ordinary same-account refresh behavior are not weakened.

## Source and test preservation

All **56 converged qualification input hashes** match current files. Of the 21 canonical contract pins, 20 remain exact; only the expected parent extraction differs. The immutable central owner/hook/mutation/parser/transport and archive route match exact d79 blob hashes. The only code delta is the expected five client paths: three production files and two unique test suites. Both Git content conflicts are resolved, with no unresolved source conflict.

The original seventeen picker/drop identity controls retain exact pre-candidate bytes. The incoming eight canonical drawer controls also remain exact, including Dismiss, partial recorded-batch retirement and aria-disabled busy dispatch. The two unique feedback/ownership suites retain their historical candidate assertions unchanged. The browser harness changes only four additional selected-input pins for the canonical upload/mutation/error dependencies; no browser assertion was changed to obtain the converged result.

## Observed merged qualification

The root's fresh merged regression passes **484 tests in 34 suites**, zero failures/skips. It includes the old 28-suite cohort plus the incoming canonical drawer, upload ownership, ambiguous failure, staging-session, catalog recovery and task-read-truth cohorts. The fresh full client/server/audit-verifier build completes successfully. Explicit no-ignore lint reports zero errors and the seven existing parent warnings; new component, caller tests and checked harness inputs have zero warnings.

The fresh converged Chromium result passes **eight checks**, with **36 selected input hashes** identical before/after and matching current files, zero unexpected requests and zero browser errors. It imports the shipped drawer/central uploader/parser and uses explicit synthetic HTTP replies with real browser chooser/FormData/XHR. Current captures include the shared ErrorState presentation in desktop/mobile light/dark views and measured fit. This browser cohort verifies displayed errors and chooser/busy/tab behavior; **Dismiss clicking is exercised by the unchanged incoming component suite, not claimed as a browser click check**.

The earlier 385-test/eight-browser-check result qualified the superseded private-owner candidate. It remains historical and is not counted as this merged implementation's qualification. Initial helper-timing and missing-browser diagnostic failures retain their prior non-product attribution. None is promoted into current merged proof.

## Limits and publication boundary

Canonical upload lifetime can stop its remaining queued dispatch and suppress retired results, but this local composition does not add network cancellation or write rollback. An already-started write may finish in its original governed program. The local guard fences only current-view metadata publication after the returned outcome. No extra batch-abort claim beyond the canonical implementation is made.

Durable attachment association/reload behavior, authenticated hosted acceptance, real bytes/storage admission/RLS, live signature ceremony, human OQ, deployment and agency acceptance remain outside this qualification. The separately owned eTMF and canonical catalog/task/archive changes are preserved rather than reimplemented. Normal full-program compiler and every unchanged publication gate must still run; this review does not infer their result or a successful remote update.

## Pins

`converged-final-review-pins.json` binds this verdict to the 56-input convergence manifest, additional current/canonical source pins and 36 current browser-input pins. It records the exact expected source delta, preserved controls, immutable owners and observed merged runner results. Root must separately verify committed blob bytes, accepted remote ref and normal gate output.
