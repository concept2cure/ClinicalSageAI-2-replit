/**
 * Legacy-import tool definitions (migration 20260512).
 *
 * The surface AnA uses to bring a client's existing dossier into the platform:
 * start an import, inspect and override the inferred mapping, and approve the
 * result so it becomes governed content.
 *
 * Extracted verbatim from AnaToolDefinitions.ts (mega-file decomposition,
 * tranche 6). These are pure `AnaTool` definition objects; their handlers live
 * in AnaToolExecutor.ts. Imported back into AnaToolDefinitions.ts so
 * `ALL_ANA_TOOLS_RAW` references them unchanged.
 */

import type { AnaTool } from '../ai-gateway/types';

// ─────────────────────────────────────────────────────────────────────────────
// Legacy-import tools (migration 20260512).
// ─────────────────────────────────────────────────────────────────────────────

export const START_LEGACY_IMPORT: AnaTool = {
  name: 'start_legacy_import',
  description:
    "Kick off an import of a legacy archive (eCTD zip from FDA/EMA/PMDA, eSTAR bundle, raw 510(k) folder, raw PMA module). The detector sniffs the backbone XML or falls back to filename heuristics and produces a per-file mapping into the kit's canonical sections. Returns the job id; use override_import_mapping for any low-confidence rows and then approve_import to materialize artifacts.",
  input_schema: {
    type: 'object',
    properties: {
      source_path:    { type: 'string', description: 'Absolute path to the uploaded zip / folder.' },
      source_kind:    { type: 'string', enum: ['zip', 'folder', 'tar', 'rar'] },
      source_filename:{ type: 'string', description: 'Original filename for display.' },
      program_id:     { type: 'string', description: 'Optional program (UUID) the archive belongs to.' },
    },
    required: ['source_path'],
  },
};

export const OVERRIDE_IMPORT_MAPPING: AnaTool = {
  name: 'override_import_mapping',
  description:
    "Override the detector's mapping on a specific file in an import job. Use when AnA recognizes a file the detector bucketed as 'attachment' or assigned a wrong CTD section. Sets mapping_source='manual' and confidence=1.0.",
  input_schema: {
    type: 'object',
    properties: {
      import_job_id:        { type: 'number' },
      file_id:              { type: 'number' },
      mapped_ctd_section:   { type: 'string' },
      mapped_section_key:   { type: 'string' },
      mapped_artifact_kind: { type: 'string' },
      status:               { type: 'string', enum: ['pending', 'mapped', 'skipped'] },
    },
    required: ['import_job_id', 'file_id'],
  },
};

export const APPROVE_IMPORT: AnaTool = {
  name: 'approve_import',
  description:
    "Finalize an import job — materialize one concept2cure_artifacts row per file that's in 'mapped' status, attached to the specified projectId. Marks the import job 'completed' and stamps approved_by + approved_at for the 21 CFR Part 11 audit trail.",
  input_schema: {
    type: 'object',
    properties: {
      import_job_id: { type: 'number' },
      project_id:    { type: 'number', description: 'projects.id the imported artifacts will hang off.' },
    },
    required: ['import_job_id', 'project_id'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Native python-docx authoring — canonical Word-grade authoring path.
// Spawns workers/artifact-compute/docx-python-runtime.py inside the isolated
// compute worker (no network egress, bounded timeout) which uses python-docx
// directly: real Document with configured fonts, page margins, headers,
// footers, headings (h0–h3), bullet/numbered lists, tables (pipe-delimited),
// page breaks (--- marker), inline images. Returns the .docx and — when
// output_format='pdf' — chains through headless LibreOffice
// (server/scripts/docx_pdf_pipeline.py) to produce a native-fidelity PDF.
//
// Prefer this over generate_document for paying-client deliverables that
// must look like real Word output (regulatory submissions, investor decks,
// signed cover letters). Keep generate_document for lightweight inline
// composition where JSZip+OOXML fidelity is sufficient.
// ─────────────────────────────────────────────────────────────────────────────

export const AUTHOR_DOCX_NATIVE: AnaTool = {
  name: 'author_docx_native',
  description:
    "Author a native Word-grade .docx using python-docx (workers/artifact-compute/docx-python-runtime.py) running inside the isolated compute worker. Real headers, footers, configured fonts (Calibri 11pt), page margins, heading levels, bullet/numbered lists (markdown-style ‐ and 1. prefixes), pipe-delimited tables, page breaks (--- marker), inline base64 images via ![alt](key). When output_format='pdf', the .docx is then converted via headless LibreOffice for native Word→PDF fidelity. Use for regulatory submissions, signed cover letters, paying-client deliverables — anything that must look like real Word output. Tenant-scoped via ToolContext (organizationId, userId, projectId).",
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description:
          'Document title. Used for the title page heading, the running header, and the output filename.',
      },
      content: {
        type: 'string',
        description:
          "Markdown-style content. Supported syntax: '# H1' through '#### H4' headings, '- ' or '* ' for bullets, '1. ' for numbered, '|col|col|' rows + '|---|---|' separator for tables, '---' on its own line for a page break, '![alt](image_key)' for inline images keyed against the images map. Plain paragraphs render as Calibri body text.",
      },
      images: {
        type: 'object',
        description:
          'Optional map of image_key → base64-encoded PNG/JPEG bytes. Referenced from content via ![alt](image_key). Omit if the document has no inline images.',
        additionalProperties: { type: 'string' },
      },
      output_format: {
        type: 'string',
        enum: ['docx', 'pdf'],
        description:
          "Output format. 'docx' returns the python-docx authored Word document; 'pdf' additionally converts via headless LibreOffice. Default 'docx'.",
      },
      pdf_compress: {
        type: 'boolean',
        description:
          'When output_format=pdf, run a Ghostscript compression pass after conversion. Useful for submission gateways that cap file size.',
      },
      pdf_quality: {
        type: 'string',
        enum: ['screen', 'ebook', 'printer', 'prepress', 'default'],
        description:
          "Ghostscript PDFSETTINGS preset when pdf_compress=true. Default 'ebook'.",
      },
    },
    required: ['title', 'content'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// DOCX → PDF — canonical Word-grade rendering. Wraps the Python pipeline
// (server/scripts/docx_pdf_pipeline.py) which shells out to headless
// LibreOffice (`soffice --headless --convert-to pdf`). The .docx remains the
// editable source of truth; the PDF is a downstream rendering with native
// Word fidelity (fonts, headers/footers, page breaks, tables, styles). We
// never render PDF directly via reportlab — see
// docs/architecture/docx-pipeline-canonical-designation.md.
//
// Use after generate_document, fetch_template_and_fill, or
// assemble_ectd_module_from_artifacts when the user asks for a PDF
// deliverable. Optional Ghostscript compression for size-sensitive shipping
// (FDA submission gateways, email attachments).
// ─────────────────────────────────────────────────────────────────────────────

export const CONVERT_DOCX_TO_PDF: AnaTool = {
  name: 'convert_docx_to_pdf',
  description:
    "Convert an existing .docx to a .pdf using headless LibreOffice — the canonical Word-grade rendering path. The .docx must already exist on disk (typically produced by generate_document, fetch_template_and_fill, or assemble_ectd_module_from_artifacts). Returns the path to the produced PDF, plus optional Ghostscript-compressed variant for submission gateways. The .docx is preserved as the editable source; the PDF is a downstream rendering with native fonts, page layout, headers, and footers — not a reportlab-flat render.",
  input_schema: {
    type: 'object',
    properties: {
      input_docx_path: {
        type: 'string',
        description:
          'Absolute path to the source .docx file. Typically the outputPath returned by a prior generate_document / fetch_template_and_fill / assemble_ectd_module_from_artifacts call.',
      },
      output_pdf_path: {
        type: 'string',
        description:
          'Optional output path for the PDF. Defaults to the same directory as the input with a .pdf extension.',
      },
      compress: {
        type: 'boolean',
        description:
          'When true, run a Ghostscript compression pass after conversion. Useful for FDA submission gateways that cap file size.',
      },
      quality: {
        type: 'string',
        enum: ['screen', 'ebook', 'printer', 'prepress', 'default'],
        description:
          "Ghostscript PDFSETTINGS preset. Default 'ebook' (~150dpi, web-grade). Use 'prepress' for color-critical print, 'screen' for the smallest file.",
      },
    },
    required: ['input_docx_path'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// General-purpose scripting sandbox — AnA's "write a Python script to do X
// precisely" capability, governed. Runs AnA-authored Python inside the
// isolated compute worker (workers/artifact-compute/python-script-runtime.py):
// ephemeral tempdir, NO network egress, bounded CPU time + address space, and
// a wall-clock SIGKILL. Optional input files are written into the script's
// working directory; any files the script produces are captured and returned.
//
// Use for data transforms, parsing, numerical checks, building intermediate
// artifacts, and bespoke manipulation that no structured tool covers. This is
// NOT a path to the host filesystem or shell — the sandbox cwd is a throwaway
// tempdir with no network and no access to the application's files.
// ─────────────────────────────────────────────────────────────────────────────

export const RUN_PYTHON_SCRIPT: AnaTool = {
  name: 'run_python_script',
  description:
    "Write and run a Python 3 script in AnA's isolated sandbox to do something precisely — data transforms, parsing, numerical/biostat checks, generating intermediate files, bespoke manipulation no other tool covers. The script runs in an ephemeral tempdir with NO network access, bounded CPU time, bounded memory, and a wall-clock timeout. Provide optional input_files (filename → base64) which are written into the script's working directory; the script reads/writes files relative to its cwd. Returns captured stdout, stderr, any error traceback, and any files the script created (base64, size-capped). The standard library plus python-docx, openpyxl, and common scientific packages available on the host can be imported. This is a sandbox: it cannot reach the network, the host filesystem outside its tempdir, or a shell. Tenant-scoped via ToolContext.",
  input_schema: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description:
          "The Python 3 source to execute. Runs with __name__ == '__main__' and cwd set to the sandbox tempdir. Print results to stdout and/or write output files relative to cwd — both are returned to you.",
      },
      input_files: {
        type: 'object',
        description:
          'Optional map of filename → base64-encoded bytes, written into the script working directory before execution (e.g. a CSV to parse, a .docx to transform). Filenames must be relative; path traversal is rejected.',
        additionalProperties: { type: 'string' },
      },
      cpu_seconds: {
        type: 'number',
        description: 'Best-effort CPU-time cap in seconds (POSIX). Default 20.',
      },
      timeout_ms: {
        type: 'number',
        description: 'Wall-clock timeout in milliseconds before SIGKILL. Default 30000, max 120000.',
      },
    },
    required: ['code'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Targeted document insertion — the governed, document-aware equivalent of
// "write a Python script to make the targeted insertions precisely". Surgically
// inserts content into an existing .docx at exact anchors (heading text,
// placeholder token, paragraph index, start/end) using python-docx inside the
// isolated worker (workers/artifact-compute/docx-insert-runtime.py). The source
// document is preserved; a new edited .docx is produced with a per-insertion
// outcome report.
//
// Prefer this over author_docx_native when the document already exists and you
// need precise edits rather than full re-authoring (e.g. drop a new subsection
// after "10.3 Statistical Methods", fill a {{SPONSOR}} placeholder, append a
// paragraph at the end). Tenant-scoped via ToolContext.
// ─────────────────────────────────────────────────────────────────────────────

export const INSERT_DOCUMENT_CONTENT: AnaTool = {
  name: 'insert_document_content',
  description:
    "Make precise, targeted insertions into an existing Word (.docx) document using python-docx in the isolated worker — the governed equivalent of scripting exact edits. Locate anchors by heading text, placeholder token (e.g. {{SPONSOR}}), paragraph index, or document start/end, then insert content before/after the anchor or replace it. Content uses markdown-style paragraph syntax ('#'/'##'/'###' headings, '- '/'* ' bullets, '1. ' numbered, plain lines as body paragraphs). The original .docx is preserved as the source; a new edited .docx is written and its path returned, along with a per-insertion report (applied / anchor_not_found). Use when a document already exists and needs surgical edits rather than full re-authoring. For full document authoring use author_docx_native; for tables/images use that path. Tenant-scoped via ToolContext.",
  input_schema: {
    type: 'object',
    properties: {
      input_docx_path: {
        type: 'string',
        description:
          'Absolute path to the source .docx to edit (typically the docxPath returned by author_docx_native, generate_document, or fetch_template_and_fill).',
      },
      insertions: {
        type: 'array',
        description: 'Ordered list of targeted insertions to apply.',
        items: {
          type: 'object',
          properties: {
            anchor_type: {
              type: 'string',
              enum: ['heading_text', 'placeholder', 'paragraph_index', 'start', 'end'],
              description:
                "How to locate the insertion point. 'heading_text'/'placeholder' match paragraph text, 'paragraph_index' is a 0-based index, 'start'/'end' target the document boundaries (no anchor_value needed).",
            },
            anchor_value: {
              type: 'string',
              description:
                "The heading text, placeholder token, or paragraph index (as a string) to match. Omit for 'start'/'end'.",
            },
            position: {
              type: 'string',
              enum: ['before', 'after', 'replace'],
              description:
                "Where to place content relative to the anchor. Default 'after'. 'replace' with a placeholder substitutes the token inline; 'replace' with another anchor type removes the matched paragraph and inserts in its place.",
            },
            match: {
              type: 'string',
              enum: ['exact', 'contains'],
              description: "For text anchors: 'exact' matches the trimmed paragraph, 'contains' (default) matches a substring.",
            },
            content: {
              type: 'string',
              description:
                "Markdown-style content to insert. Supported: '#'/'##'/'###' headings, '- '/'* ' bullets, '1. ' numbered lists, plain lines as body paragraphs.",
            },
          },
          required: ['anchor_type', 'content'],
        },
      },
      output_format: {
        type: 'string',
        enum: ['docx', 'pdf'],
        description:
          "Output format. 'docx' (default) returns the edited Word document; 'pdf' additionally converts via headless LibreOffice.",
      },
    },
    required: ['input_docx_path', 'insertions'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Raw-OOXML document surgery — the deepest file-engineering path. Unpacks a
// .docx (a ZIP of XML parts), parses word/document.xml as an XML tree (lxml),
// locates text anchors at the paragraph/run level, and surgically inserts new
// <w:p> paragraph blocks (inheriting the anchor's exact formatting) or replaces
// placeholder text — preserving fonts, bold/italic, spacing, and justification
// — then repacks every original ZIP entry and VALIDATES the result. Use when
// edits must land at precise XML locations and inherit the document's existing
// character formatting, beyond what insert_document_content (python-docx object
// level) can address. Tenant-scoped via ToolContext.
// ─────────────────────────────────────────────────────────────────────────────

export const SURGICAL_DOCX_XML_EDIT: AnaTool = {
  name: 'surgical_docx_xml_edit',
  description:
    "Surgically edit an existing Word (.docx) at the raw OOXML/XML level: unpack the archive, parse word/document.xml, locate text anchors, insert new paragraph blocks that inherit the anchor's formatting (fonts, bold/italic, spacing, justification), or replace placeholder tokens preserving the run's formatting, then repack and validate (well-formedness + python-docx round-trip). Deeper than insert_document_content (which works at the python-docx object level) — use this when you need exact XML placement and faithful inheritance of existing character/paragraph formatting. Returns the edited .docx path, a per-operation report, and a validation report. Tenant-scoped via ToolContext.",
  input_schema: {
    type: 'object',
    properties: {
      input_docx_path: {
        type: 'string',
        description: 'Absolute path to the source .docx to edit (e.g. a docxPath from author_docx_native or an uploaded document).',
      },
      operations: {
        type: 'array',
        description: 'Ordered list of XML-level operations.',
        items: {
          type: 'object',
          properties: {
            op: {
              type: 'string',
              enum: ['insert_paragraphs', 'replace_text'],
              description: "'insert_paragraphs' inserts new <w:p> blocks near a text anchor; 'replace_text' swaps a placeholder token in place.",
            },
            anchor_text: { type: 'string', description: 'For insert_paragraphs: the paragraph text to anchor on.' },
            match: { type: 'string', enum: ['exact', 'contains'], description: "Anchor match mode. Default 'contains'." },
            position: { type: 'string', enum: ['before', 'after'], description: "Insert before or after the anchor. Default 'after'." },
            paragraphs: {
              type: 'array',
              items: { type: 'string' },
              description: 'For insert_paragraphs: the new paragraph texts, in order. Each inherits the anchor paragraph/run formatting when inherit_format is true.',
            },
            inherit_format: { type: 'boolean', description: "Clone the anchor's paragraph (w:pPr) and run (w:rPr) properties onto the inserted paragraphs. Default true." },
            find: { type: 'string', description: 'For replace_text: the placeholder/token to find.' },
            replace: { type: 'string', description: 'For replace_text: the replacement text (the run formatting around the token is preserved).' },
          },
          required: ['op'],
        },
      },
      output_format: {
        type: 'string',
        enum: ['docx', 'pdf'],
        description: "Output format. 'docx' (default) returns the edited Word document; 'pdf' additionally converts via headless LibreOffice.",
      },
    },
    required: ['input_docx_path', 'operations'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Clause-template library — insert a named regulatory building block
// (signature/approval block, cover-letter header, section heading, sponsor
// placeholder swap) into an existing .docx. A curated, field-validated content
// layer over insert_document_content's governed docx-insert worker — the
// productized equivalent of hand-scripting per-document clause helpers. Prefer
// this over insert_document_content when the content is a standard regulatory
// block; drop to insert_document_content for free-form content and to
// surgical_docx_xml_edit for raw-XML formatting inheritance. Tenant-scoped.
// ─────────────────────────────────────────────────────────────────────────────

export const INSERT_CLAUSE_TEMPLATE: AnaTool = {
  name: 'insert_clause_template',
  description:
    "Insert a named regulatory clause/building block into an existing Word (.docx) — signature/approval block, cover-letter header, section heading, or sponsor placeholder swap — via the governed docx-insert worker. Each clause is a curated, field-validated template: supply the clause key and its fields and it renders the block (required-field checks included) and inserts it at the given anchor. clause='signature_block' (fields: signatory_name, signatory_title, organization?, closing?, signature_date?); 'cover_letter_header' (sponsor_name, letter_date, re_line, sponsor_address?, recipient?, submission_type?; defaults to document start); 'section_heading' (heading_text, heading_number?, heading_level? 1–3, intro?); 'sponsor_placeholder_swap' (sponsor_name + optional sponsor_address/submission_date/contact_name/contact_email; replaces {{SPONSOR}}-style tokens already in the document, no anchor needed). Returns the edited .docx path, an applied report, and any field/anchor warnings. Prefer this for standard blocks; use insert_document_content for free-form content. Tenant-scoped via ToolContext.",
  input_schema: {
    type: 'object',
    properties: {
      input_docx_path: {
        type: 'string',
        description:
          'Absolute path to the source .docx to edit (e.g. a docxPath from author_docx_native, generate_document, fetch_template_and_fill, or an uploaded template).',
      },
      clause: {
        type: 'string',
        enum: ['signature_block', 'cover_letter_header', 'section_heading', 'sponsor_placeholder_swap'],
        description: 'Which named regulatory clause/building block to render and insert.',
      },
      fields: {
        type: 'object',
        description:
          'Clause-specific fields (see the tool description for required/optional fields per clause). Values are plain text; multi-line fields (e.g. sponsor_address) are newline-separated.',
      },
      anchor: {
        type: 'object',
        description:
          "Where to place the rendered block. Not used for 'sponsor_placeholder_swap' (it locates its own {{TOKEN}}s).",
        properties: {
          anchor_type: {
            type: 'string',
            enum: ['heading_text', 'placeholder', 'paragraph_index', 'start', 'end'],
            description: "How to locate the insertion point. Defaults: 'end' (most clauses) or 'start' (cover_letter_header).",
          },
          anchor_value: { type: 'string', description: "Heading text, placeholder token, or paragraph index (as a string). Omit for 'start'/'end'." },
          position: { type: 'string', enum: ['before', 'after', 'replace'], description: "Placement relative to the anchor. Default 'after'." },
          match: { type: 'string', enum: ['exact', 'contains'], description: "Text-anchor match mode. Default 'contains'." },
        },
      },
      output_format: {
        type: 'string',
        enum: ['docx', 'pdf'],
        description: "Output format. 'docx' (default) returns the edited Word document; 'pdf' additionally converts via headless LibreOffice.",
      },
    },
    required: ['input_docx_path', 'clause'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// DOCX validation — open a .docx and confirm it is structurally sound before
// shipping: required parts present ([Content_Types].xml, _rels/.rels,
// word/document.xml), every XML/rels part well-formed, relationship targets
// resolve, and python-docx can re-open it. Closes the "repack-and-validate"
// loop for any document AnA produced (via surgical edits or scripts) or
// received from a client. Tenant-scoped via ToolContext.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Container execution — a real Linux container with bash, Python, and file
// manipulation (the native equivalent of Anthropic computer-use), run via a
// hardened `docker run`: dropped capabilities, no-new-privileges, read-only
// root fs, resource limits, non-root user, wall-clock timeout. GATED OFF by
// default; outbound network is a separate explicit opt-in. Use for
// multi-step shell/file workflows that the python sandbox can't express; for
// document surgery prefer surgical_docx_xml_edit / run_python_script.
// ─────────────────────────────────────────────────────────────────────────────

export const RUN_IN_CONTAINER: AnaTool = {
  name: 'run_in_container',
  description:
    "Run a bash script inside a real, hardened Linux container (bash + Python + file tools) — the native computer-use path for multi-step shell/file workflows. The container has dropped Linux capabilities, no privilege escalation, a read-only root filesystem, a size-bounded writable /work directory (the cwd), CPU/memory/PID limits, a non-root user, and a wall-clock timeout. Outbound network is OFF unless the deployment explicitly enables it. Provide optional input_files (filename → base64) written into /work; files the script leaves in /work are returned (base64, size-capped). Returns stdout, stderr, and exit code. This capability is gated by deployment configuration and may be disabled. Prefer run_python_script for pure-Python work and surgical_docx_xml_edit for document edits.",
  input_schema: {
    type: 'object',
    properties: {
      script: {
        type: 'string',
        description: 'The bash script to run inside the container (cwd is /work).',
      },
      input_files: {
        type: 'object',
        description: 'Optional map of filename → base64 bytes, written into /work before the script runs.',
        additionalProperties: { type: 'string' },
      },
      timeout_ms: {
        type: 'number',
        description: 'Wall-clock timeout in milliseconds. Default 60000, max 300000.',
      },
    },
    required: ['script'],
  },
};

export const VALIDATE_DOCX: AnaTool = {
  name: 'validate_docx',
  description:
    "Validate a Word (.docx) document's OOXML/ZIP integrity without modifying it: confirms required parts are present, every XML/rels part is well-formed, relationship targets resolve to real parts, and python-docx can re-open the file. Use after any raw-XML or scripted edit, or on a client-supplied document, to catch silent corruption before it ships. Returns a structured report (ok, parts checked, malformed/missing parts, dangling relationships, paragraph count).",
  input_schema: {
    type: 'object',
    properties: {
      input_docx_path: {
        type: 'string',
        description: 'Absolute path to the .docx to validate.',
      },
    },
    required: ['input_docx_path'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Content-fidelity verification — proves a freshly built/edited .docx actually
// reproduces the supplied source text (and any required caption/boilerplate
// strings) verbatim, beyond what validate_docx (structural OOXML integrity)
// checks. Extracts the .docx text via the same extraction path AnA reads
// uploads with, diffs it against the source, and asserts each required string
// is present exactly. This is the audited "verify it against your text" step.
// ─────────────────────────────────────────────────────────────────────────────

export const VERIFY_DOCX_AGAINST_SOURCE: AnaTool = {
  name: 'verify_docx_against_source',
  description:
    "Verify that a built or edited Word (.docx) faithfully reproduces a known source text — the audited \"verify it against your text\" step after rebuilding from a template, applying corrections, or appending paragraphs. Unlike validate_docx (which checks OOXML/ZIP structural integrity only), this extracts the document's text and (1) diffs it against expected_text to surface any content divergence, and (2) confirms each entry in required_strings (e.g. caption block, case/sponsor identifiers, sworn-paragraph or boilerplate anchors) appears verbatim. Returns { ok, missingRequiredStrings, divergenceSummary, additions, deletions } — a pass/fail the user and the Part 11 audit trail can cite. Pair with validate_docx for full (structural + content) verification. Tenant-scoped via ToolContext.",
  input_schema: {
    type: 'object',
    properties: {
      input_docx_path: {
        type: 'string',
        description: 'Absolute path to the built/edited .docx to verify (e.g. a docxPath returned by author_docx_native, build_from_template, or surgical_docx_xml_edit).',
      },
      expected_text: {
        type: 'string',
        description: 'The verbatim source text the document is supposed to contain (e.g. the complete text the user provided). The extracted document text is diffed against this. Optional when only required_strings is supplied.',
      },
      required_strings: {
        type: 'array',
        items: { type: 'string' },
        description: 'Strings that MUST appear verbatim in the document (e.g. caption strings, case/sponsor numbers, sworn-paragraph anchors). Each is checked for an exact substring match; any missing entry fails verification.',
      },
    },
    required: ['input_docx_path'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// MDX kit-section write-back — closes the loop between AnA's drafting and the
// kit's section editors (K510Surface, PmaSurface, CerSurface). When the model
// has produced a draft section (cover letter, SE discussion, device
// description, software documentation, PMA module narrative, CER body, etc.),
// this tool persists that content into cerv2_510k_sections.content for the
// matching section_key — flagged as draft_source='ana' so the surface can
// render an "AnA drafted this — accept / refine" affordance. Audit-logged.
// ─────────────────────────────────────────────────────────────────────────────

export const WRITE_KIT_SECTION: AnaTool = {
  name: 'write_kit_section',
  description:
    "Write drafted section content back into the MDX kit's section editor (cerv2_510k_sections), so the user sees it inside K510Surface / PmaSurface / CerSurface instead of only in chat. Use after producing a drafted section narrative the user has asked you to author — typical section_keys include 'cover-letter', 'indications-for-use', '510k-summary', 'device-description', 'substantial-equivalence', 'software', 'cybersecurity', 'biocompatibility', 'sterilization', 'electromagnetic', 'performance-bench', 'performance-clinical', 'labeling', 'cer-main', 'cer-pmcf', 'pma-module-1' through 'pma-module-6', 'qsub-briefing', 'qsub-cover'. The section is marked as drafted-by-AnA and surfaces a review affordance; the user accepts or refines from inside the editor. Section row is matched by (organization_id, section_key); tenant-scoped via ToolContext.organizationId. Returns the updated row's id, status, and completionPercentage.",
  input_schema: {
    type: 'object',
    properties: {
      section_key: {
        type: 'string',
        description:
          "Stable section identifier matching cerv2_510k_sections.section_key (e.g. 'substantial-equivalence', 'cybersecurity', 'cer-main').",
      },
      content: {
        type: 'string',
        description:
          'The drafted section content (markdown or plain text). Replaces the existing content of the row. Must be the finished prose intended for review, not raw notes.',
      },
      status: {
        type: 'string',
        enum: ['drafting', 'ready_for_review', 'in_review'],
        description:
          "Workflow status to set. Default 'drafting'. Use 'ready_for_review' when the draft is comprehensive enough for human review.",
      },
      completion_percentage: {
        type: 'number',
        description:
          'Optional explicit completion %. If omitted, status drives a sensible default (drafting=60, ready_for_review=85, in_review=90).',
      },
      summary_note: {
        type: 'string',
        description:
          'One-line note for the audit trail describing what this draft covers (e.g. "drafted SE discussion citing K251234 + reference device").',
      },
      sources: {
        type: 'array',
        description:
          "The passages the text was grounded in, exactly as project_knowledge_search returned them: pass each passage's evidence_source_id (or artifact_id) and its text as excerpt. Every clause of the content that quotes an excerpt verbatim is recorded as a citation of that Data Room source; everything else is recorded as your own assertion. Only sources that exist in this organization are accepted — any other entry is dropped and reported back.",
        items: {
          type: 'object',
          properties: {
            evidence_source_id: { type: 'integer', description: 'cre_evidence_sources.id from a retrieval passage.' },
            artifact_id: { type: 'string', description: 'The retrieval artifact id, when no evidence_source_id was returned.' },
            excerpt: { type: 'string', description: 'The passage text as retrieved (required).' },
            title: { type: 'string' },
          },
          required: ['excerpt'],
        },
      },
    },
    required: ['section_key', 'content'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// eCTD Module Assembly — collects existing artifacts in a project belonging
// to a CTD module prefix (e.g. "3.2.S") and assembles them into a single DOCX
// via masterDocumentBuilder.generateFromScratch. Pure assembly, no AI.
// ─────────────────────────────────────────────────────────────────────────────

export const ASSEMBLE_ECTD_MODULE_FROM_ARTIFACTS: AnaTool = {
  name: 'assemble_ectd_module_from_artifacts',
  description:
    "Collect every artifact in a project whose CTD section starts with a given module prefix (e.g. '3.2.S' for drug substance, '2.5' for clinical overview, '5.3.5' for clinical study reports), order them by section number, and assemble a single DOCX with proper headings. Use when the user has drafted several module sections as separate artifacts and wants the assembled module document for review or submission. Pulls the latest non-archived version of each artifact, dedupes by section, and emits the output to disk. Tenant-scoped via ToolContext.organizationId.",
  input_schema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'number',
        description: 'Project ID whose artifacts should be assembled.',
      },
      module_number: {
        type: 'string',
        description:
          'CTD module prefix to match on artifact.ctd_section (e.g. "3.2.S", "3.2.P", "2.5", "2.7", "5.3.5"). Trailing dot/wildcard not required.',
      },
      output_format: {
        type: 'string',
        enum: ['docx', 'pdf'],
        description: 'Output format. Defaults to docx.',
      },
    },
    required: ['project_id', 'module_number'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Section-aware drafting scaffolds — return a structured outline + anchor
// data that the model uses to draft prose inline in its own response.
// Following the mine_precedents pattern: tool provides STRUCTURE, LLM
// provides PROSE.
// ─────────────────────────────────────────────────────────────────────────────

export const DRAFT_510K_SUBSTANTIAL_EQUIVALENCE: AnaTool = {
  name: 'draft_510k_substantial_equivalence',
  description:
    "Return the canonical FDA 510(k) Substantial Equivalence comparison structure for a subject-vs-predicate device pair, with per-section guidance and the SE table column format. Use when drafting the SE section of a 510(k) — the structure is what FDA reviewers expect, the table format is what the SE summary requires. The tool does NOT draft prose; the model uses the returned structure + the user's device data to draft each section inline. Pair with analyze_predicate_device first if predicate technical details are needed.",
  input_schema: {
    type: 'object',
    properties: {
      predicate_510k_number: {
        type: 'string',
        description: 'Primary predicate K-number (e.g. "K223456").',
      },
      device_name: {
        type: 'string',
        description: 'Subject device name.',
      },
      intended_use: {
        type: 'string',
        description: 'Subject device intended use statement.',
      },
      technology_summary: {
        type: 'string',
        description:
          'Brief summary of subject device technology (energy source, sensors, materials, software, principles of operation).',
      },
    },
    required: ['predicate_510k_number', 'device_name', 'intended_use'],
  },
};

export const DRAFT_CLINICAL_OVERVIEW_M2_5: AnaTool = {
  name: 'draft_clinical_overview_m2_5',
  description:
    "Draft the ICH M4E(R2) Clinical Overview (Module 2.5) — the critical benefit-risk assessment. Two modes: (1) when called with csrs[] (the program's clinical studies), it composes the data-driven overview through the platform's deterministic buildM25ClinicalOverview — the 2.5.1–2.5.6 narrative, the pivotal-efficacy and benefit-risk tables, completeness, and gaps — the same engine the submission package uses, parity with draft_nonclinical_overview_m2_4 / draft_clinical_summary_m2_7; (2) without csrs[], it returns the six-subsection outline with drafting guidance and (with project_id) the project's artifacts for citation. Prefer mode 1 when clinical study data exists; report completeness and gaps honestly.",
  input_schema: {
    type: 'object',
    properties: {
      product_name: {
        type: 'string',
        description: 'Drug substance / product name.',
      },
      indication: {
        type: 'string',
        description: 'Target indication.',
      },
      csrs: {
        type: 'array',
        description: 'Clinical study summaries — when supplied, the Clinical Overview is composed from them (data-driven mode).',
        items: {
          type: 'object',
          properties: {
            studyId: { type: 'string' },
            protocolNumber: { type: 'string' },
            phase: { type: 'string' },
            studyDesign: { type: 'string' },
            primaryEndpoint: { type: 'string' },
            primaryResult: { type: 'string' },
            sampleSize: { type: 'number' },
            ittPopulation: { type: 'number' },
            saeCount: { type: 'number' },
            deathCount: { type: 'number' },
          },
          required: ['protocolNumber', 'phase'],
        },
      },
      development_rationale: { type: 'string', description: 'Disease background / unmet need for 2.5.1 (optional, data-driven mode).' },
      project_id: {
        type: 'number',
        description:
          'Project ID — in outline mode, returns up to 50 existing artifacts so you can pick citations.',
      },
    },
    required: ['product_name', 'indication'],
  },
};

export const BATCH_DRAFT_SECTIONS: AnaTool = {
  name: 'batch_draft_sections',
  description:
    "Draft MANY document sections in ONE parallel batch instead of one section per turn. Use this when the author asks to draft/regenerate several sections at once (e.g. 'draft all the TODO sections in Module 2', 'give me first drafts of 2.4, 2.5 and 2.7'). Each request is a section to draft with its own instructions; they run concurrently (bounded) through the same framework-grade drafting engine used for single sections, so a five-section batch returns in roughly the time of the slowest one rather than five sequential turns. Returns per-section drafted content the author promotes through the governed authoring flow — nothing is auto-saved. Do NOT use it to fabricate quantitative results; where a value is unknown the draft must say so.",
  input_schema: {
    type: 'object',
    properties: {
      sections: {
        type: 'array',
        description: 'The sections to draft in parallel (2–20).',
        items: {
          type: 'object',
          properties: {
            section_type: { type: 'string', description: 'Document section / CTD type to draft (e.g. "2.5", "nonclinical_overview", "device_description").' },
            instructions: { type: 'string', description: 'What this section must contain / how to draft it.' },
            existing_content: { type: 'string', description: 'Optional existing content to revise rather than draft from scratch.' },
          },
          required: ['section_type', 'instructions'],
        },
      },
      framework: { type: 'string', description: 'Regulatory framework context (e.g. "FDA", "EMA", "MDR", "IVDR"). Shared across the batch.' },
      submission_type: { type: 'string', description: 'Canonical filing type (e.g. "US_IND", "510k", "IVDR-TF") — unlocks framework-grade authoring for all filing types. Shared across the batch.' },
      project_context: {
        type: 'object',
        description: 'Shared project context applied to every section (device/product name, indication, etc.).',
        properties: {
          deviceName: { type: 'string' },
          deviceType: { type: 'string' },
          indication: { type: 'string' },
          predicateDevice: { type: 'string' },
          classification: { type: 'string' },
        },
      },
    },
    required: ['sections'],
  },
};

export const DRAFT_FDA_IR_RESPONSE: AnaTool = {
  name: 'draft_fda_ir_response',
  description:
    "Parse a pasted FDA Information Request letter, extract the numbered questions, and return a per-question response scaffold with the canonical 3-section format (FDA Question verbatim · Sponsor Response · Supporting Data/Citation) plus cover-letter guidance. Use when the user has received an IR (typically Day 74 RTF or mid-cycle) and needs to draft a response within the 14-day window. The tool extracts questions heuristically (numbered '1.', '1.1', or 'Question N:'); if extraction fails, it tells you so you can paste a more structured version. The model drafts each response inline using the scaffold; the tool itself does not call any AI.",
  input_schema: {
    type: 'object',
    properties: {
      ir_text: {
        type: 'string',
        description:
          'The full text of the Information Request letter (pasted as plain text). PDF parsing is out of scope — paste the text manually.',
      },
    },
    required: ['ir_text'],
  },
};
