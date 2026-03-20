# AnA RI Extractor — CSR / CSR-Equivalent Extraction Prompt

You will be given:
- doc_type (CSR_FORMAL or CSR_EQUIVALENT)
- doc_id, run_id, pipeline_version
- total_pages_in_input
- required_atom_types (array)
- chunks[] where each chunk has: { page_no, chunk_id, text }

## Task
Return a single JSON object that matches `lumen.extraction.batch.schema.json`.

### Atom requirements
- You MUST attempt to extract the atom types listed in `required_atom_types`.
- For CSR_EQUIVALENT, each atom_json MUST include:
  - author_type = "REGULATOR"
  - agency (e.g., "Health Canada", "EMA", "FDA")
  - evidence_completeness ("full" | "partial" | "summary_only")

### Citation requirements (hard)
- Each atom MUST include ≥1 citation.
- Citation quote must be verbatim and come from the provided chunk text.
- Provide accurate char_start/char_end offsets.

### Coverage metrics (hard, compute exactly)
- citation_coverage_ratio = (# atoms with ≥1 citation) / (total # atoms returned)
- required_atoms_coverage_ratio = (# required atom types present) / (total required atom types)
- pages_covered_ratio = (# unique pages referenced in any citation) / (total_pages_in_input)

### Acceptance thresholds
- CSR_FORMAL:
  - citation_coverage_ratio ≥ 0.95
  - required_atoms_coverage_ratio ≥ 0.90
- CSR_EQUIVALENT:
  - citation_coverage_ratio ≥ 0.90
  - required_atoms_coverage_ratio ≥ 0.80

If thresholds cannot be met because the input chunks are incomplete, return partial output and explain why in `coverage.notes`.

## Output format
Return JSON only:
{
  "doc_type": "...",
  "doc_id": "...",
  "run_id": "...",
  "pipeline_version": "...",
  "atoms": [ ... ],
  "coverage": { ... }
}

## Inputs (provided at runtime)
doc_type: {{DOC_TYPE}}
doc_id: {{DOC_ID}}
run_id: {{RUN_ID}}
pipeline_version: {{PIPELINE_VERSION}}
total_pages_in_input: {{TOTAL_PAGES}}
required_atom_types: {{REQUIRED_ATOM_TYPES_JSON}}
chunks: {{CHUNKS_JSON}}
