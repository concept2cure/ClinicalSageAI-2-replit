# F19 — exact Quality document notification targets

The Quality adapter consumes the existing validated navigation channel's `qmsDocumentId` and listens for later same-surface handoffs. A request sequence distinguishes repeated explicit requests for the same ID. Quality selects its SOP tab and reads the exact `/api/mdx/qms/documents/:id` record independently of the list's success or contents. A bound record then opens through `/editor`, which applies canonical object view permission. An unbound draft uses explicit program/template binding; an unbound controlled record shows its exact metadata and offers the authored revision workflow. A refused/missing target remains a visible error with retry of the same ID, never selection of another row.

A target arriving while the canonical workbench is open is queued. It opens after the existing Back/unsaved-leave decision completes; the handoff cannot discard current unsaved text. The list and target share one canonical register-record adapter.

Evidence: [initial missing-consumer red run](qms-notification-red.txt) failed both exact-record regressions. [All Quality tests](qms-notification-green.txt) pass 9 files/63 cases, including exact target with no list row, failure/retry retention, queued editor target, unbound metadata, repeated adapter handoff, actual TipTap save/reload and unsaved Back. [Scoped lint](o01-qms-notification-lint.txt) has no errors.

Server notification destination validation and TaskTray dispatch are owned by the identity/navigation workstream. This evidence verifies the Quality consumer; it does not claim delivery or production rollout.
