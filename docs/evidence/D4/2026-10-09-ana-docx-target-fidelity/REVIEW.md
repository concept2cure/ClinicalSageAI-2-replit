# Independent verifier review

The test session owned only the new actual-handler/PGlite suite and the existing
verifier registration/claim tests. The control-tower session owned production,
delivery documentation and release gates. A third session reviewed production
read-only. All worked on concept2cure-v2 in this checkout.

The reviewer checked tenant joins, current-version/head matching, recomputed
hashes, canonical document disposition, exact post-extraction identity/content
rechecks and UUID program anchoring. Two identified issues were corrected:
ToolHandler permits an absent context (the service now handles it explicitly),
and integer projectRef/projectId disagreements now refuse. No DB lock spans OCR.

The reviewer confirmed flat canonical diffs detect substantive line changes;
section summary maps can misclassify repeated identical headings. Exact-text
comparison therefore bypasses summary heuristics. The LCS cell bound matches the
canonical diff's split-newline arrays including the boundary row/column.

The resource claim is deliberately limited to line-diff allocation. File reading
and extraction retain their existing memory behavior. No source qualification,
seal authorization or authenticated consumer is asserted. Artifact-version
immutability comments are not relied upon: row identity, exact content and hashes
are all rechecked because an enforcing version-table trigger was not found.
