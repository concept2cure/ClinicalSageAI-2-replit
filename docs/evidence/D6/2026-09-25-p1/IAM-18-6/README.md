# IAM-18 item 6 — the SSO token in a query string; SAML replay mode `ifPresent` (Low)

**Row:** D6. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-18 (6). **Plan item:** P1-17's residuals.

## What was wrong

- The SAML callback (`server/routes/sso.ts`) redirected to the requested return path with `?token=<jwt>`; the
  development SSO callback redirected to the sign-in page with `?sso_token=<jwt>&sso_email=…&sso_name=…` (its comment
  said "fragment"). A query string is sent to the server on the next request and kept in browser history, proxy and
  access logs. No page read either parameter, and the sign-in page reads `?token=` as a password-reset token.
- `server/services/saml-provider.ts` validated `InResponseTo` in `ifPresent` mode: an assertion that answered no
  request this SP issued (IdP-initiated, or replayed without the attribute) was accepted.

## What is true now

- Both callbacks hand the session to the sign-in page in the **URL fragment**: `/concept2cure/login#sso=<jwt>&provider=…`
  with the same-origin return path as `returnTo` when one was requested (`loginHandoffUrl`). A fragment is never sent
  to a server and never logged; nothing about the person travels in the URL.
- The sign-in page (`Concept2CureLogin.tsx`) reads the fragment once (`parseSsoHandoff`: a JWT-shaped token, a
  provider, a return path that passes the same allow-list as every other redirect), drops it from the address bar with
  `history.replaceState` before anything else, and adopts the session only when `GET /session` confirms it
  (`authService.adoptSession`: stored, policy kept, `login` raised, no refresh token). A forged or expired hand-off
  signs nobody in and says so.
- The SAML replay mode defaults to **`always`**: every assertion must answer an AuthnRequest this SP issued. An
  operator who runs IdP-initiated SSO sets `SAML_VALIDATE_INRESPONSETO=ifPresent` knowingly; `never` disables the check.

## Evidence

- `red/before-fix.txt` — the route test's new cases: the development callback's location carried `?sso_token=`; the
  SAML callback redirected to the return path with `&token=`; the client parser did not exist.
- `green/after-fix.txt` — the SSO route suite with the two hand-off cases, the SAML provider suite with the replay-mode
  case, the auth-surface suite, and the client parser, redirect and session-adoption suites.
- ESLint ratchet unchanged; `check:security-patterns` 0; `ci:server-error-leaks` at baseline.
