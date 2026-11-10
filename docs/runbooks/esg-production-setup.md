# FDA ESG — Production Setup Runbook

Status: **TODO — production transport not implemented**.
Owner: Regulatory Operations + Platform (assign per release).
Touched code: `server/services/ESGSubmissionService.ts`, `server/services/fdaIntegrationService.ts`.

## What's missing

Today both `ESGSubmissionService.transmitToESG` and `ESGSubmissionService.downloadAcknowledgment` (and the sibling `fdaIntegrationService.sendToESG`) return mocks in non-test environments. There is **no real transport client** that talks to the FDA Electronic Submissions Gateway.

To go live we need **AS2 over HTTPS** (FDA's documented path). It requires an AS2 client library, mTLS certificates issued/cross-signed for the FDA ESG endpoint, MDN handling, and signed/encrypted payloads (S/MIME).

There is no SFTP path. The SFTP branch was retired on 2026-11-09 (founder decision P-93): no FDA source on file documents one, and an FDA sequence over 1 GiB is out of scope for launch, refused before anyone signs (`docs/runbooks/fda-esg-production-uat.md` §8).

Acks (`ack1` receipt-of-transmission, `ack2` received-by-CDER, `ack3` final accept/reject) are delivered back through the same transport — pulled by tracking number once available.

## Required environment variables (reuse `FDA_ESG_*` prefix — do NOT invent `ESG_PROD_*`)

| Var | Purpose |
| --- | --- |
| `FDA_ESG_URL` | Production gateway URL (e.g. `https://esg.fda.gov/gateway`) |
| `FDA_ESG_USERNAME` | Production account username issued by FDA |
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

- Real AS2 client wired into `transmitToESG` and `downloadAcknowledgment`.
- Production env vars provisioned and documented in the secrets manager.
- End-to-end test against FDA's pre-production / WebTrader test environment passes.
- This runbook updated: status flips to `READY`, owners filled in, vendor links resolved.
