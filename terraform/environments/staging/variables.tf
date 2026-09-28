# Root variables for staging. Validation lives in terraform/stack, the one place
# the rules are written; a value that breaks one fails plan there.

variable "region" {
  type    = string
  default = "us-east-1"
}

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

# ── Compute ──────────────────────────────────────────────────────────────────

variable "rds_instance_class" {
  type    = string
  default = "db.t3.small"
}

variable "api_cpu" {
  type    = number
  default = 512
}

variable "api_memory" {
  type    = number
  default = 1024
}

variable "api_desired_count" {
  type    = number
  default = 1
}

variable "worker_desired_count" {
  type    = number
  default = 0
}

# ── Image, TLS, domain ───────────────────────────────────────────────────────

variable "image_tag" {
  type        = string
  description = "Immutable container image tag/digest to deploy (e.g. sha-<gitsha> or @sha256:...). Must not be 'latest'. Validated in terraform/stack."
}

variable "acm_certificate_arn" {
  type        = string
  description = "ACM certificate ARN for ALB HTTPS"
}

variable "cloudfront_certificate_arn" {
  type        = string
  description = "ACM certificate ARN in us-east-1 for CloudFront"
}

variable "domain_aliases" {
  type        = list(string)
  description = "Custom domain names for CloudFront. At least one: validated in terraform/stack."
}

# ── Secrets (pass via -var or TF_VAR_; validated in terraform/stack) ─────────

variable "cloudfront_origin_secret" {
  type      = string
  sensitive = true
}

variable "jwt_secret" {
  type      = string
  sensitive = true
}

variable "refresh_token_secret" {
  type      = string
  sensitive = true
}

variable "mfa_encryption_key" {
  type      = string
  sensitive = true
}

variable "audit_hmac_key" {
  type      = string
  sensitive = true
}

variable "audit_hmac_secret" {
  type      = string
  sensitive = true
}

variable "connector_encryption_key" {
  type      = string
  sensitive = true
}

variable "openai_api_key" {
  type      = string
  sensitive = true
}

# Login OTP delivery (SMTP); validated in terraform/stack. Port is fixed at 465.
variable "smtp_host" {
  type = string
}

variable "smtp_user" {
  type      = string
  sensitive = true
}

variable "smtp_pass" {
  type      = string
  sensitive = true
}

variable "smtp_from" {
  type = string
}

# D1 brief B4: the founder's compliance decision. No default, no example.
variable "ai_provider_placement_approvals" {
  type = string
}

variable "tags" {
  type = map(string)
  default = {
    Project     = "concept2cure"
    Environment = "staging"
  }
}
