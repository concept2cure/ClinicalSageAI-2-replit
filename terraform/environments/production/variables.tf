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

# ── Container image ──────────────────────────────────────────────────────────
# Immutable, deployer-supplied image reference. No default so a mutable
# `:latest` tag can never be silently deployed — the deploy pipeline must pass
# an explicit SHA/digest-pinned tag (e.g. -var "image_tag=sha-<gitsha>").
# TODO(GA-blocker): pin to image digest (sha256:...) instead of a tag for
# fully reproducible, rollback-safe deploys.
variable "image_tag" {
  type        = string
  description = "Immutable container image tag/digest to deploy (e.g. sha-<gitsha> or @sha256:...). Must not be 'latest'."

  validation {
    condition     = var.image_tag != "latest"
    error_message = "image_tag must be an immutable tag or digest, not the mutable 'latest' tag."
  }
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

  # Checked here because it is known at plan. The same rule in modules/cloudfront
  # waits for the ALB's DNS name, which exists only once apply has created the ALB.
  validation {
    condition     = length(var.domain_aliases) > 0
    error_message = "Production routes the API through CloudFront, which needs a custom domain that the ALB's certificate (acm_certificate_arn) also covers."
  }
}

# ── Secrets (pass via -var or TF_VAR_ env) ───────────────────────────────────

variable "jwt_secret" {
  type      = string
  sensitive = true

  validation {
    condition     = length(var.jwt_secret) >= 32
    error_message = "jwt_secret must be at least 32 characters: the app refuses to boot otherwise (server/config/environment.ts)."
  }
}

# ── The production boot contract (D1 brief B3) ───────────────────────────────
# deploy-aws.yml refuses a task definition missing any of these, and the app
# refuses to boot without them. No defaults: plan stops until each is supplied.
# Generate them as SOP-SEC-001 §4 describes, and keep them outside the app
# database.

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

# D1 brief B4. Which AI provider may see which data classes is a compliance
# decision, not an engineering default, so there is none. The value is the JSON
# object server/services/ai-gateway/sensitive-placement-policy.ts reads: per
# provider, its region, retention and approved data classes and uses.
variable "ai_provider_placement_approvals" {
  type        = string
  description = "AI_PROVIDER_PLACEMENT_APPROVALS: a JSON object. The founder's decision (D1 brief B4); record the value and date in the D1 evidence."
  validation {
    condition     = can(keys(jsondecode(var.ai_provider_placement_approvals)))
    error_message = "ai_provider_placement_approvals must be a JSON object (server/services/ai-gateway/sensitive-placement-policy.ts refuses anything else)."
  }
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

# ── CloudFront → ALB origin secret (pass via -var or TF_VAR_ env) ────────────

variable "cloudfront_origin_secret" {
  type        = string
  sensitive   = true
  description = "Header value CloudFront adds and the ALB requires (modules/alb origin_secret): 32-128 letters, digits, '-' or '_'."
}
