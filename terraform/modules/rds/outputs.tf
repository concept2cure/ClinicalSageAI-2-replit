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
