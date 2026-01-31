variable "bucket_name" {
  type = string
}

variable "object_lock_mode" {
  type    = string
  default = "GOVERNANCE"
}

variable "retention_days" {
  type    = number
  default = 2555
}

variable "kms_key_id" {
  type = string
}

variable "kms_policy" {
  type = string
  default = ""
}

variable "tags" {
  type    = map(string)
  default = { Project = "ros-staging" }
}