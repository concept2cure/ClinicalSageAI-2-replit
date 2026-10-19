# Independent review of source recall and host wiring

This review covered the lead-owned source-file bootstrap changes, the three actual call sites, the two follow-up model-host wiring blocks and the narrow unbound chat creator policy. It made no production edits. The prior canonical authority implementation owner performed this review separately from the lead's implementation; it is not an independent review of that owner's own authority module.

One material gap was identified in the streaming follow-up function: it staged source results and called the gateway after `settleMoves` without an explicit cancellation check. The lead added checks before/after the await and before the request. The held-out control executes the actual transpiled function's cancellation path and confirms no source staging or gateway invocation when cancellation occurs during `settleMoves`. The corresponding executor early-cancellation path also passes.

A second actual-host probe found that a source/policy refusal observed during guarded receipt insertion was swallowed by settlement while the prior guarded source payload still entered the next request. `INDEPENDENT_ROOT_WRITER_REFUSAL_RED.json` preserves the behavioral failure: eight controls passed and L09 failed because the private sentinel appeared in the executor's second synthetic gateway request after `SourceReadSnapshotError`. The receipt owner added a typed settlement callback and the lead wired the canonical withdrawal helper into both hosts. A locally observed source/policy refusal now removes that new source payload; its legacy receipt outcome remains unconfirmed. A separate L10 control proves that an ordinary legacy receipt INSERT permission failure preserves the already-authorized viewer read; its first run passed in `INDEPENDENT_ROOT_RECEIPT_PERMISSION_CONTROL.json` (one executed test, nine skipped). Both cases pass in the final run.

The lead then selected conservative current-round withdrawal: any typed insertion-stage source refusal withdraws every admitted source result still queued in that round. Settlement stops subsequent INSERT attempts while retaining the count of previously successful writers and existing immutable history. L11 executes the actual host with three reads: first writer returns successfully, second refuses, third is not attempted, and all three source sentinels are absent from the next request. This writer-stub control proves host propagation and stop behavior; it does not claim a real database commit. The receipt owner's database evidence covers persistence separately. Earlier conversation transcript replay remains outside this increment.

The JSON chat call now supplies authenticated `numericUserId` and `admittedProject.projectRef`; stream supplies authenticated `guardUserId` and the admitted ref; the actual registered `recall_session_context` handler supplies `ctx.userId` and `ctx.projectRef`. Forged body identities are ignored. Existing memory/profile/outcome behavior and arbitrary prior thread recall remain outside this source-file increment.

The unbound creator exception requires an exactly unbound `client_document` with `origin:'chat_upload'`, a recorded upload ID, capture creator and upload owner matching the actor. Every other recorded parent still uses canonical private-project admission, including a deleted retained private capture. Unknown origins and unresolved recorded scope do not become a creator grant. The review's real sequential SQL control covers an active viewer's valid unbound access, a different active member's denial, and denial after an additional retained private parent.

## Held-out controls

`independent-root-wiring.test.mts` contains eleven controls:

1. The actual registered recall handler passes pinned actor/project identity while ignoring forged body identity.
2. Body-only identity cannot supply the actual handler's missing tenant context.
3. The JSON route's actual TypeScript AST argument expression evaluates to authenticated user and admitted program.
4. The streaming route's actual argument expression does likewise.
5. The actual bootstrap helper cannot substitute a body-style `user_id` for the missing actor and names both source recall gaps.
6. The actual bootstrap helper takes a private frozen actor/ref snapshot and suppresses denied source details.
7. The actual canonical unbound upload/selected-source policy executes over synthetic SQL with creator, viewer and retained-parent controls.
8. Actual transpiled follow-up functions stop cancellation before model invocation and source staging.
9. The actual executor withdraws source content when the guarded writer observes a typed source refusal after the initial handoff check.
10. The actual executor preserves an authorized viewer read when only legacy receipt INSERT permission fails.
11. The actual executor withdraws every current-round source after a later typed source refusal and stops subsequent receipt attempts.

`INDEPENDENT_ROOT_WIRING_FIRST.json` records **8/8 passed** before adding the receipt-settlement controls. The lead's first code corrections were present when those eight controls ran; this file is not reported as a pre-fix red. The separate writer-refusal red above is a reproduced behavioral failure. `INDEPENDENT_ROOT_WIRING_FINAL.json` records **11/11 passed** after the settlement callback, whole-round withdrawal and both host call sites were wired. `INDEPENDENT_ROOT_WIRING_SOURCE_MANIFEST.json` hashes the nine reviewed implementation/test files at this completion. `INDEPENDENT_ROOT_WIRING_TYPECHECK.txt` records zero selected-target diagnostics, not full repository checking. `INDEPENDENT_ROOT_WIRING_ESLINT.json` transparently records that the existing ESLint configuration ignores this evidence `.mts` file; it is not a lint pass.

Command: supported Node 22 ran `node_modules/vitest/vitest.mjs run docs/evidence/D2-ANA-SOURCE-ACCESS/2026-10-14/independent-root-wiring.test.mts --config docs/evidence/D2-ANA-SOURCE-ACCESS/2026-10-14/independent.config.mts --reporter=json --outputFile=docs/evidence/D2-ANA-SOURCE-ACCESS/2026-10-14/INDEPENDENT_ROOT_WIRING_FIRST.json`.

Actual handler/helper execution and route expression controls are labelled precisely. They do not mount either complete Express endpoint, prove deployed database roles/RLS, acknowledge a provider-served request or establish durable extraction/current-actor coverage. No live provider, client data, agency action, deployment, branch change or push occurred.
