# D1 — the platform owners are named (2026-10-01)

Row **D1**. Lane: `…session_01SuVLo2`. The founder named the platform owners:
- `jonmichaelpsmith@gmail.com`
- `jmichaelpsmith@gmail.com`

## Where they are

`terraform/environments/production/platform-owners.auto.tfvars` and the same file for staging.
- **Committed and reviewed.** The value is in a reviewed commit, not a local `terraform.tfvars` that nobody else sees.
- **Loaded automatically.** Terraform loads `*.auto.tfvars` on its own, and it overrides `terraform.tfvars`.
- **Still required.** The variable has no default, so a deployment without the file still refuses to plan.
- **The examples.** Both `terraform.tfvars.example` files now point to the new file instead of a placeholder.

The stack passes the list to the API as `PLATFORM_ADMIN_EMAILS` and `BUSINESS_CENTER_EMAILS`. Both apply to a password sign-in only; a SAML sign-in never matches them.

**Why a new file, not a default in `variables.tf`.** `variables.tf` and the examples were changed at 18:05 today by `…0194UQPx` (P1-54). This change leaves that lane's lines alone, apart from the one placeholder line in each example.

## Red, then green

| Check | Result |
|---|---|
| `red-no-owners.txt` | Without the file, `terraform plan` refuses: "The root module input variable "platform_owner_emails" is not set, and has no default value." |
| `green-production.txt`, `green-staging.txt` | Both environments validate and read the two addresses (`terraform console`; scratch copy with a local-backend override, since the real backend is S3). |
| `green-stack-boot-contract.txt` | The stack's boot contract with these two owners in place of its fixture, in a scratch copy: **60/60**. That includes the stack's lower-case validation and the assertion that the API names them in both allowlists. |

## The repository is public

Both addresses were already in it:
- the first in 130 tracked files (development sign-in and demo seeds);
- the second in one.

What this adds is that they are the platform's administrator accounts. That knowledge alone gives no access:
- **The first account** is created only with the deployment's setup token (P-5).
- **The second account** must sign up. In production, signup leaves the account pending until its address is verified from the e-mailed link, and refuses if e-mail is not configured (`server/routes/auth.ts`, `verificationRequired`). So only that mailbox can claim it.
- **Password sign-in** is limited per account.

## Still owed (founder)

1. The apply (`terraform apply` in `terraform/environments/production`).
2. One `POST /api/setup/initialize` with the setup token, as one of the two addresses. The stack's `first_run_setup` output names the secret and the call.
3. The second owner signs up and verifies the address from the e-mailed link.
