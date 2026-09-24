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
  type = string
  # Was "concept2cure-ri". RDS for PostgreSQL's DBName allows letters, digits
  # and underscores and must start with a letter, so the hyphen fails
  # CreateDBInstance — at apply, after everything before it has been built.
  # `terraform validate` cannot see that; this validation makes plan see it.
  default = "concept2cure_ri"

  validation {
    condition     = can(regex("^[A-Za-z][A-Za-z0-9_]{0,62}$", var.database_name))
    error_message = "database_name must start with a letter and contain only letters, digits and underscores (RDS DBName rule, max 63)."
  }
}

variable "master_username" {
  type    = string
  default = "c2c_admin"
}

variable "master_password" {
  type        = string
  description = "Master password. When set, Terraform owns the credential and RDS manages no secret; when null, RDS manages it (manage_master_user_password)."
  default     = null
  sensitive   = true
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

variable "ca_cert_identifier" {
  type        = string
  description = "RDS server certificate CA. Must chain to a certificate in the bundle the image trusts (Dockerfile.optimized)."
  default     = "rds-ca-rsa2048-g1"
}
