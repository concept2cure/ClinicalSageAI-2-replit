variable "region" {
  type    = string
  default = "us-east-1"
}

variable "state_bucket_name" {
  type        = string
  description = "S3 bucket for Terraform remote state"
  default     = "c2c-terraform-state"
}

variable "lock_table_name" {
  type        = string
  description = "DynamoDB table for Terraform state locking"
  default     = "c2c-terraform-lock"
}

variable "tags" {
  type = map(string)
  default = {
    Project   = "concept2cure"
    ManagedBy = "terraform"
  }
}
