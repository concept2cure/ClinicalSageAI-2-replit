output "base_url" {
  description = "EMBEDDING_LOCAL_BASE_URL: the OpenAI-compatible root the API and the worker call (the client appends /embeddings)."
  value       = "http://${aws_service_discovery_service.this.name}.${aws_service_discovery_private_dns_namespace.this.name}:${var.port}/v1"
}

output "port" {
  value = var.port
}

output "model_id" {
  value = var.model_id
}

output "security_group_id" {
  value = aws_security_group.this.id
}

output "service_name" {
  value = aws_ecs_service.this.name
}

# Read by terraform/stack/tests/boot_contract.tftest.hcl: where the tasks run,
# who may reach them, what they run and where they log. Names, addresses and
# plain configuration; the service holds no secret.

output "service" {
  value = {
    cluster          = aws_ecs_service.this.cluster
    launch_type      = aws_ecs_service.this.launch_type
    subnets          = aws_ecs_service.this.network_configuration[0].subnets
    security_groups  = aws_ecs_service.this.network_configuration[0].security_groups
    assign_public_ip = aws_ecs_service.this.network_configuration[0].assign_public_ip
    load_balancers   = length(aws_ecs_service.this.load_balancer)
    registries       = [for r in aws_ecs_service.this.service_registries : r.registry_arn]
  }
}

output "ingress" {
  value = aws_security_group.this.ingress
}

output "egress" {
  value = aws_security_group.this.egress
}

output "discovery" {
  value = {
    namespace     = aws_service_discovery_private_dns_namespace.this.name
    namespace_id  = aws_service_discovery_private_dns_namespace.this.id
    namespace_vpc = aws_service_discovery_private_dns_namespace.this.vpc
    service_name  = aws_service_discovery_service.this.name
    service_arn   = aws_service_discovery_service.this.arn
  }
}

output "container" {
  value = jsondecode(aws_ecs_task_definition.this.container_definitions)[0]
}

output "log_group" {
  value = {
    name              = aws_cloudwatch_log_group.this.name
    retention_in_days = aws_cloudwatch_log_group.this.retention_in_days
    kms_key_id        = aws_cloudwatch_log_group.this.kms_key_id
  }
}
