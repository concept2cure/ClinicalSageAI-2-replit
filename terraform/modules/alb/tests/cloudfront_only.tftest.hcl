# The ALB answers CloudFront alone (W2 B9, docs/evidence/W2/2026-09-24-b9/).
#
# Offline: the AWS provider is mocked, so `terraform test` needs no account and
# no credentials. Run from this module's directory:
#   terraform init -backend=false && terraform test

mock_provider "aws" {
  mock_resource "aws_lb" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:111122223333:loadbalancer/app/c2c-test/0123456789abcdef" }
  }
  mock_resource "aws_lb_target_group" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:111122223333:targetgroup/c2c-test-api/0123456789abcdef" }
  }
  mock_resource "aws_lb_listener" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:111122223333:listener/app/c2c-test/0123456789abcdef/0123456789abcdef" }
  }
  mock_data "aws_ec2_managed_prefix_list" {
    defaults = { id = "pl-3b927c52" }
  }
}

variables {
  name              = "c2c-test"
  vpc_id            = "vpc-0123456789abcdef0"
  vpc_cidr          = "10.10.0.0/16"
  public_subnet_ids = ["subnet-aaaaaaaa", "subnet-bbbbbbbb"]
  certificate_arn   = "arn:aws:acm:us-east-1:111122223333:certificate/test"
  origin_secret     = "c2cTestOriginSecret_0123456789abcdef"
}

run "nothing_but_https_from_cloudfront_reaches_it" {
  command = apply

  assert {
    condition = alltrue([
      for r in aws_security_group.alb.ingress :
      # The mocked provider leaves unset lists null where AWS returns them empty.
      try(length(r.cidr_blocks), 0) == 0 && try(length(r.ipv6_cidr_blocks), 0) == 0
    ])
    error_message = "An ingress rule admits an address range; the ALB must admit CloudFront's origin-facing prefix list alone."
  }

  assert {
    condition = length(aws_security_group.alb.ingress) == 1 && alltrue([
      for r in aws_security_group.alb.ingress : r.from_port == 443 && r.to_port == 443
    ])
    error_message = "The ALB must admit one port, 443."
  }

  assert {
    condition     = contains(aws_lb.this.security_groups, aws_security_group.alb.id)
    error_message = "The module's own security group must be on the ALB even when the caller passes none."
  }

  assert {
    condition     = aws_lb_listener.https.default_action[0].type == "fixed-response" && try(aws_lb_listener.https.default_action[0].fixed_response[0].status_code, "") == "403"
    error_message = "A request without the origin secret must be refused 403, not forwarded."
  }
}

run "the_prefix_list_is_cloudfronts_and_the_secret_opens_the_listener" {
  command = apply

  assert {
    condition     = data.aws_ec2_managed_prefix_list.cloudfront_origin_facing.name == "com.amazonaws.global.cloudfront.origin-facing"
    error_message = "The ingress must use CloudFront's origin-facing managed prefix list."
  }

  assert {
    condition = alltrue([
      for r in aws_security_group.alb.ingress :
      length(r.prefix_list_ids) == 1 && contains(r.prefix_list_ids, data.aws_ec2_managed_prefix_list.cloudfront_origin_facing.id)
    ])
    error_message = "The HTTPS ingress must name the CloudFront origin-facing prefix list and nothing else."
  }

  assert {
    condition = anytrue([
      for c in aws_lb_listener_rule.from_cloudfront.condition : anytrue([
        for h in c.http_header :
        h.http_header_name == output.origin_secret_header_name && h.values == toset([var.origin_secret])
      ])
    ])
    error_message = "The listener must forward only on the origin secret header the module publishes."
  }

  assert {
    condition     = aws_lb_listener_rule.from_cloudfront.action[0].type == "forward" && aws_lb_listener_rule.from_cloudfront.action[0].target_group_arn == aws_lb_target_group.api.arn
    error_message = "A request carrying the origin secret must reach the API target group."
  }
}

run "a_short_secret_is_refused" {
  command = plan

  variables {
    origin_secret = "too-short"
  }

  expect_failures = [var.origin_secret]
}

run "a_wildcard_secret_is_refused" {
  command = plan

  variables {
    # The listener reads '*' as a wildcard: this would match any value.
    origin_secret = "********************************"
  }

  expect_failures = [var.origin_secret]
}
