# D5 — freeze, dispatch and transmit take a release meaning, and a "review" is not the release

Found by the 2026-10-18 Part 11 audit (binding-and-meaning dimension; confirmed
by two independent refuters, high severity).

**Defect.** Gate 1 of the governed submission steps refused only an authorship
meaning (fixed 2026-10-05). Every other meaning, and none at all, authorized
freeze, dispatch and transmit. The §11.70 release resolver
(`findReleaseSignatureRows`) read the intent and never the meaning, so a
dispatch signed "review" was counted as the submission's release signature.
The gateway transmit (`assertTransmitterIndependent`, shared by the HTTP route
and AnA's k510 transmit) refused only authorship too, and the transmit route's
schema listed "review". Gate 1's own refusal text and the Submission Center's
dialog already named the policy, approval, responsibility or release, but the
server did not enforce it.

**Change.** One set, `RELEASE_ACT_MEANINGS` in
`server/services/part11/signature-meanings.ts`, the module that holds every
per-act set. It is enforced in four places:
- `INTENT_MEANING_REFUSAL` for freeze, dispatch and transmit (Gate 1).
- `findReleaseSignatureRows`: a meaning clause, with bound parameters.
- `assertTransmitterIndependent`: `MEANING_NOT_A_RELEASE`, 422, before any lookup.
- The transmit route's body schema, so a wrong meaning is refused before the password.

A missing meaning now fails closed. The sign route has required a meaning since
P1-21 (2026-09-25); an unspent signature older than that has to be signed again.

**Proof.**
| | Result |
|---|---|
| red (`red/before-the-fix.txt`) | 5 new cases fail. A freeze and a dispatch signed "review" are accepted; a meaning-less freeze is accepted; the resolver says `signed` for a "review" dispatch; a transmit on "review" is not refused. |
| green (`green/the-three-files.txt`) | 44/44 |
| green (`green/collateral-suites.txt`) | 26 files, 272/272: every suite whose fixture or mock carried no meaning, or a free-text one, was updated to a release meaning |

**Already failing at HEAD, before this change** (each run with the HEAD source
files restored in place, failing the same way):
- `server/services/ana-ri/__tests__/mdx-esg-transmit-gateway.test.ts`, 5 cases:
  "AS2 signing/encryption preparation failed".
- `server/services/submission-service/__tests__/refused-step-voids-signature.pglite.test.ts`,
  6 cases: a PGlite wire-protocol error (08P01, "insufficient data left in message").

Neither involves a signature meaning. Both are recorded on the board for their owners.

**Not in this change.** AnA's k510 sign-off dialog still offers REVIEWER; the
server now refuses it at transmit, after re-authentication. Adding
`k510_workflow.transmit` to `SIGNED_ACTS` with the fixed meaning `release` would
refuse it before the password. That is a follow-up.
