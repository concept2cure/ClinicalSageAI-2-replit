# ── Which deployment ────────────────────────────────────────────────────────

variable "environment" {
  type        = string
  description = "production or staging. Decides resource names; production's must match what .github/workflows/deploy-aws.yml targets."
  validation {
    condition     = contains(["production", "staging"], var.environment)
    error_message = "environment must be production or staging."
  }
}

variable "region" {
  type = string
}

# ── Networking ──────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  type = string
}

variable "public_subnets" {
  type = list(string)
}

variable "private_subnets" {
  type = list(string)
}

variable "azs" {
  type = list(string)
}

# ── Sizes and retention (the environments differ here, and only here) ───────

variable "rds_instance_class" {
  type = string
}

variable "rds_allocated_storage" {
  type = number
}

variable "rds_max_allocated_storage" {
  type = number
}

variable "rds_multi_az" {
  type = bool
}

variable "rds_backup_retention_days" {
  type = number
}

variable "rds_deletion_protection" {
  type = bool
}

variable "rds_engine_version" {
  type = string
}

variable "api_cpu" {
  type = number
}

variable "api_memory" {
  type = number
}

variable "api_desired_count" {
  type = number
}

variable "worker_desired_count" {
  type = number
}

variable "alb_deletion_protection" {
  type = bool
}

variable "evidence_object_lock_mode" {
  type        = string
  description = "COMPLIANCE for production Part 11 evidence; GOVERNANCE lets staging be torn down."
}

variable "evidence_retention_days" {
  type = number
}

# ── Image ───────────────────────────────────────────────────────────────────

variable "image_tag" {
  type        = string
  description = "Immutable container image tag/digest to deploy (e.g. sha-<gitsha> or @sha256:...). Must not be 'latest'."

  validation {
    condition     = var.image_tag != "latest"
    error_message = "image_tag must be an immutable tag or digest, not the mutable 'latest' tag."
  }
}

# ── TLS / domain ────────────────────────────────────────────────────────────

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
  description = "Custom domain names for CloudFront"

  # Checked here because it is known at plan. The same rule in modules/cloudfront
  # waits for the ALB's DNS name, which exists only once apply has created the ALB.
  validation {
    condition     = length(var.domain_aliases) > 0
    error_message = "The API is routed through CloudFront, which needs a custom domain that the ALB's certificate (acm_certificate_arn) also covers."
  }
}

variable "cloudfront_origin_secret" {
  type        = string
  sensitive   = true
  description = "Header value CloudFront adds and the ALB requires (modules/alb origin_secret): 32-128 letters, digits, '-' or '_'."
}

# ── Secrets: the boot contract (D1 brief B3) ────────────────────────────────
# deploy-aws.yml refuses a task definition missing any of these, and the app
# refuses to boot without them. Generate as SOP-SEC-001 §4 describes, and keep
# them outside the app database.

variable "jwt_secret" {
  type      = string
  sensitive = true

  validation {
    condition     = length(var.jwt_secret) >= 32
    error_message = "jwt_secret must be at least 32 characters: the app refuses to boot otherwise (server/config/environment.ts)."
  }
}

variable "refresh_token_secret" {
  type      = string
  sensitive = true
  validation {
    condition     = length(var.refresh_token_secret) >= 32
    error_message = "refresh_token_secret must be at least 32 characters (server/config/environment.ts)."
  }
}

variable "mfa_encryption_key" {
  type      = string
  sensitive = true
  validation {
    condition     = length(var.mfa_encryption_key) >= 32
    error_message = "mfa_encryption_key must be at least 32 characters (server/config/environment.ts assertMfaKeyPosture)."
  }
}

variable "audit_hmac_key" {
  type      = string
  sensitive = true
  validation {
    condition     = length(var.audit_hmac_key) >= 32
    error_message = "audit_hmac_key must be at least 32 characters (server/services/audit/auditSealPosture.ts)."
  }
}

variable "audit_hmac_secret" {
  type      = string
  sensitive = true
  validation {
    condition     = length(var.audit_hmac_secret) >= 32
    error_message = "audit_hmac_secret must be at least 32 characters (server/lib/tamper-proof-audit.ts)."
  }
}

variable "connector_encryption_key" {
  type      = string
  sensitive = true
  validation {
    condition     = length(var.connector_encryption_key) >= 32
    error_message = "connector_encryption_key must be at least 32 characters (server/services/connectors/connector-registry.ts)."
  }
}

variable "openai_api_key" {
  type      = string
  sensitive = true
}

# D1 brief B4. Which AI provider may see which data classes is a compliance
# decision, not an engineering default, so there is none.
variable "ai_provider_placement_approvals" {
  type        = string
  description = "AI_PROVIDER_PLACEMENT_APPROVALS: a JSON object. The founder's decision (D1 brief B4); record the value and date in the D1 evidence."
  validation {
    condition     = can(keys(jsondecode(var.ai_provider_placement_approvals)))
    error_message = "ai_provider_placement_approvals must be a JSON object (server/services/ai-gateway/sensitive-placement-policy.ts refuses anything else)."
  }
}

variable "tags" {
  type    = map(string)
  default = {}
}
