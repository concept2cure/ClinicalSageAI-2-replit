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
