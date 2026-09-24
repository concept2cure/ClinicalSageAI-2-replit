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
  description = "Additional security groups. The module's own group, which admits CloudFront alone, is always attached."
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

variable "origin_secret" {
  type        = string
  sensitive   = true
  description = <<-EOT
    Value CloudFront sends in the origin secret header (modules/cloudfront). The
    HTTPS listener forwards only requests that carry it and refuses the rest 403,
    because the security group alone admits every CloudFront distribution.
    Letters, digits, '-' and '_' only: the listener treats '*' and '?' as
    wildcards and compares case-insensitively. Changing it refuses API traffic
    until CloudFront has deployed the new value.
  EOT

  validation {
    condition     = can(regex("^[A-Za-z0-9_-]{32,128}$", var.origin_secret))
    error_message = "origin_secret must be 32 to 128 characters of letters, digits, '-' or '_'."
  }
}
