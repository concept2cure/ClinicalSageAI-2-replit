# P1-6 — webhook delivery followed redirects and echoed the destination's body (IAM-13, Medium)

**Row:** D6. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-13. **Plan item:** P1-6.

## What was wrong

`server/services/automation/webhook-notifications.ts` checked a channel's URL once by hostname
(`isSafeWebhookUrl`, the shared literal guard) and then delivered with a bare `fetch`. A bare fetch follows redirects,
so a public hostname that answered `302 Location: http://169.254.169.254/latest/…` (or any private address) reached it
with the webhook body; the hostname check never saw the hop. On a non-2xx response the module read the destination's
body and copied 200 characters of it into the delivery record and the warning log: a third party's text (an error page,
an internal hostname, an echoed token) written into the platform's own records. The connectors already delivered through
`server/utils/safeFetch.ts`, which resolves the hostname, refuses private and metadata addresses it resolves to, pins the
socket to the resolved address and re-validates every hop; the webhook path did not use it.

## What is true now

Delivery calls `safeFetch(channel.url, { …, redirect: 'error' }, 'webhook delivery to <channel>')`: a webhook
destination is a fixed endpoint the operator configured, so a redirect is refused rather than followed; a private or
metadata address, at the literal or after resolution, is refused before any bytes leave. The response body is cancelled
unread; a failure is recorded as `HTTP <status>` and logged the same way. A refusal by the fetcher is a failed delivery
in the returned record, never a thrown error, so `notifyWebhooks` keeps its "never throws" contract. The module's
literal hostname check stays as the first line.

| | File | Result |
|---|---|---|
| red | `red/webhook-delivery-before-fix.txt` | HEAD `f47aa229`, module unchanged: delivery goes through bare `fetch`, `safeFetch` is never called, a fetcher refusal cannot occur, and a 500 body ("internal hostname db-primary…") lands in the record; 4 of 4 fail |
| green | `green/webhook-delivery-after-fix.txt` | 4 of 4 |
| gates | `green/gates.txt` | `check:security-patterns`, `ci:unauthenticated-fetch`, `ci:server-error-leaks` exit 0 |

Test: `server/services/automation/__tests__/webhook-notifications.test.ts` (new; `safeFetch` mocked as a spy, global
`fetch` stubbed to prove it is no longer used).

## Not done here

- A real DNS/redirect run against a live destination; the fetcher's own behaviour is pinned by
  `server/utils/__tests__/safeFetch.test.ts`, and this contract pins that the webhook path uses it with redirects refused.
- The delivery record's `error` field shrank from `HTTP <status>: <200 chars of body>` to `HTTP <status>`; no caller
  or test read the body text (grep of `server/` and `client/src`).
