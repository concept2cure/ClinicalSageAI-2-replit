variable "vpc_cidr" {
  type    = string
  default = "10.9.0.0/16"
}

variable "public_subnets" {
  type    = list(string)
  default = ["10.9.101.0/24", "10.9.102.0/24"]
}

variable "private_subnets" {
  type    = list(string)
  default = ["10.9.1.0/24", "10.9.2.0/24"]
}

variable "azs" {
  type    = list(string)
  default = ["us-east-1a", "us-east-1b"]
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "eks_workloads_sg" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = { Project = "ros-staging" }
}

# Names the flow-log group, key and role, so staging and production can share
# an account without colliding (terraform/stack passes its long name).
variable "name" {
  type    = string
  default = "c2c"
}

# CIS AWS Foundations and the security audit ask for a year at least
# (MR-04 Stage 3 step 4).
variable "flow_log_retention_days" {
  type    = number
  default = 365
  validation {
    condition     = var.flow_log_retention_days >= 365
    error_message = "Flow logs are kept at least 365 days."
  }
}
