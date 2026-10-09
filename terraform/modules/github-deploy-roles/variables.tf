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
    the jobs that run without a GitHub environment (build-push, smoke-test),
    e.g. ref:refs/tags/v* and ref:refs/heads/concept2cure-v2.
  EOT
  validation {
    condition     = length(var.build_subjects) > 0 && alltrue([for s in var.build_subjects : can(regex("^ref:refs/(heads|tags)/", s))])
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
variable "api_log_group_arn" { type = string }
variable "frontend_bucket_arn" { type = string }
variable "cloudfront_distribution_arn" { type = string }

variable "tags" {
  type    = map(string)
  default = {}
}
