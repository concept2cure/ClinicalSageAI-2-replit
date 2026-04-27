# FDA ESG — Production Setup Runbook

Status: **TODO — production transport not implemented**.
Owner: Regulatory Operations + Platform (assign per release).
Touched code: `server/services/ESGSubmissionService.ts`, `server/services/fdaIntegrationService.ts`.

## What's missing

Today both `ESGSubmissionService.transmitToESG` and `ESGSubmissionService.downloadAcknowledgment` (and the sibling `fdaIntegrationService.sendToESG`) return mocks in non-test environments. There is **no real transport client** that talks to the FDA Electronic Submissions Gateway.

To go live we need either:

1. **AS2 over HTTPS** (FDA's preferred path). Requires an AS2 client library, mTLS certificates issued/cross-signed for the FDA ESG endpoint, MDN handling, and signed/encrypted payloads (S/MIME).
2. **SFTP gateway** (lower-throughput fallback). Requires an SSH key registered with FDA and credentialled SFTP login.

Acks (`ack1` receipt-of-transmission, `ack2` received-by-CDER, `ack3` final accept/reject) are delivered back through the same transport — pulled by tracking number once available.

## Required environment variables (reuse `FDA_ESG_*` prefix — do NOT invent `ESG_PROD_*`)

| Var | Purpose |
| --- | --- |
| `FDA_ESG_URL` | Production gateway URL (e.g. `https://esg.fda.gov/gateway`) |
| `FDA_ESG_USERNAME` | Production account username issued by FDA |
| `FDA_ESG_PASSWORD` | Password (SFTP fallback path only) |
| `FDA_ESG_CERT_PATH` | Filesystem path to the production mTLS / S/MIME certificate |
| `FDA_ESG_KEY_PATH` | Filesystem path to the matching private key |

`NODE_ENV !== 'production'` keeps the service in the deterministic test branch and bypasses all of the above.

## Vendor / regulator references

- FDA ESG Technical Conformance Guide — TODO: link current revision
- FDA ESG account application + cert issuance process — TODO: link
- AS2 RFC 4130 + S/MIME payload conventions used by FDA — TODO: link

## Credential ownership

- FDA ESG account: TODO — assign Regulatory Ops owner
- mTLS certs (issuance, rotation, expiry monitoring): TODO — assign Platform owner
- Secrets storage: production secrets manager (NOT committed `.env`)

## Definition of done

- Real AS2 (or SFTP) client wired into `transmitToESG` and `downloadAcknowledgment`.
- Production env vars provisioned and documented in the secrets manager.
- End-to-end test against FDA's pre-production / WebTrader test environment passes.
- This runbook updated: status flips to `READY`, owners filled in, vendor links resolved.
