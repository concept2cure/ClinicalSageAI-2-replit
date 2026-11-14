# Reconcile existing release browser proofs with the current workflow

Plan: F1. Baseline: published `b0300fe5c44c1ea2ef134f7bbed14128c22c9b9d`. No production behavior or approval boundary is changed by this test reconciliation.

## What already exists

- `.github/workflows/tier5-browser-smoke.yml` provisions a real database, then separately runs authenticated app, WO-06 governed journey, access-boundary and keyboard browser proofs.
- `scripts/run-e2e-smoke.mjs` seeds existing test identities, boots the real application and runs the selected spec. `tests/e2e/dev-auth-helper.ts` supplies the actual scoped session.
- `tests/e2e/authenticated-app-smoke.e2e.spec.ts` proves authenticated Home/Projects rendering and an unauthenticated rejection. Its exact current failure needs job logs; it is not being guessed from the red step alone.
- `tests/e2e/golden-customer-journey.e2e.ts` still posts to retired `/api/concept2cure/projects`, which returns 404. Canonical intake is `/api/c2c/projects`, with its recorded workspace, product and filing contract. The second failure expects a document title in the composer even though the current one-editor `draftPrompt` is the deliberate evidence-based section prompt; existing authoring pane tests pin that behavior.
- The initial live GitHub artifact at run `43504536297` confirms these two golden-journey failures; both also exist at the earlier `35af13338` baseline. Later specs overwrite the shared results artifact, so individual completed-job logs are needed for the other failures.
- The completed job logs identify the shared authenticated app/access/keyboard failure: `dev-auth-helper.ts` correctly requires `SMOKE_USER_EMAIL` or `DEMO_USER_EMAIL`, while the workflow supplies neither. Complete the existing workflow configuration with one explicitly fictional account shared by `ADMIN_EMAIL` and `SMOKE_USER_EMAIL`; its synthetic display name retains the existing greeting fixture. Keep the helper's missing-identity refusal intact.

Search current intake, dev-auth, authoring prompt, browser runner and test owners before modifying a failing assertion. Use current UI/API contracts; do not revive a retired route, manufacture provider responses or signatures, relax access boundaries, or turn failures into skips.

## Completion contract

Repair only existing browser test/setup owners after an actual error is captured. Keep all original proof outcomes: real session admission, unauthenticated rejection, canonical project creation, citation/export refusals, independent review, and the real editor request. Adapt inputs, scopes and assertions to the current contract; retain meaningful positive and negative checks. Reproduce against the running app, preserve exact red/green receipts, and publish directly under normal gates. Production fixes need a separate demonstrated defect and bounded contract.

## Current integration result

A concurrent canonical continuation completed broader repairs during this audit: `876128ca4` supplies the explicit fictional workflow identity and canonical intake; `25b1bacd3` reads the current editor bar; `0d010b6de` updates the governed journey to current editor/review controls; `d6ac0b6d7` retains real session identity and visible focus-frame proofs. These were adopted through `b9cd90c9d92e3e2058c37c0e20192409605ea56b`. Our overlapping draft edits were saved outside the repository and replaced by the published implementation; no duplicate workflow/test repair is committed here.

Locked application dependencies were restored in the Codespace-image rehearsal, with the pinned Playwright 1.55 test runner installed in a separate private tools prefix. Existing fixture seed scripts supplied named synthetic identities through a provisioning-only owner subprocess; the serving app remained on the restricted runtime role. The export-review gate was enabled to match the release browser runner.

All **four authenticated app and golden-journey cases passed**: personalized signed-in Home and Projects; unauthenticated rejection; evidence/edit/review/provenance and governed draft export; and the first-session IND/source/assignment/editor/review workflow. `native-browser-green.txt.gz` retains the result. No live provider call or production qualification is claimed.
