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

output "api_container" {
  description = <<-EOT
    The API container definition as rendered into the task definition. The deploy
    preflight (.github/workflows/deploy-aws.yml) reads the same fields off the
    registered task definition. Exposed so the boot contract can be checked at
    plan time (environments/production/tests), not only when a deploy is refused.
    Carries names, plain environment values and secret ARNs, never secret values.
  EOT
  value       = jsondecode(aws_ecs_task_definition.api.container_definitions)[0]
}
