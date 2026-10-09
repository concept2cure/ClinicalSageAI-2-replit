// Application Load Balancer for C2C services
//
// Reachable through CloudFront alone (W2 B9, docs/evidence/W2/2026-09-24-b9/).
// Two locks, because CloudFront's address list admits every distribution in
// AWS, not only ours:
//   1. the security group admits CloudFront's origin-facing addresses, on 443;
//   2. the HTTPS listener forwards a request only when it carries the origin
//      secret header our distribution adds (modules/cloudfront), and answers
//      anything else 403.
// With both in place the second-to-last X-Forwarded-For entry is the one
// CloudFront wrote, so the API can trust two hops (TRUST_PROXY_HOPS,
// server/config/trust-proxy.ts) and record the user rather than the edge.

locals {
  origin_secret_header_name = "X-Origin-Verify"
}

# Internet-facing on purpose: it is CloudFront's origin, and CloudFront reaches
# custom origins over the internet. What reaches it is limited below (B9): the
# security group admits CloudFront's origin-facing addresses alone, and the
# listener forwards only requests carrying the origin secret.
#trivy:ignore:AWS-0053
resource "aws_lb" "this" {
  name               = var.name
  internal           = false
  load_balancer_type = "application"
  # The module's own group always applies: the CloudFront-only rule lives there.
  security_groups = distinct(concat([aws_security_group.alb.id], var.security_group_ids))
  subnets         = var.public_subnet_ids

  enable_deletion_protection = var.deletion_protection

  # A header whose name is not a valid HTTP token never reaches the API.
  drop_invalid_header_fields = true

  access_logs {
    bucket  = var.access_logs_bucket
    prefix  = "alb-logs"
    enabled = var.access_logs_bucket != ""
  }

  tags = var.tags
}

# ── HTTPS listener (the only one) ───────────────────────────────────────────
#
# There is no port-80 listener. Nothing but CloudFront can connect, and
# CloudFront reaches this origin over HTTPS only; viewers are redirected from
# HTTP to HTTPS at CloudFront (modules/cloudfront, default_cache_behavior).

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  # Refuse by default. A request from another CloudFront distribution passes
  # the security group, but it does not carry our origin secret.
  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Forbidden"
      status_code  = "403"
    }
  }
}

resource "aws_lb_listener_rule" "from_cloudfront" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 1

  condition {
    http_header {
      http_header_name = local.origin_secret_header_name
      values           = [var.origin_secret]
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# ── Target groups ────────────────────────────────────────────────────────────

resource "aws_lb_target_group" "api" {
  name        = "${var.name}-api"
  port        = var.api_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip" # Required for Fargate

  health_check {
    enabled             = true
    path                = "/api/health"
    port                = "traffic-port"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 10
    interval            = 30
    matcher             = "200"
  }

  deregistration_delay = 30

  tags = var.tags
}

# ── Security group for ALB ───────────────────────────────────────────────────

# AWS-managed list of the addresses CloudFront uses to reach origins. One
# reference counts as its full weight (about 55 entries) against the rules
# quota of the security group, which is why there is one rule, not one per port.
data "aws_ec2_managed_prefix_list" "cloudfront_origin_facing" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_security_group" "alb" {
  name_prefix = "${var.name}-alb-"
  description = "ALB security group - HTTPS from CloudFront origin-facing addresses only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "HTTPS from CloudFront origin-facing addresses only"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront_origin_facing.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = [var.vpc_cidr]
  }

  tags = merge(var.tags, { Name = "${var.name}-alb-sg" })
}
