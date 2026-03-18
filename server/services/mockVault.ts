/**
 * Mock Vault Service – in-memory fallback when DB is unavailable.
 *
 * Returns structured placeholder documents with metadata only (no fake
 * regulatory text) so export/render flows can indicate that real content
 * has not yet been authored.
 *
 * IMPORTANT: This service is intended for development and offline fallback
 * only.  It MUST NOT be used in production to supply content that could be
 * mistaken for real regulatory submissions.
 */

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ── Helpers ────────────────────────────────────────────────────────────────────

function heading(level: number, text: string) {
  return {
    type: 'heading',
    attrs: { level },
    content: [{ type: 'text', text }],
  };
}

function paragraph(text: string) {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text }],
  };
}

// ── Placeholder content per document type ────────────────────────────────────

function placeholderContent(docType: string, title: string) {
  return {
    type: 'doc',
    content: [
      heading(1, title),
      paragraph(
        `[Content not available] This is a placeholder for a ${docType} document. ` +
        'Actual regulatory content has not been authored yet. ' +
        'Please create or import the document through the editor before exporting.'
      ),
    ],
  };
}

const placeholder510k = placeholderContent(
  '510(k)',
  '510(k) Premarket Notification – Content Pending'
);

const placeholderPma = placeholderContent(
  'PMA',
  'Premarket Approval Application – Content Pending'
);

const placeholderCer = placeholderContent(
  'CER',
  'Clinical Evaluation Report – Content Pending'
);

// ── Mock Vault Store ─────────────────────────────────────────────────────────

export type MockDocument = {
  id: string;
  documentType: string;
  title: string;
  content: any;
  createdAt: string;
  updatedAt: string;
  version: number;
};

const store = new Map<string, MockDocument>();

function initializeDefaults() {
  if (store.size > 0) return;

  const now = new Date().toISOString();
  const defaults: MockDocument[] = [
    {
      id: 'mock-510k-001',
      documentType: 'cerv2_510k',
      title: '510(k) Submission – Content Pending',
      content: placeholder510k,
      createdAt: now,
      updatedAt: now,
      version: 1,
    },
    {
      id: 'mock-pma-001',
      documentType: 'cerv2_pma',
      title: 'PMA Application – Content Pending',
      content: placeholderPma,
      createdAt: now,
      updatedAt: now,
      version: 1,
    },
    {
      id: 'mock-cer-001',
      documentType: 'cerv2_cer',
      title: 'Clinical Evaluation Report – Content Pending',
      content: placeholderCer,
      createdAt: now,
      updatedAt: now,
      version: 1,
    },
  ];

  for (const doc of defaults) {
    store.set(doc.id, doc);
  }
}

// ── Guard ──────────────────────────────────────────────────────────────────────

function assertNotProduction(method: string) {
  if (IS_PRODUCTION) {
    throw new Error(
      `mockVault.${method}() called in production. ` +
      'The mock vault service must not be used in production environments. ' +
      'Ensure real document storage is configured.'
    );
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export const mockVault = {
  /** Initialize default placeholder documents if not already loaded. */
  init() {
    assertNotProduction('init');
    initializeDefaults();
  },

  /** List all documents, optionally filtered by docType. */
  list(docType?: string): MockDocument[] {
    assertNotProduction('list');
    initializeDefaults();
    const all = Array.from(store.values());
    if (docType) return all.filter(d => d.documentType === docType);
    return all;
  },

  /** Get a single document by ID. */
  get(id: string): MockDocument | undefined {
    assertNotProduction('get');
    initializeDefaults();
    return store.get(id);
  },

  /** Get placeholder content for a specific doc type (first matching document). */
  getContentByType(docType: string): any | undefined {
    assertNotProduction('getContentByType');
    initializeDefaults();
    const doc = Array.from(store.values()).find(d => d.documentType === docType);
    return doc?.content;
  },

  /** Save / update a document (upsert). */
  save(id: string, data: Partial<MockDocument>): MockDocument {
    assertNotProduction('save');
    initializeDefaults();
    const existing = store.get(id);
    const now = new Date().toISOString();
    const doc: MockDocument = {
      id,
      documentType: data.documentType || existing?.documentType || 'cerv2_510k',
      title: data.title || existing?.title || 'Untitled Document',
      content: data.content ?? existing?.content ?? { type: 'doc', content: [] },
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      version: (existing?.version || 0) + 1,
    };
    store.set(id, doc);
    return doc;
  },

  /** Delete a document. */
  delete(id: string): boolean {
    assertNotProduction('delete');
    return store.delete(id);
  },

  /** Reset store to defaults (useful for tests). */
  reset() {
    assertNotProduction('reset');
    store.clear();
    initializeDefaults();
  },

  /** Get the placeholder editor JSON for a doc type (for export fallback). */
  getMockEditorJson(docType: string): any {
    assertNotProduction('getMockEditorJson');
    if (docType === 'cerv2_510k') return placeholder510k;
    if (docType === 'cerv2_pma') return placeholderPma;
    if (docType === 'cerv2_cer') return placeholderCer;
    return placeholderContent(docType, `${docType} – Content Pending`);
  },
};
