variable "region" {
  type    = string
  default = "us-east-1"
}

variable "vpc_cidr" {
  type    = string
  default = "10.10.0.0/16"
}

variable "public_subnets" {
  type    = list(string)
  default = ["10.10.101.0/24", "10.10.102.0/24"]
}

variable "private_subnets" {
  type    = list(string)
  default = ["10.10.1.0/24", "10.10.2.0/24"]
}

variable "azs" {
  type    = list(string)
  default = ["us-east-1a", "us-east-1b"]
}

# ── Compute ──────────────────────────────────────────────────────────────────

variable "rds_instance_class" {
  type    = string
  default = "db.t3.medium"
}

variable "api_cpu" {
  type    = number
  default = 1024
}

variable "api_memory" {
  type    = number
  default = 2048
}

variable "api_desired_count" {
  type    = number
  default = 2
}

variable "worker_desired_count" {
  type    = number
  default = 1
}

# ── TLS / Domain ─────────────────────────────────────────────────────────────

variable "acm_certificate_arn" {
  type        = string
  description = "ACM certificate ARN for ALB HTTPS"
}

variable "cloudfront_certificate_arn" {
  type        = string
  description = "ACM certificate ARN in us-east-1 for CloudFront"
  default     = ""
}

variable "domain_aliases" {
  type        = list(string)
  description = "Custom domain names for CloudFront"
  default     = []
}

# ── Secrets (pass via -var or TF_VAR_ env) ───────────────────────────────────

variable "jwt_secret" {
  type      = string
  sensitive = true
}

variable "openai_api_key" {
  type      = string
  sensitive = true
}

# ── Tags ─────────────────────────────────────────────────────────────────────

variable "tags" {
  type = map(string)
  default = {
    Project     = "concept2cure"
    Environment = "production"
  }
}
