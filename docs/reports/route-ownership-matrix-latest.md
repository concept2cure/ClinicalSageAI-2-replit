# Route Ownership Matrix (Required Review Artifact)

- Generated from: `docs/reports/route-mount-audit-latest.json`
- Source timestamp: 2026-05-20T14:21:46.851Z
- Total mounts: 0
- Errors: 0
- Warnings: 0

## Prefix Ownership

| Prefix | Owner | Contact | Warning types |
|---|---|---|---|
| `/api` | Platform API Gateway | `server/index.ts` | none |
| `/api/ai` | AI Platform | `server/services/ai-gateway/` | none |
| `/api/auth` | Identity Access | `server/routes/auth.ts` | none |
| `/api/cmc` | CMC Platform | `server/routes/cmc*.ts` | none |
| `/api/concept2cure` | Platform Kernel | `server/routes/concept2cure.ts` | none |
| `/api/documents` | Authoring Governance | `server/routes/documents-unified.ts` | none |
| `/api/ind` | Submission Workflows | `server/routes/ind*.ts` | none |
| `/api/projects` | Workspace Core | `server/routes/projects-management.ts` | none |
| `/api/regulatory` | Regulatory Intelligence | `server/routes/regulatory*.ts` | none |
| `/api/reports` | Reporting Intelligence | `server/routes/reports*.ts` | none |

## Review Gate

- [ ] Reviewer confirmed any non-`none` warning types are accepted or remediated.
