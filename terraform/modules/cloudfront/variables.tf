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

variable "api_origin_secret_header_name" {
  type        = string
  description = "Header the ALB requires on every request it forwards (modules/alb output origin_secret_header_name)."
  default     = ""
}

variable "api_origin_secret" {
  type        = string
  sensitive   = true
  description = "Value of that header; the same value the ALB module is given as origin_secret."
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

variable "waf_rate_limit_per_5_minutes" {
  type        = number
  description = "Requests one IP may make in 5 minutes before the web ACL blocks it (P-11)."
  default     = 2000
  validation {
    condition     = var.waf_rate_limit_per_5_minutes >= 100
    error_message = "AWS WAF's smallest rate limit is 100 requests per evaluation window."
  }
}

variable "waf_common_rule_set_action" {
  type        = string
  description = "count for the first two weeks (P-11), then block. Its body-size rule counts either way."
  default     = "count"
  validation {
    condition     = contains(["count", "block"], var.waf_common_rule_set_action)
    error_message = "waf_common_rule_set_action is count or block."
  }
}
