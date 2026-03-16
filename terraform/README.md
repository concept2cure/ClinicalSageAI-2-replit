# Terraform — C2C AWS Infrastructure

## Directory Structure

```
terraform/
├── bootstrap/       # One-time: S3 + DynamoDB for remote state
├── environments/
│   ├── staging/     # Staging environment (VPC, S3 evidence, CloudTrail)
│   └── production/  # Full prod stack (VPC, ECR, RDS, ECS, ALB, CloudFront)
└── modules/
    ├── alb/                 # Application Load Balancer
    ├── cloudfront/          # CloudFront + S3 static hosting
    ├── compliance-evidence/ # S3 WORM + CloudTrail (21 CFR Part 11)
    ├── ecr/                 # Elastic Container Registry
    ├── ecs-fargate/         # ECS Fargate cluster + services
    ├── rds/                 # RDS PostgreSQL (encrypted, multi-AZ)
    ├── secrets/             # AWS Secrets Manager
    └── vpc-secure/          # VPC with public/private subnets, NAT, endpoints
```

## Getting Started

### 1. Bootstrap remote state (once per AWS account)

```bash
cd terraform/bootstrap
terraform init
terraform apply
```

### 2. Deploy staging

```bash
cd terraform/environments/staging
cp ../../terraform.tfvars.example terraform.tfvars  # Edit values
terraform init
terraform plan
terraform apply
```

### 3. Deploy production

```bash
cd terraform/environments/production
cp terraform.tfvars.example terraform.tfvars  # Edit values
terraform init
terraform plan
terraform apply -var="jwt_secret=..." -var="openai_api_key=..."
```

## Security Notes

- All secrets are stored in AWS Secrets Manager, never in tfvars
- RDS uses `manage_master_user_password = true` (AWS-managed credentials)
- S3 evidence bucket uses Object Lock (WORM) with 7-year retention
- TLS 1.3 enforced on ALB; CloudFront uses TLS 1.2+
- ECS tasks run in private subnets; only ALB is public-facing
- Container images use immutable tags + scan-on-push
