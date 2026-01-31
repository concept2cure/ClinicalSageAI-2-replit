## Part 11 Compliance Validation (Staging)

### Prerequisites
- Docker Compose 2.20+
- LocalStack Pro API key (free tier available) for Object Lock testing
- Python 3.11+

### Local Validation Procedure (21 CFR §11.10(a))
Run the full smoke test suite to validate ALCOA+ compliance:

```bash
# 1. Provision emulated infrastructure
docker compose -f docker-compose.staging.yml up -d

# 2. Verify services health
curl http://localhost:8080/health  # TSA
awslocal s3api get-object-lock-configuration --bucket ros-staging-evidence-store

# 3. Execute validation protocol
python scripts/e2e_staging_smoke.py \
  --environment local \
  --output-dir ./evidence \
  --strict-part11

# 4. Review evidence package
open ./evidence/ALCOA_plus_report.md
```

### Validation Gates (§11.200)
The smoke test enforces four regulatory gates:
1. **Identity Binding**: XAdES SigningCertificate includes signer identity and role
2. **Tamper Evidence**: S3 Object Lock rejects overwrite attempts; SHA-256 hash chain verified
3. **TSA Trust**: RFC3161 timestamp chain validated to trust anchor
4. **Audit Immutability**: Database triggers reject UPDATE/DELETE on `state_transitions`

### Artifacts Retention
Evidence artifacts are retained in GitHub Actions for **30 days** (configurable). 
Each artifact contains:
- `evidence_report_*.json`: Structured validation results
- `tsa_chain_*.pem`: TSA certificate chain for long-term validation
- `ALCOA_plus_report.md`: Human-readable compliance summary

### Migration to AWS Staging
When migrating to AWS:
1. Create GitHub Environment `staging-aws` with protection rules
2. Add secrets: `AWS_ROLE_ARN`, `KMS_KEY_ID`, `S3_BUCKET`, `TSA_URL`
3. Trigger workflow with `environment: staging-aws`
4. **Blast Radius Protection**: The job will fail if S3 bucket name does not contain `-staging-`
