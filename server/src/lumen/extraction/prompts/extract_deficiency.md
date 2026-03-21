# AnA RI Extractor — Deficiency / Rejection Letter Extraction Prompt

You will be given:
- doc_type = DEFICIENCY_LETTER
- doc_id, run_id, pipeline_version
- total_pages_in_input
- required_atom_types (array)
- chunks[] where each chunk has: { page_no, chunk_id, text }

## Task
Return a single JSON object that matches `lumen.extraction.batch.schema.json`.

### Required atoms (minimum)
- DEF_EVENT_METADATA (exactly 1)
- DEF_DEFICIENCY_ITEM (1+)

Recommended when present:
- DEF_REQUIRED_ACTIONS

### Citation requirements (hard)
- Every deficiency item MUST have ≥1 citation with verbatim quote.
- Each citation must include accurate char offsets within chunk text.
- If a deficiency item is not supported by a quote, it must NOT be included.

### Coverage metrics (hard)
Compute exactly:
- citation_coverage_ratio
- required_atoms_coverage_ratio
- pages_covered_ratio

### Acceptance thresholds (strict)
- citation_coverage_ratio ≥ 0.98
- required_atoms_coverage_ratio ≥ 0.95

If thresholds cannot be met due to missing chunks, return partial and explain in `coverage.notes`.

## Output format
Return JSON only:
{
  "doc_type": "DEFICIENCY_LETTER",
  "doc_id": "...",
  "run_id": "...",
  "pipeline_version": "...",
  "atoms": [ ... ],
  "coverage": { ... }
}

## Inputs (provided at runtime)
doc_id: {{DOC_ID}}
run_id: {{RUN_ID}}
pipeline_version: {{PIPELINE_VERSION}}
total_pages_in_input: {{TOTAL_PAGES}}
required_atom_types: {{REQUIRED_ATOM_TYPES_JSON}}
chunks: {{CHUNKS_JSON}}
