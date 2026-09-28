# The one Concept2Cure deployment composition. environments/production and
# environments/staging are thin roots over it: each owns its backend, its
# provider configuration, its sizes and its secret values, and nothing else.
#
# Why one module (D1 brief B8, docs/evidence/W2/2026-09-23/README.md): staging
# was a VPC and an evidence bucket, so none of the staging evidence D2, D3 and
# D4 owe could be produced. Copying production's composition into staging would
# give two copies that drift. The first time they drifted would be the day
# staging stopped proving anything about production.

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.5"
    }
  }
}
