# D7 — each organisation chooses the platform's gateway account or its own, per agency

**Row:** D7 (one real sequence; the transmit path). **Date:** 2026-10-01.
**Decision:** the founder, 2026-10-01:

> We can have both the platform and client fda account as options and should …
> it's going to depend on region, regulatory body, as well as account and
> client preference … that decision … should be part of an account setting in
> our admin settings when clients onboard.

## What was true

- **No organisation could choose.** All 13 gateways read only the server's
  environment, so every organisation transmitted under the platform's identity
  (`FDA_ESG_AS2_FROM` and the platform certificate).
- **No transmittal recorded which account sent it.** The AS2 identity survived
  only inside a Message-ID string.
- **No setting existed** in admin settings or in onboarding.

## The change

| Piece                                                                                       | What it does                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migrations/20261001g_organization_gateway_accounts.sql` (in the set, above the final pair) | One row per organisation × gateway × environment: `platform` or `client`, the sender identifier, the client's credentials as AES-256-GCM ciphertext, and the names of the fields held. Public, `organization_id INTEGER NOT NULL`, so the sweep gives it its tenant policy. No row means the platform account, which was the only behaviour before.                                                                       |
| `server/services/security/credential-cipher.ts`                                             | The connector credential cipher, moved unchanged out of `connector-registry.ts` so both use one implementation. Same format; existing ciphertext still decrypts. It still refuses to load in production without `CONNECTOR_ENCRYPTION_KEY`.                                                                                                                                                                               |
| `server/services/submission-gateways/gateway-accounts.ts`                                   | The catalogue: one entry per gateway in the registry, with a test holding the two equal. Also: resolution, validation, the write, and the refusal. **FDA ESG can send under a client's own account today.** The other 12 record the choice, and a transmit under it is _refused before the wire_ rather than sent under the platform's identity.                                                                          |
| `server/routes/gateway-accounts.ts` (`/api/gateway-accounts`)                               | **GET:** every gateway × environment for the caller's organisation, with whether each can send now. Never any secret. **PUT:** organisation admin or owner only, with the password confirmed and a reason of at least 10 characters. Choosing the platform account clears any client secrets held. The change and its chained audit row commit together: mode before and after, sender, credential field _names_, reason. |
| The guard in `server/services/submission-gateways/index.ts`                                 | Resolves the organisation's account on every transmit, before the wire. A client account that cannot send is refused, either because the gateway does not support client accounts yet or because credentials are missing. The mode and sender identity are stamped on the transmittal's metadata **after** the caller's, so a caller cannot forge them. They are also returned on the result.                             |
| `fda-esg.ts`                                                                                | In client mode the sponsor side is the client's: the AS2 identifier FDA assigned them, and their certificate and key. FDA's side (endpoint, FDA's AS2 identifier, FDA's public certificate) is the same for every sponsor and stays platform configuration. `isConfigured` and `transmit` both honour the choice.                                                                                                         |

## The proof

| File                       | Shows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `red/transmit-before.txt`  | The new tests with the guard, the FDA loader and the request type as on trunk: **5 fail.** An organisation that chose its own MHRA account is sent under the platform anyway. An FDA client account missing its key is not refused. The account never reaches the gateway, and nothing records it. A real FDA AS2 message goes out as `SPONSOR-AS2`, the platform, instead of the client's identifier.                                                                                             |
| `green/transmit-after.txt` | The same files with the change: **51 of 51.** These include a real AS2 transmit through the FDA gateway, with only the HTTPS socket stubbed, under a client account. Its `AS2-From` and Message-ID carry the client's identifier, it is signed with the client's key, and the platform's certificate and key files are never read.                                                                                                                                                                 |
| `green/postgres-route.txt` | `tests/db/gateway-accounts.dbtest.ts` on PostgreSQL 16, as `app_service` with RLS enforcing, through the real route and `authMiddleware`: **7 of 7.** It covers: 26 rows (13 gateways × 2 environments), platform by default; a viewer refused with 403; a wrong password refused with 401 and nothing written; the certificate and key encrypted, never returned, audited by field name only; another organisation unaffected; a switch back clearing every secret; the table under row security. |

**Also run:**

- **Gateway unit directory:** 32 files pass. The `CredentialError` site audit
  now lists the two refusal sites in `gateway-accounts.ts`.
- **Connector tests:** 50 of 50, after the cipher move.
- **Golden journeys, the transmit bundle guard and the FDA honesty contract:**
  pass.
- **Not caused by this change:** `server/routes/__tests__` has 28 failures,
  identical with this change stashed (28 failed, 3,434 passed either way).
  `ci:unbacked-tables` flags `last_seen_at` in `session-inactivity.ts`.

## Still to come in this lane

The admin Setup section and the onboarding step that set this (see below once
landed).
