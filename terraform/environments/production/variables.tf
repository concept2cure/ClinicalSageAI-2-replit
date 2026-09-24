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
}

# ── Secrets (pass via -var or TF_VAR_ env) ───────────────────────────────────

variable "jwt_secret" {
  type      = string
  sensitive = true

  validation {
    condition     = length(var.jwt_secret) >= 32
    error_message = "jwt_secret must be at least 32 characters (server/config/environment.ts refuses to boot on less)."
  }
}

# ── The production boot contract (B3, 2026-09-23) ────────────────────────────
#
# Each of these is a variable the application refuses to boot without in
# production, and a name .github/workflows/deploy-aws.yml's preflight refuses a
# task definition without. None has a default, deliberately: a default would be
# a shared value in a public repository, and an apply that stops asking for the
# value is the right failure. Generate them as SOP-SEC-001 §4 describes
# (`openssl rand -base64 48`), and pass them as TF_VAR_<name>.
#
# Before this change production Terraform provided three of the twelve names the
# preflight requires, so no task definition it produced could have deployed.

variable "refresh_token_secret" {
  type        = string
  sensitive   = true
  description = "Refresh-token signing secret. >= 32 characters and different from jwt_secret (server/config/environment.ts)."
  validation {
    condition     = length(var.refresh_token_secret) >= 32
    error_message = "refresh_token_secret must be at least 32 characters."
  }
}

variable "mfa_encryption_key" {
  type        = string
  sensitive   = true
  description = "Encrypts enrolled TOTP secrets at rest. >= 32 characters; never derived from JWT_SECRET in production."
  validation {
    condition     = length(var.mfa_encryption_key) >= 32
    error_message = "mfa_encryption_key must be at least 32 characters."
  }
}

variable "audit_hmac_key" {
  type        = string
  sensitive   = true
  description = "Keys the HMAC seal over each audit_logs link (server/services/audit/auditSealPosture.ts). >= 32 characters."
  validation {
    condition     = length(var.audit_hmac_key) >= 32
    error_message = "audit_hmac_key must be at least 32 characters."
  }
}

variable "audit_hmac_secret" {
  type        = string
  sensitive   = true
  description = "Signs the tamper-proof audit chain (server/lib/tamper-proof-audit.ts). >= 32 characters; no accept-unsealed equivalent."
  validation {
    condition     = length(var.audit_hmac_secret) >= 32
    error_message = "audit_hmac_secret must be at least 32 characters."
  }
}

variable "connector_encryption_key" {
  type        = string
  sensitive   = true
  description = "Encrypts stored connector credentials (server/services/connectors/connector-registry.ts). >= 32 characters."
  validation {
    condition     = length(var.connector_encryption_key) >= 32
    error_message = "connector_encryption_key must be at least 32 characters."
  }
}

variable "app_url" {
  type        = string
  description = "The deployment's public https origin. Password-reset and invitation links are built on it, never on the request's Host header (server/services/password-setup-token.ts), and it is the origin sign-in is accepted from (ALLOWED_ORIGINS, main.tf)."
  validation {
    # Exactly the string a browser sends as its Origin header: lowercase host,
    # no path, no trailing slash, no default port. csrfProtection compares the
    # header to ALLOWED_ORIGINS by string equality, so "https://App.example.com/"
    # would boot, pass /readyz, and refuse every sign-in with 403.
    condition = (
      can(regex("^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{1,5})?$", var.app_url))
      && !endswith(var.app_url, ":443")
    )
    error_message = "app_url must be a lowercase https origin with no path or trailing slash, e.g. https://app.example.com."
  }
}

# B4 — a founder decision, deliberately not defaulted. Which AI provider may
# receive which data classes (pii, phi), in which region, under what retention,
# for which intended uses. Binding in production because
# AI_SENSITIVE_DATA_POLICY_MODE is fixed to `enforce` below. The value is
# configuration, not a secret: it is set as a plain environment variable so the
# deployed decision is readable in the task definition it governs.
variable "ai_provider_placement_approvals" {
  type        = string
  description = "JSON object: provider → {region, zeroRetentionApproved, approvedDataClasses, approvedIntendedUses}. See .env.example."
  validation {
    # try(), not can() && …: Terraform evaluates both sides of &&, so a JSON
    # array would raise "Invalid function argument" instead of this message.
    condition     = length(try(keys(jsondecode(var.ai_provider_placement_approvals)), [])) > 0
    error_message = "ai_provider_placement_approvals must be a non-empty JSON object keyed by provider."
  }
  validation {
    # The shape readProviderPlacementApprovals accepts, and the one rule
    # assertSensitivePlacementConfiguration adds (server/services/ai-gateway/
    # sensitive-placement-policy.ts). Each is a refusal at import time, so a
    # value that fails here would crash-loop every task instead of failing the
    # plan. Per provider: region a non-blank string; zeroRetentionApproved a
    # boolean; approvedDataClasses a list of only "pii"/"phi";
    # approvedIntendedUses a list of non-blank strings; and a non-empty
    # approvedDataClasses requires zeroRetentionApproved = true.
    # `tostring(x) == x` is a string test: == never converts, so it is false
    # for a number or a bool. `can(concat(x, []))` is a list test: an object
    # or a string fails it.
    condition = alltrue([
      for provider, a in try(jsondecode(var.ai_provider_placement_approvals), {}) : try(
        trimspace(provider) != ""
        && can(keys(a))
        && tostring(a.region) == a.region && trimspace(a.region) != ""
        && (a.zeroRetentionApproved == true || a.zeroRetentionApproved == false)
        && can(concat(a.approvedDataClasses, []))
        && alltrue([for c in a.approvedDataClasses : c == "pii" || c == "phi"])
        && can(concat(a.approvedIntendedUses, []))
        && alltrue([for u in a.approvedIntendedUses : tostring(u) == u && trimspace(u) != ""])
        && (length(a.approvedDataClasses) == 0 || a.zeroRetentionApproved == true),
        false
      )
    ])
    error_message = "Each ai_provider_placement_approvals entry must be {region: non-blank string, zeroRetentionApproved: bool, approvedDataClasses: [\"pii\"|\"phi\"...], approvedIntendedUses: [non-blank strings]}, and approving pii or phi requires zeroRetentionApproved = true. The app refuses to boot on anything else."
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
