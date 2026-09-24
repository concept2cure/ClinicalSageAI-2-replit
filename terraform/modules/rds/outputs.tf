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
  description = "ARN of the RDS-managed master secret (JSON, not a URL). Null when var.master_password is set."
  value       = try(aws_db_instance.this.master_user_secret[0].secret_arn, null)
}

output "db_name" {
  description = "Database name"
  value       = aws_db_instance.this.db_name
}

output "master_username" {
  description = "Owner-role username, for composing the migrations connection URL"
  value       = aws_db_instance.this.username
}
