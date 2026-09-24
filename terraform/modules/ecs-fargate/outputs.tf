output "cluster_id" {
  value = aws_ecs_cluster.this.id
}

output "cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "api_service_name" {
  value = aws_ecs_service.api.name
}

output "worker_service_name" {
  value = aws_ecs_service.worker.name
}

output "ecs_tasks_security_group_id" {
  value = aws_security_group.ecs_tasks.id
}

output "execution_role_arn" {
  value = aws_iam_role.ecs_execution.arn
}

output "task_role_arn" {
  value = aws_iam_role.ecs_task.arn
}

# Read by terraform/environments/production/tests/ and
# scripts/ops/terraform-preflight-proof.mjs to check the rendered task
# definitions against the production boot contract before any deploy. They
# carry names, secret ARNs and plain configuration — never a secret's value.
output "api_container" {
  description = <<-EOT
    The API container definition as rendered into the task definition. The deploy
    preflight (.github/workflows/deploy-aws.yml) reads the same fields off the
    registered task definition; the stack's deploy_targets output reads its name.
    Exposed so the boot contract can be checked at plan time (terraform/stack/tests).
    Carries names, plain environment values and secret ARNs, never secret values.
  EOT
  value       = jsondecode(aws_ecs_task_definition.api.container_definitions)[0]
}

output "worker_container" {
  description = "The worker container definition as rendered, for the same checks."
  value       = jsondecode(aws_ecs_task_definition.worker.container_definitions)[0]
}

output "execution_secrets_policy" {
  description = "The execution role's Secrets Manager grant (JSON policy document)"
  value       = aws_iam_role_policy.ecs_execution_secrets.policy
}
