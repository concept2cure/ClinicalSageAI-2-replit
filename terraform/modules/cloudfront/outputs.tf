output "distribution_id" {
  value = aws_cloudfront_distribution.this.id
}

output "distribution_domain_name" {
  value = aws_cloudfront_distribution.this.domain_name
}

output "distribution_arn" {
  value = aws_cloudfront_distribution.this.arn
}

output "frontend_bucket_name" {
  value = aws_s3_bucket.frontend.id
}

output "frontend_bucket_arn" {
  value = aws_s3_bucket.frontend.arn
}

output "spa_security_headers" {
  description = "The security headers CloudFront adds to the SPA, and whether the SPA behavior uses them (for the stack's tests)."
  value = {
    attached = aws_cloudfront_distribution.this.default_cache_behavior[0].response_headers_policy_id == aws_cloudfront_response_headers_policy.spa.id
    config   = aws_cloudfront_response_headers_policy.spa.security_headers_config[0]
  }
}
