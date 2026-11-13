# A sealed document's Access panel and Check work again (F1, 2026-11-13)

**Found by** the verification of the demo walk's unverified findings at trunk `592233d61`
(`docs/evidence/DEMO/2026-11-09-rehearsal/deep-walk/`, findings 1.u5 and 1.u4). Both were seen in the running app on
the frozen Protocol Synopsis of C2C-101.

| Finding | What the screen showed |
|---|---|
| 1.u5 | More (⋮) → Access: "Document access could not be read. Access cannot be changed while this document is sealed or archived." Network: 403 `GET …/permissions` |
| 1.u4 | Check on a section: a red toast, "Couldn't check the section — Document status FROZEN does not permit this action..". Network: 409 `POST …/ai/deficiency-scan` |

## What already exists (RULE 3)

| Path | What it does |
|---|---|
| `server/services/authoring/authoring-permissions.ts` `decideAuthoringPermission`, `documentStatusAllowsAction` | The one permission decision. A frozen or approved document refuses every action except view, comment, review, approve and export, before any role is read |
| `server/routes/authoring-permissions.ts` `requirePermissionManager` | Decided `manage_permissions` for the list read and for every grant and revoke alike |
| `server/middleware/authoringObjectAuthorization.ts` `actionFromPath` | Classes an authoring request. Export, file-to-vault, send-to-packager and working copy were already moved off `edit` for the same reason (2026-09-28) |
| `server/routes/authoring.router.ts` `POST /sections/:sectionId/ai/deficiency-scan` | The editor's Check. It runs `SELECT`s only and writes nothing |
| `client/src/concept2cure/v2/editor/DocumentPermissionsPanel.tsx` | Renders the list, and shows the server's refusal when a change is refused. Unchanged |

Nothing is added. Both repairs reuse the existing decision and status rule.

## The repairs

- **Access list (1.u5).** `requirePermissionManager` now asks two separate questions:
  - whether this person manages the document's access, decided as for a document that can change;
  - for a change only, whether the document's status allows it.
  - So the owner or an administrator reads who holds access to a sealed record. A grant or revoke on it is still
    refused with "Access cannot be changed while this document is sealed or archived."
  - A person who does not manage access is now told that, not "sealed".
- **Check (1.u4).** `actionFromPath` classes exactly `POST /sections/:id/ai/deficiency-scan` as `view`.
  - Any status passes, and any grant that may view the document.
  - A member with no grant is still refused 403.
  - The section's other `ai/` routes write, and keep `edit`.

## Runs

| Run | File | Result |
|---|---|---|
| Red: the four new permission cases against the unchanged route | `perm-red.txt` | 3 failed (403 for the owner's read; "sealed" told to a non-manager) |
| Green: permission route suite and the route-shadowing suite | `perm-green.txt` | 43 of 43 |
| Mutant: the list read takes the change intent | `perm-mutant-read-as-change.txt` | 2 red |
| Mutant: the seal is never asked of a change | `perm-mutant-no-seal.txt` | 2 red |
| Red: the three new Check cases against the unchanged middleware | `check-red.txt` | 3 failed (409) |
| Green: the middleware's three suites and the Check route suite | `check-green.txt` | 76 of 76 |
| Mutant: the classification removed | `check-mutant.txt` | 3 red |
| Downstream: document access and current role on PGlite, the permission integration suite, the Access panel | `downstream.txt` | 47 of 47 |
| ESLint, the four files, base and patched | `eslint-base.txt`, `eslint-patched.txt` | 0 errors; 1 warning, unchanged |

**Not done here.** The client still appends a second full stop to a refusal in the Check toast, and the Access panel
still offers Grant on a sealed document, then shows the server's refusal. Both are in
`editor/DocumentWorkbench.tsx` and `DocumentPermissionsPanel.tsx`, left for the editor lane.
