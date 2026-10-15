# U6 (edge half) — CloudFront waits as long as the ALB does

Launch row: **D1**. Date: 2026-10-01. Branch: `concept2cure-v2`.

## The defect

CloudFront waited for the API origin for its 30-second default. The ALB
behind it waits 60 seconds (its idle timeout), and the server's keep-alive is
65 seconds (`server/index.ts`).

So a request the server answers in 30 to 60 seconds reached the browser as a
**504** while the server finished the work and recorded it. Two examples:

- assembling a submission package (`POST /api/submission-ops/packages/:id/assemble`);
- a synchronous eCTD export.

In the audit's words, the operator is told "nothing was built", while the
bundle is stored, set as the transmit descriptor, and written to the
governed-action ledger.

## Fixed here

- **`terraform/modules/cloudfront/main.tf`:** the ALB origin now has
  `origin_read_timeout = 60`. That is the most CloudFront allows without a
  quota increase.
- **`terraform/modules/alb/main.tf`:** `idle_timeout = 60`, stated explicitly
  (it was the provider default), so the pairing is visible.

## Not fixed here

Work that runs longer than 60 seconds still needs the assemble route to go
async: return 202 with a job, and let the client poll. The client also needs
to re-read the package's state after a gateway error instead of saying
nothing was built. Both are in `server/routes/submission-ops.ts`, the assemble
route claimed by the package-model spine lane (row D7). They are handed to
that lane on the board.

## Verified by making it fail

`terraform/modules/cloudfront/tests/alb_origin.tftest.hcl` has a new run,
`the_alb_origin_waits_as_long_as_the_alb_does`.

| | Result |
|---|---|
| Before the fix | `Failure! 8 passed, 1 failed.` (that run) |
| After the fix | `Success! 9 passed, 0 failed.` |

The ALB module tests pass, production validates, and `trivy config` reports
no findings.
