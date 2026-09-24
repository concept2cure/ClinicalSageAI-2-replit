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
output "api_container_definitions" {
  description = "Rendered API container definitions (JSON)"
  value       = aws_ecs_task_definition.api.container_definitions
}

output "worker_container_definitions" {
  description = "Rendered worker container definitions (JSON)"
  value       = aws_ecs_task_definition.worker.container_definitions
}

output "execution_secrets_policy" {
  description = "The execution role's Secrets Manager grant (JSON policy document)"
  value       = aws_iam_role_policy.ecs_execution_secrets.policy
}
