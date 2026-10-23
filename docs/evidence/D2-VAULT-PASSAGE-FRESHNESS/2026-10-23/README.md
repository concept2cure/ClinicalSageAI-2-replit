# Vault passage freshness correction — D2 / W2

## What already exists

The canonical AdvancedRAGPipeline, Vault row mapper, candidate revalidation fences, actor/source guards, exact context verifier and Data Room/AnA consumers already exist. This increment extends their freshness checks for same-original-file re-extraction and same-ID chunk replacement. [INVENTORY.md](INVENTORY.md) records discovery and [CONTRACT.md](CONTRACT.md) defines the proposed behavior and its limits.

## Evidence status

Discovery and proposed contract are recorded before new tests or production changes. Independent review, fail-first tests, qualification and direct canonical publication are pending. No implementation, test pass, deployment or agency acceptance is claimed by this initial record.
