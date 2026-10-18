# Authoring document access · D2 client onboarding

The existing GET, POST and DELETE document-permission routes now have a reachable UI in the canonical document editor. Open Authoring, select a document, then choose **Access**. The same workbench serves the conversation's document canvas, so access management has one implementation.

`client/src/concept2cure/v2/editor/DocumentPermissionsPanel.tsx` renders the recorded member identity, document role, whole-document or section scope, active/expired/revoked state, UTC timestamps and stated reasons. The member picker reads the authenticated session's organization through `GET /api/tenant-users/:organizationId`; section choices come from the selected document's successfully loaded outline. The grant drawer defaults to Viewer. Grant and revoke use the existing C2CForm confirmation/reason pattern and the existing editor rail, buttons, tokens and timestamps. No permission or roster data is passed to AnA.

The canonical management handler previously accepted an arbitrary principal id and contact address, even though authorization matches either id or email. It now resolves a real current member in the authenticated tenant and uses that member's canonical email. Grant and revoke require a trimmed reason of 1–500 characters; optional expiry must be a future ISO timestamp. The document is locked before owner/admin authority is rechecked. Permission changes and `writeChainedAuditRow` execute on the same transaction client, so audit failure rolls the change back. Document locking serializes competing permission changes.

The canonical revoke helper counted section-owner grants as replacements for a document owner. It now counts only active whole-document owners and allows a section-owner grant to be revoked separately. Tenant/document/section scope checks, immutable-document management refusal and the final active document-owner refusal remain server decisions.

Failed reads show an error rather than an empty access list. A refused change leaves the form and entered reason open. Missing/mismatched mutation receipts, an unconfirmed audit record and network failures produce no success or optimistic local grant; a successful access reload is required before retrying. Changing documents discards the previous panel, form and pending read result. Existing grants keep their original dates, and the expiry field explains that replacing dates requires revoking the existing grant first.

## Verification

- `authoring-access-green.txt`: 73 passing tests across the new panel (15), permission-management routes (34), existing workbench review regressions (17) and canonical route ownership (7), plus 9 passing real canonical-DDL permission tests and 1 passing workbench Access reachability/focus test. 83 tests total across 6 suites.
- `authoring-access-lint.txt`: dedicated production/new-test ESLint check passed with zero warnings.
- `authoring-browser-verification.txt` and the three `authoring-access*.png` screenshots: actual React components rendered in Chromium with canonical styles. Desktop grant history, desktop dark grant drawer and 390px mobile drawer, labelled fields, Viewer default, cancellation and no horizontal overflow/runtime exceptions were checked. API replies in this isolated preview were synthetic; it makes no live backend/authentication or deployment claim. Temporary preview files were removed.

The final-owner negative test was observed failing before the helper correction: a section OWNER beside the sole document OWNER allowed revocation with HTTP 200 where 409 was required. The failure reproduced as the only failing case in a 31/32 run. The original tool output was not saved as a file; this paragraph records that observation, not a reconstructed test log. The final route tests and real-DDL regression both pass with the safeguard corrected.

No database migration, production dependency, commit, push or live deployment was performed in this slice. Real-database concurrent transaction and authenticated browser end-to-end deployment qualification remain outside this isolated verification.
