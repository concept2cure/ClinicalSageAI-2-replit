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
