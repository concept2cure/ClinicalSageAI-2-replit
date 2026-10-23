# The public subnets hand out no address (MR-02 hand-on to the MR-03 Terraform lane)

Launch row **D1**. MR-02's row on the work-order board handed this to the MR-03
Terraform lane. Semgrep's `aws-subnet-has-public-ip-address` flagged
`map_public_ip_on_launch = true` on the public subnets, and `semgrep.yml` stays
red on that one finding until it is fixed
([`05-semgrep.md`](../../MR-02/2026-10-22-trunk-green/05-semgrep.md)).

## What already exists (Rule 3)

| Piece | Path | What it does | What it did not do |
|---|---|---|---|
| Public subnets | `terraform/modules/vpc-secure/main.tf` (`aws_subnet.public`) | Hold the internet-facing ALB (`modules/alb`, its only consumer of `public_subnet_ids`) and the NAT gateway, on its own Elastic IP | Withhold a public address from anything else launched in them |
| Private subnets | the same file (`aws_subnet.private`) | Hold the ECS tasks and RDS, `map_public_ip_on_launch = false`; both ECS services set `assign_public_ip = false` | — |
| Module tests | `terraform/modules/vpc-secure/tests/private_paths.tftest.hcl` | Check the S3 and KMS endpoints | Check either subnet's address setting |

## Re-confirmed at head

At `81fcd9429`, `aws_subnet.public` still sets `map_public_ip_on_launch = true`.
Nothing in `terraform/` places an instance or a task in a public subnet. No
Trivy or Semgrep suppression covers it.

## What changed

- `map_public_ip_on_launch = false` on the public subnets, with a comment
  saying why nothing there needs it. AWS addresses the internet-facing ALB's
  nodes itself, and the NAT has its own EIP. It is an in-place update of the
  subnet attribute.
- `tests/public_subnets.tftest.hcl` requires that no subnet hands out a public
  address, and that the NAT sits in a public subnet on its own EIP.

## Verified by making it fail

- **At head** (`raw/1`): the new run fails on the subnet assertion.
- **After** (`raw/2`):
  - the module passes 3/3;
  - all three roots validate;
  - the stack passes 74/74, and the other modules all pass;
  - `trivy config` reports 0 HIGH or CRITICAL.

## Not shown here

- **Semgrep itself.** The rule packs `semgrep.yml` runs (`p/default`, `p/ci`)
  come from `semgrep.dev`, and this environment's proxy refuses it (403). That
  is an egress denial, so it was not worked around. The first `semgrep.yml` run
  on this push is the check.
- **The update against AWS.** Nothing has been applied yet (MR-03 Stage 5).
