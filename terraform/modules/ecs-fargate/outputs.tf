output "cluster_id" {
  value = aws_ecs_cluster.this.id
}

output "cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "api_service_name" {
  value = aws_ecs_service.api.name
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

output "api_task_containers" {
  description = <<-EOT
    Every container of the API task definition, the API first: the containers
    that run beside it are part of what a deploy must carry (the virus scanner
    the API waits on), so the boot contract checks them too. Names, images and
    plain configuration; never a secret's value.
  EOT
  value       = jsondecode(aws_ecs_task_definition.api.container_definitions)
}

output "scanner_memory" {
  description = "The scanner container's hard memory limit (MiB), taken out of the API task's memory. The stack checks what is left for the application."
  value       = var.scanner_memory
}

output "execution_secrets_policy" {
  description = "The execution role's Secrets Manager grant (JSON policy document)"
  value       = aws_iam_role_policy.ecs_execution_secrets.policy
}

output "task_s3_policy" {
  description = "The task role's S3 grant (JSON policy document), for the stack's tests"
  value       = aws_iam_role_policy.ecs_task_s3.policy
}

# For the GitHub deploy role (modules/github-deploy-roles): the resources it
# may act on, by ARN.
output "cluster_arn" {
  value = aws_ecs_cluster.this.arn
}

output "api_service_arn" {
  value = aws_ecs_service.api.id # the service's id IS its ARN
}

output "api_log_group_arn" {
  value = aws_cloudwatch_log_group.api.arn
}

output "service_names" {
  description = "Every ECS service this module creates, so the stack's tests can say which exist."
  value       = [aws_ecs_service.api.name]
}

output "api_autoscaling" {
  description = "The API service's autoscaling target and its two policies, for the stack's tests."
  value = {
    min_capacity       = aws_appautoscaling_target.api.min_capacity
    max_capacity       = aws_appautoscaling_target.api.max_capacity
    scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
    policies = {
      cpu = {
        metric         = aws_appautoscaling_policy.api_cpu.target_tracking_scaling_policy_configuration[0].predefined_metric_specification[0].predefined_metric_type
        target         = aws_appautoscaling_policy.api_cpu.target_tracking_scaling_policy_configuration[0].target_value
        resource_label = null
      }
      requests = {
        metric         = aws_appautoscaling_policy.api_requests.target_tracking_scaling_policy_configuration[0].predefined_metric_specification[0].predefined_metric_type
        target         = aws_appautoscaling_policy.api_requests.target_tracking_scaling_policy_configuration[0].target_value
        resource_label = aws_appautoscaling_policy.api_requests.target_tracking_scaling_policy_configuration[0].predefined_metric_specification[0].resource_label
      }
    }
  }
}
