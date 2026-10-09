# Immediate authenticated-verification follow-up — W3 / D4

The bounded target repair is complete. Source qualification and the legacy caller-supplied ok-verdict remain open.

Use the existing immutable AnA turn record, rather than adding another registry. server/services/ana/turn-record.ts persists complete tool inputs/results in ana_turn_records and ana_record_blobs with a chained hash/audit record. turn-record-verify.ts loads and verifies that record by tenant. An eventual seal can refer to a precise recorded tool step; tool-trace summaries are lossy and are not the proof surface.

The verify_docx_against_source handler in AnaToolExecutor.ts currently compares tenant-workspace DOCX text against model/tool-supplied expected_text or required_strings. It emits no persisted artifact/version/hash or qualified source identity. A clean diff establishes transcription fidelity against those supplied strings only.

The next bounded step is to make that existing verifier load the persisted owned target server-side, bind target/version/content and DOCX hashes to its result, preserve the result in the existing turn record and consume an integrity-verified recorded step. Tests must refuse wrong tenant/step/target, omitted or forged references, changed bytes and stale versions. Keep source qualification unassessed until an actual version-bound review contract exists.

Existing canonical source paths to reuse are draft-project-sources.ts, authoring/draft-source-references.ts, authoring/authoring-from-draft.ts, authoring/authoring-export.ts and authoring/authoring-file-to-vault.ts. They preserve source IDs/hash/extraction/currentness, section/render hashes and filing/audit receipts; authoring source provenance explicitly records qualification:unassessed. Current-at-save, an intact turn record or a citation checksum cannot be upgraded to scientific qualification.

This follow-up was scoped by a separate read-only review. No new verifier/receipt capability or authenticated source proof is delivered in this batch. Full IND hierarchy, applicability, therapeutic/modality and temporal qualification remain open.
