output "endpoint" {
  description = "RDS connection endpoint"
  value       = aws_db_instance.this.endpoint
}

output "address" {
  description = "RDS hostname"
  value       = aws_db_instance.this.address
}

output "port" {
  description = "RDS port"
  value       = aws_db_instance.this.port
}

output "master_user_secret_arn" {
  description = "ARN of the Secrets Manager secret containing the master password"
  # Empty when the caller supplied master_password: RDS then manages no secret.
  value = try(aws_db_instance.this.master_user_secret[0].secret_arn, null)
}

output "db_name" {
  description = "Database name"
  value       = aws_db_instance.this.db_name
}

output "master_username" {
  description = "Master username (the owner role migrations connect as)"
  value       = aws_db_instance.this.username
}

output "engine_version_actual" {
  description = "The PostgreSQL version RDS is running (major pinned, minor chosen and patched by RDS). Recorded in the IQ evidence."
  value       = aws_db_instance.this.engine_version_actual
}

output "parameters" {
  description = "The parameter group's settings, name => value, so the stack's tests can assert them (pgaudit preload, TLS)."
  value       = { for p in aws_db_parameter_group.this.parameter : p.name => p.value }
}

output "storage_kms_key_id" {
  description = "The KMS key encrypting the instance's storage, snapshots and automated backups (null: the AWS-managed aws/rds key)."
  value       = aws_db_instance.this.kms_key_id
}

output "performance_insights_kms_key_id" {
  description = "The KMS key encrypting Performance Insights data, which includes query text."
  value       = aws_db_instance.this.performance_insights_kms_key_id
}

output "instance_settings" {
  description = "The instance's storage, snapshot-tagging, monitoring and class settings, so the stack's tests can assert them (MR-03 OPS-04, OPS-30, DATA-13)."
  value = {
    instance_class         = aws_db_instance.this.instance_class
    storage_type           = aws_db_instance.this.storage_type
    copy_tags_to_snapshot  = aws_db_instance.this.copy_tags_to_snapshot
    database_insights_mode = aws_db_instance.this.database_insights_mode
    performance_insights   = aws_db_instance.this.performance_insights_enabled
  }
}
