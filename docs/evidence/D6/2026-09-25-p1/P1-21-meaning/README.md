# P1-21 (vocabulary half) — a governed sign accepted a null or free-text meaning (DP-17, Medium)

**Row:** D5 (filed under the D6 tranche folder). **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` DP-17.
**Plan item:** P1-21, the closed-vocabulary half. The first-signing acknowledgement and the identity-proofing record
are the other half and are not done here (below).

## What was wrong

`persistGovernedActionSignature` (`server/services/part11/signature-persistence.ts`) is the one writer every governed
`electronic_signatures` row goes through. For a `sign` it recorded whatever string `payload.meaning` carried, or
`null` when it carried none, and `POST /api/c2c/actions/sign` (`server/routes/c2c/actions.ts`) checked the target and
the reason but not the meaning. So a signature could state a meaning nobody defined, or no meaning at all, and the
§11.50(a)(3) manifestation ("the meaning associated with the signature") was whatever the client sent. The eSTAR filing
route (`server/routes/510k-estar-routes.ts`) went the other way: when the filer sent no meaning it wrote `approval`, a
meaning nobody declared, recorded as if they had.

The other writers that call the shared function with `command: 'sign'` (submission-gateway transmit, Module 3 section
approval, protocol signing, task sign-off) already validate the meaning at their route against one of two lists: the task
board's `APPROVED | REVIEWED | RESPONSIBILITY | AUTHORSHIP` and the sign dialog's
`authorship | review | approval | responsibility | release`. Readers compare the stored value case-sensitively
(`protocol-reviews-service.ts`, `document-lifecycle.ts`), so the two spellings are both live and neither can be
normalised away without a data migration.

## What is true now

- `GOVERNED_SIGN_MEANINGS` (`server/services/part11/signature-meanings.ts`) is the union of the two spellings, with
  `isGovernedSignMeaning()`; nothing outside it is a meaning.
- The writer refuses a `sign` whose declared meaning is missing, empty, not a string, or outside the vocabulary, with
  `SignatureMeaningError` (`SIGNATURE_MEANING_REQUIRED` | `SIGNATURE_MEANING_UNKNOWN`) thrown **before** the signer
  lookup, so a refusal does no database work. `approve`, `revoke-signature` and `transmit` are not gated (their meaning
  is fixed by their own writer).
- `POST /api/c2c/actions/sign` answers 400 with the same codes before re-authentication (a signer is not asked for a
  password for a request the writer would refuse), and maps a writer refusal to 400 as well.
- The eSTAR filing schema requires the meaning for the `filed` transition; the `?? 'approval'` default is gone. No
  first-party client drives that transition today (SubmissionCenter reads the tracker and calls `/assemble` only).

| | File | Result |
|---|---|---|
| red | `red/governed-sign-meaning-before-fix.txt` | HEAD `901f9c9e`, sources unchanged: a sign with no meaning and a sign with free text both **resolve** and write rows; 2 failed / 11 passed |
| red | `red/writer-unit-before-fix.txt` | same HEAD: the vocabulary and the error do not exist, every refusal case reaches the database; 6 failed / 7 passed |
| green | `green/writer-route-and-neighbours-after-fix.txt` | 83 / 83 across the new unit test, the governed-sign PGlite suite (three cases added), revocation, signatures-by-target, governed-action, QMS approval and task-graph seeding |
| green | `green/gates.txt` | `check:security-patterns` 0 violations; `ci:sign-ceremony` 23 baselined, no new writer; `ci:discarded-audit-write` no new occurrences |

Tests: `server/services/part11/__tests__/governed-sign-meaning.test.ts` (new);
`server/routes/c2c/__tests__/governed-sign-esignature.pglite.integration.test.ts` (three cases).

## Not done here

- **First-signing acknowledgement** (§11.10(j), §11.100(c)): a row recording that the signer accepted, with date and
  the text version, that their electronic signature is the legal equivalent of a handwritten one, required before the
  first governed sign. Needs a table (a new additive migration inserted before the RLS pair, Rule 1), a check in
  `reverifySigner` or the sign routes, and a client step in `EsignModal`. The identity-proofing record at account
  activation (§11.100(b)) is the same shape. Both remain open on P1-21.
- **One spelling.** Collapsing the two vocabularies onto one needs the readers that compare lower-case values and a
  data migration of stored `signature_meaning` values; not a security change and not attempted here.
- The Module 3 route's own list (`server/api/cmc/governance.ts`) and the transmit route's zod enum are unchanged; the
  writer's vocabulary is a superset of both, so they are stricter, not looser.
