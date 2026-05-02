# Brief #2 — AI letter response surface · backend wiring spec

**Status:** Implementation-ready spec. **Branch the kit lands on:**
TBD by Claude Design. **Backend status:** Most wiring already shipped;
this doc maps each surface affordance to the existing service it
should call.

The AI letter response surface is gated on the design system shipping
`ui_kits/correspondence/`. When the kit lands, this spec gives the
porting engineer a one-day path from kit-tree to live wiring.

## What's already shipped on the backend

| Capability | Surface |
|---|---|
| Ingest a correspondence (PDF + paste + email-sync) | `POST /api/regulatory-correspondence/correspondence/intake` |
| List correspondence | `GET /api/regulatory-correspondence/correspondence` |
| Per-issue assignment + classification | `POST /api/regulatory-correspondence/issues/...` |
| Response-package compile (with cover-letter §-pull) | `compileWithCoverLetter` in `response-package-compiler.ts` |
| Cover-letter composer | `composeCoverLetterDraft` in `cover-letter-composer.ts` |
| 510(k) summary composer | `compose510kSummary` in `k510-summary-composer.ts` |
| AnA tool — ingest correspondence | `correspondence.ingest` (governed; `agent.ana.correspondence.ingest`) |
| Audit trail | `correspondence.ingest`, `correspondence.response.compile` (the latter is the only ✗ row in audit-trail-coverage.md and lands when this surface is wired) |

## Surface ↔ backend wiring

The `ui_kits/correspondence/` kit is expected to have these affordances.
Each maps to one BFF call.

### Ingest panel (PDF / paste / email-sync)

| UI affordance | BFF call | Notes |
|---|---|---|
| "Upload PDF" | `POST /api/regulatory-correspondence/correspondence/intake` with `attachments: [{ filename, size, mime }]` and the parsed text | Multer-handled file upload; the BFF parses PDF text and writes `parsedText`. |
| "Paste letter" | Same endpoint, body carries `parsedText` directly | No attachments. |
| "Sync from mailbox" | `POST /api/regulatory-correspondence/mailbox-connections` first to register the connection, then ingestion is automatic via the mailbox-sync worker | Mailbox connection persisted under `organizations.settings.mailboxConnections`. |

The intake endpoint's response shape is already defined: `{ data: Correspondence, issues: Issue[], downstreamActions: DownstreamAction[] }`. The kit consumes `data.id`, `issues`, and `downstreamActions` to render the next view.

### Issue list (per-correspondence detail)

| UI affordance | BFF call | Notes |
|---|---|---|
| Issue list | Comes inline with the intake response; no extra call | `issues` on the intake payload. |
| Per-issue assignee dropdown | `PATCH /api/regulatory-correspondence/issues/:issueId/review` | Body carries `{ assigneeUserId, ownerFunction }`. |
| Per-issue classification edit | Same PATCH | Body carries `{ category, severity, blocker }`. |
| "Resolve" button | Same PATCH | Body carries `{ resolutionStatus: 'resolved' }`. |

### Response package builder

| UI affordance | BFF call | Notes |
|---|---|---|
| Selected-issues checkbox | (UI state only) | Pass selected ids to compile. |
| "Compile cover letter" | `POST /api/regulatory-correspondence/response-packages` body `{ correspondenceId, selectedIssueIds, organizationId, eStarDocumentId, submissionTrackingNumber, sponsorName }` | Internally calls `compileWithCoverLetter` which calls `pullEstarSections` for §3/§6/§11/§12. |
| Cover letter preview | The compile response carries `coverLetterDraft` + `coverLetterMissingSections` | UI renders the Markdown directly (or converts to its own DOCX preview). |
| "Compile 510(k) summary" | `POST /api/regulatory-correspondence/response-packages/summary` (NOT YET BUILT — see "what to add" below) | Will call `compose510kSummary` from the cover-letter package. |

### Transmit gate

| UI affordance | BFF call | Notes |
|---|---|---|
| "Lock package" | `POST /api/regulatory-correspondence/response-packages/:id/lock` (NOT YET BUILT) | Sets readinessState=`send_ready`. |
| "Transmit response" | `POST /api/510k/:projectId/esg/submit` (existing; emits `k510_workflow.transmit` audit) | The kit must enforce the strict confirmation gate (reason ≥ 30 chars). |

## What to add when the kit ships

Three small backend pieces that are easier to ship concurrent with the
UI port:

1. **`POST /api/regulatory-correspondence/response-packages/summary`**
   — wraps `compose510kSummary` from `server/services/cover-letter/k510-summary-composer.ts`. ~30 LOC. Audit `correspondence.response.summary.compile`.

2. **`POST /api/regulatory-correspondence/response-packages/:id/lock`** —
   freezes the package state so subsequent edits are blocked until
   transmit. Sets `readiness_state = 'send_ready'`. Audit
   `correspondence.response.lock`. ~20 LOC.

3. **`agent.ana.correspondence.response.compile`** audit row — the AnA
   tool exists (`correspondence.ingest`) but the response-compile
   handler is server-driven, not AnA-driven. When AnA proposes
   "compile the response package for this AI letter", route through a
   thin AnA tool wrapper around `compileWithCoverLetter` so the audit
   trail captures `actorKind: agent:ana`. ~50 LOC.

## AnA-driven flow (chat journey)

The AnA chat carries the user through the workflow even before the UI is
fully native. With the existing tools:

1. User uploads an AI letter PDF → AnA invokes
   `correspondence.ingest` (governed, two-phase confirmation; reason
   should cite the K-number / FDA letter date).
2. AnA reads the extracted issues and proposes per-issue ownership.
3. User confirms; AnA assigns each issue (note: the per-issue assign
   tool isn't exposed to AnA yet; today the user does this in the UI).
4. User says "draft the cover letter" → AnA proposes
   `correspondence.response.compile` (the new tool from item #3 above)
   and includes section §-pull.
5. User approves the cover letter, signs Part 11 → AnA proposes
   `k510_workflow.transmit` (strict gate: `confirm: yes-transmit`,
   reason ≥ 30 chars).

## Audit-trail coverage at full surface

| Action | Code | Status |
|---|---|---|
| Correspondence ingest | `correspondence.ingest` / `agent.ana.correspondence.ingest` | ✓ |
| Issue review patch | `correspondence.issue.review` | needs back-fill |
| Response package compile | `correspondence.response.compile` / `agent.ana.correspondence.response.compile` | ✗ (gated on this surface; lands in item #3 above) |
| Response package lock | `correspondence.response.lock` | new (item #2) |
| 510(k) summary compile | `correspondence.response.summary.compile` | new (item #1) |
| ESG transmit | `k510_workflow.transmit` / `agent.ana.k510_workflow.transmit` | ✓ |

## Estimated implementation time

When the kit ships:
- Items #1, #2, #3 above (backend additions): ~half-day.
- Port kit components into `client/src/concept2cure/mdx/correspondence/`: ~1.5 days.
- Wire components to the BFF endpoints listed above: ~1 day.
- Tests + audit-row back-fill: ~half-day.

**Total:** ~3.5 days from kit-shipped to surface-live for a single
engineer who's already familiar with the MDX module.
