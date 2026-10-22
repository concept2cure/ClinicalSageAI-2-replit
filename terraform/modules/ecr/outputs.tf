output "repository_urls" {
  description = "Map of component name → ECR repository URL"
  value       = { for k, v in aws_ecr_repository.this : k => v.repository_url }
}

output "repository_arns" {
  description = "Map of component name → ECR repository ARN"
  value       = { for k, v in aws_ecr_repository.this : k => v.arn }
}

output "repository_policies" {
  description = "Repository policies by image name (empty when no other account reads them), for the stack's tests."
  value       = { for k, v in aws_ecr_repository_policy.readers : k => v.policy }
}
