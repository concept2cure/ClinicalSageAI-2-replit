output "alb_arn" {
  value = aws_lb.this.arn
}

output "alb_dns_name" {
  value = aws_lb.this.dns_name
}

output "alb_zone_id" {
  value = aws_lb.this.zone_id
}

output "api_target_group_arn" {
  value = aws_lb_target_group.api.arn
}

output "https_listener_arn" {
  value = aws_lb_listener.https.arn
}

output "alb_security_group_id" {
  value = aws_security_group.alb.id
}

output "origin_secret_header_name" {
  description = "Header CloudFront must send with origin_secret for the listener to forward the request."
  value       = local.origin_secret_header_name
}

# The request-count scaling policy names the load balancer and target group by
# their ARN suffixes (modules/ecs-fargate, aws_appautoscaling_policy.api_requests).
output "alb_arn_suffix" {
  value = aws_lb.this.arn_suffix
}

output "api_target_group_arn_suffix" {
  value = aws_lb_target_group.api.arn_suffix
}

# Where the load balancer writes its access log, for the stack's test that
# production writes one (terraform/stack/tests/detective_controls.tftest.hcl).
output "access_logs" {
  value = {
    enabled = one(aws_lb.this.access_logs).enabled
    bucket  = one(aws_lb.this.access_logs).bucket
  }
}
