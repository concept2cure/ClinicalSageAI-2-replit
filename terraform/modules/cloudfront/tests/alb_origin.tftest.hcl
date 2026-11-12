# CloudFront is the only way in to the API (W2 B9, docs/evidence/W2/2026-09-24-b9/),
# so the path through it has to work.
#
# Offline: the AWS provider is mocked, so `terraform test` needs no account and
# no credentials. Run from this module's directory:
#   terraform init -backend=false && terraform test

mock_provider "aws" {
  mock_resource "aws_cloudfront_function" {
    defaults = { arn = "arn:aws:cloudfront::111122223333:function/c2c-test-frontend-spa-routes" }
  }
  mock_resource "aws_cloudfront_distribution" {
    defaults = { arn = "arn:aws:cloudfront::111122223333:distribution/E2TESTDISTRIB" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::c2c-test-frontend" }
  }
  mock_resource "aws_wafv2_web_acl" {
    defaults = { arn = "arn:aws:wafv2:us-east-1:111122223333:global/webacl/c2c-test-frontend-edge/abc" }
  }
  mock_data "aws_region" {
    defaults = { name = "us-east-1" }
  }
}

variables {
  bucket_name                   = "c2c-test-frontend"
  domain_aliases                = ["app.example.com"]
  certificate_arn               = "arn:aws:acm:us-east-1:111122223333:certificate/test"
  api_domain_name               = "c2c-test-1234567890.us-east-1.elb.amazonaws.com"
  api_origin_secret_header_name = "X-Origin-Verify"
  api_origin_secret             = "c2cTestOriginSecret_0123456789abcdef"
}

run "api_errors_reach_the_browser_as_errors" {
  command = apply

  # custom_error_response is distribution-wide: a 403 → 200 /index.html
  # mapping rewrote the API's refusals too.
  assert {
    condition     = length(aws_cloudfront_distribution.this.custom_error_response) == 0
    error_message = "No distribution-wide error mapping: it would turn an API 403 or 404 into 200 with the app's HTML."
  }
}

run "every_server_path_routes_to_the_alb" {
  command = apply

  assert {
    condition = alltrue([
      for p in [
        "/api/*", "/readyz", "/healthz", "/collab", "/collab/*", "/scim/*",
        "/mcp", "/mcp/*", "/.well-known/*", "/authorize", "/token", "/register",
        "/revoke", "/oauth/*",
      ] :
      anytrue([
        for b in aws_cloudfront_distribution.this.ordered_cache_behavior :
        b.path_pattern == p && b.target_origin_id == "alb-api"
      ])
    ])
    error_message = "A path the API server answers has no behaviour; with the ALB closed to everything else, it is unreachable."
  }
}

run "the_alb_sees_the_viewers_headers" {
  command = apply

  # Host: CloudFront checks the ALB's certificate against the forwarded Host;
  # without it, against *.elb.amazonaws.com, which no ACM certificate covers.
  assert {
    condition = alltrue([
      for b in aws_cloudfront_distribution.this.ordered_cache_behavior :
      b.forwarded_values[0].headers == toset(["*"]) && b.forwarded_values[0].query_string && b.forwarded_values[0].cookies[0].forward == "all"
      if b.target_origin_id == "alb-api"
    ])
    error_message = "Every ALB behaviour must forward all viewer headers (Host, User-Agent), the query string and cookies."
  }
}

run "the_alb_origin_carries_the_secret" {
  command = apply

  assert {
    condition = anytrue([
      for o in aws_cloudfront_distribution.this.origin :
      o.origin_id == "alb-api" && anytrue([
        for h in o.custom_header : h.name == var.api_origin_secret_header_name && h.value == var.api_origin_secret
      ])
    ])
    error_message = "The ALB origin must send the origin secret header the ALB requires."
  }
}

run "client_routes_are_rewritten_on_the_bucket_behaviour_only" {
  command = apply

  assert {
    condition = anytrue([
      for f in aws_cloudfront_distribution.this.default_cache_behavior[0].function_association :
      f.event_type == "viewer-request" && f.function_arn == aws_cloudfront_function.spa_routes.arn
    ])
    error_message = "The bucket behaviour must rewrite client-side routes to /index.html."
  }

  assert {
    condition = alltrue([
      for b in aws_cloudfront_distribution.this.ordered_cache_behavior : length(b.function_association) == 0
    ])
    error_message = "No ALB behaviour may rewrite paths."
  }

  assert {
    condition     = aws_cloudfront_distribution.this.default_cache_behavior[0].viewer_protocol_policy == "redirect-to-https"
    error_message = "Viewers on HTTP are redirected here; the ALB has no port-80 listener."
  }
}

run "api_routing_needs_a_custom_domain" {
  command = plan

  variables {
    domain_aliases = []
  }

  expect_failures = [aws_cloudfront_distribution.this]
}

run "api_routing_needs_the_secret" {
  command = plan

  variables {
    api_origin_secret = ""
  }

  expect_failures = [aws_cloudfront_distribution.this]
}

run "without_an_api_origin_nothing_routes_to_it" {
  command = apply

  variables {
    domain_aliases                = []
    certificate_arn               = ""
    api_domain_name               = ""
    api_origin_secret_header_name = ""
    api_origin_secret             = ""
  }

  assert {
    condition     = length(aws_cloudfront_distribution.this.ordered_cache_behavior) == 0 && length(aws_cloudfront_distribution.this.origin) == 1
    error_message = "With no API origin the distribution serves the bucket alone."
  }
}

# CloudFront waits 30 s for the origin by default; the ALB behind it waits 60.
# A request the server answers in 30-60 s (assembling a submission package,
# an eCTD export) reached the browser as a 504 while the server finished the
# work and recorded it (audit U6). 60 s is the most CloudFront allows without
# a quota increase, and the ALB's idle timeout.
run "the_alb_origin_waits_as_long_as_the_alb_does" {
  command = apply

  assert {
    condition = anytrue([
      for o in aws_cloudfront_distribution.this.origin :
      o.origin_id == "alb-api" && anytrue([for c in o.custom_origin_config : c.origin_read_timeout == 60])
    ])
    error_message = "The ALB origin's read timeout must be 60 s, the ALB's idle timeout; the 30 s default cuts off work the server completes."
  }
}

# MR-03 OPS-21. One SPA delivery path on the hosted deployment: the bucket. The
# API image also carries the bundle (dist/public), which the server serves on a
# self-hosted install with no CloudFront; here every behaviour that reaches the
# ALB is a path the server answers as an API, so none can serve the SPA.
run "the_spa_is_served_from_the_bucket_alone" {
  command = apply

  assert {
    condition     = aws_cloudfront_distribution.this.default_cache_behavior[0].target_origin_id == "s3-frontend"
    error_message = "Every path no ALB behaviour claims must be served from the frontend bucket."
  }

  assert {
    condition = alltrue([
      for b in aws_cloudfront_distribution.this.ordered_cache_behavior :
      b.target_origin_id != "alb-api" || contains([
        "/api/*", "/readyz", "/healthz", "/collab", "/collab/*", "/scim/*",
        "/mcp", "/mcp/*", "/.well-known/*", "/authorize", "/token", "/register",
        "/revoke", "/oauth/*",
      ], b.path_pattern)
    ])
    error_message = "An ALB behaviour claims a path the server does not answer as an API; the SPA would have a second delivery path."
  }
}

# A bad publish can be reverted: the bucket versions, and keeps a previous
# release long enough to restore it.
run "a_bad_publish_can_be_reverted" {
  command = apply

  assert {
    condition     = aws_s3_bucket_versioning.frontend.bucket == aws_s3_bucket.frontend.id && aws_s3_bucket_versioning.frontend.versioning_configuration[0].status == "Enabled"
    error_message = "The frontend bucket must version, so an overwritten index.html can be restored."
  }

  assert {
    condition = anytrue([
      for r in aws_s3_bucket_lifecycle_configuration.frontend.rule :
      r.status == "Enabled" && alltrue([for n in r.noncurrent_version_expiration : n.noncurrent_days >= 30])
      && length(r.noncurrent_version_expiration) > 0
    ])
    error_message = "Previous versions must be kept for at least 30 days, and expire after that."
  }
}


# P-11: the web ACL is on the distribution, with the decided rules.
run "the_distribution_is_behind_the_decided_web_acl" {
  command = apply

  assert {
    condition     = aws_cloudfront_distribution.this.web_acl_id == aws_wafv2_web_acl.this.arn
    error_message = "The distribution must be attached to the module's web ACL (P-11)."
  }
  assert {
    condition     = aws_wafv2_web_acl.this.scope == "CLOUDFRONT"
    error_message = "A distribution's web ACL has scope CLOUDFRONT."
  }
  assert {
    condition = toset([for r in aws_wafv2_web_acl.this.rule : r.name]) == toset([
      "aws-ip-reputation", "aws-known-bad-inputs", "per-ip-rate", "aws-common-rule-set",
    ])
    error_message = "P-11 decides four rules: IP reputation, known bad inputs, a per-IP rate rule and the common rule set."
  }
  assert {
    condition = alltrue([for r in aws_wafv2_web_acl.this.rule :
    length(r.override_action[0].none) == 1 if contains(["aws-ip-reputation", "aws-known-bad-inputs"], r.name)])
    error_message = "The IP-reputation and known-bad-inputs groups block (override none)."
  }
  assert {
    condition = one([for r in aws_wafv2_web_acl.this.rule :
    r.statement[0].rate_based_statement[0].aggregate_key_type if r.name == "per-ip-rate"]) == "IP"
    error_message = "The rate rule is per IP."
  }
  assert {
    condition = one([for r in aws_wafv2_web_acl.this.rule :
    length(r.override_action[0].count) if r.name == "aws-common-rule-set"]) == 1
    error_message = "The common rule set starts in count mode (P-11: two weeks before it blocks)."
  }
}

run "the_common_set_can_block_but_its_body_size_rule_still_counts" {
  command = apply
  variables {
    waf_common_rule_set_action = "block"
  }

  assert {
    condition = one([for r in aws_wafv2_web_acl.this.rule :
    length(r.override_action[0].none) if r.name == "aws-common-rule-set"]) == 1
    error_message = "With waf_common_rule_set_action = block, the common set blocks."
  }
  assert {
    condition = one([for r in aws_wafv2_web_acl.this.rule :
      one([for o in r.statement[0].managed_rule_group_statement[0].rule_action_override :
    length(o.action_to_use[0].count) if o.name == "SizeRestrictions_BODY"]) if r.name == "aws-common-rule-set"]) == 1
    error_message = "The 8 KB body-size rule counts even when the set blocks: it would refuse uploads, AnA turns and editor saves."
  }
}

run "a_web_acl_outside_us_east_1_is_refused" {
  command = plan

  override_data {
    target = data.aws_region.current
    values = { name = "eu-west-1" }
  }

  expect_failures = [aws_wafv2_web_acl.this]
}

run "an_unknown_common_set_action_is_refused" {
  command = plan
  variables {
    waf_common_rule_set_action = "allow"
  }
  expect_failures = [var.waf_common_rule_set_action]
}
