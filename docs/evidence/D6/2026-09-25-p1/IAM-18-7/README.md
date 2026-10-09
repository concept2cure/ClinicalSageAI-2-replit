# IAM-18 item 7 — fifty megabytes parsed before the auth boundary (Low)

**Row:** D6. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-18 (7). **Plan item:** P1-17's residuals.

## What was wrong

`server/startup/middleware.ts` mounted `express.json({ limit: '50mb' })` on `/api/concept2cure` in the core
middleware, before the default-deny auth boundary: an anonymous request to any Concept2Cure route made the process
read and parse up to fifty megabytes before being refused (the rest of `/api` parses two).

## What is true now

- Before the boundary, `mountPreAuthBodyParsers` mounts the 2 MB JSON and urlencoded parsers for `/api` and skips
  `/api/concept2cure` paths entirely: an anonymous Concept2Cure request is refused with its body unread.
- After the boundary, `applyAuthBoundary` mounts `mountConcept2cureBodyParser`: the 50 MB JSON parser (document
  bodies), the 2 MB urlencoded parser, and the prototype-pollution scrub, which the earlier scrub could not have
  applied to a body that did not yet exist.
- Nothing between the core middleware and the boundary reads a body: the audit-trail observer and the debug request
  log read headers only (`getDebugBodyMetadata`).

## Evidence

- `red/before-fix.txt` — the test cannot import the two mount functions: the large parser lived inline before the
  boundary and there was no post-boundary parser.
- `green/after-fix.txt` — 16/16 (one pre-existing skip) across `pre-auth-body-limit.test.ts` (an anonymous 3 MB
  malformed body is 401, not 400; a signed-in 3 MB body is parsed; the scrub follows; the rest of `/api` keeps its
  2 MB parser: malformed 400, 3 MB 413), `tenant-impersonation-detector.test.ts` (the detector still follows the
  boundary; the parsers follow it), `middleware.guards.test.ts`, `stripe-webhook-raw-body.contract.test.ts` (the raw
  parser still precedes JSON parsing; the contract now locates the pre-boundary mount by its function).
- ESLint ratchet: no file changed its warning count. `check:security-patterns` 0.
