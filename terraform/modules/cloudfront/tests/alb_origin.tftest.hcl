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
