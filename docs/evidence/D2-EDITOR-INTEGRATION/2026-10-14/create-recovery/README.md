# Existing-editor creation recovery — Codespaces human testing

W1 / D2, 2026-10-14. Initial base `6ffcb425`, synchronized to `4997d35e` before publication; direct incremental
publication to `concept2cure-v2`, without PRs. This is local development work,
not deployment qualification. The [contract](../../../../design/AUTHORING_CREATE_RECOVERY_2026-10-14.md)
and [Codespaces human-testing handoff](../../../../testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md)
record scope and the still-unexecuted human worksheet.

## Creation interaction increment

The existing New document/New section drawer now pins the editor's effective
project, refuses a held/mismatched project switch, guards synchronous repeated
submissions, and retains uncertain attempts until a successful explicit scoped
read. A failed read does not release the guard or repeat a POST. Exact returned
project/template/document identity is checked before adopting a creation.
Context changes, round trips and unmounts suppress stale handoffs and outcomes.

Confirmed documents use the existing exact-ID handoff and current unsaved-work
guard, including narrowed status filters and pinned conversation canvases. A
canceled leave decision retains an Open created document/section action. Section
refreshes consult the live guard and ignore superseded reads. Full creation
binding/count confirmations, all 305 templates, source guidance and governed
review/Vault paths are preserved.

Real touch-browser failures exposed clipped recovery notices inside the existing
horizontal toolbar. The same existing notice pattern now renders in a host below
the header, via a portal. No CSS, new editor, new surface, endpoint, dependency
or persistence store was added; standalone callers retain the inline fallback.

## Actual verification

- [Creation tests](creation/README.md): 81 new actual-form cases plus 26 preserved
  creation/export cases pass together, 107/107, on final source pins. Evidence
  retains the real behavioral failures and separates corrected test assumptions.
- [Workbench tests](workbench/README.md): final 19/19 pass. The actual compiler
  caught eight missing-required-field diagnostics in the new fixture; explicit
  document fields corrected them without a cast or production change.
- The broad 78-file editor run passed 77 files/916 tests and failed one legacy
  source-refresh fixture assertion. That fixture supplied prose where the real
  service returns reason codes. Its corrected four-case run passes and asserts
  each actionable canonical message, without changing production rendering.
  This is not a single all-green 78-file rerun. Final focused and browser checks
  separately qualify the notice-placement follow-up.
- [Browser checks](browser/README.md): 20/20 across desktop/touch light/dark,
  52 captures, 16 explicit synthetic create POSTs and 16 explicit recovery GETs;
  zero other mutations, unexpected requests, console/page errors or detected axe
  violations. Eight native editing viewports are at least 300 by 279 pixels.
  The 14 production pins and 11 fixture pins match the frozen sources. Synthetic
  API boundaries and three incomplete accessibility rules remain explicit.
- Nine native-editor/style/token/SQL gates pass. Strict creation component/hook
  lint is 0/0, existing Workbench warnings do not grow, and the initial scoped
  warning ratchet decreases by one. The final production build passes, retaining
  Vite's existing chunk-size advisory. Compiler and publication receipts are
  recorded separately; no baseline is increased.

After synchronization, the final frozen source passes all 130 focused UI cases
in four files, compiler baseline zero, production build and all nine static
gates. Own source hashes remain unchanged. The 291-case current-role replay and
fresh native HTTP replay are qualified separately in their follow-up receipts.

The exact broad selection and selected output receipts accompany the independent
proof. Earlier diagnostic captures and test runs are preserved as such, not
silently rebound to final source hashes. No provider calls or credentials are
needed for these automated interaction checks.

## Current-role follow-up — resolved

The [current-role fix](current-role/README.md) makes current read-only membership
precede historical object grants and stale token roles, using the canonical role
policy and the current identity for the same account and organization. Its
post-integration 18-file run passes all 291 cases. Existing ACL, tenant,
frozen-record and signing restrictions remain in place.

The [fresh local Node 22/PostgreSQL rehearsal](local-runtime/README.md) applies
the full schema and migrations, executes 115 real HTTP requests and creates
11 starts/714 sections spanning regional/shared cases and IND M1–M5. It checks
save/reopen, guidance, history/audit, scoped recovery and the actual non-superuser
app_service connection with RLS enabled. Both old admin and fresh viewer tokens
receive 403 for edits/creation after downgrade; reads remain possible and no
extra document is created. The draft Word Vault artifact downloads with its
exact recorded hash and draft marking; approval is not carried. All task-created
runtime resources, test bytes and private credential state are removed.

The [first publication receipt](first-increment-publication.txt) records normal
hooks and direct push of `2df2adde`. The current-role code and native proof land
as the following direct increment. The final build and zero-error compiler
already include these frozen source bytes. Publication is verified from normal
hooks and Git history, not predicted by this pre-publication record.

A real human session has not been performed. The Codespaces worksheet remains
Not run. Manual authoring and provider-dependent AnA oversight are separate lanes;
no fake AI output, live provider qualification, agency acceptance, submission
transmission or full launch-row green status is claimed.
