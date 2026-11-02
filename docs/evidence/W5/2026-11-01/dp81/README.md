# DP-81 — FDA's acknowledgement is FDA's only when it was verified (F1, 2026-11-01)

**Finding.** DP-81 of the 2026-10-19 security review (`docs/evidence/reviews/2026-10-19/security.md`,
README row L-4/DP-81), confirmed by two lenses and handed to another session, which never took it up.
Any answer on the pinned FDA ESG AS2 URL was served as `provenance: 'agency'`. That included a proxy's
502 page and an MDN that did not verify against FDA's pinned certificate. The file was named
`agency-acknowledgement-<id>.txt` and the download was recorded in the audit trail as the agency's.
Three paths served it:
- the Gateway transmittals download;
- `GET /api/mdx/gateways/transmittals/:id/ack`;
- AnA's `get_submission_ack`.

**Package.** F1 (Repairs). The files are unheld in `.design/claude-convergence/COORDINATION.md`. One
file is outside S5's paths: the script under `scripts/`.

## What already exists (RULE 3)

| Path | What it does | What it did not do |
|---|---|---|
| `server/services/submission-gateways/as2-cms.ts` | `verifyAs2CmsReceipt` verifies against the pinned certificate; `as2MicMatches`; `buildAs2CmsEnvelope` builds the envelope transmit sends | — |
| `as2-transport.ts` `classifyVerifiedAs2Delivery` | The verified AS2 verdict, used by FDA ESG, the receipt upload and the ICSR transport | Delegated non-2xx answers to an exported syntax-only twin, `classifyAs2Delivery`, which called an unsigned MDN RECEIVED |
| `fda-esg.ts` `as2ReceiptMetadata` | Records `verified` on every kept answer | — |
| `fda-esg.ts` `downloadAcknowledgment` | Serves a kept answer | Ignored `verified`; also served any `mdn_raw` as 'agency' |
| `acknowledgement.ts` `platformTransmittalRecord` | The honest record ("THIS IS NOT AN AGENCY ACKNOWLEDGEMENT"), plus its filename | — |
| `fda-esg-receipts.ts` `ingestFdaAs2Receipt` (held by RIM) | Re-verifies an uploaded signed MDN and records `verified: true` | Overwrites the endpoint's earlier answer (part 2 of DP-81) |
| `scripts/fda-esg-uat-smoke.ts` | The UAT pre-flight | Printed a hand-copied header map that transmit never sends |

## What changed

1. **`downloadAcknowledgment`.** It returns `'agency'` only for a kept receipt whose `verified` is
   `true`. Every other row gets the platform record:
   - an unverified answer;
   - a receipt with no flag;
   - an `mdn_raw` kept by the syntax-only judge before 2026-10-17.

   The record names the kept answer by HTTP status, size and SHA-256, so an auditor can match it to the
   row. The bytes on the row are unchanged.
2. **One AS2 verdict.** `classifyAs2Delivery` is deleted. `classifyVerifiedAs2Delivery` answers
   failed and non-2xx attempts through `classifyDelivery` as before, so production behaviour is
   unchanged. Two pieces of dead scaffolding are deleted with it: `signAs2Body` (a bare RSA signature)
   and `As2Message.signaturePem`. A comment that said the MIC and signature were "still not verified"
   now carries a dated correction.
3. **One envelope definition.** `AS2_ENVELOPE_CONTENT_TYPE` and `AS2_ENVELOPE_FILENAME` live in
   `as2-cms.ts`, and FDA ESG, the ICSR transport and the pre-flight all read them. The pre-flight
   prints `buildAs2Headers`' own output. The runbook's §4.3 acceptance list is corrected to match.

## Tests: red first, then green

| Run | File | Result |
|---|---|---|
| Red, before the fix | `red-first-ack-provenance.txt` | 4 of 9 red: the 502 page, the unsigned 200 MDN, the receipt with no flag and the legacy `mdn_raw` row each served as 'agency' |
| Red, before the fix | `red-first-as2-verdict-and-preflight.txt` | `classifyAs2Delivery` returned RECEIVED for an unsigned MDN; the pre-flight printed `optional` where transmit sends `required` |
| Mutant: the `verified` clause removed | `mutant-verified-clause-reverted.txt` | 3 red |
| Green | `green-importing-suites.txt` | 34 suites importing the changed modules: 651 pass. The 6 failures are all in `tests/lineage/founder-path-lineage.pglite.test.ts` and fail identically at HEAD `5f30fdda0d` (`pre-existing-founder-path-lineage-at-head-5f30fdda0d.txt`; its transmit hop gets a 500 from the submissions route). |
| Lint | `eslint-changed-files.txt` | 0 errors. The `max-lines` warnings on `fda-esg.ts` and `fda-esg-hardening.test.ts` are already on trunk; the warning count does not change |

**A pinned test changed on purpose.** In `ack-received-at-not-invented.test.ts`, "serves a stored MDN
… without inventing one" asserted 'agency' for an unsigned MDN that nothing verified. It pinned
DP-81, and it now asserts the platform record. In `fda-esg-hardening.test.ts`, the mocked SELECT
accepts the added `http_status` column. Its download case still serves the agency's bytes, because
its transmitted receipt was verified.

## Not done here

- **Part 2 of DP-81: a receipt upload overwrites the endpoint's earlier answer.** The overwrite is in
  `ingestFdaAs2Receipt` (`fda-esg-receipts.ts:74-89`): it replaces `metadata.as2Receipt` and
  `mdn_raw`. That file is held by RIM, so this part goes to RIM (see `../README.md`).
- **Historic downloads already recorded as 'agency'.** The export audit rows written by
  `mdx-submission-gateway.ts` stay as recorded. Whether sponsors who filed such a download need a
  notice is the founder's decision.
- **MR-10 acceptance (b)** names `classifyAs2Delivery`, which no longer exists. Its intent, that an
  unsigned MDN is never RECEIVED, is pinned by "none calls an unsigned, tied, accepting 2xx MDN
  RECEIVED" in `as2-cms.test.ts`.

## For P-96: the records that need the correction (for RIM)

P-96 (founder, 2026-11-02, "mark it in the product") gives every acknowledgement that was recorded as
FDA's before this fix, and that nothing verified, an audit-trailed correction and a visible note on its
submission. RIM owns the change. These are the record shapes, read from the code at `8d5bbef3bc^`
(before) and HEAD (after).

**1. Transmittals whose download was served as `'agency'` before `8d5bbef3bc` and is not now.** All
are in `submission_transmittals` with `region = 'fda'` and `gateway = 'esg'`.

| Shape | How it arose | Served before | Served now |
|---|---|---|---|
| `metadata->'as2Receipt'->>'bodyBase64'` non-empty and `metadata->'as2Receipt'->>'verified'` not `'true'` (false or absent) | Transmit since `e1f3fd425` (2026-10-17) kept every answer on the pinned URL: a proxy page, an unsigned MDN, an MDN for another message or MIC. The row is usually `in_transit` | `'agency'`, the answer's bytes, named `agency-acknowledgement-<id>.txt` | the platform record |
| `mdn_raw` non-empty and no `metadata->'as2Receipt'` | Before `e1f3fd425`, the syntax-only judge wrote `mdn_raw` for received, refused and unconfirmed answers (any status, including `received` and `rejected`); after it, only a failed `as2Receipt` write | `'agency'`, `mdn_raw` as UTF-8, `application/octet-stream` | the platform record |

**Not affected.**
- A row whose `as2Receipt.verified` is `true`. That covers a receipt verified at transmit, and a signed
  MDN uploaded through `As2ReceiptUpload` (`ingestFdaAs2Receipt` writes `verified: true` and the same
  bytes to `mdn_raw`).
- A row with neither field; it was always the platform record.

**2. What was handed out, recorded per download.** Each download wrote one `audit_logs` row before
delivery (`sendAuditedDownload` in `server/services/export/governedExportConsequence.ts`, called from
`GET /api/mdx/gateways/transmittals/:id/ack` in `server/routes/mdx-submission-gateway.ts`). The row has:
- `action = 'EXPORT_GENERATED'`;
- `resource_type = 'submission_transmittal_ack'`;
- `resource_id = <transmittal id>`;
- `details` holding `provenance: 'agency'`, `filename: 'agency-acknowledgement-<id>.txt'`,
  `transmissionId` and `sha256` of the bytes sent.

Those rows are the record of each file a sponsor may hold. Under P-96 they are corrected by a new audit
row that references them, not edited in place (append-only audit trail).

**3. AnA's answers.** `get_submission_ack` (`server/services/ana/AnaToolExecutor.ts`) returned
`provenance` and the first 4,000 characters as `ackText`. It stores nothing of its own. What AnA said is
in the conversation history. It is not a separate record to correct, but the submission's note is what
a person reading that conversation later would see.

**Counting.** On a database, these three counts give the affected set:
- shape 1a: `SELECT … FROM submission_transmittals WHERE region='fda' AND gateway='esg' AND metadata ? 'as2Receipt' AND COALESCE(metadata->'as2Receipt'->>'verified','false') <> 'true'`;
- shape 1b: `… AND NOT (metadata ? 'as2Receipt') AND mdn_raw IS NOT NULL AND mdn_raw <> ''`;
- shape 2: their `audit_logs` rows, joined on `resource_id`.

FDA ESG was never UAT-qualified (`FDA_ESG_NOT_PROVEN`), so on a production database the expected count
is staging and test rows only.
