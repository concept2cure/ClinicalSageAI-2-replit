# D7 — the PDF/A rule, decided

**Row:** D7 (one real sequence; the transmit path). **Date:** 2026-10-01.
**Decided under** the founder's delegation of 2026-10-01: _"you can make the
decision that's best for our clients and our product for the other open
questions."_

## The question

`ECTD_REQUIRE_PDFA` had been held off although its recorded precondition
(Ghostscript and veraPDF in the image) was met. On, it refused a production
package if any PDF leaf was not converted to PDF/A, with the message _"A
production eCTD submission requires PDF/A."_ That is not true: FDA, EMA and
the other agencies the catalog transmits to accept plain PDF 1.4–1.7 as well as
PDF/A. The posture report left two options: block only where a region requires
PDF/A, or block a leaf declared PDF/A but not converted.

## The decision

- **PDF/A is never required by default.** No agency in the catalog requires it,
  and refusing a package the agency accepts helps no client. So there is no
  region list, because no region would be on it.
- **It is required only where someone chose it.** An organisation whose own
  procedures require PDF/A turns on **Require PDF/A** in Admin, Setup. A
  deployment sets `ECTD_REQUIRE_PDFA`. Either one refuses a production transmit
  with a plain-PDF leaf before the wire.
- **The refusal names who required it**, and that the agency accepts plain PDF.
  Neither message claims any more that an agency requires PDF/A.
- **It fails closed.** If the setting cannot be read, or the organisation row
  cannot be seen, the transmit is refused. It is never sent as plain PDF.
- **Declared-but-unconverted is not a separate refusal.** No agency's
  validation criteria test a PDF/A claim, so refusing on it would hold a
  submission for nothing the agency checks. The grade still reports it.
- **A test (staging) transmit is never refused for PDF/A.**

## The change

| Piece                                                                             | What it does                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/services/ectd/pdfa-requirement.ts` (new)                                  | Decides who requires PDF/A: the deployment, the organisation (`settings.submission.requirePdfA`, the literal boolean `true` only), or nobody. A read failure or a missing row is thrown.                          |
| `server/services/submission-gateways/index.ts`                                    | The transmit guard resolves the requirement before the wire. It reads only when it can decide something: a production transmit whose grade lists plain-PDF leaves.                                                |
| `server/services/submission-gateways/pre-transmit-check.ts`                       | The PDF/A check takes the requirement. Plain PDF fails the check only where PDF/A was chosen. The detail and the refusal say who chose it.                                                                        |
| `server/services/ectd/pdfa-readiness.ts`                                          | The packager's deployment-wide refusal no longer says a submission requires PDF/A.                                                                                                                                |
| `client/src/concept2cure/v2/surfaces/PdfARequirementSetting.tsx`, Admin, Setup    | A **Submission files** card with **Require PDF/A**: off by default, and saying why. A change takes a reason through the existing governed settings PATCH, which is audited and admin-only. A failed read says so. |
| `docs/reports/ectd-gate-posture-2026-09-08.md`, `submission-gate-posture.test.ts` | The posture record now holds the decision, and when the deployment switch would be right.                                                                                                                         |

## The proof

| File                               | Shows                                                                                                                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `red/before.txt`                   | The rule's tests against trunk's guard and pre-transmit check: **4 of 8 fail.** An organisation that requires PDF/A is sent plain PDF anyway. The refusal does not say who required it. An unreadable setting and an invisible organisation row both send.    |
| `green/after.txt`                  | With the change: **105 of 105** across the rule at the guard, the pre-transmit check, the posture record, PDF/A readiness, the bundle guard (whose assertion now expects the source to be named), the Setup control, and Setup itself.                        |
| `green/postgres-settings-read.txt` | `tests/db/pdfa-requirement.dbtest.ts` on PostgreSQL 16: **5 of 5.** It reads `organizations.settings` as stored. Only boolean `true` requires PDF/A, and the string `"true"` does not. Another organisation's setting never applies, and the deployment wins. |

**Also run:** the gateway and eCTD unit directories and both submission-gateway
route suites: 109 files, 1,410 tests, all pass.
