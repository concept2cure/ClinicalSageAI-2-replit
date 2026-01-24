# TrialSage Safety Checklist

This document provides a step-by-step checklist to follow before making significant changes to critical components of the TrialSage platform. Following these procedures helps prevent data loss, breaks in functionality, and maintains system integrity.

## Before Making Critical Changes

- [ ] **Create a backup** using `./scripts/backup.sh`
- [ ] **Create a component snapshot** using `./scripts/create_component_snapshot.sh [component_path]`
- [ ] **Run component verification** using `./scripts/verify_components.sh`
- [ ] **Document the planned changes** in a design document

## During Development

- [ ] Implement changes in small, testable increments
- [ ] Add appropriate comments to clarify complex logic
- [ ] Regularly test the component in isolation
- [ ] Ensure all variable names and functions follow naming conventions
- [ ] Avoid duplicate function or variable declarations

## After Making Changes

- [ ] Run verification again to check for errors
- [ ] Test the modified component in the full application context
- [ ] Document any API or interface changes
- [ ] Create a new backup if changes are successful

## Component Recovery Process

If a component becomes corrupted or non-functional:

1. Stop any active development
2. Check available snapshots: `./scripts/recover_component.sh [component_path]`
3. Restore from a working snapshot: `./scripts/recover_component.sh [component_path] [version]`
4. Verify the restored component works correctly
5. Recreate your changes more carefully

## Database Protection

- Always use parameterized queries to prevent SQL injection
- Implement schema validation for all inputs
- Avoid manual SQL operations when using an ORM
- Never delete database tables during development
- Use migrations for all schema changes

## Critical Components That Require Extra Caution

- `client/src/components/cer/GSPRMappingPanel.jsx` - GSPR Mapping functionality
- `client/src/services/CerAPIService.js` - Clinical Evaluation Report API services
- `client/src/components/cer/AiCerGenerator.jsx` - AI-powered CER generation
- `server/routes/cer-ai-analysis.mjs` - Backend route for AI analysis

## Emergency Contacts

If you encounter severe data loss or system failure:

1. Document the issue with detailed steps to reproduce
2. Check backups for recovery options
3. Contact the system administrator immediately

---

_Follow this checklist diligently to ensure the stability and reliability of the TrialSage platform during development._
