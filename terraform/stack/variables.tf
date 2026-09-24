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

  # The first alias becomes APP_URL and ALLOWED_ORIGINS (main.tf app_origin).
  # csrfProtection compares the browser's Origin header by string equality,
  # and a browser sends the host lowercased with no trailing dot, so
  # "App.example.com" would boot, pass /readyz, and 403 every sign-in.
  validation {
    condition = alltrue([
      for d in var.domain_aliases : can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$", d))
    ])
    error_message = "Each domain alias must be a lowercase hostname with no scheme, port, path or trailing dot, e.g. app.example.com."
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
    # try(), not can() && …: Terraform evaluates both sides of &&.
    condition     = length(try(keys(jsondecode(var.ai_provider_placement_approvals)), [])) > 0
    error_message = "ai_provider_placement_approvals must be a non-empty JSON object keyed by provider (server/services/ai-gateway/sensitive-placement-policy.ts refuses anything else, '{}' included)."
  }
  validation {
    # The shape readProviderPlacementApprovals accepts, and the one rule
    # assertSensitivePlacementConfiguration adds. Each is a refusal at import
    # time, so a value that fails here would crash-loop every task instead of
    # failing the plan. Per provider: region a non-blank string;
    # zeroRetentionApproved a boolean; approvedDataClasses a list of only
    # "pii"/"phi"; approvedIntendedUses a list of non-blank strings; and a
    # non-empty approvedDataClasses requires zeroRetentionApproved = true.
    # `tostring(x) == x` is a string test: == never converts, so it is false
    # for a number or a bool. `can(concat(x, []))` is a list test.
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

variable "tags" {
  type    = map(string)
  default = {}
}

# ── GitHub deploy roles (github_deploy.tf) ───────────────────────────────────

variable "github_repository" {
  type        = string
  description = "owner/repo whose Actions deploy this environment."
  default     = "concept2cure/ClinicalSageAI-2-replit"
}

variable "github_build_subjects" {
  type        = list(string)
  description = "OIDC subjects (after repo:<repo>:) for the build role: jobs outside the GitHub environment. deploy-aws.yml runs on v* tags and on workflow_dispatch from the branch."
  default     = ["ref:refs/tags/v*", "ref:refs/heads/concept2cure-v2"]
}

variable "create_github_oidc_provider" {
  type        = bool
  description = "Create the account's GitHub OIDC provider. One per account: set false for an environment that shares an account with one that already created it (the account-topology decision in docs/evidence/W2/2026-09-23b/README.md)."
}
