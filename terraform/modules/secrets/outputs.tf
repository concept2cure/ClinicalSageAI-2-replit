output "secret_arns" {
  description = "Map of secret name → ARN"
  value       = { for k, v in aws_secretsmanager_secret.this : k => v.arn }
}

output "secret_arns_list" {
  description = "List of all secret ARNs (for IAM policies)"
  value       = [for v in aws_secretsmanager_secret.this : v.arn]
}
