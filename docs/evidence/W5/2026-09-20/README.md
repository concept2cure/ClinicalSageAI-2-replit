# W5 evidence — submission transports and licensed artefacts, 2026-09-20

**Row moved:** D7 (one real sequence) — the engineering half: B16 (510(k) ESG
transport) and B7 (E2B(R3) ICSR transport) are closed in code with tests; B2
(eSTAR field maps for the two vendored PDFs) is verified by round trip.
**Blocked:** the free-download half — B3, B14, B21 and the three PreSTAR PDFs
(B1) — because this build environment's egress proxy refuses every agency host
(403 to CONNECT, an organisation policy denial). Nothing was vendored from a
guess or a mirror. See `downloads-BLOCKED.md`.

D7 stays **not green**: preflight is still 2/15 and readiness 4/40, exactly as
before, because every row those scripts observe is a licensed artefact or a
credential that only a network-permitted machine / Regulatory Ops can supply.
What changed is that the two rows that were *engineering* blockers are no
longer: credentials now buy a real transmission attempt instead of a second
refusal.

## What was built

### B16 — one ESG transport, plus the NextGen REST option
- The product's 510(k) transmit (`k510_workflow.transmit` in
  `server/services/ana-ri/mdx-command-handlers.ts`) already ran
  `executeGovernedTransmit` → `getGateway('fda','esg')` → the real AS2 code
  (the parallel `ESGSubmissionService` was deleted in an earlier session). This
  session kept every governed precondition (verified actor, §11.50 meaning,
  re-auth instant, `yes-transmit` + 30-char reason, server-computed package
  gate) and added the second transport:
- `server/services/submission-gateways/as2-transport.ts` — the AS2 envelope,
  body signing, mTLS POST and MDN interpretation, **extracted** from
  `fda-esg.ts` so the ICSR path reuses the one implementation (zero duplication).
- `fda-esg.ts` — `FDA_ESG_TRANSPORT` (`as2` default | `rest`), REST credential
  resolution (`FDA_ESG_REST_URL`, `FDA_ESG_REST_CLIENT_ID`,
  `FDA_ESG_REST_CLIENT_SECRET`, `FDA_ESG_REST_SUBMITTER_ID`; staging prefix
  `FDA_ESG_STAGING_`), all documented in the file header. With `rest`
  selected the gateway raises the new typed `UnverifiedTransportError`
  (`types.ts`; `transmitted: false`) **before any transmittal row exists and
  before any socket opens**, because FDA's ESG NextGen wire contract has not
  been verified against FDA documentation or exercised in FDA's UAT. It is a
  refusal, not a stub. An unrecognised transport value is refused too.
- `mdx-command-handlers.ts` maps it to `TRANSPORT_NOT_VERIFIED` with no `data`
  (no identifier minted for a transmission that never happened).

### B7 — ICSR transport attempts the real call when configured
- `server/services/ind-lifecycle/icsr-gateway-transport.ts` (this is where the
  E2B transport lives; there is no `pharmacovigilance/**/icsr-gateway-transport*`)
  no longer throws "not implemented" when a gateway is configured. AS2 (shared
  module; `ICSR_GATEWAY_USERNAME` as AS2-From, `ICSR_GATEWAY_CERT_PATH`,
  `ICSR_GATEWAY_KEY_PATH`, `ICSR_GATEWAY_AS2_TO`, optional
  `ICSR_GATEWAY_AGENCY_CERT_PATH`) or HTTPS Basic upload
  (`ICSR_GATEWAY_USERNAME` + `ICSR_GATEWAY_PASSWORD`); `ICSR_GATEWAY_PROTOCOL`
  overrides. `transmitted` only on a 2xx whose MDN accepts the very message
  sent (AS2) or that returns a receipt identifier (HTTPS); every other outcome
  is a typed `IcsrGatewayTransmitError` / `IcsrGatewayNotConfiguredError`
  (naming the missing variables), audited as a refusal. Unconfigured in
  production still throws; unconfigured outside production still returns the
  `SIMULATED-` receipt that `markIcsrTransmitted` refuses. A transport receipt
  is explicitly not the E2B ACK; the ACK is recorded separately.

### B2 — eSTAR field maps for the two vendored PDFs
- Already populated (XFA SOM paths, 20 keys for `510k-device`, 19 for
  `510k-ivd`); the PreSTAR descriptors stay `{}` with the fail-closed comment.
  `b2-estar-field-map-roundtrip.txt` is this session's verification: pdf-lib
  sees **0 AcroForm fields** in both PDFs (they are dynamic XFA —
  `isDynamicXfaPdf: true`), so the runbook's AcroForm procedure cannot apply
  and the XFA `datasets` path is the correct one; every mapped path is declared
  by its template, a sample fill writes 20/19 fields with 0 skips and 0
  warnings, and read-back matches on all 22/21 paths with the original template
  bytes preserved as the prefix of the output.

### Readiness report
- `scripts/ops/ga-readiness-report.mjs`: the `icsr-gateway` row now observes the
  variables the selected protocol needs (ready when present) instead of the
  stale "transport client is not implemented"; the `gateway:fda:esg` row reads
  the REST variables when `FDA_ESG_TRANSPORT=rest` and reports that
  configuration **blocked with the unverified-contract reason**, never ready.
  `ga-readiness-row-checks.txt` shows each row in its fail and pass states.

## Evidence in this folder

| File | What it shows |
|---|---|
| `before/submission-preflight.txt`, `before/ga-readiness-report.txt` | 2/15 and 4/40 before any change |
| `after/submission-preflight.txt`, `after/ga-readiness-report.txt` | 2/15 and 4/40 after — same counts; the ICSR row's observation is now honest |
| `after/ga-readiness-row-checks.txt` | the two changed rows exercised in fail and pass states |
| `after/vitest-transports.txt` | 7 files / 81 tests: no credentials ⇒ typed refusal naming the vars; credentials + mocked 200 ⇒ ack recorded (AS2 MDN); mocked non-2xx / rejecting MDN / wrong-message MDN / no-disposition / socket error ⇒ typed refusals; REST ⇒ `UnverifiedTransportError`, no row, no socket; dispatch gate blocks on validator errors, missing evidence, namespace escape, unassembled package |
| `after/vitest-estar.txt` | 3 files / 79 tests on the eSTAR fill, field-map behaviour and template registry |
| `after/b2-estar-field-map-roundtrip.txt` | pdf-lib AcroForm enumeration + XFA fill/read-back for both 510(k) descriptors |
| `after/qualify-ectd.txt` | `npm run qualify:ectd` — Overall PASS, 5/5, still noting "no DTDs vendored" |
| `after/tsc-changed-files.txt` | `tsc --noEmit` over the changed files: 0 errors attributed to W5 files (7 pre-existing elsewhere in the closure) |
| `after/eslint-changed-files.txt` | eslint: 0 errors; warnings are pre-existing size/complexity rules |
| `downloads-BLOCKED.md`, `proxy-status-after-download-attempts.json` | every agency URL tried for B3/B14/B21/B1 and the proxy's per-host 403 record |

## Not done, and why
- **B3 / B14 / B21 / B1 downloads** — egress policy denial; must be fetched from
  a network-permitted machine (procedure in `downloads-BLOCKED.md`).
- **ESG NextGen REST real call** — needs FDA's API documentation and a
  pre-production round trip; until then it refuses by type.
- **PKCS#7 S/MIME on AS2** — unchanged gap, documented in `as2-transport.ts`;
  confirm with FDA during UAT (`docs/runbooks/fda-esg-production-uat.md`).
- **`docs/runbooks/esg-production-setup.md`** is stale (still names the deleted
  `ESGSubmissionService` and `Status: TODO`); outside this session's file
  scope — flagged for the control tower.
