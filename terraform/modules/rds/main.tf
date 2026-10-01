// RDS PostgreSQL instance — 21 CFR Part 11 compliant
// Encryption at rest, multi-AZ, automated backups, deletion protection

resource "aws_db_subnet_group" "this" {
  name       = "${var.identifier}-subnet-group"
  subnet_ids = var.subnet_ids
  tags       = var.tags
}

resource "aws_db_instance" "this" {
  identifier = var.identifier

  engine = "postgres"
  # The MAJOR version (2026-10-01, B10): RDS creates on its current minor of
  # it and applies minor (security) patches in maintenance_window below. A
  # pinned minor is retired by AWS on a schedule; "15.4" was, so the first apply
  # and any rebuild from nothing would have failed to create the instance. A
  # major upgrade is never automatic: it changes the validated system and is
  # planned, tested and applied deliberately. The version actually running is
  # the engine_version_actual output, for the IQ record.
  engine_version              = var.engine_version
  auto_minor_version_upgrade  = true
  allow_major_version_upgrade = false
  instance_class              = var.instance_class
  allocated_storage           = var.allocated_storage
  max_allocated_storage       = var.max_allocated_storage

  db_name  = var.database_name
  username = var.master_username

  # Who owns the master credential (B1, 2026-09-23). With
  # manage_master_user_password = true, RDS stores the credential in Secrets
  # Manager as JSON — {"username":…,"password":…} — and an ECS `secrets` entry
  # pointing at it injects that JSON string verbatim. The application reads
  # DATABASE_URL as a connection string (server/startup/env.ts), so a task
  # wired that way cannot connect at all. Passing master_password lets the
  # environment compose real postgresql:// URLs; leaving it null keeps the
  # AWS-managed behaviour for any caller that still wants it.
  password                    = var.master_password
  manage_master_user_password = var.master_password == null ? true : null

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = var.security_group_ids

  multi_az                  = var.multi_az
  storage_encrypted         = true
  kms_key_id                = var.kms_key_id
  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.identifier}-final-snapshot"

  backup_retention_period = var.backup_retention_days
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  performance_insights_enabled = true
  monitoring_interval          = 60
  monitoring_role_arn          = aws_iam_role.rds_monitoring.arn

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  parameter_group_name = aws_db_parameter_group.this.name

  # The CA the server certificate chains to. Pinned so it cannot drift away from
  # the bundle the image trusts (Dockerfile.optimized, rds-global-bundle.pem);
  # an unpinned instance takes whatever RDS's current default CA is.
  ca_cert_identifier = var.ca_cert_identifier

  tags = merge(var.tags, {
    Part11Control   = "DataIntegrity"
    ComplianceScope = "ElectronicRecords"
    BackupRetention = "${var.backup_retention_days}days"
  })
}

resource "aws_db_parameter_group" "this" {
  name   = "${var.identifier}-params"
  family = "postgres${split(".", var.engine_version)[0]}"

  # Refuse plaintext connections at the server, stated rather than inherited.
  # The engine default has changed across majors, and a Part 11 control should
  # not depend on which one the instance runs. Without it, only the client
  # insists on TLS — and a client that forgot (a psql session, a URL with
  # sslmode=disable, which node-postgres honours over the app's own TLS
  # settings) would be served in the clear.
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

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

  # pgaudit runs only when preloaded (2026-10-01, security audit INF-13, plan
  # P1-11). pgaudit.log below was set from the start and recorded nothing for
  # want of this. A static parameter: it takes effect at boot, which a new
  # instance does after this group is attached. It replaces RDS's default list,
  # so pg_stat_statements is named too. deploy-migrate creates the extension and
  # refuses to roll services when DB_AUDIT_REQUIRED=pgaudit and it is not
  # recording (scripts/db/database-audit.mjs).
  parameter {
    name         = "shared_preload_libraries"
    value        = "pg_stat_statements,pgaudit"
    apply_method = "pending-reboot"
  }

  parameter {
    name         = "pgaudit.log"
    value        = "write,ddl"
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
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "monitoring.rds.amazonaws.com" }
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}
