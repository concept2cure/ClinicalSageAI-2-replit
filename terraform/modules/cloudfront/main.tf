// CloudFront + S3 for static frontend hosting, and the only way in to the API
//
// The ALB admits CloudFront alone (modules/alb, W2 B9), so every path the API
// server answers must have a behaviour here; a path left off this list cannot
// be reached at all.

locals {
  alb_path_patterns = var.api_domain_name == "" ? [] : [
    "/api/*",
    "/readyz", # D1's acceptance line reads it here
    "/healthz",
    "/collab", # live co-editing WebSocket (server/services/hocuspocus-server.ts)
    "/collab/*",
    "/scim/*", # SCIM 2.0 provisioning (/scim/v2)
    "/mcp",    # the connector for Claude and its OAuth endpoints (server/mcp/index.ts)
    "/mcp/*",
    "/.well-known/*",
    "/authorize",
    "/token",
    "/register",
    "/revoke",
    "/oauth/*",
  ]
}

resource "aws_s3_bucket" "frontend" {
  bucket = var.bucket_name
  tags   = var.tags
}

# A bad publish can be reverted (MR-03 OPS-21). deploy-aws.yml overwrites
# index.html, the locale files and the rest in place on every release; with
# versioning each overwritten object keeps its previous version, which can be
# restored without a rebuild. The vault and evidence buckets already version.
resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Previous versions are kept for 90 days, long enough to revert any release in
# that window, and not forever: every deploy makes a few.
resource "aws_s3_bucket_lifecycle_configuration" "frontend" {
  bucket     = aws_s3_bucket.frontend.id
  depends_on = [aws_s3_bucket_versioning.frontend]

  rule {
    id     = "previous-releases"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# The bucket holds the built frontend, which CloudFront serves to every viewer.
# A customer-managed key would protect nothing, and CloudFront would then need
# kms:Decrypt on it to read the assets.
#trivy:ignore:AWS-0132
resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# ── Origin Access Control ────────────────────────────────────────────────────

resource "aws_cloudfront_origin_access_control" "this" {
  name                              = "${var.bucket_name}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ── S3 bucket policy (CloudFront only) ──────────────────────────────────────

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontServicePrincipal"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.this.arn
        }
      }
    }]
  })
}

# ── Client-side routes ──────────────────────────────────────────────────────
#
# A path whose last segment has no dot is a client-side route, so the bucket's
# index.html answers it. This runs on the S3 behaviour only. It replaces
# distribution-wide custom_error_response blocks (403/404 → 200 /index.html),
# which applied to every origin, so an API 403 or 404 reached the browser as
# 200 with the app's HTML.

resource "aws_cloudfront_function" "spa_routes" {
  name    = "${replace(var.bucket_name, ".", "-")}-spa-routes"
  runtime = "cloudfront-js-2.0"
  comment = "Serve index.html for client-side routes"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      var last = request.uri.substring(request.uri.lastIndexOf('/') + 1);
      if (last.indexOf('.') === -1) {
        request.uri = '/index.html';
      }
      return request;
    }
  EOT
}

# ── CloudFront distribution ─────────────────────────────────────────────────

# Security headers for the SPA (security plan P0-15, INF-04). The API paths
# carry the server's own headers (server/middleware/enterprise-security.ts);
# the SPA is served straight from S3 and had none.
#
# The CSP here is the part a static bundle can hold without breaking: framing,
# base URI, plugins and form targets. The server's script and style policy
# rests on a per-request nonce injected into index.html, which a file on S3
# cannot carry, so copying it would block the bundle. A script-src for the
# static SPA needs a browser check through a real distribution first.
resource "aws_cloudfront_response_headers_policy" "spa" {
  name    = "${replace(var.bucket_name, ".", "-")}-spa-security"
  comment = "Security headers for the SPA (HSTS, nosniff, no framing)"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    content_security_policy {
      content_security_policy = "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'"
      override                = true
    }
  }
}

# The web ACL on the distribution (founder decision P-11, docs/LAUNCH_DEFINITION_OF_DONE.md):
# AWS's IP-reputation and known-bad-inputs groups block, a per-IP rate rule
# blocks, and AWS's common rule set runs in count mode for its first two weeks
# (waf_common_rule_set_action). The common set's body-size rule refuses any body
# over 8 KB, which would refuse document uploads, AnA turns and the editor's own
# saves; it stays in count mode on every path, also when the set blocks, and the
# app applies its own body limits. The two weeks of counted matches decide
# whether a path-scoped body rule is added. A CloudFront web ACL exists only in
# us-east-1, so this module refuses any other provider region.
data "aws_region" "current" {}

resource "aws_wafv2_web_acl" "this" {
  name        = "${var.bucket_name}-edge"
  description = "Edge protection for the C2C distribution (P-11)"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  rule {
    name     = "aws-ip-reputation"
    priority = 10
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesAmazonIpReputationList"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "aws-ip-reputation"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "aws-known-bad-inputs"
    priority = 20
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "aws-known-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "per-ip-rate"
    priority = 30
    action {
      block {}
    }
    statement {
      rate_based_statement {
        aggregate_key_type    = "IP"
        limit                 = var.waf_rate_limit_per_5_minutes
        evaluation_window_sec = 300
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "per-ip-rate"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "aws-common-rule-set"
    priority = 40
    dynamic "override_action" {
      for_each = var.waf_common_rule_set_action == "count" ? [1] : []
      content {
        count {}
      }
    }
    dynamic "override_action" {
      for_each = var.waf_common_rule_set_action == "block" ? [1] : []
      content {
        none {}
      }
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"
        # Count on every path, whatever the set's action (see above).
        rule_action_override {
          name = "SizeRestrictions_BODY"
          action_to_use {
            count {}
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "aws-common-rule-set"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.bucket_name}-edge"
    sampled_requests_enabled   = true
  }

  lifecycle {
    precondition {
      condition     = data.aws_region.current.name == "us-east-1"
      error_message = "A CloudFront web ACL can only be created in us-east-1; this module's provider is in another region."
    }
  }

  tags = var.tags
}

resource "aws_cloudfront_distribution" "this" {
  web_acl_id          = aws_wafv2_web_acl.this.arn
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  aliases             = var.domain_aliases
  price_class         = var.price_class
  comment             = "C2C frontend - ${var.bucket_name}"

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "s3-frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.this.id
  }

  # API origin (ALB backend)
  dynamic "origin" {
    for_each = var.api_domain_name != "" ? [1] : []
    content {
      domain_name = var.api_domain_name
      origin_id   = "alb-api"
      custom_origin_config {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
        # The ALB's idle timeout, and the most CloudFront allows without a
        # quota increase. At the 30 s default, a request the server answers in
        # 30-60 s (assembling a submission package, an eCTD export) reached the
        # browser as a 504 while the server finished and recorded it (U6).
        origin_read_timeout = 60
      }
      # The ALB forwards only requests that carry this (modules/alb).
      custom_header {
        name  = var.api_origin_secret_header_name
        value = var.api_origin_secret
      }
    }
  }

  default_cache_behavior {
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    target_origin_id           = "s3-frontend"
    viewer_protocol_policy     = "redirect-to-https"
    compress                   = true
    response_headers_policy_id = aws_cloudfront_response_headers_policy.spa.id

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_routes.arn
    }
  }

  # Route the API server's paths to the ALB.
  #
  # Every viewer header is forwarded, which also means nothing is cached.
  #   - Host: CloudFront checks the ALB's certificate against the Host it
  #     forwards. Without it, it checks the ALB's *.elb.amazonaws.com name,
  #     which no ACM certificate can cover, and every request fails 502.
  #   - User-Agent: CloudFront replaces it with its own unless it is
  #     forwarded, so the audit trail recorded CloudFront, not the browser.
  dynamic "ordered_cache_behavior" {
    for_each = local.alb_path_patterns
    content {
      path_pattern           = ordered_cache_behavior.value
      allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
      cached_methods         = ["GET", "HEAD"]
      target_origin_id       = "alb-api"
      viewer_protocol_policy = "https-only"
      compress               = true

      forwarded_values {
        query_string = true
        headers      = ["*"]
        cookies {
          forward = "all"
        }
      }

      min_ttl     = 0
      default_ttl = 0
      max_ttl     = 0
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn            = var.certificate_arn
    ssl_support_method             = var.certificate_arn != "" ? "sni-only" : null
    minimum_protocol_version       = var.certificate_arn != "" ? "TLSv1.2_2021" : null
    cloudfront_default_certificate = var.certificate_arn == ""
  }

  lifecycle {
    # The forwarded Host is what the ALB's certificate must match. A
    # *.cloudfront.net name cannot be on an ACM certificate, so API routing
    # needs a custom domain, on both this certificate and the ALB's.
    precondition {
      condition     = var.api_domain_name == "" || (length(var.domain_aliases) > 0 && var.certificate_arn != "")
      error_message = "Routing the API through CloudFront needs domain_aliases and certificate_arn; the ALB's certificate must cover the same names."
    }
    precondition {
      condition     = var.api_domain_name == "" || (var.api_origin_secret_header_name != "" && length(var.api_origin_secret) >= 32)
      error_message = "Routing the API through CloudFront needs the ALB's origin secret header name and a secret of at least 32 characters (modules/alb)."
    }
  }

  tags = var.tags
}
