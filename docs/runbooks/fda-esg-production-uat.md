# FDA ESG — Production UAT Runbook

**Status:** Pre-UAT. The transport code is real (`server/services/submission-gateways/fda-esg.ts`,
492 LOC, RFC-4130 AS2) but has never been exercised against the live FDA ESG
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
- Synchronous MDN capture. The gateway requests a signed receipt
  (`Disposition-Notification-Options: signed-receipt-protocol=required, pkcs7-signature;
  signed-receipt-micalg=required, sha-256`) and sends no `Receipt-Delivery-Option`, which
  means synchronous (`buildAs2Headers`, `as2-transport.ts`). *Corrected 2026-11-01 (F1): this
  line said the gateway sent `Receipt-Delivery-Option: sync`; it does not.*
- ack1 (gateway receipt), ack2 (virus + structure check), ack3 (center acceptance) capture
  via the FDA ESG WebTrader portal. ack2 / ack3 are async, hours–days.
- A package over 1 GiB is refused before anyone signs, by name (§8). There is no SFTP path to
  exercise: it was retired on 2026-11-09 (founder decision P-93).

Out of scope (defer to follow-on tasks):

- ~~PKCS#7 / CMS signed-and-encrypted AS2 payload.~~ *Done since `e1f3fd425` (2026-10-17):
  transmit signs the payload entity and encrypts it for FDA (`buildAs2CmsEnvelope`,
  `as2-cms.ts`), and a receipt counts only when FDA's signature verifies against the pinned
  certificate and its Received-Content-MIC matches (`classifyVerifiedAs2Delivery`). An answer
  that does not verify is downloaded as the platform's transmittal record, never as FDA's
  acknowledgement (2026-11-01, F1, DP-81). Note added 2026-11-01.*
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
| FDA AS2 identifier | Regulatory Ops | FDA's AS2 identifier for this environment, as issued at ESG registration — record the one FDA issued for each environment. Injected as `FDA_ESG_STAGING_AS2_TO` / `FDA_ESG_AS2_TO`. Required: there is no default, and transmit refuses with a `CredentialError` naming the variable when it is unset (2026-10-01, sweep F16 — it used to fall back to `FDA-CESUB`, a value with no FDA source, the same for both environments). |
| Sponsor mTLS cert + private key (PEM) | Platform | Pair issued or cross-signed for the FDA ESG endpoint. Same key is used for the AS2 detached signature (`fda-esg.ts:158–166`). |
| FDA AS2 public cert (PEM) | Platform | Used as the `ca` trust anchor for the mTLS handshake (`fda-esg.ts:244`); the field is also retained for future PKCS#7 encrypt-to-FDA. |
| Sponsor application number | Regulatory Ops | E.g. `IND123456`. Passed in `metadata.applicationId` (`fda-esg.ts:355–357`). |
| Test eCTD bundle | QA | A non-production package; SHA-256 must match the descriptor (`bundle-integrity.ts`). |
| FDA ESG ops contact | Regulatory Ops | Help-desk channel for ack troubleshooting during the backup window. |

---

## 3. Environment configuration

The gateway resolves credentials through `envFor(environment, key)` (`fda-esg.ts:62–68`).
For staging UAT, every variable is read with the `FDA_ESG_STAGING_` prefix. **Set every
variable in the platform secrets manager — never commit to `.env`.**

Required for AS2 (presence checked at `fda-esg.ts:81–88`):

```text
FDA_ESG_STAGING_URL              # e.g. https://esgtest.fda.gov/gateway   — fda-esg.ts:75
FDA_ESG_STAGING_AS2_FROM         # sponsor's AS2 identifier               — fda-esg.ts:76
FDA_ESG_STAGING_AS2_TO           # FDA's AS2 identifier for the test environment, as issued at ESG registration; required, never defaulted
FDA_ESG_STAGING_CERT_PATH        # absolute path to mTLS client cert PEM  — fda-esg.ts:78
FDA_ESG_STAGING_KEY_PATH         # absolute path to mTLS private key PEM  — fda-esg.ts:79
FDA_ESG_STAGING_FDA_CERT_PATH    # absolute path to FDA's AS2 public cert — fda-esg.ts:80
```

No `FDA_ESG*_SFTP_*` variable is read since 2026-11-09 (P-93). If a deployment set
`FDA_ESG_SFTP_HOST`, `_SFTP_USER`, `_SFTP_KEY_PATH` or their `STAGING_` forms, remove them,
and the key they point to, from the secrets store.

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

The gateway builds AS2 headers with `buildAs2Headers` (`as2-transport.ts`), and the smoke
script's `--print-envelope` (§9) now calls that same function with the envelope transmit sends.
Confirm the headers it prints are:

- `Message-ID` of the form `<uuid@${AS2_FROM}>`
- `AS2-From` matches `FDA_ESG_STAGING_AS2_FROM`
- `AS2-To` matches `FDA_ESG_STAGING_AS2_TO` (FDA's AS2 identifier for this environment; the smoke refuses to run without it)
- `AS2-Version: 1.2`
- `Disposition-Notification-To` is set to the sponsor (sync MDN)
- `Disposition-Notification-Options: signed-receipt-protocol=required, pkcs7-signature; signed-receipt-micalg=required, sha-256`
- no `Receipt-Delivery-Option` (its absence requests a synchronous receipt)
- `Content-Type: application/pkcs7-mime; smime-type=enveloped-data; name="smime.p7m"`
- `Content-Disposition: attachment; filename="smime.p7m"`

*Corrected 2026-11-01 (F1). This list, and the script, used to show signed receipts `optional`,
`Receipt-Delivery-Option: sync`, `application/octet-stream` and `ectd.zip`. Transmit sends
none of those. The script printed a hand-copied map, not the gateway's own headers.*

If your FDA ESG account profile expects different filename, AS2 version, or async MDN, raise
to engineering — those values are hard-coded in `buildAs2Headers` and changing them is a code
change, not a configuration change. **Flagged as engineering follow-up.**

### 4.4 Bundle integrity

The transmit path calls `readVerifiedBundle` (`fda-esg.ts`, AS2 transmit), which re-hashes the on-disk file and compares to the descriptor's `sha256`. Run
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

ack2 (virus scan and structure check) and ack3 (the center's validation result) arrive from FDA hours to days later.
FDA ESG's WebTrader was retired in April 2025 (`fda-esg.ts`, the header comment).

**The status is never patched by hand** (P-92, founder 2026-11-02: "no settlement by an unsigned action"). The earlier
`UPDATE submission_transmittals SET status = 'ack…_received'` statements in this section are retired. What records an
acknowledgement:

- **FDA's signed MDN:** "Record agency MDN" on Gateway transmittals (`ingestFdaAs2Receipt`). It checks FDA's signature,
  the original message and the payload MIC, and records the send by FDA's own answer.
- **A send that is held** (handed to the gateway, with no verified answer): it is settled from the sequence's Dispatch
  tab by a signed act (`settleHeldSend`, `POST /api/submissions/sequences/:seqId/held-send/settle`).
  - It is recorded as received on FDA's Ack2 or Ack3, kept in the project's Vault.
  - Or it is released as not received, on FDA's written confirmation, or on the platform's own proof that nothing left
    (P-108 1(b)).
  - See `docs/runbooks/ectd-transmit-path.md`, "A held send".

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

## 7. When a send went wrong

**You cannot un-transmit.** Once the AS2 POST returns a 2xx, the bytes are with FDA.

**The manual rollback that was here is retired, on both spines** (P-92, founder 2026-11-02: "no settlement by an
unsigned action" and "the removed rollback route stays removed"; the route's removing commit `6ef0ef121`). No SQL marks a
transmittal rejected by hand. Instead:

- **A filing that went out wrong** is taken back by a **withdrawal sequence**, sent from Submission Center (sequence
  type `'withdrawal'`, `server/routes/submissions.ts`), as the removing commit says.
- **A send held with no verified answer** is settled by the signed act in §5.4. Its release states the duplicate-filing
  risk to the signer before they sign.
- **On the package spine there is no signed settlement yet.** `/api/submission-ops/packages/*` is retired (P-103), so the
  sequence is the one filing path. A package-spine held send is escalated (design §7 item 12), with no SQL. The
  expected count is zero; the query in `ectd-transmit-path.md`, "A held send", counts it.

A transmit that failed at the AS2 layer (4xx or 5xx) is already recorded by the gateway with its error. Nothing more is
written by hand.

---

## 8. A sequence over 1 GiB is refused before signing (P-93)

Founder decision P-93 (`docs/LAUNCH_DEFINITION_OF_DONE.md`, 2026-11-02): FDA sequences over
1 GiB are out of scope for launch. The SFTP branch that took them was retired on 2026-11-09:
no FDA source on file documents an SFTP channel, and its module was never installed, so every
such send was refused after the signature.

**1 GiB is Concept2Cure's launch scope, not FDA's limit.** FDA's only limit on file is 10 GB
(Form 5640 v2.0, `FDA_GATEWAY_LIMIT_BYTES`). Between 1 GiB and 10 GB FDA still takes the
sequence through the ESG, so never point a person to physical media or "another channel".

What a person reads, verbatim (the size is measured on the assembled package):
- **Transmit, on the click** (the e-signature never opens): "Transmit of sequence 0003 not
  started — Refusing to transmit: the package is 1.27 GiB, and at launch Concept2Cure sends
  packages of up to 1 GiB to FDA. The sequence is dispatched, so its leaves can no longer be
  changed, and it cannot be sent as it is. Nothing was signed."
- **Freeze**, while the leaves can change: "Refusing to freeze: the package is 1.27 GiB, and
  at launch Concept2Cure sends packages of up to 1 GiB to FDA. Remove some of its leaves and
  place them in a later sequence, so that each package is 1 GiB or less. Transmit would refuse
  this package, and once the sequence is frozen its leaves can no longer be changed."
- **Any other caller of the FDA ESG gateway** (the package spine, AnA's 510(k) transmit, the
  smoke script): "Refusing to transmit to FDA: the package is 1.27 GiB, and at launch
  Concept2Cure sends packages of up to 1 GiB to FDA. Nothing was sent." No transmittal row is
  written.

Where it lives: `LAUNCH_SEQUENCE_MAX_BYTES` and `launchSequenceSizeRefusal`
(`server/services/ectd/ectd-regional-rules.ts`), applied by `sequenceTransmitReadiness`,
`assertSequencePackageable` and `transmitDispatchedSequence`
(`server/services/submission-service/submission-service.ts`) and by `FdaEsgGateway.transmit`
(`fda-esg.ts`). Evidence: `docs/evidence/D7-ONE-GIB-LAUNCH-CEILING/2026-11-09/`.

**Rows the retired branch left (read-only; run as the database owner, RLS would scope it).**
A person decides what each means; nothing is patched by hand.

```sql
-- Transmittals the SFTP branch recorded. Since 2026-10-17 each is bound to a
-- sequence's attempt; every one was refused before any connection.
SELECT organization_id, id, status, transmission_id, created_at,
       metadata->'dispatchBinding'->>'sequenceId' AS sequence_id,
       metadata->>'environment' AS environment
  FROM submission_transmittals
 WHERE region = 'fda' AND gateway = 'esg' AND transport = 'sftp'
 ORDER BY organization_id, created_at;

-- Sequences still held 'transmitting'. One with no attempt or signature bound
-- predates the per-attempt binding (2026-10-17); it is escalated, never reset by
-- hand (the P-92 / P-93 joint question to the founder).
SELECT organization_id, id, sequence_number, dispatch_status,
       transmit_attempt_id IS NULL OR transmit_signature_action_id IS NULL AS legacy_unbound
  FROM ectd_sequences
 WHERE dispatch_status = 'transmitting' AND deleted_at IS NULL
 ORDER BY organization_id, id;
```

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
- [ ] ack2 recorded by FDA's signed MDN ("Record agency MDN") or by the signed settlement (§5.4), never by a manual
      status patch.
- [ ] ack3 from the correct center (CDER for an IND) recorded the same way.

### A sequence over 1 GiB (P-93)

- [ ] The transmit click on an FDA sequence whose package is over 1 GiB shows the §8 refusal,
      and no e-signature opens.
- [ ] No `submission_transmittals` row and no signature are written for it.

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
| "Refusing to transmit: the package is … at launch Concept2Cure sends packages of up to 1 GiB to FDA" | `launchSequenceSizeRefusal` (`ectd-regional-rules.ts`) | The assembled package is over 1 GiB (P-93). | Before freeze, move leaves to a later sequence. After freeze the leaves are locked; see §8. |
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
  must be patched manually today. An async-MDN webhook (AS2) is the production path.
- **Hard-coded AS2 headers.** `buildAs2Headers` (`fda-esg.ts:142–156`) pins AS2-Version,
  filename, sync MDN, and content-type. Any sponsor profile that needs different values is
  a code change, not a config change.
- **Sequences over 1 GiB.** Out of scope for launch (P-93, §8). The only FDA limit on file is
  10 GB; carrying more than 1 GiB is a founder decision.
- **Rollback governed-action shape.** `recordGovernedAction` (`mdx-submission-gateway.ts:326`)
  has no companion "rollback" / "void" command. UAT rollbacks are recorded manually.
- **Per-package transmit lock.** Nothing today prevents a second `transmit` against the
  same package after a rollback. Worth a TIER-2 follow-up before GA-1.
- **Staging variant of AS2-To.** `FDA_ESG_STAGING_AS2_TO` and `FDA_ESG_AS2_TO` are each
  required, with no default and no fallback from one environment to the other (2026-10-01,
  sweep F16 — both used to default to the same `FDA-CESUB`, a value with no FDA source). Set each to the AS2
  identifier FDA issued for that environment at ESG registration.

---

## 12. References

- Code: `/home/user/ClinicalSageAI-2-replit/server/services/submission-gateways/fda-esg.ts`
- Regression tests: `server/services/submission-gateways/__tests__/fda-esg-hardening.test.ts` (the 1 GiB refusal), `server/services/submission-service/__tests__/launch-sequence-size.pglite.test.ts`
- Route layer: `/home/user/ClinicalSageAI-2-replit/server/routes/mdx-submission-gateway.ts`
- Smoke script: `/home/user/ClinicalSageAI-2-replit/scripts/fda-esg-uat-smoke.ts`
- Path-to-GA §C.6: `/home/user/ClinicalSageAI-2-replit/docs/reports/PATH_TO_GA_2026-06-29.md`
- Predecessor (pre-real-transport) doc: `/home/user/ClinicalSageAI-2-replit/docs/runbooks/esg-production-setup.md`
- RFC 4130 (AS2): <https://datatracker.ietf.org/doc/html/rfc4130>
- FDA ESG Technical Conformance Guide: per FDA publication (current revision; obtain from
  Regulatory Ops at runbook-execution time).
