variable "bucket_name" {
  type = string
}

variable "name_prefix" {
  type        = string
  description = "Prefix for the trail, log group, role and key alias (e.g. c2c-prod). They were hard-coded \"ros-staging-*\" in every environment."
}

variable "object_lock_mode" {
  type    = string
  default = "GOVERNANCE"
}

variable "retention_days" {
  type    = number
  default = 2555
}

variable "anchor_writer_role_arn" {
  type        = string
  default     = ""
  description = "The role that writes and reads the audit-chain anchors under anchors/ (security plan P0-8): the application task role. Empty grants nothing."
}

variable "tags" {
  type    = map(string)
  default = { Project = "ros-staging" }
}
