# P-39 step 3: the correspondence family converges onto the project inbox

Decision P-39 step 3 (`docs/LAUNCH_DEFINITION_OF_DONE.md`) says:

> "The `c2c_correspondence` family (`/api/regulatory-correspondence`), onto the project inbox, keeping its issue parser
> and response clock as the inbox's."

Step 2 landed first, as P-54 orders (`docs/evidence/D2-COMMITMENTS-CONVERGED/2026-10-29/`). So did G3, the part of this
step the Weave plan names (`docs/evidence/D2-WEAVE-GAP/2026-10-29/question-extraction/`).

## What already exists

### The family (to converge)

**Routes:** `server/routes/regulatory-correspondence.ts`, mounted at `/api/regulatory-correspondence`
(`register-inline-routes.ts`).
- Submissions: create, read and state.
- Correspondence: intake, list and detail.
- Issue review, the one governed write.
- Response packages, timeline, mailbox connections and deficiency analytics.

**Tables:** `db/migrations/20260331_regulatory_correspondence_os.sql`: `c2c_submissions`, `c2c_correspondence`,
`c2c_correspondence_issues`, `c2c_response_packages`, `c2c_communication_timeline_events`, `c2c_mailbox_connections`
and `c2c_secure_attachments`. Nothing writes the last one.

**Services:** `server/services/regulatory-correspondence/`.
- The **issue parser**, `issue-parser.ts`. It classifies a whole letter by keyword. It has two taxonomies, CTD rules
  for a drug letter and the device rule packs, and it does not split a letter into questions.
- The **response clock**, `response-clock.ts`: dated, undated or untracked, from the stated date or the window for the
  letter's class.
- `operating-layer.ts`: work items, blockers, and the due-soon and workload reads.
- The response-package compiler.

**Who reaches it:**
- The device screens' Correspondence tab and the AnaDrafter read the list and the detail
  (`programTabsService.ts`, `usePathwayTabsData.ts`, `AnaDrafter.tsx`).
- AnA's in-scope `correspondence.ingest` writes through intake.
- `submission-ops.ts` reads `c2c_correspondence_issues` for publish gate 4 and the command-center count.
- The clock's one consumer is the MDX proactive signal (`mdx-proactive-signals.ts`). No client reads that signal
  today.
- Report OS writes outbound letters through `/deliveries`, which has no caller, and uses `c2c_submissions` as its
  submission scope.

**What is wrong with it:**
- The device tab listed every letter in the organisation. The program uuid became NaN and the project filter was
  dropped.
- No read checked project admission.
- No browser client writes to the family, so a real organisation's store is empty unless it is seeded.

### The inbox (canonical)

- **Letters:** `concept2cure_agency_communications`, through `server/routes/c2c/communication-center.ts` (list, create,
  advance). The client is `AgencyInbox.tsx` in Communication and in Project home's Respond.
- **Questions:** `agency_communication_questions`, through `server/routes/c2c/agency-responses.ts`:
  - questions, responses and signed approvals;
  - commitments;
  - the response package;
  - G3's question proposals.
- **Due date:** typed by a person. `letterOverdue` (`response-logic.ts`) is the overdue verdict. Nothing derives a due
  date, and `communication_type` is free text, so the clock has no letter class to read.

## The slices, in order

| Slice | What | Ships |
|---|---|---|
| **S1** | The family's reads and its one governed write are scoped to a project the person may open or change. Not convergence, but an exposure that must not wait for it. | Done 2026-10-29 |
| **S2** | The device Correspondence tab reads the project inbox, and each letter opens on its record in Communication (`openLetterInCommunication`, as CMC does). The AnaDrafter, a second response screen that could not send, is deleted. | Done 2026-10-29 |
| **S3** | AnA's `correspondence.ingest` records the letter through the inbox's governed create. **Blocked**: see "S3 is blocked" below. | blocked |
| **S4** | The response clock becomes the inbox's: a letter records its class (`AGENCY_LETTER_CLASSES`), the list returns `correspondenceResponseClock` (the stated date wins, else the class window from receipt, else undated), and the card shows it. The overdue verdict moves with S5. | Done 2026-10-29 |
| **S5** | Submission-ops publish gate 4 and the command-center count read the inbox: a letter's questions not approved, by the server's own verdict. | after S4 |
| **S6** | The family's routes are deleted and its tables made read-only, with their rows kept, as `20261019b` and `20261029i` did. The issue parser stays as the inbox's classifier: it suggests a proposed question's discipline and CTD section, and a person records them. The deletion record names S2–S5's paths. | last |

Report OS's use of `c2c_submissions` as a scope is not this step's: it is Reporting's, and its `/deliveries` writer
has no caller. S6 leaves `c2c_submissions` readable for it and says so.

## Not decided here

Mailbox connections (`c2c_mailbox_connections`) have no inbox equivalent and no caller. S6 retires their routes with
the family. A mailbox integration for the inbox is a new capability, so it is the founder's to decide under RULE 2.

## S3 is blocked: AnA's HTTP proxy carries no identity the server verifies (found 2026-10-29)

`correspondence.ingest` (`server/services/ana-ri/mdx-command-handlers-phase3.ts`) does not call the intake in process.
It sends an HTTP request to the platform's own address (`INTERNAL_BFF_URL`) with these headers:
- `X-Service-Token` (`ANA_SERVICE_TOKEN`);
- `X-Tenant-Id`;
- `X-User-Id`.

No server code verifies `X-Service-Token`:
- a search of `server/` finds the header only in the three files that send it;
- `tenantAuth.ts` reads `x-tenant-id` only to report a mismatch with the session.

So a deployed system refuses the request without a session (401), or the command answers 503 when the token is unset.
The same is true of `predicate.candidate.set_status`, `se_matrix.patch` (same file) and the proxied commands in
`mdx-command-handlers.ts` and `mdx-document-preview-tool.ts`. The comment at `mdx-command-handlers.ts:599` already
says: "for production this should be a dedicated AnA service principal".

Pointing the proxy at the inbox would carry the defect over. So S3 waits on one of two things:
- an AnA identity the routes verify, which is security's lane;
- or the inbox create extracted into a service that AnA calls in process, as the acting user, with project write
  admission reproduced outside a request.

The second is the convergence S3 needs, and it is the one recommended. Until then the command is reported as not
working, never as working. S4 does not depend on S3 and goes next.
