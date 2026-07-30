## Summary

<!-- What changed, and why. Lead with the defect or the capability, not the file list. -->

## Type of Change

- [ ] 🐛 Bug fix (non-breaking change that fixes an issue)
- [ ] ✨ New feature (non-breaking change that adds functionality)
- [ ] 💥 Breaking change (fix or feature that would change existing behaviour)
- [ ] 📚 Documentation update
- [ ] 🔧 Configuration change
- [ ] ♻️ Refactoring (no functional changes)

## Module Affected

- [ ] CER (Clinical Evaluation Reports)
- [ ] 510(k) / eSTAR
- [ ] CMC Platform
- [ ] CoAuthor / eCTD
- [ ] GRDHE (Regulatory Data Harmonization)
- [ ] AnA / AI
- [ ] Analytics
- [ ] Infrastructure / DevOps
- [ ] Other (describe under Additional Notes)

## Testing

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] All existing tests pass
- [ ] Manual testing completed

### Test evidence

<!-- Paste the actual output, not a claim that it passed. A green suite is not
     evidence until it has been shown it can fail: for a new check or guard,
     mutate it and record that the tests catch the mutation. -->

```
```

## Part 11 Compliance Check

<!-- Check all that apply. -->

- [ ] This PR modifies database schema (`migrations/`, `db/migrations/`, `shared/schema*`)
- [ ] This PR modifies cryptographic code (`tsa-server/`, `ind_automation/signatures/`, `hsm/`)
- [ ] This PR modifies CI/CD workflows (`.github/workflows/`)
- [ ] This PR modifies audit/logging (audit trail, `state_transitions`, FHIR AuditEvents)
- [ ] This PR modifies e-signature, freeze, or record-immutability behaviour

**If you checked any box above:** complete `docs/SECURITY_REVIEW_CHECKLIST.md` and attach
evidence (output, screenshots, logs) before requesting review. CODEOWNERS blocks merge if
the relevant owners are not added or no security approval is present.

## Security

- [ ] No hardcoded credentials
- [ ] No PHI/PII exposed in logs
- [ ] Tenant isolation preserved — every new query filters on the org/tenant column,
      and every new table ships its own `tenant_isolation_policy`
      (`migrations/0021_enable_rls_everywhere.sql` is dynamic, already ran everywhere,
      and never revisits tables added later)
- [ ] RBAC permissions checked on new or changed endpoints
- [ ] Blast radius considered and stated

## Code Quality

- [ ] Follows the [architecture guide](docs/ARCHITECTURE.md)
- [ ] No `console.log` (use the logger)
- [ ] TypeScript types properly defined
- [ ] No imports from `_deprecated/` folders

## Documentation

- [ ] README / API docs updated (if needed)
- [ ] CHANGELOG.md updated
- [ ] Relevant ADR added or updated (if architecture changed)

## Related Issues

<!-- Fixes #123, Relates to #456 -->

## Additional Notes

<!-- Anything a reviewer needs that the diff does not show: what you deliberately did
     NOT do, what you could not verify, what you assumed. -->

<!-- Assign @concept2cure/security-team if any Part 11 box is checked. -->
