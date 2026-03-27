# Launch-Gate Document Consequence Baseline Audit

Status: SUPERSEDED
Canonical: No
Supersedes: DOCUMENT_CONSEQUENCE_AUDIT.md
Superseded By: LAUNCH_GATE_DOCUMENT_CONSEQUENCE_REPORT.md
Related Reports: 510K_DOCUMENT_GENERATION_AUDIT.md


**Date**: 2026-03-26
**Branch**: concept2cure-v2
**Auditor**: Copilot launch-gate sprint

---

## 1. Beta-Visible Generated-Document Entry Points

### 1.1 Compute Plane (server/services/compute/computeService.ts)

| Property                   | Status                                                                  |
| -------------------------- | ----------------------------------------------------------------------- |
| Creates governed artifact  | **YES** — via `registerArtifactWithGovernance()`                        |
| Appears in project context | **YES** — artifact_id stored on job, joined to `concept2cure_artifacts` |
| Reopens in editor          | **YES** — `ComputeJobPanel` → `onOpenArtifact` → editor mode            |
| Shows version/status       | **YES** — in expanded detail panel (artifact_status, version)           |
| Shows placement            | **YES** — placement_state in detail                                     |
| Shows provenance           | **YES** — provenance_ref in detail                                      |
| Shows audit                | **YES** — audit_ref in detail                                           |
| Source                     | Compute job                                                             |
| Is dead-end                | **NO**                                                                  |

### 1.2 AnA RI Artifact Generation (server/routes/ana-ri.ts → /api/ana-ri/generate)

| Property                   | Status                                                                      |
| -------------------------- | --------------------------------------------------------------------------- |
| Creates governed artifact  | **YES** — via `tagArtifact()` → `concept2cure_artifacts`                    |
| Appears in project context | **YES** — project-bound by project_id                                       |
| Reopens in editor          | **YES** — artifactId returned, can open in UnifiedDocumentEditor            |
| Shows version/status       | **PARTIAL** — qualityGrade, provider, model shown; status is always 'draft' |
| Shows placement            | **NO** — ctdSection not set on AnA-generated artifacts by default           |
| Shows provenance           | **NO** — no provenance event created; only metadata.anaRiActionType         |
| Shows audit                | **NO** — no audit log entry for AnA generation                              |
| Source                     | Chat action / slash command                                                 |
| Is dead-end                | **NO** — but missing provenance/audit/placement consequence                 |

### 1.3 Authoring AI Draft (server/routes/authoring.router.ts → /api/authoring/sections/:sectionId/ai/draft)

| Property                   | Status                                                         |
| -------------------------- | -------------------------------------------------------------- |
| Creates governed artifact  | **YES** — updates `authoring_sections` content                 |
| Appears in project context | **YES** — section bound to document, document bound to project |
| Reopens in editor          | **YES** — section lives in editor                              |
| Shows version/status       | **YES** — revision history tracked                             |
| Shows placement            | **YES** — section has CTD placement inherent                   |
| Shows provenance           | **PARTIAL** — operator/timestamp, no formal provenance chain   |
| Shows audit                | **YES** — `documentAuditTrail` entries                         |
| Source                     | Editor button                                                  |
| Is dead-end                | **NO**                                                         |

### 1.4 Conversation OS Proposal Accept (server/services/conversation-os/artifactProposalService.ts)

| Property                         | Status                                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Creates governed artifact        | **YES** — via `registerArtifactWithGovernance()` when context valid                                                    |
| Appears in project context       | **PARTIAL** — durable record in `conversation_os_accepted_artifact_versions`, but artifact refresh needed in workspace |
| Reopens in editor                | **NO** — accept returns state but client does not navigate to artifact or reload artifact list                         |
| Shows version/status             | **NO** — client only updates proposal status badge to "accepted" without any governance detail                         |
| Shows placement/provenance/audit | **NO** — governance consequence metadata is returned by API but not rendered                                           |
| Source                           | Conversation proposal accept                                                                                           |
| Is dead-end                      | **PARTIAL** — backend is governed, client shows no consequence                                                         |

### 1.5 Intelligent Report Engine (server/routes/intelligent-reports.ts)

| Property                   | Status                                                          |
| -------------------------- | --------------------------------------------------------------- |
| Creates governed artifact  | **YES** — immutableReportRecords table, cryptographic sealing   |
| Appears in project context | **YES** — project-bound                                         |
| Reopens in editor          | **SEALED** — sealed reports cannot be edited (correct behavior) |
| Shows version/status       | **YES** — sealStatus, verificationCode                          |
| Shows placement            | **PARTIAL** — domain-based, not CTD placement                   |
| Shows provenance           | **YES** — atom-level provenance entries                         |
| Shows audit                | **YES** — full seal events, attestations                        |
| Source                     | Report menu                                                     |
| Is dead-end                | **NO**                                                          |

### 1.6 CSR Builder (server/routes/csr-builder-routes.ts)

| Property                   | Status                                                    |
| -------------------------- | --------------------------------------------------------- |
| Creates governed artifact  | **PARTIAL** — generated content can be saved as artifacts |
| Appears in project context | **PARTIAL** — depends on explicit save                    |
| Reopens in editor          | **YES** — if saved as artifact                            |
| Source                     | CSR builder UI                                            |
| Is dead-end                | **NO** if saved; **YES** if only viewed                   |

### 1.7 510(k) eSTAR Package (server/routes/medical-device-api.ts)

| Property                   | Status                                                           |
| -------------------------- | ---------------------------------------------------------------- |
| Creates governed artifact  | **NO** — generates ZIP download, no concept2cure_artifact record |
| Appears in project context | **NO** — download-only                                           |
| Reopens in editor          | **NO** — ZIP package, not editable                               |
| Shows provenance/audit     | **NO**                                                           |
| Source                     | 510(k) wizard                                                    |
| Is dead-end                | **YES** — download-only, no governed consequence                 |

### 1.8 Dead-End Download Paths (NOT hero path but beta-visible)

| Path               | File                                  | Dead-End?                       |
| ------------------ | ------------------------------------- | ------------------------------- |
| eCTD cover letter  | server/routes/biotech-artifacts.ts    | YES — DOCX download only        |
| CMC blueprint      | server/api/cmc/blueprint-generator.js | YES — DOCX download, orphaned   |
| Universal packager | server/routes/universal-packager.ts   | YES — batch export, no artifact |
| Deep research doc  | server/routes/deep-research.ts        | YES — generated but no reopen   |

---

## 2. Top 8 Trust Gaps in Current Beta Path

| #   | Gap                                                                                                                                                                                                 | Severity | File(s)                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------- |
| 1   | **Proposal accept shows no consequence** — user clicks "accept", sees status change to "accepted" but no governed artifact detail, no link to open in editor, no metadata                           | CRITICAL | ProjectWorkspaceShell.tsx, artifactProposalService.ts          |
| 2   | **Proposal accept doesn't reload artifact list** — governed artifact created on backend but not reflected in workspace until manual page refresh                                                    | HIGH     | ProjectWorkspaceShell.tsx                                      |
| 3   | **No unified "recent governed documents" surface** — dashboard shows ComputeJobPanel and raw Conversation OS debug section separately, no unified view of all recently generated/accepted artifacts | HIGH     | ProjectWorkspaceShell.tsx                                      |
| 4   | **Conversation OS section looks like debug output** — "Conversation OS Durability" section shows raw manifest/scout/plan debug info, not user-facing governed document consequence                  | HIGH     | ProjectWorkspaceShell.tsx                                      |
| 5   | **510(k) eSTAR is download-only** — hero path generates ZIP but creates no governed artifact, no project binding, no provenance                                                                     | MEDIUM   | medical-device-api.ts (out of scope for this sprint - labeled) |
| 6   | **AnA RI artifacts lack provenance/audit/placement** — artifacts are created but miss the full governance chain that compute artifacts get                                                          | MEDIUM   | ana-ri.ts, artifact-generator.ts                               |
| 7   | **Dead-end download paths exist** — eCTD cover letter, CMC blueprint, deep research docs are download-only                                                                                          | LOW      | Various routes                                                 |
| 8   | **Compute result_summary not surfaced at list level** — list endpoint returns job data but governed consequence metadata requires separate detail call                                              | LOW      | computeService.ts, compute.ts                                  |

---

## 3. Files to Touch

### Must touch (this sprint):

- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` — consequence surface, proposal accept flow
- `server/services/conversation-os/artifactProposalService.ts` — ensure accept returns full consequence
- `server/routes/conversation-os.ts` — ensure accept endpoint returns full consequence to client

### Should touch (this sprint):

- `server/routes/compute.ts` — list endpoint could include result_summary fields at top level
- `server/services/compute/computeService.ts` — listComputeJobs could surface consequence at list level

### Out of scope (labeled):

- 510(k) eSTAR zip generation (needs architect decision)
- eCTD cover letter / CMC blueprint dead-ends (non-hero-path)
- AnA RI provenance/audit gap (separate sprint)

---

## 4. Sprint Focus

The highest-impact work is making the existing governed consequence **visible to the user**:

1. Turn proposal accept into a visible governed event with consequence metadata
2. Replace the debug "Conversation OS Durability" section with a real governed consequence surface
3. Add a unified "Recent Governed Documents" view that shows compute + proposal + AnA artifacts
4. Ensure accept → reload artifacts → show governed artifact in project context
5. Ensure all consequence surfaces have "Open in editor" action
