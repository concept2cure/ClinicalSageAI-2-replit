// The self-hosted embedding lane (P1-54, ADR-0014 §1.5).
//
// An OpenAI-compatible embedding server — Hugging Face Text Embeddings
// Inference serving BAAI bge-m3 — on Fargate in the private subnets. The API and
// the worker reach it at EMBEDDING_LOCAL_BASE_URL with EMBEDDING_PROVIDER=local
// (server/services/ai-gateway/embeddings/embedding-provider.ts), so no tenant's
// text leaves the VPC to be embedded and every tenant has Vault and
// knowledge-base search without electing a second vendor. Since P1-45 the
// gateway refuses OpenAI embeddings for every organisation that has not elected
// OpenAI, and since P0-11 the stack provisions no OpenAI key unless one has.
//
// Reachable from the application tasks' security group alone. No public IP and
// no load balancer: the tasks register their private addresses in a private
// DNS namespace that resolves inside this VPC only (Cloud Map), and ECS removes
// a task's record when its health check fails or it stops.

locals {
  container_name = "embeddings"
}

# ── Logs ─────────────────────────────────────────────────────────────────────
# Retained and keyed as the application log groups are (modules/ecs-fargate):
# CloudWatch's own key. tests/boot_contract.tftest.hcl holds both to that.

resource "aws_cloudwatch_log_group" "this" {
  name              = "/ecs/${var.name}/embeddings"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

# ── Task execution role: pull the image, write the logs. Nothing else. ───────
# The container needs no AWS API and no secret, so the task has no task role
# and this role has no Secrets Manager grant (unlike the application's).

resource "aws_iam_role" "execution" {
  name = "${var.name}-embeddings-execution"
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

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# ── Network boundary ─────────────────────────────────────────────────────────

resource "aws_security_group" "this" {
  name_prefix = "${var.name}-embeddings-"
  description = "Self-hosted embedding server: from the application tasks only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Embedding requests from the API and worker tasks only"
    from_port       = var.port
    to_port         = var.port
    protocol        = "tcp"
    security_groups = var.client_security_group_ids
  }

  # HTTPS out through the NAT, and nothing else: the image registry (ghcr.io)
  # and the model hub (huggingface.co, its CDN) at start-up, CloudWatch Logs
  # throughout. Hosted services with no fixed address ranges to list.
  #trivy:ignore:AWS-0104
  egress {
    description = "HTTPS to the image registry, the model hub and CloudWatch Logs"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, { Name = "${var.name}-embeddings-sg" })

  lifecycle {
    create_before_destroy = true
  }
}

# ── Service discovery: a private name, no load balancer ──────────────────────

resource "aws_service_discovery_private_dns_namespace" "this" {
  name        = "${var.name}.internal"
  description = "Private service names for ${var.name}; resolves inside its VPC only"
  vpc         = var.vpc_id
  tags        = var.tags
}

resource "aws_service_discovery_service" "this" {
  name = "embeddings"

  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.this.id
    routing_policy = "MULTIVALUE"
    dns_records {
      type = "A"
      ttl  = 10
    }
  }

  # ECS reports the container health check here, so the name resolves to tasks
  # that answer /health only — not to one still downloading the model.
  health_check_custom_config {}

  tags = var.tags
}

# ── Task definition ──────────────────────────────────────────────────────────

resource "aws_ecs_task_definition" "this" {
  family                   = "${var.name}-embeddings"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.execution.arn

  # The image digest is linux/amd64 (image/tei-cpu-1.9.4-digest.txt in the evidence).
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name      = local.container_name
    image     = var.image
    essential = true

    portMappings = [{
      containerPort = var.port
      protocol      = "tcp"
    }]

    # Text Embeddings Inference reads each setting from the environment
    # (router/src/main.rs, clap `env`); the image's own CMD keeps --json-output.
    environment = concat([
      { name = "MODEL_ID", value = var.model_id },
      { name = "PORT", value = tostring(var.port) },
      # The runtime sends up to 100 texts per request (enhancedEmbeddingService
      # batchSize; the Vault chunker sends 64). The server refuses more than this,
      # default 32.
      { name = "MAX_CLIENT_BATCH_SIZE", value = tostring(var.max_client_batch_size) },
      # 100 texts of up to 32,000 characters each, UTF-8: up to ~10 MB. Default 2 MB.
      { name = "PAYLOAD_LIMIT", value = tostring(var.payload_limit_bytes) },
      # The image assumes 8 cores; one thread per vCPU the task has.
      { name = "RAYON_NUM_THREADS", value = tostring(max(1, floor(var.cpu / 1024))) },
      ], var.model_revision == null ? [] : [
      # A commit, so the weights (and with them the vector space every stored
      # embedding lives in) cannot change under a running corpus.
      { name = "REVISION", value = var.model_revision },
    ])

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.this.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = local.container_name
      }
    }

    # The pinned image installs curl (its Dockerfile, v1.9.4: apt-get install …
    # curl). /health answers 200 once the model is loaded. startPeriod is ECS's
    # maximum: the first start downloads the weights (~2.3 GB) before loading.
    healthCheck = {
      command     = ["CMD", "curl", "-fsS", "-o", "/dev/null", "http://127.0.0.1:${var.port}/health"]
      interval    = 30
      timeout     = 10
      retries     = 3
      startPeriod = 300
    }
  }])

  tags = var.tags
}

# ── Service ──────────────────────────────────────────────────────────────────

resource "aws_ecs_service" "this" {
  name            = "${var.name}-embeddings"
  cluster         = var.cluster_id
  task_definition = aws_ecs_task_definition.this.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.this.id]
    assign_public_ip = false
  }

  service_registries {
    registry_arn = aws_service_discovery_service.this.arn
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  tags = var.tags
}
