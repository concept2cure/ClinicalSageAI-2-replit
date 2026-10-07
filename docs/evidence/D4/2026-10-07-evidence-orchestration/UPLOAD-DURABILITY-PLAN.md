# Canonical upload durability: bounded D4 follow-through

The read-only connector audit confirmed that canonical chat/Projects upload
continues after `fs.mkdir` or `fs.writeFile` fails, then can report an ingested
Data Room source with no stored bytes. Fix this existing handoff prerequisite;
do not introduce a connector import path, provider account, store or engine.

Approved scope: the existing byte-persistence block in
`server/routes/chat/upload.ts`, dedicated durability tests, and its evidence
receipt. Byte persistence failure must return a safe 503 refusal before
upload metadata, source/artifact/audit, extraction or retrieval writes. The
successful scanner/tenant/project/format/extraction/capture path is preserved.

Do not expose filesystem/driver error text. Do not delete or rewrite original
uploads, add cleanup of ambiguous partially written bytes, claim filesystem
immutability/fsync/DB+filesystem atomicity, or change unrelated capture logic.
No dependencies, migrations, new tools, hooks, baselines or client surfaces.

Handoff worker owns the production block and new test/receipt. Control tower
owns shared regressions, review, direct publication and exact-source checks.
Demonstrate RED before implementation and GREEN after. No worker commit/push.
