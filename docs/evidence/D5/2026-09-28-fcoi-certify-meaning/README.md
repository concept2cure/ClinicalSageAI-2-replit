# A financial-disclosure certification states its meaning, or nothing is asked

**Row:** D5 (§11.50(a)(3): a signature carries the meaning its signer gave).
**Session:** `…01P6GWSv`. **Date:** 2026-09-28. **Source:** the hand-on "→ D5 lane
(P1-21 / DP-17), found, not fixed" in `docs/work-orders/README.md`.

## What was wrong

`POST /api/financial-disclosures/disclosures/:id/certify` defaulted `meaning` to
`'Certified'`. So did `certifyDisclosureTx` behind it. Since `3d09bf2a9`, the
shared signature writer refuses any meaning outside `GOVERNED_SIGN_MEANINGS`.
Every certification that omitted a meaning, or sent one outside the vocabulary,
went through these steps before it failed:
1. re-authenticated the signer;
2. opened a transaction;
3. certified the disclosure;
4. wrote the ledger pair;
5. failed at the signature row, and rolled back as a 500.

The signer was asked for a password for a request that could never succeed.
The default was also a meaning nobody gave.

## The change

- **One refusal, shared.** `signMeaningRefusal(meaning)` in
  `server/services/part11/signature-meanings.ts` is the check the governed
  action route (`c2c/actions.ts`) already made. That route now calls it
  instead of keeping its own copy.
- **The certify route checks first.** It checks the meaning after parsing and
  **before re-authentication**. A missing or empty meaning is 400
  `SIGNATURE_MEANING_REQUIRED`, an unknown one is 400
  `SIGNATURE_MEANING_UNKNOWN`, and the message names the vocabulary. Nothing
  is opened or written.
- **The meaning is carried unchanged.** The checked meaning goes into the
  certification, the ledger payload and the signature row.
- **No default left.** `certifyDisclosureTx` takes a `GovernedSignMeaning` and
  no longer defaults it.

No client calls these routes. An API caller must now send a meaning, as it
must on every other governed sign.

## Proof

`server/routes/__tests__/financial-disclosure-certify-meaning.test.ts`:

| Case | HEAD | Change |
|---|---|---|
| No meaning | proceeds to re-auth and writes (200 with the writer mocked; 500 against the real writer) | 400 `SIGNATURE_MEANING_REQUIRED`; no password asked, nothing opened |
| Empty meaning | the same | 400 `SIGNATURE_MEANING_REQUIRED` |
| `'Certified'` (the old default) | the same | 400 `SIGNATURE_MEANING_UNKNOWN` |
| `'responsibility'` | 200 | 200, and that meaning in all three writes |

- `red.txt`: 3 of 4 fail against HEAD.
- `green.txt`: 4/4; 1249/1249 across the 77 suites that pin the meaning
  refusal, the governed action route or FCoI.
- Gates: `ci:sign-ceremony`, `ci:server-error-leaks`, `ci:fabricated-identity`,
  `ci:discarded-audit-write` and `check:security-patterns` pass.
- Scoped type check: no errors.
- ESLint: `financial-disclosures.ts` 1 → 0 warnings; no file gained one.
