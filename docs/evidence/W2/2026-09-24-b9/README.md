# W2 / D1 + D6 — B9: the ALB answers CloudFront alone, and the way in through CloudFront works (2026-09-24)

**Row:** D1 (hosted production). It also closes D6's open item "the ALB is
reachable from the internet, not only through CloudFront". **Workstream:** W2.
**Brief:** `../2026-09-23/README.md` §B9. **Board:** `docs/work-orders/README.md` §0.

**Summary.** The ALB security group admitted `0.0.0.0/0` on 80 and 443. It now
admits CloudFront's origin-facing prefix list on 443 only. The HTTPS listener
forwards only requests that carry an origin secret header, which our
distribution adds, and refuses everything else with 403. With the ALB closed,
CloudFront is the only way in, and that path had four defects of its own, all
fixed here:

- It could not validate the ALB's certificate, so every `/api/*` request
  failed with 502.
- It rewrote every API 403 and 404 to `200 index.html`.
- It had no route for the server paths outside `/api/*`.
- It replaced the browser's User-Agent in audit rows with CloudFront's.

Production now trusts two proxy hops (`TRUST_PROXY_HOPS=2`), so audit rows and
sign-in allowances see the user's address instead of CloudFront's (F-24). The
deploy smoke test now goes through the public URL and fails closed (audit
SMOKE-01).

**Nothing here was applied.** No AWS account or credentials were available. The
proof is offline: `terraform validate`, and `terraform test` against a mocked
AWS provider, with every check also shown failing on the code it replaces.

## What was wrong

| # | Defect | Where | Effect | Shown by |
|---|---|---|---|---|
| 1 | ALB ingress `0.0.0.0/0` on 80 and 443 (B9) | `modules/alb` | Anyone could reach the ALB directly and bypass CloudFront. F-24 therefore had to stay at one trusted hop, so each CloudFront-routed user was recorded as the edge address and shared that edge's sign-in allowance. | `terraform-test-before.txt` |
| 2 | The listener forwarded every request. The module's own security group was attached only if the caller passed it back in (production did, through a self-reference). | `modules/alb` | The prefix list alone would still admit any CloudFront distribution in AWS. A composition that omitted the group would have lost the rule silently. | `terraform-test-before.txt` |
| 3 | The CloudFront origin was the ALB's DNS name, the connection was `https-only`, and `Host` was not forwarded | `modules/cloudfront` | CloudFront checks the origin certificate against the name it connects with. That name is `*.elb.amazonaws.com`, which no ACM certificate can cover, so every `/api/*` request gets 502. The repository's own smoke test had to call that name with `--insecure`. | CloudFront documentation, which **this environment cannot fetch** (`docs.aws.amazon.com` is refused by egress policy), and the D6 review. **Confirm at the first apply.** |
| 4 | `custom_error_response` 403 and 404 → `200 /index.html` | `modules/cloudfront` | The mapping is distribution-wide, so it also applied to the API. Every API refusal (403) and not-found (404) reached the browser as 200 with the app's HTML. `/readyz` through CloudFront would have reached S3 and come back as `200 index.html`, a green readiness result for any deployment. | `provider-schema-custom-error-response.txt`, `terraform-test-before.txt` |
| 5 | No behaviour for server paths outside `/api/*`: `/readyz`, `/healthz`, `/collab` (the Authoring co-editing socket), `/scim/v2`, the connector for Claude (`/mcp`, `/authorize`, `/token`, `/register`, `/revoke`, `/oauth/consent`, `/.well-known/*`) | `modules/cloudfront` | Through CloudFront each of these reached S3 and came back as `200 index.html`. Once the ALB is closed, a path without a behaviour cannot be reached at all. | `terraform-test-before.txt` |
| 6 | `/api/*` forwarded three named headers: `Authorization`, `Origin`, `Accept` | `modules/cloudfront` | CloudFront replaces an unforwarded User-Agent with its own, so audit rows recorded CloudFront (D6 review). The client also sends `x-organization-id` (10 call sites), which is not in that list. Forwarding every header removes the question. | `terraform-test-before.txt` |
| 7 | The smoke test called `https://<ALB DNS>/api/health --insecure`, skipped with exit 0 when the ALB could not be found, and ran after a failed API deploy if the frontend deploy succeeded (July audit **SMOKE-01**, P1) | `deploy-aws.yml` | A dead deployment reported green. `/api/health` is a static 200. | `smoke-step-before.txt` |
| 8 | The security group description contained an em dash | `modules/alb` | EC2 accepts only ASCII in group descriptions, so the first apply would fail. Stated from the API's documented character set; it cannot be reproduced without AWS. | — |

## What changed

- **`modules/alb`**
  - Ingress: 443 from `com.amazonaws.global.cloudfront.origin-facing` only. One
    reference to that list counts as its full weight (about 55 entries) against
    the group's rules quota, which is one reason there is no second port.
  - No port-80 ingress and no port-80 listener. The HTTP-to-HTTPS redirect is
    CloudFront's (`default_cache_behavior`, `redirect-to-https`), which viewers
    actually reach. The CloudFront test asserts it.
  - The listener refuses with 403 by default. Rule 1 forwards only when
    `X-Origin-Verify` equals `origin_secret`, which is validated to 32–128
    characters of `[A-Za-z0-9_-]`, because the listener treats `*` and `?` as
    wildcards.
  - The module's own security group is always attached.
- **`modules/cloudfront`**
  - The origin sends the secret header.
  - Every ALB behaviour forwards all viewer headers (`Host` included, so the
    certificate check succeeds), the query string and cookies, and caches
    nothing.
  - There are 14 path patterns. Each one's entry in `local.alb_path_patterns`
    says why it is there.
  - Client-side routing moved from the distribution-wide error mapping to a
    `viewer-request` CloudFront Function on the S3 behaviour only. A last path
    segment without a dot is rewritten to `/index.html`. V2 surfaces are
    `/concept2cure/<surface>` with parameters in the query string, so they
    never carry a dot (`client/src/concept2cure/v2/routing.ts`).
  - Preconditions: API routing needs a custom domain, a certificate and the
    secret.
- **`environments/production`** (in the B1–B5 lane's files; the lines are
  listed on the board):
  - `origin_secret` goes to `alb`, and the header name and secret go to `cdn`.
  - The self-referencing `security_group_ids` is removed.
  - `trust_proxy_hops = 2` is set in `ecs`.
  - `cloudfront_origin_secret` (sensitive) is appended.
  - `domain_aliases` must be non-empty. The check sits here because it is known
    at plan time. The module's precondition waits for the ALB's DNS name, which
    exists only once apply has created the ALB.
  - The tfvars example is updated.
- **`.github/workflows/deploy-aws.yml` smoke test**
  - Resolves the distribution's alias.
  - Calls `https://<alias>/readyz` with the certificate checked, and requires
    200 and `ready: true`.
  - Fails if the distribution ID or the alias is missing.
  - Runs only after a successful API deploy, or after a frontend-only dispatch.
- **`terraform/README.md`**: the production apply steps and the security note.

## Proof

Terraform 1.9.8 and hashicorp/aws 5.70.0 from a local provider mirror. No AWS
credentials.

| File | Shows |
|---|---|
| `terraform-test-before.txt` | This change's module tests against the modules as they were (`53c1f3c01`). **alb 0 passed / 2 failed**: an address range admitted, two ports, the group not attached, the listener forwarding. **cloudfront 0 passed / 5 failed**: the error mapping, 13 of 14 paths missing, the three-header list, no origin secret, no routing function. |
| `terraform-test-after.txt` | The same tests after the change: **alb 4/4, cloudfront 8/8**. |
| `mutations.txt` | Each of 13 fixes reverted on its own. **Every one is caught**, each by the run named for it. |
| `production-composition.txt` | The whole production environment under the mocked provider. It plans with a domain and a secret. A mocked apply renders `TRUST_PROXY_HOPS=2` in the API task definition. It is **refused at plan** without a domain (production's check) and with a weak secret (the ALB module's validation). |
| `production-composition-mutant.txt` | Without `trust_proxy_hops = 2` the check fails. |
| `production-composition-scratch-tests.txt` | The source of those scratch-only tests and outputs, which are not committed because the files belong to the B1–B5 lane. |
| `provider-schema-custom-error-response.txt` | `custom_error_response` can be declared only on the distribution, never per behaviour or origin. |
| `spa-routes-function.txt` / `-mutant.txt` | The function, run in Node exactly as written in `main.tf`: 12 paths from this app routed correctly. A mutant that rewrites every path breaks 6 of them. |
| `smoke-step-before.txt` / `-after.txt` | The old and new smoke step run against stubbed `aws` and `curl`. **Before**, it reported healthy when the ALB could not be found, and on a 200 of HTML. **After**, it refuses no distribution, no alias, `200 index.html`, 503 and connection refused, and passes only on `ready: true`. |
| `terraform-validate-{production,staging}.txt` | `Success! The configuration is valid.` |

Repository gates run: `ci:workflow-targets` and `ci:required-workflow-concurrency`
both OK. To reproduce the module tests, run `terraform init -backend=false &&
terraform test` in `terraform/modules/alb` and in `terraform/modules/cloudfront`.

## Open — not done here, and why

- **Founder, before apply:**
  - A custom domain in `domain_aliases`, with **both** certificates covering it:
    `acm_certificate_arn` on the ALB, because CloudFront checks it against the
    forwarded Host, and `cloudfront_certificate_arn`.
  - DNS for that domain pointing at the distribution.
  - A generated `cloudfront_origin_secret` kept where the next apply can read
    it.
  - `cloudfront:GetDistribution` on the deploy role, for the smoke test.
- **The app's own configuration (B3's preflight variables):**
  - The public URL the MCP connector advertises (`server/mcp/config.ts`,
    `publicUrl`) must be the custom domain.
  - `ALLOWED_ORIGINS` (the CSRF origin check) must include it.
- **HEALTH-01's ALB half is left to B5.** The target group still checks
  `/api/health`, a static 200. The audit's fix moves it to `/readyz`. That is
  coupled to the ECS health check and grace period that B5 is changing, so
  B5's change may edit that one attribute in `modules/alb`.
- **B8.** Staging should compose `alb` and `cdn` the same way, with its own
  secret and domain.
- **The origin read timeout.** CloudFront's default of 30 seconds applies to
  every ALB behaviour. A response that is silent for 30 seconds gets 504
  through CloudFront, where the ALB allowed 60 (`server/index.ts` keeps
  connections alive for 65 s for that window). Several routes stream, but
  whether a non-streamed AnA or export request can be silent for 30 s was not
  measured. The value was not changed without that evidence.
- **Rotating the origin secret** refuses API traffic until CloudFront has
  deployed the new value, which takes minutes.
- **No Terraform check runs in CI.** `terraform-compliance.yml` (Checkov and a
  staging plan) triggers only on `pull_request`, which this repository does not
  use. The module tests added here run offline. Wiring `terraform test` into
  CI is W2's call.
- **socket.io is not routed.** The server listens at `/socket.io/`, but nothing
  in `client/src` connects to it, so no behaviour was added.
