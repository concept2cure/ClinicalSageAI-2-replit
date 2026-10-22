variable "region" {
  type    = string
  default = "us-east-1"
}

variable "state_bucket_name" {
  type        = string
  description = "S3 bucket for Terraform remote state. Leave unset: the bucket is named for the account, c2c-tfstate-<account id>-<region>."
  default     = null
}

variable "tags" {
  type = map(string)
  default = {
    Project   = "concept2cure"
    ManagedBy = "terraform"
  }
}
