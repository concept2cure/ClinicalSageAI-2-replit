# 2026-09-22 periodic review — follow-through

**Launch row:** D5 (Part 11 evidence). **Lane:** "Launch-catalog review follow-through" in
`docs/work-orders/README.md` (`…session_01WcyqbqWn6LszBqUWUSNnqA`).

## Status at HEAD, 2026-09-24

Every finding in this lane was re-checked against HEAD (then `98b49d6f9`), and each
OPEN verdict was given to a second agent told to refute it. None was refuted.

| Finding | Status | Evidence |
|---|---|---|
| P1 protocol finalize / review disposition | fixed | `d622ca53a` |
| P2 QMP create / activate / delete | fixed | `f4c9c50ca` |
| P3 contradiction resolution | fixed | `9f3f40d72`, `docs/evidence/D5-GOVERNED-PATH/2026-09-22/` |
| T1 discarded task-ledger outcome | fixed (WO-16C's) | `a7955fc10`, `95aa4216c` |
| T2 task-write authority | fixed | `a7955fc10` |
| T3 archive / sign swallow a 401 | fixed | `6f79a000f` (sign), `a7955fc10` (archive) |
| T4 archive reason optional on the server | fixed | `a7955fc10` |
| SEC-1 reads outside the request-scoped client | fixed | `fe78e4c3c` |
| **P4** release signature shows no signer, time or meaning | **server fixed here; client open** | below |
| P5 reason-for-change enforced on the client only | open | `authoring.router.ts` — skip window, see below |
| P6 Revert enabled on a sealed document | open | `DocumentWorkbench.tsx` — skip window |
| P7 activity feed shows `User <id>` | open | `c2c/projects.ts` — skip window |
| V1 Vault filing sends no reason | open | `c2c/project-vault.ts` — skip window |

"Skip window": another session changed the file in the last 24 hours, and this
lane does not edit such a file (`docs/work-orders/README.md` §0).

## P4 — server half

§11.50(b): a signature's human-readable form carries the printed name, the date and
time, and the meaning. The Submission Center's "Release signature · §11.70" panel
had none of them. That was because `findActiveReleaseSignature` ran
`SELECT id FROM electronic_signatures`, so nothing downstream could carry them.

**Change.**
- `findActiveReleaseSignature` selects `signer_id, signer_name, signer_title,
  signature_meaning, signed_at` and returns them.
- `SignedExportDescriptor` carries them.
- `GET /api/ectd/export/by-run/:runId/signed` returns them in `signature`.

A field the row does not hold is `null` all the way to the wire; nothing fills it
in. The query's WHERE clause and ORDER BY, the tenant guard, and the WO-16B
finding-14 throw are unchanged. A test pins each of them.

**Failing first.**
- `p11-4-server-red.txt`: the tests were added with the source unchanged, giving
  5 failures. The lookup returned `{ id: 7 }` and the descriptor had no signer
  fields. With only the route file reverted, the route case also fails: its body
  carried 3 of the 8 signature fields.
- `p11-4-server-green.txt`: with the change applied, 79/79 across the new tests
  and the suites that depend on the lookup: the WO-16B gate, the sign-payload
  snapshot, the sign-release route, and orchestrator moves 3/5/6.

**Also run.**
- `tsc --noEmit`: clean.
- `ci:eslint-warning-ratchet --since HEAD`: no file changed its count.
- `ci:fabricated-identity`: OK.

**Not done: the client half.** `client/src/concept2cure/v2/surfaces/EctdCompile.tsx`
still renders only the id, the digest and the seal verdict. That file belongs to the
claimed D7/W5 lane (`…01TtwRHm`), which changed it within the last 24 hours. The
server now returns everything the panel needs. The client change should:
- render the printed name and title, the time, and the meaning;
- render a null name as "Printed name not recorded";
- add the same fields to the `signedPackage` AnA facts;
- extend `ectdCompileOrchestratorHonesty.test.tsx:210`, with a failing run first.

A meaning label already exists inside `AuthoringSignatures.tsx`. Lift it into a
shared module rather than copying it.

## New-code audit, 2026-09-24

An adversarial pass over the governed files added between 09-19 and 09-24 found
13 distinct defects. Each was checked through three lenses, and none was refuted
outright. #1 is fixed here, and the rest are written up for their lanes. Ranking and
reach are from the audit.

### #1 — a QMS controlled document made effective with no electronic signature (fixed)

§11.50: making an SOP effective is a signed act. VSR-001 F-3 made
`POST /api/mdx/qms/documents/:id/approve` one: signing authority, password and
second factor re-verified, the meaning, author ≠ approver, and one
`electronic_signatures` row bound to the version's content digest. Three other
writes reached the same `status = 'effective'` with none of that:

1. **AnA tool `approve_qms_document`.**
   - It set the document effective, stamped the chat user as approver, and
     recorded a stock reason.
   - It wrote `command: 'transition'`, not `'sign'`, so both the
     `35794a160` sweep and `ci:sign-ceremony` missed it.
   - The register's **"Ask AnA to approve"** chip sent every approval here. Its
     tooltip said "you still capture the e-signature".
2. **`POST /api/qms/documents/:id/transition {to:'effective'}`**, which stamped the
   caller as approver.
3. **`POST` and `PATCH /api/mdx/qms/documents`.** Both admitted every status.
   PATCH could also rewrite the title or version of a signed document, which then
   stayed effective while no longer matching its signed digest.

**Change.**
- The tool returns the canonical `refuseSignatureInChat`, and its description
  says "AnA cannot sign".
- `transitionDocument` refuses `effective` in the service.
- The mdx-qms create and patch schemas admit only `draft` and `in_review`.
- PATCH edits only a draft or in-review document. Any other answers 409
  `QMS_DOCUMENT_CONTROLLED`.
- The chip is replaced in the same change by an **Approve** button. It opens the
  shared `EsignModal` (approval meaning only) and posts to the signed route. The
  time it shows is the server's `signedAt`, and it is disabled on sample rows.
- **Removed:** AnA making a document effective. **Replacement, by path:**
  `client/src/concept2cure/quality/SopRegister.tsx` → `POST
  /api/mdx/qms/documents/:id/approve`, proven by `SopRegisterApproval.test.tsx`.

**Failing first.**
- `qms-approval-red.txt`: 7 server failures at HEAD with the source unchanged
  (the PGlite contract test shows the real handler making the document
  effective). The client suite failed 5/5 against the HEAD register.
- `qms-approval-green.txt`: 95/95 across the new tests and every QMS suite, and
  the client suite 5/5.

**Also run.**
- `tsc`: clean.
- ESLint ratchet `--since HEAD`: unchanged.
- `ci:sign-ceremony`: 23 baselined sites, unchanged.
- `ci:canvas-path`: wired.
- The AnA manifest was regenerated.

**Still open.** `ci:sign-ceremony` only sees `command: 'sign'`. An approval
recorded under another verb is invisible to it, and that is how this one survived.
Widening the gate is a follow-up.

### Handed off (not edited here)

| # | Finding | Launch reach | Where it goes |
|---|---|---|---|
| 2 | The review quorum counts approvals of an earlier version (`artifact-approval-act.ts:77-93`); v2 becomes filable on reviewer R's v1 decision | Authoring → Submission Center, API-only reviewer routes | next in this lane |
| 3 | Batch leaf resolution shares one leaf's pin verdict across every leaf on the same document (`ectd/leaf-document-resolver.ts:263`), so dispatch and transmit Gate 2 can clear stale content | Submission Readiness / Center | **fixed** in this lane (below) |
| 5 | The model-governance gate misses prose tools its field regex does not name (`governed-write-tools.ts:32`) | AnA drafting (D4 model governance) | AnA lane `…01DiJJAk` |
| 6 | The MCP connector accepts suspended or deprovisioned accounts (`server/mcp/auth/platform-token.ts:104`, `provider.ts:116`) | D8, live only with `MCP_ENABLED=true` | D8 owner, before staging |
| 9 | File-to-vault leaves a vault row behind when placement throws, then says nothing was written (`authoring-file-to-vault.ts:306`) | Authoring → Vault | AnA lane (canvas → vault path) |
| 10 | An emailed code bypasses an enrolled authenticator | sign-in | already the owner's open decision (D6 §4) |
| 4, 7, 8, 11, 12 | IRB expiry, EU burden indicator, endpoint derivation, CTIS results slot, Q3A wording | not in the launch catalog | recorded here only (RULE 2) |
| 13 | The AnA draft's default module `M2` becomes a confirmed placement; `FileToVaultDialog.tsx:51` misreads the folder object | Authoring canvas | AnA lane |

The QMS retire route (`mdx-qms.ts:656`) and `retire_qms_document` also take the
reason as optional, and the tool records a stock sentence. That belongs with P5
and V1 (server-side reason-for-change) in this lane.

### #3 — batch leaf resolution lent one leaf's pin verdict to the others (fixed)

`resolveLeafDocuments` cached the whole resolution, pin verdict included, under a
key naming only the document. Two leaves on one document took the first leaf's
verdict. The assessor reads leaves with no ORDER BY, so a stale pin read as
`resolved` whenever an unpinned or fresh leaf on the same document came first.
Dispatch readiness, freeze and transmit Gate 2 then cleared content its placement
never pinned. The cache now shares only the store read, and each leaf's own pin is
compared against it. The file was last touched on 09-22, so it is in no lane's
window.

- `leaf-pin-red.txt`: the two new orderings, [unpinned, stale] and [fresh, stale],
  fail on real PGlite with the source unchanged. The stale leaf reads `resolved`.
- `leaf-pin-green.txt`: 26/26 across the resolver and both dispatch-readiness
  suites.
- One existing assertion changed from `toBe` to `toEqual`. Identical pointers no
  longer share a single resolution object, and that shared object was the defect.
