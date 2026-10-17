# F19 affected-record notification navigation

Contract published before implementation, 2026-10-14. Notification audience and
per-recipient preferences/receipts remain the existing canonical policy.

## Resolution boundary

`GET /api/mdx/notifications/:id/target` takes only a positive notification ID.
The authenticated organization/user and request database connection select the
notification through the same live audience, receipt, expiry and preference
predicate as the inbox. The client cannot supply a resource, tenant, role,
program or URL to this endpoint. The selected row contributes resource identity,
not access authority. Each supported source is reread in its own tenant; bound
programs use canonical program ownership, unique project anchor and project
sharing checks with the live membership role. Authored content also uses the
canonical document/section `view` permission decision. The response contains
only a validated owning surface, native record parameters and nullable UUID
program context, never notification prose, document content, program names,
private metadata or credentials.

Deleted, foreign, permission-refused or no-longer-recipient targets are a generic
404. Missing source-to-program relationships and unsupported/ambiguous legacy
references are explicit 422 refusals; an unavailable read is 503 and retryable.
No guessed first record, current-project fallback, integer-as-program UUID,
same-name match, or generic-artifact-to-authoring conversion is allowed.

## Producer and consumer inventory

Actual shared-inbox producers: scheduled reports (`report_run`); task events and
task collaboration (`unified_task`); collaboration lock takeover
(`authoring_document`, UUID optionally followed by `:sectionUUID`); legacy
schedule alerts (`project`, integer `projects.id`); universal collaboration and
AnA `fire_notification` (explicit polymorphic resources or a recorded action
URL). This work does not invent automatic notification production in modules
that currently produce none.

Supported source families and exact owning destinations:

- Saved report run → Insights `reportRunId`; existing report scope authorization.
- Unified task → Tasks one-shot `taskId`, with its actually recorded program.
- Canonical authoring document/section → Document Authoring strong `docId` and
  exact resolved section code, with its own program. No artifact ID conversion.
- Legacy project → Project home only through a unique owned UUID mapping.
- Canonical submission/sequence → Submission Center exact `submissionId`,
  optional `sequenceId` and workspace. Sequence parent must match submission.
- Gateway transmittal → Gateway log exact `transmittalId` and target read; an
  older row outside the list limit is loaded independently.
- Protocol document → Protocol Development `protocol` and own `program`, or
  explicit `protocolScope=unfiled`; no implicit selection of another protocol.
- Controlled QMS document → Quality exact `qmsDocumentId`, including honest
  unbound legacy metadata. Its editor route remains the authority for content.

Recorded action URLs are accepted only for these known destinations with exact
native IDs, and only when no contradictory resource family is declared.
Redirects, arbitrary operations, client program hints and unknown params are
not authority. Their record identities are reread through the same resolver.

## Client behavior and recovery

The tray requests the target only when clicked, shows pending/refusal with a
retry, and navigates only after a complete validated response. Target resolution
does not mark the notice read. An open governed form or unsaved native editor
blocks navigation before project/target channels change. The owning program
and exact destination parameters are handed through existing shell/nav/editor
channels and safe URL parameters. Consumers must handle same-surface handoffs,
failed reads and targets outside the first page without opening another row.

Explicitly unmappable legacy records remain visible messages: the separate
Phase-13 review/project notification stores, polymorphic surface-only IDs,
generic concept2cure artifacts without a canonical authored-document mapping,
multi-record digests, project rows lacking a unique owned UUID mapping, and
unknown kinds. They are not advertised as successful record opens.
Custom recorded Authoring URLs with only a `sectionCode` hint are refused;
section-targeted notices require the canonical section UUID, rather than
silently opening the document's default section.
Local tests prove recipient isolation, object/private-program denial, exact identity,
program preservation, malformed/legacy refusal, retry and actual UI consumption.
