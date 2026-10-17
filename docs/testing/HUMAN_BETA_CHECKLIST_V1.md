# Human Beta Checklist v1

Generated: 2026-04-01. Setup and task-handoff plan revised: 2026-10-14.

## Provisioned test baseline

Use an authorized test environment and records created there. The script
`scripts/seed/rc-beta-seed.ts` prints a static JSON descriptor; it does not create
accounts, memberships, projects, documents or tasks. `RC-BIO-001` and
`RC-DEV-001` are descriptor labels, not proof that those projects exist or usable
record IDs. Do not construct project links from them.

1. Sign in through the canonical login UI with the environment's configured
   authentication and second factor. Complete the existing organization
   onboarding, or choose a test organization you may already access.
2. Through existing organization onboarding/invitations and access controls,
   establish an author/editor, a different reviewer/authorized signer, and a
   member without access to the private test project/document. Each person must
   sign in as themselves. Record current memberships and permissions; a session
   or an invitation alone does not establish signing authority.
3. In **Projects**, use **New project** or select an authorized existing project.
   Confirm its actual product, filing and jurisdiction. Record the saved program
   ID and displayed project name/code; if a separate numeric project ID is
   reported, record it separately. A numeric project ID is not a program UUID.
   Use the Projects selection to open the workspace rather than a guessed URL.
4. In **Authoring**, create and save a real test document with at least two
   sections and a table. Retain actual document/version and section IDs. Assign
   the independent reviewer through **Send for review**. For the task checks,
   use **Tasks** and its existing **New task** form to create assigned test tasks
   and record their displayed task IDs. Prepare any signing-required task using
   the existing task/workflow controls and an authorized signer.
5. Record the baseline below before the witnessed run. If required setup or
   permissions are unavailable, record the scenario as blocked, not passed.
   Repeat the relevant baseline for a device project if that cohort is in scope;
   do not substitute an IND project for a device filing.

| Record | Capture from the actual environment |
| --- | --- |
| Run | UTC date, environment URL, deployed release/commit when available, tester |
| Organization and people | Actual organization ID, actor IDs/personas and current roles/access |
| Project | Actual program ID, project name/code, separate project ID if reported |
| Saved work | Actual document ID/version, section IDs and relevant source records |
| Tasks | Displayed task IDs, assignees, distinguishing due dates/linked records |
| Outcomes | Review request/verdict, task transition, audit, signature and receipt IDs as each occurs |

Keep credentials out of the run record. Development login helpers, emitted seed
JSON and intercepted API responses do not establish deployed authentication or
persisted setup.

## Founder run path (exact)

1. Open `/` and confirm entry resolves to `/concept2cure/login` or the
   authenticated `/concept2cure` shell.
2. Authenticate and select the recorded test organization.
3. In **Projects**, open the provisioned biotech project from the baseline and
   confirm its name and program identity.
4. Enter its Authoring workspace and open the saved test document.
5. Open its review/provenance/audit controls and execute the independent review
   scenario below.
6. Return through the existing workspace/Projects controls. Confirm organization
   and project identity remain unchanged.
7. Execute **Your work → exact task** below, then repeat the applicable abbreviated
   path for the separately provisioned device project.

## Tester run path

1. Sign in normally and confirm the recorded organization, project and persona.
2. Open the assigned saved work through the existing project/workspace controls.
3. Execute an artifact open/edit/review cycle with the independent reviewer.
4. Verify AnA thread context and Vault/reference access against that same project.
5. Execute the exact-task and account-switch checks below.
6. Capture dead ends, misleading actions or identity loss with the failure format.

## Success criteria

- Primary actions reach the intended saved record without a title-based substitute.
- Organization, actor and project context remain correct across transitions.
- Saved edits, reviews, task transitions and signatures have their actual retained
  outcome identifiers; opening a panel is not evidence that a write occurred.
- Governed work exposes its provenance/audit and required native review/signing
  controls. Missing setup, refused access and unavailable reads are reported honestly.

## Quality: controlled text and personal acknowledgement (2026-10-14)

Use a test organization with an editor, an independent approver and a reader.
Retain the resulting document, signature, audit and acknowledgement identifiers.

1. In Quality, open a draft SOP and choose **Edit controlled text**. Enter actual
   procedure text and a reason, then **Save controlled text**. Reopen it and
   verify the text persisted; the document must still require review/approval.
2. Change text without saving and close the editor. **Keep editing** retains
   the draft; **Discard changes** must leave the stored document unchanged.
3. Have a text contributor attempt approval through the existing signing
   dialog. It must refuse. Have the independent approver review the text and
   complete the existing reauthentication and approval ceremony.
4. As the reader, choose **Read and acknowledge** for the effective SOP. Verify
   the released revision and full text. The declaration starts unchecked;
   checking it enables **Acknowledge this revision**. Submit and reopen: the
   reader's receipt and current-release roster coverage must persist.
5. Revise the SOP through the existing workflow. An earlier receipt must not
   count for the new release, and the retained receipt must preserve the old
   text/version. A reader with stale displayed text must reload before writing.
6. Switch user or organization while a record is open; no previous account's
   document, receipt or draft may remain available for a write. Repeat the
   reader/editor check at a narrow viewport and in dark mode.

This tests personal reading and understanding, not assessed competency or a
role-specific training matrix. Skeleton-only and unverified legacy releases
must explain why acknowledgement is unavailable. Local automated evidence and
its production verification boundary are recorded in
[the QMS evidence](../evidence/D2-QMS-TRAINING/2026-10-14/README.md).

## Authoring: independent review of the saved document (2026-10-14)

Use a test organization with an author, a different assigned reviewer and a
member without access to the document or its private project. Retain the review
request, verdict, task and audit identifiers.

1. Save an Authoring document with at least two sections and a table. Use
   **Send for review** to assign the independent member through the existing
   workflow. Open Review and verify the assignment belongs to that person.
2. Choose **Record review decision**. Verify the revision and every saved
   section, including the table and any governed figure. The decision starts
   unstated. Request changes with a reason and record it; verify the receipt,
   refreshed queue, authoring task rail and audit. A peer verdict must not
   stand in for a required electronic signature on a gated task.
3. Keep a decision dialog open while the author saves a change in another tab.
   The old dialog must refuse a verdict. **Reload review record** must clear
   the earlier decision/reason and show the complete changed content before a
   new decision can be recorded. The earlier verdict remains an earlier fact.
4. Re-request review while an older dialog is open. That dialog must refuse
   the old request even if the prose is unchanged. Legacy verdicts without a
   saved-content binding must be labeled as unverified earlier content and
   must not count as current peer approval.
5. Attempt to assign or record review as the original author and as someone
   who previously saved content. Both must refuse, including an administrator.
   The unassigned member, a removed member, and a person with only a section
   grant must not read the complete private review or record a verdict.
6. Switch account or organization while reading or recording. Previous content
   and late receipts must not carry into the replacement account. Repeat the
   complete saved read and receipt in dark mode and at phone width.

This finishes peer review; final signing retains its existing authentication,
meaning and release gates. Local database and browser evidence, including its
production verification boundary, is recorded in
[the review continuation evidence](../evidence/D2-WORKFLOW-CONTINUATION/2026-10-14/README.md).

## Your work → exact task (2026-10-14 acceptance plan)

Use assigned tasks created through the baseline above. This checks entries that
also exist as task records on **Tasks**; other review/workflow queue entries keep
their existing destinations. Navigation itself must record no verdict, completion
or signature.

1. Prepare two assigned tasks with the same title and distinguishable due dates
   or linked records. On Tasks, record both displayed task IDs and distinguishing
   facts, then close the detail normally. Choose filters that hide one target.
2. Open **Your work** and select the known target's assigned-task entry. Verify
   Tasks opens that exact displayed ID, title, assignee and context. It must not
   open the duplicate-title task or invent a project association. A matched task
   may become visible despite the earlier filters. Close that detail normally,
   remain on Tasks and open another known drawer target to prove same-screen
   navigation selects the new exact task.
3. Open a signing-required task from its **Your work** task-approval entry.
   Verify the exact task ID, current state, instructions and existing sign-off
   controls. Use the native review/advance/signing controls explicitly. Required
   reauthentication, meaning, reason and signature must remain required; retain
   the actual transition/audit/signature IDs. A peer verdict or navigation is not
   a substitute for task signing.
4. With unsaved Authoring work or an active task detail/create/workflow/signing
   dialog, attempt another available drawer handoff. Current work must remain
   intact and navigation must be refused with a useful reason. If the existing
   modal owns input, leave it through its normal controls. Save/finish or close
   the original work explicitly, then retry; no silent save/discard or delayed
   navigation may occur.
5. For a disposable test task, retain a drawer-generated target, then archive it
   using the existing authorized task control and reason. Revisit the retained
   target. A missing/inaccessible target or unavailable task read must show a
   clear result and must not select a similarly named task. If a read outage or
   archive condition cannot be exercised, mark that condition unexecuted.
6. Switch account or organization through the existing controls while the drawer
   or target is open; where timing permits, also switch during a loading read.
   The old selection/form and late responses must not appear or write under the
   replacement identity. An earlier account's target must be refused, not rebound
   to that account's similarly named task. Reopen Your work under the current
   identity. Record which loading-race conditions were actually witnessed.
7. Repeat the exact read and native sign/control checks at phone width and in
   dark mode. Retain task IDs, before/after locations, screenshots and outcomes.

8. In a disposable test project, start a new document or section, then close its
   form while the request is pending. Opening a task from Your work must wait
   for the creation outcome; closing the form does not cancel the request.
   If a timeout or lost response is available in the test environment, the UI
   must keep the outcome unconfirmed and require its existing scoped check.
   A failed check or failed editor refresh must keep that restriction. After a
   successful check and current-view refresh, inspect the working records before
   requesting another creation. A read does not identify which request created
   a record. Confirm a definite refusal and a confirmed creation release the
   restriction normally, without an automatic second POST. Mark unavailable
   timing/failure conditions unexecuted; do not infer them from an automated run.

This is the expected acceptance scenario for the bounded
[task-handoff contract](../design/TASK_DRAWER_HANDOFF_2026-10-14.md), not a claim
that a deployed human run has occurred. Source tests and synthetic browser
responses remain separate from witnessed deployed identity, task and signing
outcomes. See [setup audit](../evidence/D2-TASK-HANDOFF/2026-10-14/beta-setup-audit.md).

## Failure logging format
- Timestamp (UTC)
- Persona, actual actor/organization/program IDs and displayed project name/code
- Actual document/task ID and any review/audit/signature/receipt identifiers
- Exact URL before and after action
- Expected result vs observed
- Screenshot/video path (if captured)
- Severity (S0/S1/S2/S3)

## Severity rubric
- **S0**: Data loss, privacy breach, auth bypass, or governance bypass.
- **S1**: Primary beta path blocked (cannot continue meaningful workflow).
- **S2**: Wrong/misleading navigation, broken secondary operation, recoverable.
- **S3**: Cosmetic or copy issue with no workflow impact.

## Stop-test-immediately conditions
- Any S0 condition.
- Reproducible S1 condition affecting founder path.
- Evidence of cross-project context leakage.
