# Terraform (Staging) — ROS Part 11

This folder contains scaffolding for the staging Terraform environment focused on Part 11 compliance (VPC, S3 WORM evidence, CloudTrail). This is a "plan-only" first-stage PR to validate design and security reviews.

Usage:

1. Copy `terraform.tfvars.example` to `terraform.tfvars` and edit variables as needed.
2. Run `terraform init` and `terraform plan` in `terraform/environments/staging` (no backend configured in plan-only mode).

Notes:
- Modules are intentionally simple and safe in this PR (no state/backend); apply will be gated and later done with a controlled process.
- See `docs/SECURITY_REVIEW_CHECKLIST.md` for the required pre-merge controls and evidence list.
