# The API task cannot write the site, and the site is served with security headers

**Row:** D1 (hosted production), for D6. **Workstream:** W2. **Session:**
`…01AiwZKG`. **Date:** 2026-09-25. **Source:** security plan 2026-09-24,
P0-15 (INF-03, INF-04), handed to W2 by the D6 session.

## What was wrong

- **INF-03.** The ECS task role held `s3:GetObject`, `s3:PutObject` and
  `s3:ListBucket` on the frontend bucket and its objects
  (`terraform/stack/main.tf`, `s3_bucket_arns`). The API and the worker serve
  no static files: CloudFront serves the SPA straight from that bucket, and the
  deploy role publishes it. One compromised task could rewrite the site every
  user loads.
- **INF-04.** The SPA behavior carried no response-headers policy. The server's
  own headers (`server/middleware/enterprise-security.ts`) reach only the API
  paths, so the site itself was served without HSTS, `nosniff` or a framing
  refusal.

## The change

- **The task role's S3 list no longer names the frontend bucket.**
  `modules/ecs-fargate` exposes the rendered grant (`task_s3_policy`) so the
  test can read it.
- **`modules/cloudfront` adds `aws_cloudfront_response_headers_policy.spa`**
  and attaches it to the SPA's default behavior. The policy sets:
  - HSTS for one year, with subdomains and preload;
  - `X-Content-Type-Options: nosniff`;
  - `X-Frame-Options: DENY`;
  - `Referrer-Policy: strict-origin-when-cross-origin`;
  - `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'`.
- **Why no script or style policy.** The server's script and style directives
  rest on a per-request nonce injected into `index.html`. A file on S3 cannot
  carry that nonce, so copying the policy would block the bundle. A
  `script-src` for the static SPA needs a browser check through a real
  distribution. Until then, only directives that cannot block loading are set.
- **Checks that the headers break nothing:**
  - **`nosniff`.** Every asset type the build emits (`js`, `css`, `json`,
    `svg`, `webmanifest`, `xml`, `txt`, `html`) gets a correct Content-Type
    from `aws s3 sync`'s guesser, so no script is served as octet-stream.
  - **`frame-ancestors 'none'`.** The one client iframe (the PDF viewer)
    frames a document, not the SPA.

## Proof (`terraform test`, AWS provider mocked)

| Check | Red | Green |
|---|---|---|
| The task role cannot reach the frontend bucket (`renders_the_boot_contract`) | 20 passed, 1 failed: "The ECS task role can reach the frontend bucket" | 21/21 |
| The site is served with security headers (`the_site_is_served_with_security_headers`) | Policy defined but not attached: `attached is false`, 21 passed, 1 failed | 22/22 |

`scripts/ops/terraform-preflight-proof.mjs`: every check holds, including
"every AWS call the deploy and provision workflows make is granted to the role
its job can assume". `terraform fmt` is clean on the changed files.

## Not done here

- **The plan's `curl -I` through CloudFront.** It needs a real distribution:
  `terraform apply` is the founder's.
- **A `script-src` / `style-src` CSP for the static SPA.** It needs that same
  real distribution and a browser.
- **The evidence bucket's grant.** It names the bucket ARN without `/*`, so
  the object actions in it match nothing. That is not this item's; it is
  recorded here so it is not read as a working grant.
