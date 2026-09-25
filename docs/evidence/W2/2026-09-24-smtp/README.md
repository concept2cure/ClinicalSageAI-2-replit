# W2 / D1 + D6 — the stack can deliver login codes (2026-09-24)

**Row:** D1 (hosted production); also D6 (sign-in). **Workstream:** W2.
**Board:** `docs/work-orders/README.md` §0.

**Summary.** The one-time code sent by email is the mandatory second factor at
sign-in. The server refuses no boot over it. It logs, in production, that
"NO user can log in until email delivery works" (`server/startup/services.ts`).

`terraform/stack` had no SMTP setting, and the deploy preflight required
none. A deployment from this Terraform would therefore:

- boot;
- pass the preflight;
- read `/readyz` 200;
- admit no one.

Now:

- The stack takes the SMTP host, sender, user and password. The port is fixed
  at 465.
- Every container gets host, port and sender as plain values, and user and
  password as Secrets Manager secrets.
- The deploy preflight refuses a task definition without `SMTP_HOST`,
  `SMTP_USER` and `SMTP_PASS`. Those are the three that `isEmailConfigured()`
  reads.

## Why only port 465

`server/services/emailService.ts` sets `secure: port === 465` and does not set
`requireTLS`. On 465 the connection is TLS from the start. On any other port it
starts in clear and upgrades only if the server offers STARTTLS. When the
server does not offer it, or the offer is stripped in transit, the SMTP
password and every one-time code travel in clear.

The stack refuses any other port at plan time. The app code was not changed.
Accepting 587 would need `requireTLS: true` there first.

## Proof

Terraform 1.9.8 with a local provider mirror, mocked AWS, no credentials.

| File | Shows |
|---|---|
| `stack-test-before.txt` | With the preflight's list extended and the stack unchanged, `terraform test` fails on 2 runs: the rendered task definition lacks names the preflight requires, for production and for staging. |
| `stack-test-after.txt` | **21/21** (19 existing, plus 2 added). The added runs check that both containers carry `SMTP_HOST`, `SMTP_PORT=465`, `SMTP_FROM` and the credentials as secrets only, and that port 587 is refused. The existing leak check now includes the SMTP user and password. |
| `mutations.txt` | Each change reverted on its own is caught. SMTP left out of the task definition: 3 runs fail. The password as a plain environment value: the leak check fails. Any port accepted: the refusal run fails. |
| `deploy-preflight.txt` | `deploy-aws.yml`'s own preflight shell run against the rendered task definition (`scripts/ops/terraform-preflight-proof.mjs`). **Accepted as rendered.** The same definition with its `SMTP_*` entries removed is **refused**, naming the three missing settings. |
| `terraform-validate.txt` | `production` and `staging` validate. |

## Founder, before apply

- **Choose the SMTP provider.** Amazon SES in the stack's region is the
  natural fit. Its SMTP endpoint accepts 465.
  - Verify the sending domain, with DKIM records in DNS.
  - Leave the SES sandbox; in the sandbox SES delivers only to verified
    addresses.
- **Set the credentials.** `TF_VAR_smtp_user` and `TF_VAR_smtp_pass` come from
  the provider. `smtp_host` and `smtp_from` go in tfvars (see
  `terraform.tfvars.example`).
- **After apply, prove delivery to a real external inbox** and file the output
  with D1's evidence: `npm run pilot:verify-otp -- <address>`. This is the
  readiness report's own unblock step.

## Not changed

- **`emailService.ts`.** The port restriction is enforced in Terraform, where
  the deployment is built.
- **`/readyz`.** It does not report email, and this change does not make it.
  The preflight is where a missing SMTP setting now stops a deploy.
