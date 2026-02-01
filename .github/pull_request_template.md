## Change Summary
<!-- Describe what changed and why -->

## Part 11 Compliance Check
<!-- Check all that apply -->
- [ ] This PR modifies database schema (`init-sql/`, migrations)
- [ ] This PR modifies cryptographic code (`tsa-server/`, `ind_automation/signatures/`, `hsm/`)
- [ ] This PR modifies CI/CD workflows (`.github/workflows/`)
- [ ] This PR modifies audit/logging (`state_transitions`, FHIR AuditEvents)

**If you checked any box above:**  
You **must** complete `docs/SECURITY_REVIEW_CHECKLIST.md` and attach evidence (screenshots, logs) before requesting review. CODEOWNERS will automatically block merge if the relevant owners are not added or no security approval is present.

## Test Evidence
- [ ] Local smoke test passes (`python scripts/e2e_staging_smoke.py --environment local`)
- [ ] Unit tests added for new validation logic
- [ ] No secrets in logs (verified with `grep -i password\|secret\|key` on CI output)

## Security
- [ ] No hardcoded credentials
- [ ] Blast radius checks pass (bucket names contain `-staging-`)
- [ ] SQL immutability triggers tested (if applicable)

/assign @concept2cure/security-team (if Part 11 checkbox selected)