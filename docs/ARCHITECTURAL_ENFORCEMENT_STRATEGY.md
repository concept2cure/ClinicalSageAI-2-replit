# Architectural Enforcement Strategy

**Document Version:** 1.0.0
**Created:** January 2025
**Status:** Implemented
**Classification:** Technical Architecture

---

## Executive Summary

This document outlines the enterprise-grade architectural enforcement techniques implemented in the TrialSage/Concept2Cure.RI platform. These mechanisms ensure code quality, maintain architectural consistency, and provide comprehensive documentation for both human developers and AI agents.

---

## 1. CODEOWNERS Implementation

**File:** `.github/CODEOWNERS`
**Status:** ✅ IMPLEMENTED

### Purpose

Enforces mandatory code review requirements for critical system paths, ensuring domain experts review changes to sensitive areas.

### Coverage Matrix

| Domain               | Paths                                                   | Assigned Team            |
| -------------------- | ------------------------------------------------------- | ------------------------ |
| Security & Auth      | `server/auth.ts`, `server/middleware/auth*.ts`          | @security-team           |
| 21 CFR Part 11       | `server/audit/*.ts`, `shared/audit-schema.ts`           | @compliance-team         |
| Database Schema      | `db/schema/*.ts`, `drizzle.config.ts`, `server/db/*.ts` | @dba-team                |
| LUMEN CORTEX AI      | `lumen_cortex/**`, `agents/**`                          | @ai-team                 |
| CI/CD Infrastructure | `.github/**`, `Dockerfile*`, `docker-compose.yml`       | @devops-team             |
| Client Portal V2     | `client/src/portal-v2/**`                               | @frontend-team, @ux-team |

### Benefits

- Prevents accidental changes to critical paths without expert review
- Documents ownership for onboarding
- AI agents can query CODEOWNERS to understand who to consult

---

## 2. Architecture Decision Records (ADR)

**Directory:** `docs/adr/`
**Status:** ✅ IMPLEMENTED

### Purpose

Provides structured documentation of architectural decisions with full context, enabling AI agents and developers to understand WHY decisions were made.

### ADR Index

| ADR                                                         | Title                                         | Status   |
| ----------------------------------------------------------- | --------------------------------------------- | -------- |
| [0001](docs/adr/0001-use-drizzle-orm-over-prisma.md)        | Use Drizzle ORM over Prisma                   | Accepted |
| [0002](docs/adr/0002-multi-tenant-architecture.md)          | Multi-Tenant Architecture with organizationId | Accepted |
| [0003](docs/adr/0003-21-cfr-part-11-compliance-strategy.md) | 21 CFR Part 11 Compliance Strategy            | Accepted |
| [0004](docs/adr/0004-lumen-cortex-ai-architecture.md)       | LUMEN CORTEX AI Architecture                  | Accepted |
| [0005](docs/adr/0005-client-portal-v2-design.md)            | Client Portal V2 Design System                | Accepted |

### ADR Template

All ADRs follow the structure:

- Title and Date
- Status (Proposed/Accepted/Deprecated/Superseded)
- Context (why the decision was needed)
- Decision (what was decided)
- Consequences (positive and negative impacts)
- Compliance Notes (regulatory implications)

### AI Agent Integration

AI agents should:

1. Read ADRs before suggesting architectural changes
2. Propose new ADRs when making significant decisions
3. Reference existing ADRs when asked about architecture

---

## 3. Danger.js PR Automation

**File:** `dangerfile.ts`
**Workflow:** `.github/workflows/danger.yml`
**Status:** ✅ IMPLEMENTED

### Purpose

Automates PR review with consistent, objective feedback on code quality, architecture violations, and compliance issues.

### Rules Implemented

| Rule                  | Threshold                    | Action                        |
| --------------------- | ---------------------------- | ----------------------------- |
| PR Size               | >500 lines                   | ⚠️ Warning                    |
| PR Size               | >1000 lines                  | 🚫 Failure                    |
| Critical Path Changes | Any auth/compliance file     | 🔔 Security team notification |
| Schema Changes        | Without migration            | ⚠️ Reminder                   |
| Deprecated Imports    | Any lodash, moment, etc.     | 🚫 Blocked                    |
| Console Statements    | >5 console.log               | ⚠️ Warning                    |
| Test Coverage         | Modified files without tests | ⚠️ Warning                    |
| ADR Suggestion        | Infrastructure changes       | 💡 Suggestion                 |

### Critical Path Monitoring

Changes to these patterns trigger special warnings:

- `server/auth*.ts` - Authentication logic
- `**/audit/**` - Audit trail (21 CFR Part 11)
- `db/schema/**` - Database schema
- `.github/workflows/**` - CI/CD pipelines
- `**/security/**` - Security configuration

---

## 4. SonarCloud Quality Gate

**Configuration:** `sonar-project.properties`
**Workflow:** `.github/workflows/ci.yml` (sonarcloud job)
**Status:** ✅ IMPLEMENTED

### Purpose

Continuous code quality analysis with automated quality gates to prevent technical debt accumulation.

### Configuration

```properties
sonar.projectKey=concept2cure_Concept2Cure.RI-2-replit
sonar.organization=concept2cure
sonar.sources=server,client/src,shared
sonar.exclusions=**/node_modules/**,**/coverage/**,**/dist/**,**/_archive/**
sonar.tests=server,client/src
sonar.test.inclusions=**/*.test.ts,**/*.test.tsx,**/*.spec.ts
sonar.javascript.lcov.reportPaths=coverage/lcov.info
```

### Quality Gate Metrics

- Maintainability Rating: A
- Reliability Rating: A
- Security Rating: A
- Coverage: >80% (target)
- Duplicated Lines: <3%
- Code Smells: 0 new issues

### Setup Requirements

1. Add `SONAR_TOKEN` to GitHub repository secrets
2. Configure SonarCloud project at sonarcloud.io
3. Link GitHub repository to SonarCloud organization

---

## 5. Storybook Component Library

**Directory:** `.storybook/`
**Status:** ✅ IMPLEMENTED

### Purpose

Interactive component documentation and visual regression testing for the TrialSage design system.

### Configuration Files

| File                    | Purpose                                         |
| ----------------------- | ----------------------------------------------- |
| `.storybook/main.ts`    | Story discovery, addons, Vite integration       |
| `.storybook/preview.ts` | Global decorators, viewport configs, themes     |
| `.storybook/manager.ts` | Storybook UI customization (TrialSage branding) |

### Available Scripts

```bash
npm run storybook         # Start dev server on port 6006
npm run storybook:build   # Build static site
npm run storybook:test    # Run visual regression tests
```

### Story Guidelines

1. Every UI component should have a `.stories.tsx` file
2. Use `autodocs` tag for automatic documentation
3. Include accessibility annotations
4. Show all variants and states
5. Document usage guidelines in JSDoc comments

### Example Story

See `client/src/components/ui/button.stories.tsx` for reference implementation.

---

## 6. Context Compression (Repomix/Gitingest)

**Docs:** `docs/ai/context-compression.md`
**Scripts:** `scripts/ai/context-pack.sh`
**Status:** ✅ IMPLEMENTED

### Purpose

Reduce token usage and hallucination risk by packing only relevant repository sections for AI agents.

### Output

Context packs are stored under:

- `.ai/context/repomix.json`
- `.ai/context/gitingest.json`

### Scope Profile

Default includes:

- `server/`
- `client/src/`
- `shared/`
- `docs/adr/`
- `docs/architecture/`
- `package.json`, `tsconfig.json`, `drizzle.config.ts`

---

## 7. Prompt Templates in Code

**File:** `.ai-instructions.md`
**Status:** ✅ IMPLEMENTED

### Purpose

Provide consistent, repo-specific guidance to AI agents (architecture patterns, testing requirements, security boundaries) without repeating prompts.

---

## 8. AI-Generated Test Verification

**Docs:** `docs/ai/test-verification.md`
**Status:** ✅ IMPLEMENTED

### Purpose

Ensure AI-written tests cover edge cases, not only happy paths. Defines a checklist for failure modes, permissions, boundary conditions, and data integrity.

### Enforcement

PR checks run `scripts/ai/verify-tests.sh` and block changes to source files without corresponding test files.

---

## 9. Checkpointing with Git Worktrees

**Docs:** `docs/ai/checkpointing.md`
**Scripts:** `scripts/ai/worktree-new.sh`, `scripts/ai/worktree-clean.sh`
**Status:** ✅ IMPLEMENTED

### Purpose

Enable parallel AI experiments without stashing or committing partial work. Each worktree provides an isolated working directory.

---

## Workflow Integration

### PR Lifecycle with Enforcement

```
Developer Opens PR
        │
        ▼
┌───────────────────┐
│   Danger.js Run   │
│ (PR Size, Rules)  │
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│   CODEOWNERS      │
│ (Auto-assign)     │
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│   SonarCloud      │
│ (Quality Gate)    │
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│   CI Tests Pass   │
└───────┬───────────┘
        │
        ▼
     Merge Ready
```

---

## Maintenance Schedule

| Task                        | Frequency             | Owner               |
| --------------------------- | --------------------- | ------------------- |
| Update ADRs                 | As decisions are made | Architecture Team   |
| Review CODEOWNERS           | Quarterly             | Engineering Manager |
| Danger.js rules audit       | Monthly               | DevOps Team         |
| SonarCloud threshold review | Quarterly             | QA Lead             |
| Storybook maintenance       | With UI changes       | Frontend Team       |

---

## Related Documentation

- [docs/adr/README.md](docs/adr/README.md) - ADR Index
- [docs/ai/README.md](docs/ai/README.md) - AI engineering toolkit
- [docs/ai/context-compression.md](docs/ai/context-compression.md) - Context packing
- [docs/ai/test-verification.md](docs/ai/test-verification.md) - Test verification
- [docs/ai/checkpointing.md](docs/ai/checkpointing.md) - Worktrees
- [.ai-instructions.md](.ai-instructions.md) - AI agent instructions
- [SECURITY.md](SECURITY.md) - Security policies
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) - Contribution guidelines
- [CHANGELOG.md](CHANGELOG.md) - Version history

---

## Appendix: AI Agent Instructions

### For AI Agents Working on This Codebase

1. **Before Making Changes:**
   - Read relevant ADRs in `docs/adr/`
   - Check CODEOWNERS for approval requirements
   - Review Danger.js rules in `dangerfile.ts`

2. **When Proposing Architecture Changes:**
   - Create a new ADR using `docs/adr/TEMPLATE.md`
   - Reference existing ADRs that may be affected
   - Consider 21 CFR Part 11 compliance implications

3. **For UI Components:**
   - Create/update Storybook stories
   - Follow design system conventions
   - Ensure accessibility compliance

4. **Quality Standards:**
   - Maintain SonarCloud quality gate passing
   - Write tests for new functionality
   - Avoid deprecated patterns listed in Danger.js

---

_This document is maintained as part of the TrialSage architectural governance framework._
