# P1-37 — the server logger's personal-data mask skipped the message string and array elements (DP-39, Low)

**Row:** D6. **Finding:** `docs/evidence/reviews/2026-09-26/security.md` §3 DP-39, registered in
`docs/security/SECURITY_AUDIT_2026-09-24.md`. **Plan item:** P1-37. **Parent closure:** P1-27, third part (`../P1-27/`,
"the server logger masks personal data").

## What was wrong

At HEAD `7fbe51c5`, in both hand-kept mirrors of the logger:

- `server/utils/logger.ts:187-196` — each level called `pinoLogger.<level>({ context: redactContext(...) }, message)`.
  The `context` object went through the P1-27 mask; the `message` string went to pino as the caller composed it.
  `server/utils/logger.js:126-186` did the same into `JSON.stringify({ ..., message, context: redactContext(context) })`.
- `server/utils/logger.ts:142-145` (`logger.js:104`) — `redactContext` returned an array unchanged, by design
  ("Arrays are passed through — array values usually don't contain named fields"). A list of addresses under an
  ordinary key, or an object with a sensitive key inside a list, was never scanned. The suite pinned that as the
  contract (`logger.test.ts:173-178`, "passes arrays through unchanged").

So the P1-27 closure's sentence — an address or an IP is masked "wherever either appears as a log value" — held for a
scalar string under an object key and not for the two shapes above. The review found no exploited instance with its
grep; a wider grep finds three message-only interpolations of an e-mail address that go through this logger
(`createScopedLogger`): `server/routes/sso.ts:574` (`SAML SSO login successful for user=${dbUser.email}`),
`server/routes/sso.ts:910` (`JIT provisioning new SAML user: ${email}`) and
`server/services/authoring/authoring-evidence.ts:230` (`Audit trail created: … by ${ctx.actorEmail}`). Each wrote the
address in clear.

## What is true now

Identical change in both files (`logger.ts:147-176, 200-209`; `logger.js:109-136, 139-212`):

- **The message is masked.** `maskMessage` runs `maskPersonalData` over the message string before it reaches pino or
  `JSON.stringify`, so the three sites above now log `S***@example.test` without a call-site edit. `MASK_SCAN_LIMIT`
  is unchanged and applies to the message as to any string: a message over 2 KB is left alone. A non-string message
  (a legacy `.js` caller passing an object or an Error) is handed on as before rather than made to throw inside the
  request that is logging.
- **Arrays are walked.** `redactContext` maps an array through the same per-value rule as an object's values
  (`maskValue`): a string element is masked, an object or array element is walked at `depth + 1`, anything else passes
  through. The depth-6 guard applies to arrays as to objects. An array element has no key, so `SENSITIVE_KEYS` is
  matched on the keys of objects inside it; an array *under* a sensitive key is still `[REDACTED]` whole, never walked.
  The caller's array is not mutated (a new array is returned, as a new object always was).
- The walker's comment and the file header say so; the "arrays are passed through" text is gone from both files.

`server/utils/consoleBridge.ts` is unchanged: its `redactArgs` already hands every object argument (arrays included)
to `redactContext`, so the bridge inherits the array walk; its string arguments are still passed through by its own
design (pinned by its suite, see open items).

## Evidence

| | File | Result |
|---|---|---|
| red | `red/logger-message-and-arrays-before-fix.txt` | Both sources at their HEAD `7fbe51c5` content, the DP-39 cases added to `logger.test.ts`: **11 failed / 38 passed** across the two suites. `logger.js`: `message` `'Sign-in refused for ada.lovelace@example.test from 203.0.113.42'` written as is; `logger.ts`: pino handed the same raw string at every level and through a scoped logger; `redactContext` in both mirrors returned `['ada.lovelace@example.test', …]` unmasked and `[{ password: 'hunter2' }]` unredacted; an array passed as the whole context reached both sinks in clear. Three of the new cases were already green on the old code and are guards, not the defect: the over-limit message left alone (both mirrors) and an array under a sensitive key redacted whole. `consoleBridge.test.ts` 13/13 before and after. |
| green | `green/logger-message-and-arrays-after-fix.txt` | **49 / 49** across `logger.test.ts` (36) and `consoleBridge.test.ts` (13). |
| gates, lint | `green/gates-and-lint.txt` | `ci:server-error-leaks` OK (120 baselined sites across 77 files; no file gained one); `check:security-patterns` 0 violations across 2,857 files. ESLint: `logger.ts` 0 → 0, `logger.js` 2 warnings (`no-console` on the `console.log`/`console.debug` sinks, pre-existing) → 2, `logger.test.ts` 0 → 0. |

Test: `server/utils/__tests__/logger.test.ts`, the `DP-39` blocks from line 262. The bare `../logger` specifier resolves
to `logger.js` under vitest (Vite tries `.js` before `.ts`) while a production bundle resolves it to `logger.ts`, so
the new cases run against **both** mirrors: `logger.js` by explicit import, `logger.ts` by a variable-held specifier
(a literal `'../logger.ts'` is TS5097). pino is replaced with a recording sink for the `.ts` twin because the seam
under test is the `message` argument the wrapper hands pino; nothing downstream of that call is asserted. The `.js`
mirror is asserted on the JSON line it writes to `console.<level>`. The one pre-existing case that pinned the old
array contract (`passes arrays through unchanged`) is rewritten to the new one in the same block.

The first red run had one case failing for the wrong reason (its spy watched `console.info` while `logger.js`'s `info`
writes through `console.log`); the spy was corrected and the red re-run against the HEAD content of both sources
before the fix was put back, so the filed red fails every case on the leak itself.

## Re-run

```
NODE_OPTIONS=--max-old-space-size=1536 npx vitest run \
  server/utils/__tests__/logger.test.ts server/utils/__tests__/consoleBridge.test.ts
npm run ci:server-error-leaks
npm run check:security-patterns
npx eslint server/utils/logger.ts server/utils/logger.js server/utils/__tests__/logger.test.ts
```

## Left open

- **`consoleBridge` string arguments.** The bridge passes a string argument through unmasked by design, and its suite
  pins that (`consoleBridge.test.ts`, "passes string + number + boolean arguments through unchanged"). A legacy
  `console.error(\`login failed for ${email}\`)` in production therefore still writes the address; the item named the
  logger's message and arrays, and the bridge's suite was to stay green. Masking bridge strings through
  `maskPersonalData` is a one-line change plus that test's rewrite — a separate item, same DP-39 family.
- **Non-string messages** are handed on unmasked, as before. Every TypeScript caller is typed `string`; the exposure is
  a `.js` caller passing an object as the message. Not counted this session.
- **A `Date`, `Buffer` or class instance inside an array** is now walked as an object, as one under a key always was
  (`Object.entries` of a `Date` is `[]`, so it logs as `{}`). Before this change such an element survived because the
  array was not walked. Nothing in the two suites depends on it; a caller that logs a date should pass an ISO string.
- **The register and plan rows** (`docs/security/*`), the D6 index (`../README.md`) and the P1-27 README cross-reference
  are proposed in this lane's structured result, not edited here.
