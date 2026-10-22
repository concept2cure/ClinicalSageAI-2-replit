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

Terraform 1.11 or later: state locks with an S3 lock file beside the state
(`use_lockfile = true`), which 1.11 made generally available; there is no
DynamoDB lock table. Each root commits its `.terraform.lock.hcl`, so `init`
installs the provider builds the configuration was tested with.

### 1. Bootstrap remote state (once per AWS account)

The state bucket is named for the account, `c2c-tfstate-<account id>-<region>`.
A fixed name cannot work: S3 names are global, and the one this repository used
to hard-code belongs to another account (MR-03 OPS-03).

```bash
cd terraform/bootstrap
terraform init
terraform apply
terraform output -raw state_bucket   # the name each root's backend.hcl names
```

Then, in each root, copy `backend.hcl.example` to `backend.hcl` and set its
`bucket` to that name. An account id is not a secret: commit `backend.hcl` once
the account exists. `npm run ci:terraform-backend` refuses a backend that names
its bucket in source, or locks with DynamoDB.

### 2. Deploy staging

```bash
cd terraform/environments/staging
cp terraform.tfvars.example terraform.tfvars  # Edit values; it lists every TF_VAR_ secret to export
terraform init -backend-config=backend.hcl
terraform plan
terraform apply
```

### 3. Deploy production

```bash
cd terraform/environments/production
cp terraform.tfvars.example terraform.tfvars  # Edit values, including domain_aliases
terraform init -backend-config=backend.hcl
export TF_VAR_cloudfront_origin_secret="$(openssl rand -hex 32)"  # keep it: CloudFront and the ALB share it
terraform plan
terraform apply  # with every TF_VAR_ secret terraform.tfvars.example lists exported
```

Production needs a custom domain (`domain_aliases`), and both certificates
(`acm_certificate_arn` on the ALB, `cloudfront_certificate_arn`) must cover it:
CloudFront checks the ALB's certificate against the domain it forwards.

### Module tests (offline)

`modules/alb` and `modules/cloudfront` carry `terraform test` suites that mock
the AWS provider, so they need no account or credentials:

```bash
cd terraform/modules/alb   # or modules/cloudfront
terraform init -backend=false
terraform test
```

## Security Notes

- All secrets are stored in AWS Secrets Manager, never in tfvars
- RDS uses `manage_master_user_password = true` (AWS-managed credentials)
- S3 evidence bucket uses Object Lock (WORM) with 7-year retention
- TLS 1.3 enforced on ALB; CloudFront uses TLS 1.2+
- ECS tasks run in private subnets. The ALB is reachable from CloudFront alone:
  its security group admits CloudFront's origin-facing prefix list on 443, and
  its listener forwards only requests carrying the origin secret header
  (`modules/alb`). CloudFront is the only public entry point.
- Container images use immutable tags + scan-on-push
