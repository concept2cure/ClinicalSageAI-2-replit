variable "name" {
  type        = string
  description = "Name prefix for ALB resources"
}

variable "vpc_id" {
  type = string
}

variable "vpc_cidr" {
  type = string
}

variable "public_subnet_ids" {
  type        = list(string)
  description = "Public subnets for ALB"
}

variable "security_group_ids" {
  type        = list(string)
  description = "Additional security groups (ALB SG is always attached)"
  default     = []
}

variable "certificate_arn" {
  type        = string
  description = "ACM certificate ARN for HTTPS"
}

variable "api_port" {
  type    = number
  default = 5000
}

variable "deletion_protection" {
  type    = bool
  default = true
}

variable "access_logs_bucket" {
  type    = string
  default = ""
}

variable "tags" {
  type    = map(string)
  default = {}
}
