# F01 / F02 — controlled document completion evidence

Contract published before implementation: [qms-contract.md](qms-contract.md).

F01 now uses the existing Authoring document and section records throughout the Quality workflow. Register/template creation, explicit legacy draft binding, Open, actual editor save, review, signature and controlled revision have real service callers and persisted outcomes. The canonical `insertDocumentTx` owns creation: fresh active membership, unique program/project anchor and existing project sharing are verified on its enlisted connection; QMS registration, canonical sections/genesis revisions, both audit paths and creator OWNER/AUTHOR grants must all persist before commit. A denied project or failed ledger, canonical audit or ownership grant rolls the entire creation back.

Review requires real saved text and canonical edit access. The existing Part 11 authority, password/MFA, two-person and meaning checks remain. A signing role also needs fresh project access and canonical object approval permission. Approval locks and captures the actual editing copy, includes it in the version content digest, stores the real signature binding and retains immutable sections in `qms_document_versions`. The shared canonical Authoring mutation gate and database trigger refuse writes to reviewed, signed or retained copies; signing/freezing through Authoring is routed back to Quality. Revision creates a new editing copy, preserves earlier content and signatures, and permits editing only on the new draft.

Legacy registry-only controlled entries require explicit program/template selection to start an authored major revision. The exact earlier registry record is preserved as immutable `legacy-registry` history, with no fabricated authored document, sections, signature or approval date. The new template starts empty and cannot enter review until text is saved. Organization-visible list, single-record and review-due responses strip stored authored prose; editor and retained signed-version reads apply the existing canonical object permission. A denied history returns a refusal, not an empty history.

F02 counts training only for the effective document's exact version, using distinct active organization members in both numerator and denominator. Expired records, previous-version acknowledgments, former members and duplicate membership rows cannot improve current compliance; all historical acknowledgments remain intact. See [training evidence](qms-training.md).

Verification uses Node 22.23.3, scoped Vitest and real PGlite transaction/trigger/schema execution. Red evidence retained:

- [Unbound/empty content refusal](qms-content-red.txt) and [initial Quality controls](qms-ui-red.txt).
- [Private project allowed incorrectly](qms-program-access-red.txt).
- [Creation falsely succeeded after ownership grant failure](qms-ownership-red.txt).
- [Signer bypassed canonical object approval permission](qms-approval-access-red.txt).
- [Previous-version training counted incorrectly](qms-training-red.txt).

Green evidence: [complete scoped run](qms-complete-scoped-tests.txt), [signed approval checks](qms-final-signature-tests.txt), [actual editor integration](qms-ui-workbench.txt), [current-version training](qms-training-green.txt), and [scoped ESLint](qms-final-lint.txt). The lifecycle suite also replays the additive migration and verifies unrelated document deletion remains functional. The AnA contract suite executes the actual canonical section revision/audit/permission stores and existing chained QMS/Vault ledger; its prior audit rollback and spoofed-identity assertions are preserved.

Deployment requires the additive `20261014_qms_controlled_authoring_content.sql` migration, integrated into the canonical migration set after the QMS/Authoring parents and before tenant sweeps. Existing records are not silently migrated to authored text. Subsequent [native request database qualification](qms-request-db-verification.md) completes the explicit pinned-connection contract and documents actual FORCE RLS signing/training/foreign controls, the working canonical ambient-scope control and proof limits. Application-wide type checking, clean installation, build and real-browser release gates remain with the control tower. Component HTTP doubles prove caller contracts and actual TipTap behavior; PGlite proves database semantics, not production deployment. No commit, push, deployment, new dependency or provider call was made in this scope.
