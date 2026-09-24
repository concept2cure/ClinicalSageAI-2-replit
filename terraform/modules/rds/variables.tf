variable "identifier" {
  type        = string
  description = "RDS instance identifier"
}

variable "engine_version" {
  type    = string
  default = "15.4"
}

variable "instance_class" {
  type    = string
  default = "db.t3.medium"
}

variable "allocated_storage" {
  type    = number
  default = 50
}

variable "max_allocated_storage" {
  type    = number
  default = 200
}

variable "database_name" {
  type    = string
  default = "concept2cure_ri"

  # RDS for PostgreSQL DBName: letters, digits and underscores, starting with a
  # letter, at most 63 characters. The default was "concept2cure-ri", and the
  # hyphen fails CreateDBInstance at apply time, which `terraform validate`
  # never sees (D1 brief B2, docs/evidence/W2/2026-09-23/README.md). Checked
  # here so it fails at plan.
  validation {
    condition     = can(regex("^[A-Za-z][A-Za-z0-9_]{0,62}$", var.database_name))
    error_message = "database_name must start with a letter and contain only letters, digits and underscores (at most 63 characters): RDS rejects anything else at create time."
  }
}

variable "master_password" {
  type        = string
  default     = null
  sensitive   = true
  description = <<-EOT
    Master password Terraform owns. When set, RDS does NOT manage the password in
    Secrets Manager, so the caller can compose a real connection URL from it.

    Left null, RDS manages it (manage_master_user_password), and the secret it
    writes is JSON ({"username","password"}), not a URL. Production passed that
    secret's ARN as DATABASE_URL, so ECS injected the JSON string verbatim and
    the app could not connect (D1 brief B1).
  EOT
}

variable "master_username" {
  type    = string
  default = "c2c_admin"
}

variable "subnet_ids" {
  type        = list(string)
  description = "Subnet IDs for the DB subnet group"
}

variable "security_group_ids" {
  type        = list(string)
  description = "Security group IDs to attach to the RDS instance"
}

variable "multi_az" {
  type    = bool
  default = true
}

variable "kms_key_id" {
  type        = string
  description = "KMS key ARN for storage encryption (leave empty for default key)"
  default     = ""
}

variable "deletion_protection" {
  type    = bool
  default = true
}

variable "backup_retention_days" {
  type    = number
  default = 35
}

variable "tags" {
  type    = map(string)
  default = {}
}
