variable "bucket_name" {
  type        = string
  description = "S3 bucket name for frontend assets"
}

variable "domain_aliases" {
  type        = list(string)
  description = "Custom domain names (e.g. [\"app.concept2cure.com\"])"
  default     = []
}

variable "certificate_arn" {
  type        = string
  description = "ACM certificate ARN (must be in us-east-1 for CloudFront)"
  default     = ""
}

variable "api_domain_name" {
  type        = string
  description = "ALB DNS name for API origin (leave empty to skip API routing)"
  default     = ""
}

variable "price_class" {
  type    = string
  default = "PriceClass_100" # US, Canada, Europe
}

variable "tags" {
  type    = map(string)
  default = {}
}
