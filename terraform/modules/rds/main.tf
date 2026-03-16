// RDS PostgreSQL instance — 21 CFR Part 11 compliant
// Encryption at rest, multi-AZ, automated backups, deletion protection

resource "aws_db_subnet_group" "this" {
  name       = "${var.identifier}-subnet-group"
  subnet_ids = var.subnet_ids
  tags       = var.tags
}

resource "aws_db_instance" "this" {
  identifier = var.identifier

  engine               = "postgres"
  engine_version       = var.engine_version
  instance_class       = var.instance_class
  allocated_storage    = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage

  db_name  = var.database_name
  username = var.master_username
  manage_master_user_password = true  # AWS manages the password in Secrets Manager

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = var.security_group_ids

  multi_az                = var.multi_az
  storage_encrypted       = true
  kms_key_id              = var.kms_key_id
  deletion_protection     = var.deletion_protection
  skip_final_snapshot     = false
  final_snapshot_identifier = "${var.identifier}-final-snapshot"

  backup_retention_period = var.backup_retention_days
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  performance_insights_enabled = true
  monitoring_interval          = 60
  monitoring_role_arn          = aws_iam_role.rds_monitoring.arn

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  parameter_group_name = aws_db_parameter_group.this.name

  tags = merge(var.tags, {
    Part11Control       = "DataIntegrity"
    ComplianceScope     = "ElectronicRecords"
    BackupRetention     = "${var.backup_retention_days}days"
  })
}

resource "aws_db_parameter_group" "this" {
  name   = "${var.identifier}-params"
  family = "postgres${split(".", var.engine_version)[0]}"

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_statement"
    value = "ddl"
  }

  parameter {
    name  = "pgaudit.log"
    value = "write,ddl"
    apply_method = "pending-reboot"
  }

  tags = var.tags
}

# ── IAM role for Enhanced Monitoring ─────────────────────────────────────────

resource "aws_iam_role" "rds_monitoring" {
  name = "${var.identifier}-rds-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "monitoring.rds.amazonaws.com" }
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}
