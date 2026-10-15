# Real-browser keyboard pass, 2026-10-05 (coverage-gap sweep, row GB)

The 2026-09-28 coverage-gap sweep owed a real-browser keyboard pass. It had not
run, because the local reference database was behind and deploy-migrate could
not finish on it as the application role (row GB). This is that pass.

- **Rows informed:** D2 (launch catalog), D4 (validation evidence), D6 (accessibility half of the security posture).
- **Spec:** `tests/e2e/launch-surface-keyboard.e2e.spec.ts`.
- **Browser:** Chromium 141 (Playwright 1.56.1), viewport 1280×720.
- **Server:** the real server (`server/index.ts`, Vite dev middleware), signed in through the hard-gated dev-login (`NODE_ENV=development`, `ALLOW_DEV_AUTH=1`), as `scripts/run-e2e-smoke.mjs` boots it.
- **Identity:** the seeded org admin.

## The reference database

The container's `clinicalsage` database had been built single-role by the
environment's setup script: `c2c`, the account the application runs as, owned all
1,136 tables. The readiness contract refused it (`scripts/db/readiness-contract.mjs`
as `c2c`):

- `public.licenses` was missing;
- `audit.tamper_proof_log` was missing;
- `c2c` owned 19 append-only stores, among them `audit_logs`, `electronic_signatures` and `authoring_signatures`. Ownership confers UPDATE and DELETE regardless of grants.

It was dropped and recreated owned by `postgres` (founder's instruction), then
provisioned the documented way (`npm run db:provision`, owner `postgres`, runtime
`c2c`; `docs/operations/DB_READINESS.md`). The container's PostgreSQL 16 lacked
pgvector, and the provisioner refused (exit 4) until `postgresql-16-pgvector` was
installed.

- `provision-reference-db.log`, credentials masked: green. The readiness contract holds as `c2c` (superuser=false, bypassrls=false); 1,296/1,296 relations hold the recipe grants.
- `runtime-role-ownership.txt`: `c2c` owns 0 tables, and holds neither UPDATE nor DELETE on `audit_logs` or `electronic_signatures`.

**Owed outside this pass:** the setup script that built the single-role database
will build it again in every fresh container. It should provision through
`npm run db:provision` with a separate owner.

## What the pass measures

Each surface is walked with up to 40 Tab presses from the top of the document. The
sequential-focus starting point is reset with a removed `tabindex=-1` node, not a
mouse click: Chromium starts the next Tab from a clicked node, which skips
anything above it.

At every stop, the pass records:

- the element;
- its accessible name;
- whether it is visible;
- whether it sits under `aria-hidden`;
- whether focusing it changed how it looks (2.4.7).

The last is measured, not read from CSS. Outline, box-shadow, border, background
and text decoration are compared while the element is focused and again once
focus has moved on.

Per surface, it also checks:

- that focus moves at all, and is not held in a short cycle (2.1.2);
- that Shift+Tab returns to the previous stop;
- that the first stop is a skip link that moves focus to the surface (2.4.1).

On a surface with controls of its own, the next Tab after the skip link must land
inside the surface. The per-surface records are in `records/`.

## Findings

| Finding | WCAG 2.2 | Disposition |
|---|---|---|
| KB-1 No skip link. On every launch surface the rail and top bar put 22 Tab stops before the surface's first control. The shell does have `main` and a labelled `nav`, so a screen reader can skip them; a sighted keyboard user could not. | 2.4.1 Bypass Blocks (A) | **Fixed.** `V2App.tsx` renders "Skip to content" as the shell's first element (`position: fixed`, so it takes no grid cell). It moves focus to the surface container (`#c2c-page`, `tabindex=-1`). It is off-screen until focused and styled from existing tokens (`app-v2.css`). |
| KB-2 The password toggle on sign-in was named "Show": it named nothing. | 2.4.6 Headings and Labels (AA) | **Fixed** in the live component, `Concept2CureLogin.tsx`. The name is composed from the button's own text and the field's label (`aria-labelledby`, technique ARIA9), giving "Show Password" / "Hide Password" in all 18 locales from strings already translated. It begins with the visible word (2.5.3), and `aria-controls` names the field. |
| KB-3 `client/src/concept2cure/auth/ZenLogin.tsx` is not rendered by any route; every sign-in and reset route renders `Concept2CureLogin`. It is still exported from `auth/index.ts`. | — | **Not changed here.** A duplicate sign-in implementation. Removing it is a deletion under the working agreement (history search, named replacement, reachability gate), so it is left for its own change. |

Nothing else was found:

- **Focus indicators:** every stop on every surface showed a measured change on focus (253 of 253 measured stops; 255 walked).
- **Visibility:** focus never landed on an invisible element or inside `aria-hidden`.
- **Traps:** no surface held focus.
- **Shift+Tab:** returned to the previous stop everywhere.

Submission Readiness has no control of its own for this organisation: it shows an
honest "Open a program" empty state, and mouse users have no action there either.
The skip link lands on it, and the next Tab correctly leaves it.

## Results (after the fix)

| Surface | Tabbable | Stops walked | First stop | Skip link reaches surface | Focus change measured | Hidden / aria-hidden | Shift+Tab |
|---|---|---|---|---|---|---|---|
| Sign-in | 9 | 9 | Select language | n/a (no repeated block) | 9/9 | 0 | ✓ |
| Projects | 43 | 40 (cap) | Skip to content | ✓ | 39/39 | 0 | ✓ |
| Vault | 35 | 35 | Skip to content | ✓ | 35/35 | 0 | ✓ |
| Authoring (review) | 33 | 33 | Skip to content | ✓ | 33/33 | 0 | ✓ |
| Submission Center | 38 | 38 | Skip to content | ✓ | 38/38 | 0 | ✓ |
| Submission Readiness | 30 | 30 | Skip to content | ✓ (no controls inside) | 30/30 | 0 | ✓ |
| QMS controlled documents | 48 | 40 (cap) | Skip to content | ✓ | 39/39 | 0 | ✓ |
| Reporting & analytics | 30 | 30 | Skip to content | ✓ | 30/30 | 0 | ✓ |

The 40th stop on the two capped surfaces has no "after" reading, because the walk
ends there.

## Shown failing first

- `red-before-fix.log`: the spec against the three UI files at their committed state. Vite was confirmed to be serving the old modules before the run. **8 failed, 0 passed.** It failed on exactly the two new checks (the skip link on all seven launch surfaces, the toggle name on sign-in) and nothing else.
- `green-after-fix.log`: the same spec with the fix restored. **8 passed.**

Two corrections to the harness were made between the first run and these, and both runs above use the corrected harness:

- **The focus reset.** It had used a mouse click, which moved the starting point past the skip link.
- **The in-surface check on a surface with no controls.** It now asks that the skip link land on the surface; only a surface with controls must keep the next Tab inside it.

## Not covered

- **The surfaces with content.** The organisation was freshly seeded, so most surfaces show their empty or first-run state. The editor core (`DocumentWorkbench`, `RichSectionEditor`), dialogs, menus and the e-signature ceremony were not opened. Escape-to-close and focus return from dialogs therefore remain unmeasured.
- **Other ways of working.** No screen reader. No zoom or reflow. No reduced-motion or forced-colours modes.
- **Signed-in flows on sign-in.** The sign-in page was walked signed out only. The MFA step and password reset were not reached.
