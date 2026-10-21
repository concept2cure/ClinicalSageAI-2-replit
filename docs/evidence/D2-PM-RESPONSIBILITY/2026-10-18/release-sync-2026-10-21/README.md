# D2 Projects — PM-03 resumed integration qualification

The workspace resumed on 2026-10-21 with the original PM changes and evidence
intact. Commit `73be30039` preserves that implementation. Canonical integration
commit `d4f18a5de` preserves incoming work through `cb4065898`.

## What already exists

The parent [contract](../contract.md) and [evidence inventory](../README.md)
identify the existing team route, ProjectHome panel, current-program admission,
sharing normalizer, identity labels and profile writer. This qualification
completes the same projection and preserves those implementations. It adds no
team write, approval/signing evaluator, generic delegation, or parallel surface.
The scoped deleted-capability search returned no matches.

## Integration findings and corrections

- The one textual conflict was ProjectHome's imports. Retain both PM-03 imports
  and the incoming filing-document-class/agency-label imports. Preserve incoming
  OCR coverage labels and document-class sequencing restrictions.
- Current intake/profile writes now store contact objects `{name, role?}`;
  historical intake stored strings. Complete the existing projection for both
  name forms. Account IDs, email, access or freeform role claims in those objects
  never become identity links or account responsibility assignments. The
  existing profile continues to own its freeform role facts.
- Current actor, canonical anchor, request client, sharing and member-label
  helpers are unchanged from the initial PM implementation. Incoming reporting
  write admission does not change the read admission used by the roster.
- Install the current committed lockfile before qualification: incoming Vite
  and follow-redirects security patches must be exercised. No manifest is edited
  for PM-03. A compiler cache may be reused; the normal full TypeScript and
  pre-push gates retain their zero-error baselines.

The original evidence qualifies its original source hashes. This folder records
post-integration checks and source hashes for publication. Native fixture limits
remain as described in the parent README; recorded-name object behavior gains a
real HTTP/SQL assertion. No production deployment is claimed.

## Qualified checks

| Check | Result |
| --- | --- |
| Existing ProjectHome, team, document-class and response UI | 220 tests passed in 25 files |
| Team/profile/intake/current-access/sharing/reporting | 212 tests passed in 10 files |
| Native PostgreSQL HTTP and RLS fixture | 20 tests passed |
| Production client/server and audit verifier build | Passed on current lockfile |
| Pushed-file lint | Zero errors and zero net warning growth |
| Actual-component Chromium check | Desktop 1280/mobile 390; no overflow or page errors; retry/empty states passed |

The lint warning gate caught browser-harness globals/console usage and one long
test group. Explicit browser globals, an allowed console method, and smaller
test groups corrected those findings; no baseline or policy was weakened.
`lint-warnings-initial.txt` retains the failure. The native and browser checks
were repeated after their fixture-only changes.

Full TypeScript and the normal pre-push gates must pass before publication.
Commands, results and source hashes are recorded in `verification.json` and
`source-bindings.json`. Production deployment remains a separate workflow.
