variable "name_prefix" {
  type        = string
  description = "Prefix for the two role names, e.g. c2c-production."
}

variable "github_repository" {
  type        = string
  description = "owner/repo whose Actions may assume the roles."
  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository must be owner/repo."
  }
}

variable "deploy_environment" {
  type        = string
  description = "The GitHub environment whose jobs may assume the deploy role (its OIDC subject is repo:<repo>:environment:<name>)."
}

variable "build_subjects" {
  type        = list(string)
  description = <<-EOT
    OIDC subject suffixes (after repo:<repo>:) that may assume the BUILD role:
    the job that builds the image outside a GitHub environment (build-push),
    e.g. ref:refs/tags/rc-* and ref:refs/heads/concept2cure-v2. Empty: no build
    role at all. Production is empty: it never builds, it promotes (MR-03
    Stage 4).
  EOT
  validation {
    condition     = alltrue([for s in var.build_subjects : can(regex("^ref:refs/(heads|tags)/", s))])
    error_message = "build_subjects must be ref:refs/heads/… or ref:refs/tags/… subjects; environment subjects belong to the deploy role."
  }
}

variable "create_oidc_provider" {
  type        = bool
  description = "Create the account's token.actions.githubusercontent.com provider. One per account: false for a second environment in the same account."
}

variable "ecr_repository_arn" { type = string }
variable "ecs_cluster_arn" { type = string }
variable "ecs_api_service_arn" { type = string }
variable "one_off_task_families" {
  type        = list(string)
  description = "Families the deploy role may register and run one-off tasks from (migrate, provision)."
}
variable "pass_role_arns" {
  type        = list(string)
  description = "The ECS execution and task roles; the deploy role may pass them to ECS tasks only."
}
variable "promote_source_repository_arns" {
  type        = list(string)
  description = "Another account's image repositories the deploy role may read, to promote a verified image from (production reads staging's). Empty: none."
  default     = []
  validation {
    condition     = alltrue([for a in var.promote_source_repository_arns : can(regex("^arn:aws[a-z-]*:ecr:[a-z0-9-]+:[0-9]{12}:repository/.+$", a))])
    error_message = "promote_source_repository_arns must be ECR repository ARNs."
  }
}
variable "api_log_group_arn" { type = string }
variable "frontend_bucket_arn" { type = string }
variable "cloudfront_distribution_arn" { type = string }

variable "tags" {
  type    = map(string)
  default = {}
}
