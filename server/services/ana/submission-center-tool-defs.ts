/**
 * Submission-center tool definitions.
 *
 * AnA's reach over the canonical submission core: ingestion, the deterministic
 * eCTD primitives, and the surrounding submission-center operations.
 *
 * Extracted verbatim from AnaToolDefinitions.ts (mega-file decomposition,
 * tranche 6). These are pure `AnaTool` definition objects; their handlers live
 * in AnaToolExecutor.ts. Imported back into AnaToolDefinitions.ts so
 * `ALL_ANA_TOOLS_RAW` references them unchanged.
 */

import type { AnaTool } from '../ai-gateway/types';
import { PLACEABLE_DOCUMENT_TABLE_LIST } from '../ectd/leaf-document-tables';
import { DOCUMENT_TEMPLATES } from '../market-specs/document-template-library';
import type { RmfJurisdiction } from '../market-specs/risk-management-structure';
import { MDR_FACT_VOCABULARY, IVDR_FACT_VOCABULARY } from '../market-specs/device-classification';

// ─────────────────────────────────────────────────────────────────────────────
// Submission-center tools — give AnA reach over the canonical core + ingestion
// + deterministic eCTD primitives. The three compute tools are pure (no tenant
// data touched); the two ingestion tools persist and are tenant-scoped via the
// active context. Irreversible/outward actions (freeze, transmit) stay in the
// existing governed tools — these do not bypass that.
// ─────────────────────────────────────────────────────────────────────────────

export const COMPUTE_LIFECYCLE_OPERATIONS: AnaTool = {
  name: 'compute_lifecycle_operations',
  description:
    'Compute the eCTD lifecycle operator (new, replace, append, or delete) for each leaf of a new sequence by diffing it against the prior sequence. You get every leaf with its computed operation plus a summary count (new, replace, append, delete, unchanged), and every replace/append/delete carries an ICH modified-file pointer at the prior leaf it acts on, naming that leaf by its sequence\'s backbone and its leaf ID (e.g. ../0000/index.xml#leaf-3-2-S-1-general). Two ways to supply the prior state: (a) list prior_leaves by hand, each with the leaf_id and backbone its sequence recorded, plus prior_sequence_prefix — a prior leaf listed without them gets no pointer, because a leaf is never named by its file path; or (b) give application_number + prior_sequence_number and the prior sequence\'s stored leaf manifest is loaded automatically from your organization\'s compilation history (the prefix is derived for you). Nothing is written. Use it when planning a sequence so the user sees exactly which leaves change.',
  input_schema: {
    type: 'object',
    properties: {
      prior_leaves: {
        type: 'array',
        description: 'Leaves published in the prior sequence.',
        items: {
          type: 'object',
          properties: {
            leaf_key: { type: 'string', description: 'Stable leaf identity (eCTD leaf GUID); defaults to ctd_section/file_name.' },
            ctd_section: { type: 'string', description: 'CTD section code, e.g. "2.5".' },
            file_name: { type: 'string', description: 'Leaf file name.' },
            md5: { type: 'string', description: 'Published content checksum.' },
            title: { type: 'string', description: 'Leaf title.' },
            source_path: { type: 'string', description: 'Path of the prior file (used for delete leaves).' },
            href: { type: 'string', description: 'Published backbone-relative path of the prior leaf in its sequence (e.g. "m3/32-body-data/32s-drug-sub/general.pdf"). A record of what was filed; the modified-file pointer names leaf_id and backbone, not this path.' },
            leaf_id: { type: 'string', description: 'The ID the prior leaf carries in its sequence\'s backbone, as that sequence\'s leaf manifest recorded it (e.g. "leaf-3-2-S-1-general"). Required, with backbone, for a superseding op to carry a modified-file pointer.' },
            backbone: { type: 'string', description: 'The backbone that carries the prior leaf, from its sequence root: "index.xml" for Modules 2-5, or the regional backbone for Module 1 (e.g. "m1/us/us-regional.xml").' },
          },
          required: ['ctd_section', 'file_name', 'md5'],
        },
      },
      prior_sequence_prefix: {
        type: 'string',
        description: 'Relative traversal from the NEW sequence\'s backbone to the prior sequence root, e.g. "../0000/" when sequences are sibling folders under the application. Prepended to each prior leaf\'s backbone#leaf_id to form the cross-sequence modified-file value. Omit for an ungrouped/same-root lifecycle.',
      },
      application_number: {
        type: 'string',
        description: 'When set together with prior_sequence_number (and prior_leaves is NOT given), the prior sequence\'s published leaf manifest is loaded automatically from that application\'s compilation history — you do not need to list prior leaves by hand. Scoped to your organization.',
      },
      prior_sequence_number: {
        type: 'string',
        description: 'The prior eCTD sequence to diff against, e.g. "0000". With application_number set (and prior_leaves omitted), the engine loads that sequence\'s stored leaves and derives the "../<seq>/" modified-file prefix automatically.',
      },
      desired_leaves: {
        type: 'array',
        description: 'Leaves the new sequence intends to contain.',
        items: {
          type: 'object',
          properties: {
            leaf_key: { type: 'string', description: 'Stable leaf identity; defaults to ctd_section/file_name.' },
            ctd_section: { type: 'string', description: 'CTD section code.' },
            file_name: { type: 'string', description: 'Leaf file name.' },
            md5: { type: 'string', description: 'Content checksum of the desired file.' },
            title: { type: 'string', description: 'Leaf title.' },
            source_path: { type: 'string', description: 'Path of the desired file.' },
            append_on_change: { type: 'boolean', description: 'When content changed, emit append instead of replace.' },
          },
          required: ['ctd_section', 'file_name', 'md5'],
        },
      },
    },
    required: ['desired_leaves'],
  },
};

export const GENERATE_STF: AnaTool = {
  name: 'generate_stf',
  description:
    "Generate the ICH Study Tagging File (stf-<study-id>.xml) for each study from its tagged leaves. You pass each leaf with its study id, file tag, CTD section, package path, title, operation, its leaf ID in index.xml and the STF folder's relative path to index.xml; you get one STF per study (a doc-content per leaf pointing at index.xml#ID, holding the file-tag), a summary and warnings. A .xpt or define.xml tagged outside FDA validation 1735's list is refused. Pure computation — nothing is written to the package; the packager generates the STFs it ships itself.",
  input_schema: {
    type: 'object',
    properties: {
      leaves: {
        type: 'array',
        description: 'Study-report leaves to tag.',
        items: {
          type: 'object',
          properties: {
            study_id: { type: 'string', description: 'Controlling study identifier.' },
            file_tag: { type: 'string', description: "STF file-tag, e.g. 'study-report', 'protocol-or-amendment'." },
            ctd_section: { type: 'string', description: 'CTD section, e.g. "5.3.5.1".' },
            href: { type: 'string', description: 'Package-relative path of the leaf file (decides whether it is a dataset or define.xml).' },
            title: { type: 'string', description: 'Leaf title.' },
            operation: { type: 'string', enum: ['new', 'append', 'replace', 'delete'], description: 'Lifecycle operation.' },
            index_leaf_id: { type: 'string', description: "The leaf's ID attribute in index.xml." },
            index_rel_path: { type: 'string', description: "Relative path from the STF's folder to index.xml, e.g. '../../../index.xml'." },
          },
          required: ['study_id', 'file_tag', 'ctd_section', 'href', 'title', 'operation', 'index_leaf_id', 'index_rel_path'],
        },
      },
      study_meta: {
        type: 'array',
        description: 'Optional per-study title and category.',
        items: {
          type: 'object',
          properties: {
            study_id: { type: 'string' },
            study_title: { type: 'string' },
            study_category: { type: 'string' },
          },
          required: ['study_id'],
        },
      },
    },
    required: ['leaves'],
  },
};

export const CONVERT_TO_RPS_V4: AnaTool = {
  name: 'convert_to_rps_v4',
  description:
    'Convert a v3.2.2 leaf set into an ICH eCTD v4.0 (HL7 RPS) submission-unit message: one Document + Context-of-Use per leaf, with lifecycle operators mapped (new→create, replace→revise, append→append, delete→remove) and — when prior_sequence_number is given — a relatedContextOfUse pointer at each superseded CoU. You get the RPS message structure (documents + contexts of use) and, with include_xml, the RPS message XML. Pure computation — nothing is written. Use it to preview or produce the v4.0 form of a sequence for a region that has moved (or is piloting) eCTD v4.0.',
  input_schema: {
    type: 'object',
    properties: {
      leaves: {
        type: 'array',
        description: 'The v3.2.2 leaves of THIS sequence.',
        items: {
          type: 'object',
          properties: {
            ctd_section: { type: 'string', description: 'CTD section code, e.g. "3.2.S.1" or "1.2".' },
            file_name: { type: 'string', description: 'Leaf file name.' },
            title: { type: 'string', description: 'Leaf title (also the CoU title).' },
            md5: { type: 'string', description: 'Optional content checksum (informational here).' },
            operation: { type: 'string', enum: ['new', 'append', 'replace', 'delete'], description: 'v3.2.2 lifecycle operation; mapped to the RPS operation code.' },
          },
          required: ['ctd_section', 'file_name', 'title'],
        },
      },
      application: {
        type: 'object',
        description: 'The application the submission belongs to.',
        properties: {
          number: { type: 'string', description: 'Application number, e.g. "123456".' },
          type_code: { type: 'string', description: 'Application-type code (CL1), e.g. "us_application_type_1".' },
          center: { type: 'string', description: 'Review center: cder | cber | cdrh | …' },
        },
        required: ['number', 'type_code', 'center'],
      },
      submission: {
        type: 'object',
        description: 'The regulatory activity (submission) the unit belongs to.',
        properties: {
          type_code: { type: 'string', description: 'Submission-type code (CL12), e.g. "us_submission_type_1".' },
          number: { type: 'string', description: 'Optional submission id/number.' },
        },
        required: ['type_code'],
      },
      submission_unit: {
        type: 'object',
        description: 'This sequence, as an RPS submission unit.',
        properties: {
          id: { type: 'string', description: 'Stable UUID for the submission unit.' },
          unit_type_code: { type: 'string', description: 'Submission-unit-type code (CL13).' },
          title: { type: 'string', description: 'Title (≤128 chars).' },
          sequence_number: { type: 'string', description: 'Four-digit sequence, e.g. "0001".' },
        },
        required: ['id', 'unit_type_code', 'title', 'sequence_number'],
      },
      prior_sequence_number: {
        type: 'string',
        description: 'When this sequence carries lifecycle operations (revise/append/remove), the prior sequence they supersede — used to point each relatedContextOfUse at the earlier CoU.',
      },
      include_xml: {
        type: 'boolean',
        description: 'Also return the serialized RPS message XML (default false).',
      },
    },
    required: ['leaves', 'application', 'submission', 'submission_unit'],
  },
};

export const CHECK_ECTD_CROSS_REFERENCES: AnaTool = {
  name: 'check_ectd_cross_references',
  description:
    'Check that every intra-package cross-reference in an eCTD submission resolves to a leaf that is present and not deleted. You pass the package leaves and the references between them; you get the resolved references and any broken ones with the reason (target not found, or target deleted). Pure computation — read only. Use it before validation to catch dangling hyperlinks.',
  input_schema: {
    type: 'object',
    properties: {
      leaves: {
        type: 'array',
        description: 'All leaves in the package.',
        items: {
          type: 'object',
          properties: {
            leaf_key: { type: 'string' },
            ctd_section: { type: 'string' },
            file_name: { type: 'string' },
            title: { type: 'string' },
            operation: { type: 'string', enum: ['new', 'append', 'replace', 'delete'] },
          },
          required: ['ctd_section', 'file_name'],
        },
      },
      references: {
        type: 'array',
        description: 'Cross-references to validate.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Optional reference id.' },
            source: { type: 'string', description: 'The leaf making the reference (section code, leaf key, or file name).' },
            target: { type: 'string', description: 'The referenced leaf (section code, leaf key, file name, or href).' },
            label: { type: 'string', description: 'Optional display label.' },
          },
          required: ['source', 'target'],
        },
      },
    },
    required: ['leaves', 'references'],
  },
};

export const CLASSIFY_SUBMISSION_DOCUMENT: AnaTool = {
  name: 'classify_submission_document',
  description:
    'Classify a submission document to its CTD section through the ingestion pipeline. It PROPOSES and changes nothing: the document keeps its section and nothing is placed. With a sequence id the result also carries proposedLeaf, the leaf a person would place there; to place it, call place_into_sequence with that section, a separate step the person confirms with the section in view. The document, tenant, and acting user come from the active context. The AI call is audited. Use this when a user uploads a document and asks where it belongs.',
  input_schema: {
    type: 'object',
    properties: {
      document_id: { type: 'number', description: 'Id of the coauthor document to classify.' },
      sequence_id: { type: 'number', description: 'Optional target sequence; the result then carries the leaf to place there. Nothing is placed.' },
    },
    required: ['document_id'],
  },
};

export const EXTRACT_SUBMISSION_DOCUMENT: AnaTool = {
  name: 'extract_submission_document',
  description:
    "Extract a submission document's structure, claims, and referenced sources through the ingestion pipeline, and record a provenance link from the target section to the document. You pass the document id, the CTD section it maps to, and the submission id; tenant and acting user come from the active context. The result is returned and audited, and the provenance link is recorded; the document itself is not changed. Use this after classification to capture what a document supports.",
  input_schema: {
    type: 'object',
    properties: {
      document_id: { type: 'number', description: 'Id of the coauthor document to extract.' },
      section_code: { type: 'string', description: 'CTD section the document maps to, e.g. "2.7.3".' },
      submission_id: { type: 'number', description: 'Submission the provenance link belongs to.' },
    },
    required: ['document_id', 'section_code', 'submission_id'],
  },
};

export const RUN_SHADOW_REVIEW: AnaTool = {
  name: 'run_shadow_review',
  description:
    'Run a shadow review on an assembled sequence — a simulated reviewer pass that returns severity-scored Refuse-to-File and Complete-Response-risk findings, each with a regulatory basis and a fix, plus rtf/crl gate scores computed by the server from the severities of those findings (scoreBasis: severity_aggregate; the reviewer model reports no figure). You pass the sequence id and an optional reviewer lens; tenant and acting user come from the active context. The run and its findings are persisted and the AI call is audited. Use this before dispatch to surface what a reviewer would reject.',
  input_schema: {
    type: 'object',
    properties: {
      sequence_id: { type: 'number', description: 'Id of the assembled eCTD sequence to review.' },
      lens: {
        type: 'string',
        enum: ['fda_filing', 'ema_d120', 'pmda', 'nb_mdr', 'nb_ivdr'],
        description: "Reviewer lens; defaults to 'fda_filing'.",
      },
    },
    required: ['sequence_id'],
  },
};

export const VALIDATE_ECTD_PACKAGE: AnaTool = {
  name: 'validate_ectd_package',
  description:
    'Run the deterministic eCTD 4.0 validator over a set of leaves and return a pass/fail verdict, a 0-100 score, and severity-scored findings (required-section coverage, filename rules, MD5 format, lifecycle operations, ICH M8). Pure computation — read only, no transmission. Use it before packaging or transmitting so the user sees and fixes errors first.',
  input_schema: {
    type: 'object',
    properties: {
      submission_type: { type: 'string', description: "Submission type for required-section rules (default 'IND')." },
      leaves: {
        type: 'array',
        description: 'Leaves to validate.',
        items: {
          type: 'object',
          properties: {
            section_code: { type: 'string', description: 'eCTD section code, e.g. "m3.2.S.1".' },
            title: { type: 'string', description: 'Document title.' },
            checksum: { type: 'string', description: 'MD5 checksum.' },
            operation: { type: 'string', enum: ['new', 'append', 'replace', 'delete'], description: 'Lifecycle operation.' },
            file_path: { type: 'string', description: 'Relative file path within the package.' },
            mime_type: { type: 'string', description: "Defaults to 'application/pdf'." },
            file_size: { type: 'number', description: 'File size in bytes.' },
            lifecycle_operator: { type: 'string', description: 'Optional lifecycle operator id.' },
          },
          required: ['section_code', 'title', 'checksum', 'operation', 'file_path'],
        },
      },
    },
    required: ['leaves'],
  },
};

// ── Submission AI tasks (gateway-backed, audited) ────────────────────────────

export const PLAN_SUBMISSION: AnaTool = {
  name: 'plan_submission',
  description:
    'Generate a submission plan for a target product: the required module/section map, regional forms, a timeline keyed to health-authority clocks, a dependency graph, and an initial gap list. Tenant and acting user come from the active context. Grounds against ICH and region guidance and is audited. Use it when a user starts a new submission and asks what is required.',
  input_schema: {
    type: 'object',
    properties: {
      application_type: { type: 'string', description: 'e.g. ind, nda, bla, maa, 510k, de_novo, pma, cta.' },
      client_type: { type: 'string', enum: ['pharma', 'biotech', 'mdx', 'ivd'], description: 'Client type.' },
      regions: { type: 'array', items: { type: 'string', enum: ['fda', 'eu', 'jp'] }, description: 'Target regions.' },
      product_profile: { type: 'string', description: 'Optional product and indication description.' },
      submission_id: { type: 'number', description: 'Optional submission this plan is for (recorded on the audit entry).' },
    },
    required: ['application_type', 'client_type', 'regions'],
  },
};

export const EXPLAIN_VALIDATION_FINDINGS: AnaTool = {
  name: 'explain_validation_findings',
  description:
    'Translate deterministic eCTD/region validator findings into plain-language causes and concrete fixes, without changing any verdict. Tenant comes from the active context; the call is audited. Use it after validate_ectd_package so the user understands and can fix each finding.',
  input_schema: {
    type: 'object',
    properties: {
      region: { type: 'string', enum: ['fda', 'eu', 'jp'] },
      findings: {
        type: 'array',
        description: 'Deterministic validator findings to explain.',
        items: {
          type: 'object',
          properties: {
            rule_id: { type: 'string' },
            severity: { type: 'string', enum: ['error', 'warning', 'info'] },
            message: { type: 'string' },
            leaf: { type: 'string' },
          },
          required: ['severity', 'message'],
        },
      },
      submission_id: { type: 'number', description: 'Optional submission id for the audit entry.' },
    },
    required: ['region', 'findings'],
  },
};

export const CROSS_REGION_GAP_ANALYSIS: AnaTool = {
  name: 'cross_region_gap_analysis',
  description:
    'Given a submission prepared for a source region, compute what is additionally needed to file the same product in target regions: Module 1 deltas, bridging-study needs (ICH E5), translation scope, and format conversion. Tenant comes from the active context; the call is audited.',
  input_schema: {
    type: 'object',
    properties: {
      source_region: { type: 'string', enum: ['fda', 'eu', 'jp'] },
      target_regions: { type: 'array', items: { type: 'string', enum: ['fda', 'eu', 'jp'] } },
      application_type: { type: 'string', description: 'e.g. nda, maa, jnda.' },
      sections_present: { type: 'array', items: { type: 'string' }, description: 'Optional CTD section codes already prepared.' },
      submission_id: { type: 'number', description: 'Optional submission id for the audit entry.' },
    },
    required: ['source_region', 'target_regions', 'application_type'],
  },
};

export const DISPATCH_QC_CHECK: AnaTool = {
  name: 'dispatch_qc_check',
  description:
    'Run a final adversarial pre-transmit QC pass and decide whether dispatch may proceed. Hard rule: never cleared when there are open error-severity validation findings or unacknowledged Shadow Review criticals. This does NOT transmit — it gates. Tenant comes from the active context; the call is audited.',
  input_schema: {
    type: 'object',
    properties: {
      region: { type: 'string', enum: ['fda', 'eu', 'jp'] },
      validation_errors: { type: 'number', description: 'Count of open error-severity validation findings.' },
      unresolved_shadow_criticals: { type: 'number', description: 'Count of unacknowledged Shadow Review criticals.' },
      leaves: {
        type: 'array',
        items: { type: 'object', properties: { section_code: { type: 'string' }, operation: { type: 'string' } }, required: ['section_code', 'operation'] },
      },
      submission_id: { type: 'number', description: 'Optional submission id for the audit entry.' },
    },
    required: ['region', 'validation_errors', 'unresolved_shadow_criticals', 'leaves'],
  },
};

// ── Truth Engine (provenance + consistency) ──────────────────────────────────

export const TRACE_PROVENANCE: AnaTool = {
  name: 'trace_provenance',
  description:
    'Trace where a submission section derives from: returns the provenance links (source document, direction, confidence) recorded for that section, ordered by confidence. Deterministic read of the evidence graph — never invents sources. Tenant comes from the active context. Use it to answer "what does 2.7 draw on?".',
  input_schema: {
    type: 'object',
    properties: {
      submission_id: { type: 'number', description: 'The submission.' },
      target_section_code: { type: 'string', description: 'The section to trace, e.g. "2.7.3".' },
    },
    required: ['submission_id', 'target_section_code'],
  },
};

export const CHECK_CONSISTENCY: AnaTool = {
  name: 'check_consistency',
  description:
    'Compare the labelled figures in a claim (enrolled N, sample size, sites, events, alpha, power, hazard ratio, primary p-value) with the same figures in other parts of the dossier, by deterministic extraction, and record each as a consistency finding: match when they agree, conflict when they do not. A source sharing no labelled figure with the claim is returned as notCompared — not a finding of consistency. Prose claims are not compared. Tenant comes from the active context; the call is audited.',
  input_schema: {
    type: 'object',
    properties: {
      submission_id: { type: 'number', description: 'The submission.' },
      dimension: { type: 'string', description: 'What is being checked, recorded with each finding, e.g. "subject-counts".' },
      left: {
        type: 'object',
        description: 'The claim under review.',
        properties: { ref: { type: 'string' }, text: { type: 'string' } },
        required: ['ref', 'text'],
      },
      right: {
        type: 'array',
        description: 'The sources to check against.',
        items: { type: 'object', properties: { ref: { type: 'string' }, text: { type: 'string' } }, required: ['ref', 'text'] },
      },
    },
    required: ['submission_id', 'dimension', 'left', 'right'],
  },
};

export const ASSESS_PATHWAY_READINESS: AnaTool = {
  name: 'assess_pathway_readiness',
  description:
    "Assess whether a submission sequence is ready for a non-eCTD regulatory pathway (EU CTIS clinical trials, EU MDR/IVDR device tech doc, FDA eSTAR 510(k)/De Novo, or Japan PMDA Shōnin). Reads the sequence's leaves from the active tenant context and returns a required-slot gap report (ready + missingRequired). Deterministic, read-only — it maps and gap-checks, it never submits.",
  input_schema: {
    type: 'object',
    properties: {
      sequence_id: { type: 'number', description: 'The sequence whose leaves are assessed.' },
      pathway: {
        type: 'string',
        enum: ['ctis', 'mdr', 'ivdr', 'estar_510k', 'estar_de_novo', 'pmda_shonin'],
        description: 'The target pathway.',
      },
      member_states: {
        type: 'array',
        items: { type: 'string' },
        description: 'CTIS only — concerned EU member-state codes (e.g. ["DE","FR"]).',
      },
    },
    required: ['sequence_id', 'pathway'],
  },
};

export const BUILD_PATHWAY_MANIFEST: AnaTool = {
  name: 'build_pathway_manifest',
  description:
    "Build the assembled table-of-contents for a non-eCTD pathway (EU CTIS, EU MDR/IVDR, FDA eSTAR 510(k)/De Novo, Japan PMDA Shōnin). Reads the sequence's leaves from the active tenant context, projects them onto the pathway's section registry, and returns a uniform ordered manifest: each slot as an entry with a group label (annex / eSTAR / CTIS part+state / STED), a deterministic path, present/missing status, and the source leaves mapped into it. Deterministic, read-only — it maps and reports gaps, it never invents a missing slot and never submits. Use after assess_pathway_readiness when you need the full ordered structure, not just the gap list.",
  input_schema: {
    type: 'object',
    properties: {
      sequence_id: { type: 'number', description: 'The sequence whose leaves are assembled into the manifest.' },
      pathway: {
        type: 'string',
        enum: ['ctis', 'mdr', 'ivdr', 'estar_510k', 'estar_de_novo', 'pmda_shonin'],
        description: 'The target pathway.',
      },
      member_states: {
        type: 'array',
        items: { type: 'string' },
        description: 'CTIS only — concerned EU member-state codes (e.g. ["DE","FR"]).',
      },
    },
    required: ['sequence_id', 'pathway'],
  },
};

export const LIST_VALIDATION_RULES: AnaTool = {
  name: 'list_validation_rules',
  description:
    "List the named, sourced eCTD validation rule corpus the Submission Center checks against (ICH/FDA/EU/JP criteria). Returns each rule's id, title, category, regions, severity (high/medium/low), rationale, published source, and enforcement (whether the rule is floored by the deterministic dispatch gate, guaranteed by the packager, or requires the agency validator). Static reference data — read-only, not tenant-specific. Use it to explain WHY a validation finding blocks dispatch and to cite the rule behind a gate verdict (a finding's code equals the rule id).",
  input_schema: {
    type: 'object',
    properties: {
      region: {
        type: 'string',
        enum: ['fda', 'eu', 'jp'],
        description: 'Optional — scope to one region (includes shared ICH rules). Omit for the full corpus.',
      },
    },
    required: [],
  },
};

export const LOOKUP_REGULATORY_PATHWAY: AnaTool = {
  name: 'lookup_regulatory_pathway',
  description:
    "Look up expedited-development, accelerated-review and early-access pathways across the major global regulators (FDA, EMA, PMDA, MHRA, Health Canada, TGA, NMPA, ANVISA, Swissmedic). Returns the agency, program name, kind, eligibility, benefits and a statute/guidance citation. Static reference data — read-only, not tenant-specific. NOTE: designations and criteria change; confirm eligibility against the agency's current guidance before relying on a pathway. Pass `agency` to list a regulator's programs, `query` to search by goal (e.g. 'breakthrough', 'conditional approval', 'orphan', 'priority review'), or omit both for a summary across agencies.",
  input_schema: {
    type: 'object',
    properties: {
      agency: {
        type: 'string',
        enum: ['FDA', 'EMA', 'PMDA', 'MHRA', 'Health Canada', 'TGA', 'NMPA', 'ANVISA', 'Swissmedic'],
        description: 'Optional — scope to one regulator.',
      },
      query: { type: 'string', description: "Goal/keyword to search, e.g. 'breakthrough', 'orphan'." },
    },
    required: [],
  },
};

export const RESOLVE_REGULATORY_STRUCTURE: AnaTool = {
  name: 'resolve_regulatory_structure',
  description:
    "Resolve the DETERMINISTIC submission structure for a region + application type via the reasoning engine (not the LLM): the required CTD sections (regional Module 1 + ICH M4 common Modules 2–5) and the review-clock model. Use this to ground a submission plan's structure — it is rule-resolved and citable, never invented. Covers regions fda|eu|jp and application types ind|nda|bla|maa|cta|anda|510k|pma; unsupported combinations are reported as unsupported (no fabrication). Read-only, deterministic, not tenant-specific.",
  input_schema: {
    type: 'object',
    properties: {
      regions: {
        type: 'array',
        items: { type: 'string' },
        description: "Target regions, e.g. ['fda','eu']. Aliases like 'us'/'europe'/'japan' are accepted.",
      },
      application_type: {
        type: 'string',
        description: "Application type, e.g. 'ind', 'nda', 'maa', '510k'.",
      },
    },
    required: ['regions', 'application_type'],
  },
};

export const GET_MARKET_SUBMISSION_SPEC: AnaTool = {
  name: 'get_market_submission_spec',
  description:
    "Look up the per-market submission specification — the governance + FORMATTING datasheet for a market and submission format. Returns, in one place: accepted file formats / PDF versions / file-naming + size + path limits / checksum, the regional backbone, e-signature basis + sequencing + lifecycle governance, language/translation rules, required forms, template references, and source citations. Covers drug/biologic eCTD (FDA/EU/JP/Health Canada), FDA eSTAR (device 510(k)/De Novo), EU MDR & IVDR technical documentation (EUDAMED), and EU CTIS. Static reference data — read-only, not tenant-specific. Pass `spec_id` (e.g. 'us-ectd', 'eu-mdr') for one spec, or `market` (us|eu|jp|ca) / `family` (ectd|estar|eu_mdr|eu_ivdr|ctis) to filter; omit all for the full registry.",
  input_schema: {
    type: 'object',
    properties: {
      spec_id: { type: 'string', description: "A specific spec id, e.g. 'us-ectd', 'eu-mdr', 'eu-ctis'." },
      market: { type: 'string', description: 'Market code to filter by (us, eu, jp, ca, …).' },
      family: {
        type: 'string',
        enum: ['ectd', 'estar', 'eu_mdr', 'eu_ivdr', 'ctis'],
        description: 'Submission family to filter by.',
      },
    },
    required: [],
  },
};

/**
 * The get_document_template outlines that are read from a canonical record, and
 * that record. Every other outline in market-specs/document-template-library.ts is
 * a heading list kept by hand against its cited basis, and the description says
 * so. An outline joins this map only when the library derives its sections from
 * the record — __tests__/document-template-description.test.ts proves each entry
 * against the record and fails on an entry it cannot prove.
 */
export const TEMPLATE_OUTLINES_FROM_RECORD: Readonly<Record<string, string>> = {
  clinical_study_report: 'ICH E3',
  smpc: 'QRD SmPC',
  dsur: 'corrected ICH E2F',
};

/** These are canonical platform scaffolds, not a verified agency document structure. */
export const TEMPLATE_OUTLINES_FROM_BLUEPRINT: Readonly<Record<string, string>> = Object.fromEntries(
  DOCUMENT_TEMPLATES.flatMap((t) => t.outlineSource?.kind === 'project-blueprint'
    ? [[t.id, t.outlineSource.blueprintId]]
    : []),
);

/** What a hand-kept outline is, where that needs saying. Kept terse: see the order note below. */
const HAND_KEPT_OUTLINE_NOTES: Readonly<Record<string, string>> = {
  pbrer: 'interim E2C(R2)',
  cover_letter: 'platform headings',
};

const recordDerivedOutlines = DOCUMENT_TEMPLATES
  .filter((t) => t.id in TEMPLATE_OUTLINES_FROM_RECORD)
  .map((t) => `${t.id} (${TEMPLATE_OUTLINES_FROM_RECORD[t.id]})`)
  .join('; ');

const blueprintOutlines = Object.keys(TEMPLATE_OUTLINES_FROM_BLUEPRINT).join('; ');

const handKeptOutlines = DOCUMENT_TEMPLATES
  .filter((t) => !(t.id in TEMPLATE_OUTLINES_FROM_RECORD) && !(t.id in TEMPLATE_OUTLINES_FROM_BLUEPRINT))
  .map((t) => (HAND_KEPT_OUTLINE_NOTES[t.id] ? `${t.id} (${HAND_KEPT_OUTLINE_NOTES[t.id]})` : t.id))
  .join('; ');

/**
 * Order matters. OpenAI-compatible providers trim a tool description at 1024
 * characters (ai-gateway/gateway.ts, OPENAI_MAX_TOOL_DESCRIPTION_CHARS). The
 * purpose, the presentation rule, the input usage and the record-derived list come
 * first; the hand-kept list comes last, so a trim can only drop trailing hand-kept
 * ids — the description then understates where an outline came from, never
 * overstates it. The test pins both the order and the length.
 */
export const GET_DOCUMENT_TEMPLATE: AnaTool = {
  name: 'get_document_template',
  description:
    'Paged authoring outlines; not drafted prose, verified evidence or readiness. ' +
    'Use `template_id` or an exact active `registry_id` (never guess); `family`/`coverage` list components/biotech gaps. ' +
    '`offset`/`limit` page results. `market`+`prepare` adds a regional route and at most 3 focused questions. ' +
    '`discussed_topics` only prevents re-asking. ' +
    "Cite basis/limits: hand-kept outlines and blueprint required flags are platform guidance, not the agency's text. " +
    `Record-derived: ${recordDerivedOutlines}. ` +
    `Blueprint scaffolds: ${blueprintOutlines}. ` +
    `Kept by hand: ${handKeptOutlines}.`,
  input_schema: {
    type: 'object',
    properties: {
      template_id: { type: 'string', description: "A specific template id, e.g. 'clinical_overview', 'k510_summary', 'smpc', 'gspr_checklist'." },
      registry_id: { type: 'string', description: 'Exact active global registry ID, such as US_IND, EU_MAA, CA_NDS or JP_MKT_APPROVAL. With template_id: sets filing context for preparation. Alone: reads the existing filing scaffold, with explicit unavailability when it is absent or needs review. Never guess an ID.' },
      market: { type: 'string', enum: ['US', 'EU', 'CA', 'JP'], description: 'Confirmed target jurisdiction for preparation; do not infer from the conversation language.' },
      prepare: { type: 'boolean', description: 'Include a regional route and up to 3 prioritized client questions. This creates an inquiry brief, not a readiness or evidence-sufficiency verdict.' },
      discussed_topics: {
        type: 'array',
        description: 'Topics already discussed in this conversation, to avoid asking them again. These are conversational markers only; they never establish that source data are supplied, verified or sufficient.',
        items: { type: 'string', enum: ['scope', 'source_versions', 'data_cutoff', 'statistical_results', 'estimands', 'safety', 'quality', 'local_requirements', 'japan_evidence', 'agency_commitments', 'review_owners'] },
      },
      coverage: { type: 'boolean', description: 'Without template_id or registry_id: list existing biotech registry outline coverage, including missing or withheld outlines. Scaffold availability is not qualified builder or filing capability.' },
      offset: { type: 'integer', minimum: 0, default: 0, description: 'Zero-based catalog/section offset. Continue with nextOffset when one is returned.' },
      limit: { type: 'integer', minimum: 1, maximum: 30, default: 12, description: 'Maximum catalog entries or template sections to return in this page.' },
      family: {
        type: 'string',
        enum: ['ectd', 'estar', 'eu_mdr', 'eu_ivdr', 'ctis'],
        description: 'Submission family to list templates for.',
      },
    },
    required: [],
  },
};

export const VALIDATE_MARKET_FORMATTING: AnaTool = {
  name: 'validate_market_formatting',
  description:
    "Check a market's FORMATTING rules (file-naming pattern, name/path length caps, accepted file types, per-file and total size limits, encryption ban) against a list of file descriptors, given a market spec id (e.g. 'us-ectd', 'eu-ectd'). It does NOT read file bytes: sizes and encryption you supply are treated as claims — a declared violation is reported, but a declared clean value never counts as checked, so those rules come back in notAssessed. The result carries verdict (conformant | conformant_with_warnings | nonconformant | not_assessed); when it is not_assessed, say which rules were not checked and do not call the files conformant. Read-only; it does not transmit.",
  input_schema: {
    type: 'object',
    properties: {
      spec_id: { type: 'string', description: "The market spec id, e.g. 'us-ectd', 'eu-ectd', 'jp-ectd'." },
      leaves: {
        type: 'array',
        description: 'The files to check.',
        items: {
          type: 'object',
          properties: {
            file_name: { type: 'string', description: 'Base file name, e.g. "overview.pdf".' },
            file_path: { type: 'string', description: 'Full relative path within the package.' },
            file_size_bytes: { type: 'number', description: 'File size in bytes.' },
            file_format: { type: 'string', description: 'Format hint, e.g. "PDF".' },
            encrypted: { type: 'boolean', description: 'Whether the file is encrypted / permission-restricted.' },
          },
          required: ['file_name'],
        },
      },
    },
    required: ['spec_id', 'leaves'],
  },
};

export const GET_SUBMISSION_REQUIREMENTS: AnaTool = {
  name: 'get_submission_requirements',
  description:
    "Get the required content for a submission TYPE (ind, nda, bla, anda, 510k, de_novo, pma, maa, cta, jnda, mdr_td, ivdr_td): the required CTD modules, document templates, and forms, with the regulatory basis. Optionally ASSESS a candidate set — pass `present_template_ids`, `present_document_names`, and/or `present_forms` and it returns which required documents/forms are present vs missing (optional documents never block). Read-only, static reference data. Use it to plan a submission or to gap-check what's assembled. Omit `submission_type` to list all types.",
  input_schema: {
    type: 'object',
    properties: {
      submission_type: { type: 'string', description: "e.g. 'nda', '510k', 'maa', 'cta', 'mdr_td'." },
      present_template_ids: { type: 'array', items: { type: 'string' }, description: 'Document-template ids already present (for assessment).' },
      present_document_names: { type: 'array', items: { type: 'string' }, description: 'Document names already present (for assessment).' },
      present_forms: { type: 'array', items: { type: 'string' }, description: 'Forms already present (for assessment).' },
    },
    required: [],
  },
};

export const ASSESS_PATHWAY_ELIGIBILITY: AnaTool = {
  name: 'assess_pathway_eligibility',
  description:
    "Check eligibility for an expedited/special regulatory designation (fda_breakthrough, fda_fast_track, fda_accelerated_approval, fda_priority_review, fda_orphan, eu_prime, eu_orphan, eu_conditional_ma, pmda_sakigake, pmda_orphan). Without `answers` it returns the designation's criteria. With `answers` (a map of criterion id → true/false) it returns eligibility — eligible only when EVERY criterion is met, undetermined while any is unanswered. This is a structured check against the published program definition, NOT the agency's designation decision. Omit `designation` to list all; pass `market` to scope.",
  input_schema: {
    type: 'object',
    properties: {
      designation: { type: 'string', description: "e.g. 'fda_breakthrough', 'eu_prime', 'pmda_sakigake'." },
      market: { type: 'string', description: 'Filter the list by market (us, eu, jp).' },
      answers: { type: 'object', description: 'Map of criterion id → boolean, to assess eligibility.' },
    },
    required: [],
  },
};

export const CLASSIFY_POST_SUBMISSION_CHANGE: AnaTool = {
  name: 'classify_post_submission_change',
  description:
    "Classify a post-approval change into its lifecycle category — FDA supplements (Prior Approval Supplement, CBE-30, CBE-0, Annual Report) or EU variations (Type IA, IAIN, IB, II, Line Extension) — and the canonical sequence type it maps to. Without `flags` it returns the catalog for the market. With `flags` (scope_extension, major_impact, moderate_impact, immediate_safety_change, minimal_impact, eu_immediate_notification) it recommends a category by deterministic precedence. This is a structured decision aid from your flags, NOT the agency's classification decision — confirm against the variation/classification guideline. `market` is 'us' or 'eu'.",
  input_schema: {
    type: 'object',
    properties: {
      market: { type: 'string', enum: ['us', 'eu'], description: "The market: 'us' (FDA supplements) or 'eu' (variations)." },
      flags: {
        type: 'object',
        description: 'Structured change characteristics. Omit to list the category catalog.',
        properties: {
          scope_extension: { type: 'boolean', description: 'New indication/strength/form/route.' },
          major_impact: { type: 'boolean', description: 'Substantial potential impact on safety/efficacy/quality.' },
          moderate_impact: { type: 'boolean', description: 'Moderate potential impact.' },
          immediate_safety_change: { type: 'boolean', description: 'Safety-related change to take effect immediately (US CBE-0).' },
          minimal_impact: { type: 'boolean', description: 'Minimal/no impact (administrative / within validated ranges).' },
          eu_immediate_notification: { type: 'boolean', description: 'EU: requires immediate notification (Type IAIN).' },
        },
      },
    },
    required: ['market'],
  },
};

/**
 * The jurisdictions `assess_device_evidence_structure` accepts for an RMF. Keyed by
 * `RmfJurisdiction` so a jurisdiction added to or removed from
 * risk-management-structure.ts fails the typecheck here; the advertised enum and
 * the handler's check (AnaToolExecutor.ts) both read this list.
 */
const RMF_JURISDICTION_KEYS: Record<RmfJurisdiction, true> = { EU_MDR: true, EU_IVDR: true, FDA: true, OTHER: true };
export const RMF_JURISDICTIONS = Object.keys(RMF_JURISDICTION_KEYS) as RmfJurisdiction[];

export const ASSESS_DEVICE_EVIDENCE_STRUCTURE: AnaTool = {
  name: 'assess_device_evidence_structure',
  description:
    "Assess a device/IVD evidence document against its regulated structure. For `document: 'cer'` it checks the CER against MEDDEV 2.7/1 Rev 4 / MDR Annex XIV (set `equivalence_claimed` if equivalence is used); for `document: 'per'` it checks the IVDR Annex XIII Performance Evaluation Report and reports which of the three pillars (scientific validity, analytical, clinical) are covered; for `document: 'rmf'` it checks the ISO 14971 risk management file, and with `jurisdiction` (EU_MDR, EU_IVDR, FDA, OTHER) it also returns that jurisdiction's risk-acceptability policy (`acceptabilityPolicy`: principle, statement, whether cost may justify stopping risk reduction, and its basis with confidence), e.g. AFAP with no economic justification for an EU MDR/IVDR file. Without `jurisdiction` no policy is returned; ask which market the file is for. Pass `present_section_ids` (the sections you have). Without `present_section_ids` it returns the full structure (stages/pillars/sections + reviewer questions). Deterministic, read-only. Use it to gap-check a CER/PER/RMF before Notified-Body review.",
  input_schema: {
    type: 'object',
    properties: {
      document: { type: 'string', enum: ['cer', 'per', 'rmf'], description: "'cer' (MDR clinical evaluation), 'per' (IVDR performance evaluation), or 'rmf' (ISO 14971 risk management file)." },
      present_section_ids: { type: 'array', items: { type: 'string' }, description: 'Section ids present in the document (for assessment).' },
      equivalence_claimed: { type: 'boolean', description: 'CER only — set true if equivalence to another device is claimed.' },
      jurisdiction: { type: 'string', enum: RMF_JURISDICTIONS, description: "RMF only — the market the risk management file is for: 'EU_MDR', 'EU_IVDR', 'FDA', or 'OTHER' (not modelled). Returns the risk-acceptability policy beside the structure or assessment." },
    },
    required: ['document'],
  },
};

export const CLASSIFY_DEVICE: AnaTool = {
  name: 'classify_device',
  // The engine fails closed (2026-10-05): a class a missing fact decides comes back
  // null with missingFacts, and bad facts are refused. The fact vocabulary is the
  // engine's own key list, so the two cannot drift.
  description:
    "Determine an EU MDR or IVDR risk class, or an FDA pathway, from structured facts. `framework: 'mdr'` applies Regulation (EU) 2017/745 Annex VIII Rules 1–22 → Class I/IIa/IIb/III with the rule(s) that gave it. `framework: 'ivdr'` applies Regulation (EU) 2017/746 Annex VIII Rules 1–7 → Class A/B/C/D. `framework: 'fda'` recommends a pathway (exempt/510k/de_novo/pma). Unknown fact keys, unreadable values and facts that contradict each other are refused with an error naming them. When a fact that decides the class was not supplied, class is null and missingFacts names it: say the class is not determined, ask the user for those facts, and never state a class. The rule wording is a recall paraphrase; each result carries a caveat to confirm against the Annex text or the FDA classification database. Deterministic.",
  input_schema: {
    type: 'object',
    properties: {
      framework: { type: 'string', enum: ['mdr', 'ivdr', 'fda'], description: 'The classification framework.' },
      facts: {
        type: 'object',
        description: `Structured device facts; a bare key is true/false, otherwise its values are shown. MDR: ${MDR_FACT_VOCABULARY}. IVDR: ${IVDR_FACT_VOCABULARY}. FDA: fdaClass (I|II|III), predicateAvailable, exempt, novelLowModerateRisk.`,
      },
    },
    required: ['framework', 'facts'],
  },
};

export const GET_DEVICE_REVIEWER_CHECKLIST: AnaTool = {
  name: 'get_device_reviewer_checklist',
  description:
    "Get the shadow-reviewer checklist for a device submission — the section-anchored questions an FDA or Notified-Body reviewer asks of a 510k, de_novo, pma, cer, or per, each with severity and the regulatory basis. This is the reverse-workflow oversight: what a reviewer will ask of YOUR submission, always-on and independent of risk flags. Use it to pre-empt deficiencies and to ask the client the right questions. Deterministic, read-only.",
  input_schema: {
    type: 'object',
    properties: {
      submission_type: { type: 'string', enum: ['510k', 'de_novo', 'pma', 'cer', 'per'], description: 'The device submission type.' },
    },
    required: ['submission_type'],
  },
};

export const GET_BIOCOMPATIBILITY_ENDPOINTS: AnaTool = {
  name: 'get_biocompatibility_endpoints',
  description:
    "Return the ISO 10993-1 biological-evaluation endpoints a reviewer expects addressed for a device's contact category. Pass `nature` (skin, mucosal_membrane, breached_surface, blood_path_indirect, tissue_bone_dentin, circulating_blood, implant_tissue_bone, implant_blood) and `duration` (limited ≤24h, prolonged >24h–30d, long_term >30d). Returns the endpoint set (cytotoxicity, sensitization, irritation, pyrogenicity, haemocompatibility, implantation, systemic toxicity, genotoxicity, chronic toxicity, carcinogenicity as applicable). Deterministic; the Biological Evaluation Plan determines the actual tests vs. justifications.",
  input_schema: {
    type: 'object',
    properties: {
      nature: { type: 'string', enum: ['skin', 'mucosal_membrane', 'breached_surface', 'blood_path_indirect', 'tissue_bone_dentin', 'circulating_blood', 'implant_tissue_bone', 'implant_blood'], description: 'Nature of body contact.' },
      duration: { type: 'string', enum: ['limited', 'prolonged', 'long_term'], description: 'Duration of contact.' },
    },
    required: ['nature', 'duration'],
  },
};

export const BUILD_DEVICE_BLUEPRINT: AnaTool = {
  name: 'build_device_blueprint',
  description:
    "Build the COMPLETE reverse-workflow blueprint for a device/IVD submission: from the submission type + structured device facts it returns the risk classification, the required documents/forms, the APPLICABLE evidence modules (risk management always; clinical evaluation for mdr_td; performance evaluation for ivdr_td; biocompatibility when body-contacting → ISO 10993 endpoints; software when present → IEC 62304 class + deliverables) each with its gap assessment, and the matching FDA/NB reviewer checklist. This is the one-call planning + oversight view working backward from a submitted application. Deterministic, read-only. `submission_type` ∈ 510k|de_novo|pma|mdr_td|ivdr_td.",
  input_schema: {
    type: 'object',
    properties: {
      submission_type: { type: 'string', enum: ['510k', 'de_novo', 'pma', 'mdr_td', 'ivdr_td'], description: 'The device submission type.' },
      classification: { type: 'object', description: 'Optional { framework: mdr|ivdr|fda, facts: {...} } to classify the device.' },
      contact: { type: 'object', description: 'Optional { nature, duration } — when present, biocompatibility applies.' },
      software: { type: 'object', description: 'Optional { applicable, canContributeToDeathOrSeriousInjury?, canContributeToNonSeriousInjury?, presentDeliverableIds? }.' },
      present: { type: 'object', description: 'Optional { cerSectionIds?, perSectionIds?, rmfSectionIds? } already authored, for gap assessment.' },
      equivalence_claimed: { type: 'boolean', description: 'CER equivalence claim (mdr_td).' },
    },
    required: ['submission_type'],
  },
};

export const ASSESS_STORED_CER: AnaTool = {
  name: 'assess_stored_cer',
  description:
    "Gap-check a STORED Clinical Evaluation Report (an existing cer_reports record + its cer_sections) against the canonical MEDDEV 2.7/1 / MDR Annex XIV structure. Reads the tenant's actual saved CER, maps its populated fields/sections onto the canonical sections, and reports readiness, the missing required sections, and which sections still need clinical-data substantiation. Tenant-scoped (the report must belong to the caller's organization). Pass `report_id` (the cer_reports.report_id) and optionally `equivalence_claimed`. Use this to oversee a real CER in progress, not a hand-supplied section list.",
  input_schema: {
    type: 'object',
    properties: {
      report_id: { type: 'string', description: 'The cer_reports.report_id of the stored CER.' },
      equivalence_claimed: { type: 'boolean', description: 'Set true if equivalence to another device is claimed.' },
    },
    required: ['report_id'],
  },
};

export const BUILD_GLOBAL_DEVICE_STRATEGY: AnaTool = {
  name: 'build_global_device_strategy',
  description:
    "Map how a single device/IVD's evidence carries across the major regions (FDA, EU MDR, EU IVDR, Japan PMDA): which evidence is SHARED via internationally-recognised standards (ISO 14971/10993/13485, IEC 60601/62304/62366 — build once) vs. REGION-SPECIFIC (the clinical/performance argument, labelling, UDI, forms — produce per region), with each region's pathway + registration. `kind` ∈ device|ivd (eu_mdr applies to devices, eu_ivdr to IVDs); optional `regions` to filter. A planning map, not a strategy decision — and a 510(k) SE story does NOT satisfy an MDR CER/IVDR PER. Deterministic.",
  input_schema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['device', 'ivd'], description: 'Device or IVD.' },
      regions: { type: 'array', items: { type: 'string', enum: ['fda', 'eu_mdr', 'eu_ivdr', 'pmda'] }, description: 'Optional region filter.' },
    },
    required: ['kind'],
  },
};

export const GET_REGULATORY_TIMELINE: AnaTool = {
  name: 'get_regulatory_timeline',
  description:
    "Get the published review-clock goals + milestones for a submission pathway (510k, de_novo, pma, mdr_ce, ivdr_ce, eu_cta, pmda_device, fda_nda, eu_maa): the ordered milestones (day offsets from submission), the target decision horizon, and whether the clock stops for applicant responses. Honest: EU MDR/IVDR Notified-Body assessment has NO statutory clock (returned as null, not an invented number). These are TARGET/GOAL timelines subject to clock stops and program changes — planning anchors, not commitments. Deterministic.",
  input_schema: {
    type: 'object',
    properties: {
      pathway: { type: 'string', enum: ['510k', 'de_novo', 'pma', 'mdr_ce', 'ivdr_ce', 'eu_cta', 'pmda_device', 'fda_nda', 'eu_maa'], description: 'The submission pathway.' },
    },
    required: ['pathway'],
  },
};

export const VALIDATE_UDI: AnaTool = {
  name: 'validate_udi',
  description:
    "Validate a device UDI carrier. For a GS1 carrier (the parenthesised AI form, e.g. '(01)00012345678905(17)241231(10)LOT1(21)SER1') it computes the GS1 mod-10 check digit, validates the GTIN-14 UDI-DI, and parses the UDI-PI (11 manufacture date / 17 expiry / 10 lot / 21 serial), then notes the GUDID (FDA) and EUDAMED (EU) registration. HIBCC/ICCBBA carriers are detected but not parsed. Returns udiDiOk + warnings. Exact algorithm, deterministic.",
  input_schema: {
    type: 'object',
    properties: { udi: { type: 'string', description: 'The UDI carrier string (GS1 parenthesised AI form supported).' } },
    required: ['udi'],
  },
};

export const GET_ELECTRICAL_STANDARDS: AnaTool = {
  name: 'get_electrical_standards',
  description:
    "Resolve the applicable IEC 60601 electrical-safety standards for a device from its facts (electricallyPowered, hasAlarms, closedLoopControl, homeUse, emsUse, hasParticularStandard). Returns the general standard + always-on collaterals (EMC, usability) plus the conditional collaterals triggered (alarms 60601-1-8, closed-loop 60601-1-10, home use 60601-1-11, EMS 60601-1-12), the core test categories (means of protection, leakage currents, dielectric, EMC…), and the reviewer questions. Not applicable when the device is not electrically powered. Deterministic.",
  input_schema: {
    type: 'object',
    properties: {
      electricallyPowered: { type: 'boolean', description: 'Mains/battery powered medical electrical equipment.' },
      hasAlarms: { type: 'boolean', description: 'Generates clinical alarms (→ 60601-1-8).' },
      closedLoopControl: { type: 'boolean', description: 'Has a physiologic closed-loop controller (→ 60601-1-10).' },
      homeUse: { type: 'boolean', description: 'Intended for home/lay use (→ 60601-1-11).' },
      emsUse: { type: 'boolean', description: 'Intended for the EMS environment (→ 60601-1-12).' },
      hasParticularStandard: { type: 'boolean', description: 'A device-type particular standard (60601-2-xx) applies.' },
    },
    required: ['electricallyPowered'],
  },
};

export const GET_STERILIZATION_REQUIREMENTS: AnaTool = {
  name: 'get_sterilization_requirements',
  description:
    "Resolve sterilization requirements for a device from its facts. Pass `sterile` (true/false) and optionally `method` (eo, radiation, steam, dry_heat, vh2o2, aseptic). Returns the governing ISO standard (11135 EO / 11137 radiation / 17665 steam / …), the Sterility Assurance Level (SAL 10⁻⁶ for terminal; aseptic makes no SAL claim), the validation elements (bioburden, dose-setting/half-cycle, EO residuals), the packaging standard (ISO 11607), and the reviewer questions. Not applicable for a non-sterile device. Deterministic.",
  input_schema: {
    type: 'object',
    properties: {
      sterile: { type: 'boolean', description: 'Whether the device is supplied sterile.' },
      method: { type: 'string', enum: ['eo', 'radiation', 'steam', 'dry_heat', 'vh2o2', 'aseptic', 'unknown'], description: 'Sterilization method, if known.' },
    },
    required: ['sterile'],
  },
};

export const ASSESS_COMBINATION_PRODUCT: AnaTool = {
  name: 'assess_combination_product',
  description:
    "Assess a (possible) combination product under 21 CFR Part 3. Pass `components` (drug/biologic/device — ≥2 distinct types makes it a combination), optionally the `primary_mode_of_action` (the PMOA component) and `combination_type` (single_entity/co_packaged/cross_labeled). Returns whether it's a combination, the FDA lead center from the PMOA (drug→CDER, biologic→CBER, device→CDRH), the EU consideration (MDR Article 117 / medicines framework), and practical considerations (21 CFR Part 4 cGMP, RFD). When the PMOA isn't established it recommends a Request for Designation rather than guessing. Deterministic.",
  input_schema: {
    type: 'object',
    properties: {
      components: { type: 'array', items: { type: 'string', enum: ['drug', 'biologic', 'device'] }, description: 'The constituent component types.' },
      primary_mode_of_action: { type: 'string', enum: ['drug', 'biologic', 'device'], description: 'The component providing the primary mode of action, if established.' },
      combination_type: { type: 'string', enum: ['single_entity', 'co_packaged', 'cross_labeled'], description: 'How the constituents are combined.' },
    },
    required: ['components'],
  },
};

export const GET_DEVICE_LABELING: AnaTool = {
  name: 'get_device_labeling',
  description:
    "Resolve the labeling requirements for a device from its facts (sterile, singleUse, reusable, implantable, prescriptionOnly, forClinicalInvestigation, hasExpiry, containsMedicinalSubstance). Returns the applicable FDA label elements (21 CFR 801), EU MDR label elements (Annex I §23.2), IFU content sections (Annex I §23.4), the ISO 15223-1 symbols, and reviewer questions — e.g. a sterile device adds the sterilisation method + sterile symbol; a reusable device adds reprocessing instructions; an implant adds the implant-card note. Labeling is a frequent deficiency; this is the required element set, not approved label text. Deterministic.",
  input_schema: {
    type: 'object',
    properties: {
      sterile: { type: 'boolean' }, singleUse: { type: 'boolean' }, reusable: { type: 'boolean' },
      implantable: { type: 'boolean' }, prescriptionOnly: { type: 'boolean' },
      forClinicalInvestigation: { type: 'boolean' }, hasExpiry: { type: 'boolean' },
      containsMedicinalSubstance: { type: 'boolean' },
    },
    required: [],
  },
};

export const ASSESS_QMS: AnaTool = {
  name: 'assess_qms',
  description:
    "Inspect or gap-check a device quality management system against ISO 13485:2016 (with the FDA QSR→QMSR mapping). Without `present_clause_ids` it returns the major clause structure (design controls, purchasing, production, complaints/reporting, nonconforming product, CAPA…) with each clause's FDA mapping (21 CFR 820.x) and auditor questions, plus the QMSR transition note (effective 2026-02-02). With `present_clause_ids` it reports readiness + missing clauses. Static reference + pure assessment, deterministic — an audit-prep aid, not an audit verdict.",
  input_schema: {
    type: 'object',
    properties: {
      present_clause_ids: { type: 'array', items: { type: 'string' }, description: 'Clause ids the QMS has in place (for the readiness assessment).' },
    },
    required: [],
  },
};

export const LIST_REGULATORY_CAPABILITIES: AnaTool = {
  name: 'list_regulatory_capabilities',
  description:
    "List the Submission Center's deterministic regulatory capabilities — each with its category (reference/classification/evidence/oversight/planning/enforcement), description, primary HTTP route, and AnA tool. Use it to discover what regulatory tooling is available (market specs, document templates, requirements, eligibility, device classification, CER/PER/RMF structures, biocompatibility, electrical safety, sterilization, UDI, reviewer checklists, blueprint, global strategy, timelines, dispatch gate). Static reference data, deterministic.",
  input_schema: { type: 'object', properties: {}, required: [] },
};

export const PLACE_INTO_SEQUENCE: AnaTool = {
  name: 'place_into_sequence',
  description:
    "Place a document into an eCTD sequence of the canonical submission core — create or update a submission_leaves row (upsert semantics: pass leaf_id to update an existing leaf, omit it to create one). Tenant and acting user come from the active context; the write is audited (LEAF_CREATED / LEAF_UPDATED). The server REFUSES a frozen or dispatched sequence (its leaves are immutable) and a source document not owned by the caller's organization (coauthor_documents, unified_documents, ctd_onboarding_documents, rendered_leaf_files and c2c_document_sections are all tenancy-checked at placement) — surface that refusal verbatim, never claim a placement the server declined. document_table/document_id link the leaf to its source. document_table is a CLOSED set — the server REFUSES (400) any value outside it, so a guessed or misspelled table is never placed; pick the table the document actually lives in. coauthor_documents, unified_documents, ctd_onboarding_documents, rendered_leaf_files and c2c_document_sections are materialized into the package; vault_documents is a documented pointer the assembler cannot materialize: the dispatch-readiness gate reports it as an ERROR (EXTERNAL_DOCUMENT_NOT_MATERIALIZABLE) and transmit fails closed on it, so do not place one unless the user explicitly asks for that pointer. Use this when a user asks to file a drafted document into a sequence.",
  input_schema: {
    type: 'object',
    properties: {
      sequence_id: { type: 'number', description: 'The eCTD sequence to place into.' },
      section_code: { type: 'string', description: 'CTD section code for the leaf, e.g. "2.7.3" or "m1/us/1.2".' },
      title: { type: 'string', description: 'Leaf title (usually the document title).' },
      lifecycle_op: { type: 'string', enum: ['new', 'replace', 'append', 'delete'], description: "Lifecycle operation; defaults to 'new'." },
      document_table: {
        type: 'string',
        enum: [...PLACEABLE_DOCUMENT_TABLE_LIST],
        description:
          'Source document table the leaf points at. Must be one of the listed values — anything else is refused at placement.',
      },
      document_id: { type: 'number', description: 'Source document id in that table (integer).' },
      document_type: { type: 'string', description: 'Optional document type label.' },
      granularity: { type: 'string', description: "Optional granularity, e.g. 'document' or 'leaf'." },
      leaf_id: { type: 'number', description: 'Existing leaf id to update instead of creating.' },
      parent_leaf_id: { type: 'number', description: 'For replace/append/delete: the leaf in THIS sequence the operation supersedes.' },
    },
    required: ['sequence_id', 'section_code', 'title'],
  },
};

export const ASSESS_DISPATCH_READINESS: AnaTool = {
  name: 'assess_dispatch_readiness',
  description:
    "Determine whether an eCTD sequence is clear to dispatch, with every input computed SERVER-SIDE from the canonical core — never a client-supplied number. Returns the authoritative validationErrors (structural defects in the sequence's leaves), the count of open critical Shadow Review findings, and the hard dispatch-gate verdict (cleared + blockers). Deterministic, read-only — it proves readiness, it never transmits. Prefer this over dispatch_qc_check when you need the tamper-proof verdict rather than the AI advisory.",
  input_schema: {
    type: 'object',
    properties: {
      sequence_id: { type: 'number', description: 'The sequence to assess for dispatch readiness.' },
    },
    required: ['sequence_id'],
  },
};
