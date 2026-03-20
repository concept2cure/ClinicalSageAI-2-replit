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
  default = "concept2cure-ri"
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
