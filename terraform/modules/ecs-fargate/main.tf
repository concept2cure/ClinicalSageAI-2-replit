// ECS Fargate cluster + services for C2C API and Worker

# ── Cluster ──────────────────────────────────────────────────────────────────

resource "aws_ecs_cluster" "this" {
  name = var.cluster_name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = var.tags
}

# ── CloudWatch log groups ────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.cluster_name}/api"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${var.cluster_name}/worker"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

# ── Task execution IAM role (shared) ────────────────────────────────────────

resource "aws_iam_role" "ecs_execution" {
  name = "${var.cluster_name}-ecs-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Allow pulling secrets from Secrets Manager
resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "secrets-access"
  role = aws_iam_role.ecs_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = var.secret_arns
    }]
  })
}

# ── Task role (app permissions) ─────────────────────────────────────────────

resource "aws_iam_role" "ecs_task" {
  name = "${var.cluster_name}-ecs-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
  tags = var.tags
}

resource "aws_iam_role_policy" "ecs_task_s3" {
  name = "s3-access"
  role = aws_iam_role.ecs_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:PutObject", "s3:ListBucket"]
      Resource = var.s3_bucket_arns
    }]
  })
}

# ── Security group for ECS tasks ─────────────────────────────────────────────

resource "aws_security_group" "ecs_tasks" {
  name_prefix = "${var.cluster_name}-ecs-"
  description = "ECS Fargate tasks"
  vpc_id      = var.vpc_id

  ingress {
    description     = "From ALB only"
    from_port       = var.api_container_port
    to_port         = var.api_container_port
    protocol        = "tcp"
    security_groups = [var.alb_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, { Name = "${var.cluster_name}-ecs-sg" })
}

# ── API task definition ─────────────────────────────────────────────────────

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.cluster_name}-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "api"
    image     = var.api_image
    essential = true

    portMappings = [{
      containerPort = var.api_container_port
      protocol      = "tcp"
    }]

    environment = concat([
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = tostring(var.api_container_port) },
      { name = "TRUST_PROXY_HOPS", value = tostring(var.trust_proxy_hops) },
    ], var.api_environment)

    secrets = [for s in var.api_secrets : {
      name      = s.name
      valueFrom = s.value_from
    }]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.api.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "api"
      }
    }

    # LIVENESS, and runnable in this image (B5, 2026-09-23).
    #
    # It was `wget …/api/health`. The image (Dockerfile.optimized) installs curl,
    # not wget, so the check could never pass: every task unhealthy, every
    # deploy rolled back by the circuit breaker.
    #
    # It is NOT /readyz, which the 2026-09-23 brief proposed. /readyz answers 503
    # whenever the database, the schema OR AnA is down, and AnA's verdict is
    # recorded once at boot (server/startup/ana-readiness-state.ts). A failing
    # container check makes ECS REPLACE the task, so /readyz here would restart
    # every task whose AnA verdict was latched down, and during a Multi-AZ
    # failover would replace every task at once — turning a 60-second database
    # event into an outage. Restarting cannot fix a dependency; it can only take
    # the process down with it. So this asks the one question a restart
    # answers: is the process alive.
    #
    # Readiness belongs in the deploy's post-roll check, which reports without
    # killing. As of 2026-09-24 NOTHING in the deploy path asks /readyz — the
    # smoke-test job probes the static /api/health (B9's lane is changing that).
    # Until it does, a deploy can report success while /readyz is 503.
    # node is the image's own interpreter; exec form needs no shell.
    healthCheck = {
      command     = ["CMD", "node", "-e", "require('http').get('http://localhost:${var.api_container_port}/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]
      interval    = 30
      timeout     = 10
      retries     = 3
      startPeriod = 60
    }
  }])

  tags = var.tags
}

# ── Worker task definition ──────────────────────────────────────────────────

resource "aws_ecs_task_definition" "worker" {
  family                   = "${var.cluster_name}-worker"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.worker_cpu
  memory                   = var.worker_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "worker"
    image     = var.worker_image
    essential = true

    environment = concat([
      { name = "NODE_ENV", value = "production" },
    ], var.worker_environment)

    secrets = [for s in var.worker_secrets : {
      name      = s.name
      valueFrom = s.value_from
    }]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.worker.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "worker"
      }
    }
  }])

  tags = var.tags
}

# ── API service ─────────────────────────────────────────────────────────────

resource "aws_ecs_service" "api" {
  name            = "${var.cluster_name}-api"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.api_target_group_arn
    container_name   = "api"
    container_port   = var.api_container_port
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  # The load balancer's checks (and ECS's reaction to them — it replaces a task
  # the target group marks unhealthy) start once the task is registered. Give a
  # cold start room before that counts, the way the container check's
  # startPeriod does.
  health_check_grace_period_seconds = 120

  tags = var.tags

  # Terraform owns the task definition's CONTENT; the deploy pipeline owns which
  # revision runs. deploy-aws.yml registers a new revision copied from the latest
  # one with only the image changed to the pinned digest, then moves the service
  # onto it. Without this, the next `terraform apply` moved the service back to
  # Terraform's own revision — the image by tag, not by digest — undoing the
  # deploy it did not know had happened.
  lifecycle {
    ignore_changes = [task_definition]
  }
}

# ── Worker service ──────────────────────────────────────────────────────────

resource "aws_ecs_service" "worker" {
  name            = "${var.cluster_name}-worker"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = var.worker_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = var.tags

  # No ignore_changes here, unlike the api service: no pipeline deploys the
  # worker (deploy-aws.yml has no worker job; B7), so Terraform is the only
  # thing that moves it to a new revision. Ignoring task_definition would pin
  # it to its first revision for good.
}
