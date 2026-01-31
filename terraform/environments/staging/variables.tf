variable "region" {
  type    = string
  default = "us-east-1"
}

variable "vpc_cidr" {
  type    = string
  default = "10.9.0.0/16"
}

variable "private_subnets" {
  type    = list(string)
  default = ["10.9.1.0/24", "10.9.2.0/24"]
}

variable "azs" {
  type = list(string)
  default = ["us-east-1a", "us-east-1b"]
}

variable "eks_workloads_sg" {
  type = string
  default = "sg-REPLACE_ME"
}

variable "evidence_bucket_name" {
  type = string
  default = "ros-staging-cloudtrail-evidence-local"
}

variable "evidence_kms_key_id" {
  type = string
  default = "alias/ros-staging-evidence"
}

variable "kms_policy" {
  type = string
  default = ""
}

variable "object_lock_mode" {
  type    = string
  default = "GOVERNANCE"
}

variable "retention_days" {
  type    = number
  default = 2555
}

variable "tags" {
  type = map(string)
  default = { Project = "ros-staging" }
}