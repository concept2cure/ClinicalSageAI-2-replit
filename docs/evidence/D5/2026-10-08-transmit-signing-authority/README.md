# Only a role that may sign transmits to an agency (SEC-1008-1)

**Date:** 2026-10-08 · **Rows:** D5 (Part 11), D7 (transmission) · **Session:** `…01471vSKg1KXj3ijXDiyvXGX`

**Found by** the weekly launch-catalog review (`docs/evidence/reviews/2026-10-08/security.md`). A verifier confirmed it as high.

## The defect

`POST /api/mdx/gateways/:region/:gateway/transmit` sends a package to FDA ESG or the EMA gateway. Its gates were:
- `requireEditorAccess`, which admits every role that may write, member and manager included;
- a password (and code) re-verification;
- the package creator may not transmit.

Nothing asked whether the person may **sign**. The send is irreversible. Afterwards the platform wrote an `electronic_signatures` row recording it as that person's signature, a signature the signing policy (`isSigningAuthorized`: admin, approver, reviewer by default) says they may not give. The AnA transmit path (`executeGovernedTransmit`, called from `ana-ri/mdx-command-handlers.ts`) had the same gap. The sibling `POST /api/submissions/sequences/:seqId/transmit` was already safe, because it consumes a prior authorized signature.

## The decision

The board's convention leaves files another lane changed in the last 24 hours to that lane. These files were changed this morning by the QA lane (`…01DiJJAk`). I took this fix anyway, as product owner, by the founder's delegation of 2026-10-08. The decision rests on the risk:
- a filing sent to an agency under an unauthorized signature cannot be recalled;
- it would land on a client's own regulatory record;
- the fix is two small additions to existing files and does not touch that lane's logic.

## The change

- **`governed-transmit-checks.ts`:** `assertTransmitterHasSigningAuthority(org, user)` reads the role from this organization's membership (`resolveSignerOrgRole`), never from the request. It judges that role with the one signing policy (`isSigningAuthorized`) and refuses with 403 `ESIGNATURE_NO_AUTHORITY` and "Nothing was transmitted."
- **`executeGovernedTransmit`:** asks first, before any byte is read. Every caller inherits it: the HTTP route and AnA's transmit.
- **The route:** asks before the password check (`refusedForSigningAuthority`). A role that may not sign spends no attempt against its account lockout.

## Proof

| Check | Red | Green |
|---|---|---|
| Member, manager, viewer and no membership are refused, with nothing sent and no signature row opened | `red-against-trunk.txt`: 4 fail on trunk | 12/12 in `governed-transmit-signature.test.ts` |
| The route refuses a member or manager before the credential read | `red-route-ordering.txt`: 2 fail with the route change removed (one password-hash read each) | 44/44 in `tests/mdx-submission-gateway-routes.test.ts` |
| Every suite on the transmit path (`related-files.txt`, 26 files) | `related-first-run.txt`: 81 tests in 7 files failed closed (500), because their fixtures stated no signer role | `green-related.txt`: 26 files, 446 tests |

The seven fixtures now state, in one commented line each, that their transmitter is an approver. That states an assumption the tests always made. It weakens nothing.

Typecheck is clean. Lint: the warning count on the three files is unchanged at 4.

## Not changed

The signature row is still written after the send (`governed-transmit.ts`, the `ledgerWriteFailed` path). The review recorded that ordering as disclosed by design. It is left to the QA lane, which owns the transmit sequencing.
