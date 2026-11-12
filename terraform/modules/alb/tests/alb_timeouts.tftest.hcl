# The edge's 60 seconds, pinned on the ALB (MR-03 Stage 6 step 3, OPS-17).
#
# Three timeouts meet at the load balancer, and they hold only in this order:
#
#   CloudFront origin_read_timeout (60 s, modules/cloudfront)
#     = ALB idle_timeout (60 s, here)
#     < the server's keepAliveTimeout (65 s, server/index.ts)
#
# An ALB that idles longer than the server keeps a connection the server has
# already closed, and the next request on it is a 502. An ALB that idles for
# less than CloudFront waits cuts a long response CloudFront would still have
# delivered. modules/cloudfront/tests/alb_origin.tftest.hcl pins CloudFront's
# half and tests/ci/edge-timeouts.contract.test.ts the server's; until
# 2026-11-11 nothing pinned this one.
#
#   cd terraform/modules/alb && terraform init -backend=false && terraform test

mock_provider "aws" {
  mock_data "aws_ec2_managed_prefix_list" {
    defaults = { id = "pl-3b927c52" }
  }
}

variables {
  name              = "c2c-prod"
  vpc_id            = "vpc-0123456789abcdef0"
  vpc_cidr          = "10.0.0.0/16"
  public_subnet_ids = ["subnet-aaaaaaaa", "subnet-bbbbbbbb"]
  certificate_arn   = "arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000"
  origin_secret     = "0123456789abcdef0123456789abcdef"
}

run "the_alb_idles_for_exactly_the_edge_timeout" {
  command = plan

  assert {
    condition     = aws_lb.this.idle_timeout == 60
    error_message = "The ALB's idle_timeout must be 60 s: CloudFront's origin_read_timeout, and below the server's 65 s keep-alive (server/index.ts). Raise all three together or none (MR-03 Stage 6 step 10)."
  }
}

# Access logs (MR-04 Stage 3 step 5): on exactly when a bucket is passed. The
# stack passes one (terraform/stack/tests/detective_controls.tftest.hcl); the
# module default stays empty so the module can be reused without one.
run "access_logs_are_written_when_a_bucket_is_given" {
  command = plan

  variables {
    access_logs_bucket = "c2c-prod-alb-logs-123456789012"
  }

  assert {
    condition     = output.access_logs.enabled && output.access_logs.bucket == "c2c-prod-alb-logs-123456789012"
    error_message = "With a bucket, the ALB must write access logs to it."
  }
}

run "no_bucket_no_access_logs" {
  command = plan

  assert {
    condition     = !output.access_logs.enabled
    error_message = "Without a bucket, access logs stay off (an enabled log with no bucket fails at create)."
  }
}
