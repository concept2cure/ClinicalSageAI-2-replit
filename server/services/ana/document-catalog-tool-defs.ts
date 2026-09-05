/**
 * Project-folder document tool definitions — the discovery / whole-document
 * read / comprehension-record / semantic-search surface over vault.documents
 * and the chat-upload evidence spine. Pure `AnaTool` definition objects, split
 * from document-catalog-tools.ts the way document-intake-tool-defs.ts is
 * split from its handlers; the handlers live in document-catalog-tools.ts and
 * are registered via the inject-and-sibling pattern, so the
 * registry-consistency suite holds def ↔ handler parity automatically.
 */

import type { AnaTool } from '../ai-gateway/types';

// ─────────────────────────────────────────────────────────────────────────────

export const LIST_PROJECT_DOCUMENTS: AnaTool = {
  name: 'list_project_documents',
  description:
    'List every document in the project vault (the client\'s project folder) — the durable store uploads land in, ' +
    'across sessions. Returns, per document: its id, title, file name, WHERE it is filed (folder, CTD section, ' +
    'placement status), and its catalog state — "cataloged" (read in full and understood; kind + purpose shown), ' +
    '"extracted" (text ready, not yet studied), "extraction_failed" (with the recorded reason), or "uncataloged" ' +
    '(predates cataloging). Use this FIRST whenever the user mentions their files, a prior upload, or asks what ' +
    'exists — never assume a file is gone because it was uploaded in an earlier session. Also returns the ' +
    'organization\'s CHAT-UPLOADED files (the Data Room evidence spine) with each one\'s file_id, so a file ' +
    'attached in a past conversation can be reopened with inspect_uploaded_document / read_uploaded_document. ' +
    'Follow up with read_project_document to study a vault document and catalog_project_document to record what it is.',
  input_schema: {
    type: 'object',
    properties: {
      program_id: {
        type: 'string',
        description: 'Optional regulatory program UUID to scope to. Default: the active project\'s program, else every program in the organization.',
      },
      limit: { type: 'number', description: 'Maximum documents to return (default 100, max 200).' },
    },
    required: [],
  },
};

export const READ_PROJECT_DOCUMENT: AnaTool = {
  name: 'read_project_document',
  description:
    'Read the full extracted text of a vault document by document id (from list_project_documents), windowed with ' +
    'offset/max_chars. Scanned PDFs were OCRed at ingest — the text here IS the document\'s content, so read it, ' +
    'do not treat the file as an opaque image. Every window you read is recorded as a read receipt; the response ' +
    'reports your exact coverage so far and the character ranges still unread. To truly review a document, page ' +
    'through ALL of it (advance offset until coverage is complete) — catalog_project_document will refuse a ' +
    'partial read. If extraction failed, this tool says so with the recorded reason instead of returning empty ' +
    'text; report that honestly rather than guessing at the content.',
  input_schema: {
    type: 'object',
    properties: {
      document_id: { type: 'string', description: 'The vault document UUID from list_project_documents.' },
      max_chars: { type: 'number', description: 'Maximum characters to return in this window (default 30000, max 80000).' },
      offset: { type: 'number', description: 'Character offset to start from (default 0; advance it to page through the whole document).' },
    },
    required: ['document_id'],
  },
};

export const CATALOG_PROJECT_DOCUMENT: AnaTool = {
  name: 'catalog_project_document',
  description:
    'Record durable comprehension of a vault document you have just read IN FULL: what kind of document it is, what ' +
    'it is for, a faithful summary, and the key data inside it (study IDs, dates, doses, endpoints, sample sizes, ' +
    'batch numbers — whatever the document actually carries). This is what makes the file remembered: the record is ' +
    'embedded for semantic recall and surfaced at the start of future sessions alongside the document\'s filed ' +
    'location. The write is REFUSED unless your read receipts cover the entire extracted text — if refused, the ' +
    'response lists the exact unread ranges; go read them with read_project_document and try again. Never invent ' +
    'content to fill key_data: record only what the text states.',
  input_schema: {
    type: 'object',
    properties: {
      document_id: { type: 'string', description: 'The vault document UUID.' },
      document_kind: {
        type: 'string',
        description: 'What the document IS, specifically (e.g. "GLP 28-day rat toxicology study report", "Certificate of Analysis, batch 23-104", "Investigator CV").',
      },
      purpose: {
        type: 'string',
        description: 'One or two sentences: what this document is FOR in the program (what it evidences, which section it supports, why the client uploaded it).',
      },
      summary: {
        type: 'string',
        description: 'A faithful summary of the whole document — its structure, findings, and conclusions. Grounded in the text you read; no extrapolation.',
      },
      key_data: {
        type: 'object',
        description: 'Structured facts extracted from the text: identifiers, dates, quantities, endpoints, results. Keys of your choosing; values exactly as stated in the document.',
      },
    },
    required: ['document_id', 'document_kind', 'purpose', 'summary'],
  },
};

export const SEARCH_PROJECT_DOCUMENTS: AnaTool = {
  name: 'search_project_documents',
  description:
    'Semantic search over the CATALOGED project files — "which of the client\'s documents covers X?". Matches ' +
    'against the comprehension records written by catalog_project_document (kind, purpose, summary, key data ' +
    'after a full read), so every hit is a document that has actually been studied. The response also states how ' +
    'many documents are NOT yet searchable (uncataloged or failed extraction) — absence from these results never ' +
    'means the file does not exist; use list_project_documents for full discovery. If the semantic index is ' +
    'unavailable the tool says so instead of returning an empty result.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to look for — a topic, identifier, study, batch, section, or question.' },
      limit: { type: 'number', description: 'Maximum hits to return (default 8, max 25).' },
    },
    required: ['query'],
  },
};

export const DOCUMENT_CATALOG_TOOLS: AnaTool[] = [
  LIST_PROJECT_DOCUMENTS,
  READ_PROJECT_DOCUMENT,
  CATALOG_PROJECT_DOCUMENT,
  SEARCH_PROJECT_DOCUMENTS,
];

