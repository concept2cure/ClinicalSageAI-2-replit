# FDA ESG — Production UAT Runbook

**Status:** Pre-UAT. The transport code is real (`server/services/submission-gateways/fda-esg.ts`,
492 LOC, RFC-4130 AS2 + SFTP fallback) but has never been exercised against the live FDA ESG
staging endpoint with sponsor WebTrader / AS2 credentials.

**Scope:** Path-to-GA §C.6 — end-to-end UAT of the FDA Electronic Submissions Gateway against
the FDA pre-production / WebTrader test environment. GA-1 critical path.

**Owners:** Regulatory Operations (FDA ESG account + sponsor identity) · Platform (secrets, certs,
gateway code) · QA (transmit → ack chain verification).

**Time budget:** 3–5 calendar days (per Path-to-GA risk #3, allocate 5).

---

## 1. Scope and non-goals

In scope:

- mTLS handshake and AS2 envelope transmit against the FDA AS2 endpoint.
- Synchronous MDN capture (the gateway requests `Receipt-Delivery-Option: sync`,
  `fda-esg.ts:150`).
- ack1 (gateway receipt), ack2 (virus + structure check), ack3 (center acceptance) capture
  via the FDA ESG WebTrader portal. ack2 / ack3 are async, hours–days.
- SFTP fallback path exercised once (≥1 GB bundle, `fda-esg.ts:346`).

Out of scope (defer to follow-on tasks):

- PKCS#7 / CMS signed-and-encrypted AS2 payload. Today's code TLS-protects the AS2 body and
  signs with a detached SHA-256 (`fda-esg.ts:158–166`); full CMS wrapping is flagged as an
  engineering follow-up in the file header (`fda-esg.ts:125–131`).
- Programmatic ack polling from `/outgoing/`. Today's `checkStatus` returns the last-known DB
  row (`fda-esg.ts:443–464`); `downloadAcknowledgment` synthesises a text summary
  (`fda-esg.ts:466–490`). Real polling is a follow-up.
- Asynchronous-MDN webhook wiring (the gateway currently asks for sync only).

---

## 2. Prerequisites

| Item | Owner | Notes |
| --- | --- | --- |
| FDA ESG WebTrader account (test) | Regulatory Ops | <https://esg.fda.gov> registration; sponsor identity tied to the org. |
| Sponsor AS2 identifier | Regulatory Ops | The value injected as `FDA_ESG_STAGING_AS2_FROM`. Assigned by FDA at account provisioning. |
| FDA AS2 identifier | Regulatory Ops | Defaults to `FDA-CESUB` (`fda-esg.ts:77`); override only if FDA tells you to in writing. |
| Sponsor mTLS cert + private key (PEM) | Platform | Pair issued or cross-signed for the FDA ESG endpoint. Same key is used for the AS2 detached signature (`fda-esg.ts:158–166`). |
| FDA AS2 public cert (PEM) | Platform | Used as the `ca` trust anchor for the mTLS handshake (`fda-esg.ts:244`); the field is also retained for future PKCS#7 encrypt-to-FDA. |
| Sponsor application number | Regulatory Ops | E.g. `IND123456`. Passed in `metadata.applicationId` (`fda-esg.ts:355–357`). |
| Test eCTD bundle | QA | A non-production package; SHA-256 must match the descriptor (`bundle-integrity.ts`). |
| FDA ESG ops contact | Regulatory Ops | Help-desk channel for ack troubleshooting during the backup window. |
| SFTP credentials (for the SFTP test only) | Platform | SSH key registered with FDA against the same sponsor account. |

---

## 3. Environment configuration

The gateway resolves credentials through `envFor(environment, key)` (`fda-esg.ts:62–68`).
For staging UAT, every variable is read with the `FDA_ESG_STAGING_` prefix. **Set every
variable in the platform secrets manager — never commit to `.env`.**

Required for AS2 (presence checked at `fda-esg.ts:81–88`):

```text
FDA_ESG_STAGING_URL              # e.g. https://esgtest.fda.gov/gateway   — fda-esg.ts:75
FDA_ESG_STAGING_AS2_FROM         # sponsor's AS2 identifier               — fda-esg.ts:76
FDA_ESG_STAGING_AS2_TO           # optional; defaults to FDA-CESUB        — fda-esg.ts:77
FDA_ESG_STAGING_CERT_PATH        # absolute path to mTLS client cert PEM  — fda-esg.ts:78
FDA_ESG_STAGING_KEY_PATH         # absolute path to mTLS private key PEM  — fda-esg.ts:79
FDA_ESG_STAGING_FDA_CERT_PATH    # absolute path to FDA's AS2 public cert — fda-esg.ts:80
```

Required for the SFTP fallback exercise (presence checked at `fda-esg.ts:271–276`):

```text
FDA_ESG_STAGING_SFTP_HOST        # e.g. esg-sftp-test.fda.gov             — fda-esg.ts:115
FDA_ESG_STAGING_SFTP_USER        # sponsor SFTP username                  — fda-esg.ts:116
FDA_ESG_STAGING_SFTP_KEY_PATH    # absolute path to SSH private key PEM   — fda-esg.ts:117
```

Production cutover later swaps the prefix to `FDA_ESG_` (no `STAGING_`). Same variable names
otherwise (`fda-esg.ts:66`). Do not invent `ESG_PROD_*` or any other prefix — the resolver
will not read it.

Also required for any UAT process running outside the app:

```text
NODE_ENV=test                    # avoids any prod-mode side effects in transitive services
DATABASE_URL=...                 # the same Postgres the app uses; transmittal rows land here
```

The smoke script (§9) validates presence before doing anything else.

---

## 4. Pre-flight checks

Run all of these from the UAT bastion. Do not skip any — every one of them maps to a
production failure mode in §10.

### 4.1 Cert chain validation

```bash
# Client cert + key are a matching pair
openssl x509 -in "$FDA_ESG_STAGING_CERT_PATH" -noout -modulus | openssl md5
openssl rsa  -in "$FDA_ESG_STAGING_KEY_PATH"  -noout -modulus | openssl md5
# The two MD5 hashes MUST be identical.

# Client cert is not expired and not expiring during UAT window
openssl x509 -in "$FDA_ESG_STAGING_CERT_PATH" -noout -dates

# FDA cert is a real cert (the gateway loads it raw at fda-esg.ts:107)
openssl x509 -in "$FDA_ESG_STAGING_FDA_CERT_PATH" -noout -subject -issuer -dates
```

Acceptance: identical modulus hashes; `notAfter` ≥ 30 days from now; FDA cert issuer matches
what the FDA ESG operations team published.

### 4.2 mTLS handshake against the FDA endpoint

```bash
openssl s_client \
  -connect "$(echo "$FDA_ESG_STAGING_URL" | sed -E 's|^https?://||; s|/.*$||'):443" \
  -cert "$FDA_ESG_STAGING_CERT_PATH" \
  -key  "$FDA_ESG_STAGING_KEY_PATH"  \
  -CAfile "$FDA_ESG_STAGING_FDA_CERT_PATH" \
  -servername "$(echo "$FDA_ESG_STAGING_URL" | sed -E 's|^https?://||; s|/.*$||')" \
  -showcerts < /dev/null
```

Acceptance: TLS handshake completes (`Verify return code: 0 (ok)`). The gateway sets
`rejectUnauthorized: true` (`fda-esg.ts:245`) so any handshake failure here will reproduce as
a `TransportError` at transmit time.

### 4.3 AS2 envelope shape sanity check

The gateway builds AS2 headers at `fda-esg.ts:142–156`. Confirm via the smoke script (§9,
`--print-envelope`) that the headers it would send are:

- `Message-ID` of the form `<uuid@${AS2_FROM}>`
- `AS2-From` matches `FDA_ESG_STAGING_AS2_FROM`
- `AS2-To` matches `FDA_ESG_STAGING_AS2_TO` (or `FDA-CESUB`)
- `AS2-Version: 1.2`
- `Disposition-Notification-To` is set to the sponsor (sync MDN)
- `Receipt-Delivery-Option: sync`
- `Content-Type: application/octet-stream`
- `Content-Disposition: attachment; filename="ectd.zip"`

If your FDA ESG account profile expects different filename, AS2 version, or async MDN, raise
to engineering — those values are hard-coded in `buildAs2Headers` and changing them is a code
change, not a configuration change. **Flagged as engineering follow-up.**

### 4.4 Bundle integrity

The transmit path calls `readVerifiedBundle` (`fda-esg.ts:386`, also `fda-esg.ts:361` on the
SFTP path) which re-hashes the on-disk file and compares to the descriptor's `sha256`. Run
this once before UAT day:

```bash
sha256sum "$TEST_BUNDLE_PATH"
# Compare to the descriptor.sha256 recorded when the bundle was assembled.
```

Acceptance: hashes match. A mismatch will raise `ValidationError` and the transmit will
422 from the route layer (`mdx-submission-gateway.ts:362–364`).

### 4.5 Sponsor row in `submission_gateway_credentials`

`loadFdaCredentials` best-effort writes an audit row for the (org, environment) at
`fda-esg.ts:91–102`. Confirm it lands by tailing the transmittals DB after the first
configured-status check (`isConfigured` → `loadFdaCredentials`, `fda-esg.ts:326–333`):

```sql
SELECT organization_id, environment, credential_kind, identifier, secrets_ref, status
FROM submission_gateway_credentials
WHERE region = 'fda' AND gateway = 'esg' AND organization_id = $1
ORDER BY id DESC LIMIT 1;
```

Acceptance: one row, `credential_kind = 'mtls'`, `status = 'active'`, `identifier` equals
your `AS2_FROM`, `secrets_ref` equals your `CERT_PATH`.

---

## 5. UAT submission walkthrough

This is the happy-path. Do exactly one transmit per session and write down the
`transmittalId` + `transmissionId` returned.

### 5.1 Seed a test submission and bundle

Use the existing `mdx-submission-gateway` route. The route is the only entry point the
orchestrator exposes; it calls `getGateway('fda', 'esg').transmit(...)` at
`mdx-submission-gateway.ts:299–315`. Do NOT call `FdaEsgGateway` directly outside of the
smoke script; you will bypass the bundle-rematerialization step (`mdx-submission-gateway.ts:62–76`)
and the governed-action ledger write (`mdx-submission-gateway.ts:322–355`).

1. Assemble an eCTD bundle for the test application (`packageEctdSubmission` from
   `submission-gateways/index.ts:26`). Record `bundle.path`, `bundle.sha256`,
   `bundle.sizeBytes` — these flow into the `submission_transmittals` row at
   `fda-esg.ts:181–186`.
2. Run `package.validate` (orchestrator step that enforces `gatewayReady === true`,
   `submission-package-orchestrator.ts:1184–1258`). UAT does not transmit unless
   `gatewayReady` is true.

### 5.2 Invoke the gateway transmit

POST against the staging endpoint (`environment: 'staging'`):

```http
POST /api/mdx/gateways/fda/esg/transmit
Content-Type: application/json
Authorization: ...

{
  "packageId": <packageId>,
  "programId": "<programId>",
  "environment": "staging",
  "submissionType": "original",
  "reason": "FDA ESG production UAT, Path-to-GA §C.6",
  "metadata": {
    "applicationId": "IND123456",
    "sequence":      "0001"
  }
}
```

Expect HTTP 201 with a `data` payload shaped like `GatewayTransmitResult`
(`types.ts:145–153`):

```json
{
  "data": {
    "transmittalId":  <number>,
    "transmissionId": "<MDN message-id from response>",
    "status":         "received",
    "transport":      "as2",
    "httpStatus":     200,
    "ackReceivedAt":  "<ISO-8601>",
    "message":        "FDA ESG AS2 transmit accepted. MDN: <id>."
  }
}
```

`status: 'received'` is set on a 2xx HTTP response (`fda-esg.ts:412–420`) and means ack1
(receipt-of-transmission, gateway-level) — not ack2 (FDA accepted) and not ack3 (center
accepted). Do not declare UAT success on this alone. See §8.

### 5.3 Capture ack1 (MDN)

The MDN is returned in the synchronous HTTP response body. The gateway reads the
`message-id` response header (`fda-esg.ts:399–400`) and stamps it on the transmittal row as
`transmission_id`. Fetch the raw response for the UAT record:

```bash
# Returns text/plain summary today (synthesized; fda-esg.ts:484–489)
curl -i "$APP_URL/api/mdx/gateways/transmittals/<transmittalId>/ack"
```

Save the raw HTTP response body of the original `POST /transmit` (the AS2 MDN bytes) — the
synthesized text from `downloadAcknowledgment` is a UI rendering, not the actual MDN. The
gateway does not currently persist the raw MDN. **Flagged as engineering follow-up.**

### 5.4 Wait for ack2 and ack3

ack2 (virus scan + structure check) and ack3 (CDER/CDRH/CBER acceptance) are emitted
asynchronously by FDA hours–days later. The gateway does not poll for them today
(`fda-esg.ts:442–464`); UAT verification is manual:

1. Sign into the FDA ESG WebTrader portal as the sponsor.
2. Find the submission by `applicationId` + `sequence`.
3. Confirm ack2 appears with disposition `accepted`; record the timestamp.
4. Confirm ack3 appears with disposition `accepted`; record the timestamp + the center
   (CDER / CDRH / CBER).

Manually patch the transmittal row to reflect each ack — the orchestrator UI consumes the
`status` enum (`types.ts:74–76`):

```sql
UPDATE submission_transmittals
   SET status = 'ack1_received', ack_received_at = NOW(), updated_at = NOW()
 WHERE id = <transmittalId>;
-- after ack2 lands in WebTrader:
UPDATE submission_transmittals
   SET status = 'ack2_received', updated_at = NOW()
 WHERE id = <transmittalId>;
-- after ack3:
UPDATE submission_transmittals
   SET status = 'ack3_received', updated_at = NOW()
 WHERE id = <transmittalId>;
```

(Manual patching is acceptable during UAT only. Automated ack polling is the GA-1 follow-up
called out in §1.)

---

## 6. Backup window scheduling guidance

- Hold the transmit window between **Monday and Thursday, 09:00–15:00 ET**. FDA ESG ops
  staffing is thinnest outside business hours; ack2 / ack3 chase is hard on a Friday
  afternoon.
- Open the FDA ESG help-desk ticket before the transmit, not after. Reference the sponsor
  account ID, the test `applicationId`, and the planned UTC transmit time.
- Reserve a 90-minute pairing slot covering Regulatory Ops, Platform, and QA for the
  transmit itself. ack1 lands inside that window; ack2 / ack3 do not.
- Pre-stage the test bundle, env vars, and smoke-script output in the runbook artifact
  before opening the window. The actual transmit is one HTTP call — the work is in the
  before-and-after.

---

## 7. Rollback procedure

**You cannot un-transmit.** Once the AS2 POST returns a 2xx (`fda-esg.ts:412`) or the
SFTP PUT lands in `/incoming/` (`fda-esg.ts:307`), the bytes are with FDA. The rollback is
in our own state, not theirs.

If the transmit completed but is wrong (wrong bundle, wrong application number, wrong
sequence):

1. **Mark the transmittal failed in the orchestrator state.** Run:

   ```sql
   UPDATE submission_transmittals
      SET status = 'rejected',
          error_class = 'gateway',
          error_message = 'Manual rollback — incorrect submission. See ticket <id>.',
          updated_at = NOW()
    WHERE id = <transmittalId>;
   ```

   This matches the error-class taxonomy in `types.ts:83–88` and how the gateway itself
   writes failures (`fda-esg.ts:421–438`).

2. **Flag for human review.** File the WebTrader retraction request with the FDA ESG help
   desk — only FDA can mark the submission rejected on their side; we cannot.

3. **Record a governed action.** The transmit route writes a `sign` governed action after
   successful transmit (`mdx-submission-gateway.ts:326–342`); the rollback needs a sibling
   `unsign`-style action explaining why. **Flagged as engineering follow-up** — there is no
   existing `recordGovernedAction` shape for rollback; for UAT, record the action manually
   in the audit log channel.

4. **Block any further transmit on the same package** until the WebTrader retraction is
   confirmed. The orchestrator does not have a per-package transmit lock today —
   **flagged as engineering follow-up**.

If the transmit failed at the AS2 layer (4xx/5xx HTTP, `fda-esg.ts:402–411`) the gateway
already marked the row `rejected` with `error_class = 'gateway'` — no rollback needed beyond
ticketing FDA for an explanation.

---

## 8. SFTP fallback verification

The gateway selects SFTP when `bundle.sizeBytes > 1_073_741_824` (1 GB; `fda-esg.ts:346`).
This is the **only** trigger today — there is no operator flag, no per-org override, and no
manual selection. **Flagged as engineering follow-up** if Regulatory Ops wants SFTP-by-policy
for specific submission types.

Run the SFTP exercise exactly once during UAT, with an explicitly oversized synthetic bundle:

1. Build a synthetic test eCTD bundle ≥ 1.0 GiB. The bundle-integrity gate requires the
   on-disk SHA-256 to match the descriptor (`fda-esg.ts:361`).
2. Confirm the SFTP env vars are set (§3) — otherwise `transmitViaSftp` throws
   `CredentialError` at `fda-esg.ts:271–276`.
3. Confirm `ssh2-sftp-client` is installed: `node -e "require('ssh2-sftp-client')"`. The
   package is loaded by dynamic import at `fda-esg.ts:283–291`; if missing, the gateway
   throws `TransportError` with a specific install hint.
4. Transmit. Expect `GatewayTransmitResult.transport === 'sftp'` and
   `result.transmissionId` of the form `sftp-<applicationId>-<sequence>-<epoch-ms>`
   (`fda-esg.ts:305`). The remote path is `/incoming/<applicationId>/<sequence>/<id>.zip`
   (`fda-esg.ts:306`).
5. **The post-upload status is `in_transit` with `ackReceivedAt = null`** — not `received`.
   This is the regression-locked contract from `__tests__/fda-esg-sftp-ack.test.ts`. An
   SFTP PUT only deposits the bundle in FDA's `/incoming/`; FDA picks it up async and emits
   ack1/2/3 over `/outgoing/` (`fda-esg.ts:365–369`).
6. Verify the file landed via the FDA ESG WebTrader portal's "outbound queue" view. Today
   we have no `/outgoing/` reader (`fda-esg.ts:467–471`), so post-upload ack verification is
   manual exactly like §5.4.

---

## 9. Acceptance criteria

UAT passes only when **every** item below is true.

### AS2 path

- [ ] `isConfigured(orgId, 'staging')` returns `true` (`fda-esg.ts:326–333`).
- [ ] Pre-flight (§4) all green.
- [ ] `POST /transmit` returns HTTP 201 with a `data` payload where:
  - `transport === 'as2'`
  - `httpStatus === 200` (or any 2xx; `fda-esg.ts:402`)
  - `status === 'received'`
  - `transmissionId` is a non-empty MDN message-id
  - `ackReceivedAt` is non-null
- [ ] `submission_transmittals` row written with `status = 'received'`, `transmission_id`,
      `http_status`, `ack_received_at` (`fda-esg.ts:412–415`).
- [ ] One row in `submission_gateway_credentials` for (orgId, 'staging') with
      `status = 'active'` (`fda-esg.ts:91–102`).
- [ ] `submission_governed_actions` carries one `command = 'sign'` entry for the
      transmittal (`mdx-submission-gateway.ts:326–342`).
- [ ] ack2 observed in WebTrader within FDA's published SLA (typically <24 h); transmittal
      manually patched to `ack2_received`.
- [ ] ack3 observed in WebTrader from the correct center (CDER for IND); transmittal
      manually patched to `ack3_received`.

### SFTP path (exercise once)

- [ ] `POST /transmit` with a >1 GB bundle returns:
  - `transport === 'sftp'`
  - `status === 'in_transit'` (NOT `received`)
  - `ackReceivedAt === null`
  - `transmissionId` matches `/^sftp-<appId>-<seq>-\d+$/`
- [ ] No `ack_received_at` written on the transmittal row at upload time (the regression
      lock in `__tests__/fda-esg-sftp-ack.test.ts`).
- [ ] The file is visible in WebTrader's outbound queue with the expected remote path.
- [ ] ack1/2/3 observed in WebTrader; transmittal manually patched.

---

## 10. Common failure modes and diagnostics

| Symptom | Where in code | Likely root cause | First diagnostic |
| --- | --- | --- | --- |
| `CredentialError: missing credentials: FDA_ESG_STAGING_*` | `fda-esg.ts:81–88` | One or more env vars not set in the platform secrets manager. | Re-run the smoke script (§9 below); it lists every missing var. |
| `TransportError: ESG AS2 POST failed: ...` with TLS message | `fda-esg.ts:256` + Node TLS | Cert chain mismatch — usually the FDA cert (`FDA_ESG_STAGING_FDA_CERT_PATH`) is stale. | Re-run §4.2 with `-showcerts`; compare issuer chain to FDA's published cert. |
| `TransportError: ESG AS2 POST timeout` | `fda-esg.ts:257` | 60-second HTTPS timeout reached (`fda-esg.ts:246`). FDA endpoint slow or network egress blocked. | `curl -v --connect-timeout 10` against the host; check egress firewall. |
| Cert pair mismatch — handshake fails immediately | `fda-esg.ts:236–247` | `CERT_PATH` and `KEY_PATH` don't match. | §4.1 — modulus MD5 must match. |
| Client cert expired | `fda-esg.ts:104–108` (load) → TLS handshake | Cert past `notAfter`. | `openssl x509 -noout -dates -in $CERT_PATH`. |
| `GatewayError: FDA ESG AS2 returned HTTP 401/403` | `fda-esg.ts:402–411` | Sponsor cert not registered against the `AS2_FROM` identity at FDA. | Open FDA ESG help-desk ticket with sponsor ID + cert fingerprint. |
| `GatewayError: FDA ESG AS2 returned HTTP 4xx` (body indicates envelope) | `fda-esg.ts:402–411` | AS2-To wrong, AS2 version mismatch, or sync-MDN not supported for your sponsor profile. | Re-read §4.3; if FDA needs async MDN, raise as engineering follow-up — `buildAs2Headers` is hard-coded. |
| MDN message-id missing in response headers | `fda-esg.ts:399–400` | FDA returned 2xx but no `Message-ID` header. Gateway falls back to the request's own `messageId`. | The transmit row records the fallback id; reconcile manually against WebTrader. |
| `TransportError: ssh2-sftp-client` not installed | `fda-esg.ts:283–291` | Optional dependency missing on the running host. | `npm install ssh2-sftp-client` on the target environment. |
| `CredentialError` on SFTP path even though AS2 vars set | `fda-esg.ts:271–276` | `FDA_ESG_STAGING_SFTP_*` not set, but bundle exceeded 1 GB so the gateway selected SFTP. | Either reduce bundle size or set the SFTP env vars; SFTP selection is size-only. |
| AS2 transmit succeeds but ack2 never arrives | n/a — our side is done | Submission failed FDA's structure check. | Pull the ack2 from WebTrader; the body explains the failure. |
| Orchestrator says `gatewayReady: false`; transmit refused | `submission-package-orchestrator.ts:1184–1258` and `mdx-submission-gateway.ts` 412 from `CredentialError` | Hardened validator found errors — must fix and re-assemble. | Inspect the `findings` payload returned by the validate-hardened route. |
| `ValidationError` (HTTP 422) from `/transmit` | `mdx-submission-gateway.ts:362–364`; raised by `readVerifiedBundle` (`fda-esg.ts:386`, `:361`) | On-disk bundle bytes don't match the recorded SHA-256. | Re-run §4.4; rebuild the bundle if hashes differ. |

---

## 11. Engineering follow-ups discovered during runbook authoring

These are not blockers for the staging UAT itself but should be tracked against GA-1 /
GA-2 follow-on tickets.

- **PKCS#7 / CMS envelope.** Today the AS2 body is detached-signed only; full sign+encrypt is
  flagged in the file header (`fda-esg.ts:125–131`). FDA accepts TLS-protected AS2 in
  practice; confirm in writing per sponsor profile before relying on it for production
  payloads.
- **Raw MDN persistence.** `fda-esg.ts:399–420` only retains the MDN message-id, not the
  MDN body. `downloadAcknowledgment` (`fda-esg.ts:466–490`) synthesises a text summary
  from DB state. A real MDN audit trail needs the raw response stored against the
  transmittal row.
- **Async ack polling.** `checkStatus` returns DB state (`fda-esg.ts:442–464`); ack2 / ack3
  must be patched manually today. A `/outgoing/` poller (SFTP) and / or async-MDN webhook
  (AS2) is the production path.
- **Hard-coded AS2 headers.** `buildAs2Headers` (`fda-esg.ts:142–156`) pins AS2-Version,
  filename, sync MDN, and content-type. Any sponsor profile that needs different values is
  a code change, not a config change.
- **SFTP selection trigger.** The 1 GB threshold (`fda-esg.ts:346`) is the sole switch.
  No operator-driven SFTP-by-policy.
- **Rollback governed-action shape.** `recordGovernedAction` (`mdx-submission-gateway.ts:326`)
  has no companion "rollback" / "void" command. UAT rollbacks are recorded manually.
- **Per-package transmit lock.** Nothing today prevents a second `transmit` against the
  same package after a rollback. Worth a TIER-2 follow-up before GA-1.
- **Staging variant of AS2-To.** `FDA_ESG_STAGING_AS2_TO` is read (`fda-esg.ts:77`) but the
  same default (`FDA-CESUB`) applies to both staging and prod; confirm FDA uses the same
  AS2-To for the WebTrader test endpoint.

---

## 12. References

- Code: `/home/user/ClinicalSageAI-2-replit/server/services/submission-gateways/fda-esg.ts`
- Regression test: `/home/user/ClinicalSageAI-2-replit/server/services/submission-gateways/__tests__/fda-esg-sftp-ack.test.ts`
- Route layer: `/home/user/ClinicalSageAI-2-replit/server/routes/mdx-submission-gateway.ts`
- Smoke script: `/home/user/ClinicalSageAI-2-replit/scripts/fda-esg-uat-smoke.ts`
- Path-to-GA §C.6: `/home/user/ClinicalSageAI-2-replit/docs/reports/PATH_TO_GA_2026-06-29.md`
- Predecessor (pre-real-transport) doc: `/home/user/ClinicalSageAI-2-replit/docs/runbooks/esg-production-setup.md`
- RFC 4130 (AS2): <https://datatracker.ietf.org/doc/html/rfc4130>
- FDA ESG Technical Conformance Guide: per FDA publication (current revision; obtain from
  Regulatory Ops at runbook-execution time).
