output "secret_arns" {
  description = "Map of secret name → ARN"
  value       = { for k, v in aws_secretsmanager_secret.this : k => v.arn }
}

output "secret_arns_list" {
  description = "List of all secret ARNs (for IAM policies)"
  value       = [for v in aws_secretsmanager_secret.this : v.arn]
}

output "kms_key_ids" {
  description = "Secret name => the KMS key encrypting it (null: the AWS-managed aws/secretsmanager key)."
  value       = { for k, s in aws_secretsmanager_secret.this : k => s.kms_key_id }
}

output "recovery_windows" {
  description = "Secret name => days a deleted secret is kept before it is gone (0: immediately)."
  value       = { for k, s in aws_secretsmanager_secret.this : k => s.recovery_window_in_days }
}
