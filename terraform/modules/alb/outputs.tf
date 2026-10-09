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
