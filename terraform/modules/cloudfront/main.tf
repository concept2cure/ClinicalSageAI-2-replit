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

# No WAF yet: a founder decision, not defaulted (docs/evidence/W2/2026-09-24-trivy/).
# It carries a monthly cost, and AWS's common managed rule set blocks request
# bodies over 8 KB until it is tuned, which would refuse document uploads and
# AnA turns. Until then the ALB admits CloudFront alone, and sign-in and API
# rate limits are applied in the app.
#trivy:ignore:AWS-0011
resource "aws_cloudfront_distribution" "this" {
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
      }
      # The ALB forwards only requests that carry this (modules/alb).
      custom_header {
        name  = var.api_origin_secret_header_name
        value = var.api_origin_secret
      }
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-frontend"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

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
    acm_certificate_arn      = var.certificate_arn
    ssl_support_method       = var.certificate_arn != "" ? "sni-only" : null
    minimum_protocol_version = var.certificate_arn != "" ? "TLSv1.2_2021" : null
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
