/**
 * SAAS TITANIUM DATABASE (Multi-Tenant Edition)
 * Simulates Row-Level Security (RLS) & Latency
 */

class SaaSDatabase {
  constructor() {
    this._storageKey = 'clinicalSage_demo_db_v1';

    // 1. TENANTS (Subscribers)
    this.tenants = [
      { id: 'org_acme', name: 'Acme Pharma', plan: 'ENTERPRISE' },
      { id: 'org_biotech', name: 'BioTech Startups', plan: 'PRO' }
    ];

    // 2. USERS (RBAC)
    this.users = [
      { id: 'u1', name: 'Dr. Sarah J.', email: 'sarah@acme.com', tenantId: 'org_acme', role: 'ADMIN' },
      { id: 'u2', name: 'John Doe', email: 'john@biotech.com', tenantId: 'org_biotech', role: 'WRITER' }
    ];

    // 3. DATA (Partitioned by Tenant)
    this.documents = [
      // ACME DATA
      { 
        id: '101', tenantId: 'org_acme', 
        title: 'Protocol 101: Oncology Phase III', 
        stage: 'QC REVIEW', status: 'READY', version: '2.4',
        editor: 'Dr. Sarah J.', last_modified: new Date().toISOString()
      },
      {
        id: '102', tenantId: 'org_acme',
        title: 'Protocol 102: Immunotherapy Safety',
        stage: 'DRAFTING', status: 'DRAFT', version: '1.1',
        editor: 'Dr. Sarah J.', last_modified: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString()
      },
      // BIOTECH DATA (Isolated)
      { 
        id: '999', tenantId: 'org_biotech', 
        title: 'Confidential IP: Molecule X', 
        stage: 'DRAFTING', status: 'DRAFT', version: '0.1',
        editor: 'John Doe', last_modified: new Date().toISOString()
      }
    ];

    // 4. ARTIFACTS (Source datasets / tables)
    this.artifacts = [
      {
        id: 'tbl-14.2.1',
        tenantId: 'org_acme',
        type: 'SAS7BDAT',
        data_version: 'v2.0',
        label: 'Progression Free Survival Table (PFS) — primary endpoints'
      },
      {
        id: 'adam-adae',
        tenantId: 'org_acme',
        type: 'SAS7BDAT',
        data_version: 'v1.3',
        label: 'ADaM AE (ADAE) — adverse events'
      },
      {
        id: 'tbl-14.2.1',
        tenantId: 'org_biotech',
        type: 'CSV',
        data_version: 'v1.0',
        label: 'PFS Table (sandbox) — biotech tenant isolated copy'
      }
    ];

    // 5. SMART TAGS (Graph edges: document -> artifact/variable)
    // Note: tag count per document is used to drive impact report counts.
    this.smartTags = [
      // ACME references to tbl-14.2.1
      { docId: '101', tenantId: 'org_acme', id: 'tag-hr-pfs', sourceId: 'tbl-14.2.1', variable: 'HR_PFS', value: '0.48', status: 'verified', dataVersion: 'v2.0' },
      { docId: '101', tenantId: 'org_acme', id: 'tag-2', sourceId: 'tbl-14.2.1', variable: 'MEDIAN_PFS', value: '12.1', status: 'verified', dataVersion: 'v2.0' },
      { docId: '101', tenantId: 'org_acme', id: 'tag-3', sourceId: 'tbl-14.2.1', variable: 'PFS_EVENTS', value: '143', status: 'verified', dataVersion: 'v2.0' },
      { docId: '102', tenantId: 'org_acme', id: 'tag-hr-pfs', sourceId: 'tbl-14.2.1', variable: 'HR_PFS', value: '0.48', status: 'verified', dataVersion: 'v2.0' },

      // BIOTECH isolated reference (should not be returned for ACME)
      { docId: '999', tenantId: 'org_biotech', id: 'tag-999', sourceId: 'tbl-14.2.1', variable: 'HR_PFS', value: '0.91', status: 'verified', dataVersion: 'v1.0' }
    ];

    this.auditLog = [];

    // 5b. VAULT FILES (Uploaded / imported binaries + extracted previews)
    this.vaultFiles = [
      {
        id: 'vault-demo-1',
        tenantId: 'org_acme',
        name: 'Application Form.pdf',
        type: 'pdf',
        folder: 'Module 1',
        section: 'module1',
        path: '/Module 1/Application Form.pdf',
        sizeBytes: 2300000,
        uploadedAt: new Date().toISOString(),
        source: 'demo',
      },
      {
        id: 'vault-demo-2',
        tenantId: 'org_acme',
        name: 'Cover Letter.docx',
        type: 'docx',
        folder: 'Module 1',
        section: 'module1',
        path: '/Module 1/Cover Letter.docx',
        sizeBytes: 1500000,
        uploadedAt: new Date().toISOString(),
        source: 'demo',
        preview: {
          kind: 'text',
          value:
            'Cover Letter (Demo)\n\nThis is a demo VAULT file record. Use the Upload tab to add PDF/DOCX/XLSX.',
        },
      },
    ];

    // 5c. TEMPLATE LIBRARY (Smart Templates) — seeded per tenant
    this.smartTemplates = [];
    this._seededTenants = new Set();

    // 6. THREADS (Review threads / system comments)
    // Stored per-tenant implicitly via the document's tenantId.
    this.threads = [];

    // Load persisted state (best-effort) after defaults exist
    this._hydrateFromStorage();
  }

  async _delay() { return new Promise(r => setTimeout(r, 60)); }

  _isBrowser() {
    return (
      typeof window !== 'undefined' &&
      typeof window.localStorage !== 'undefined' &&
      typeof window.localStorage.getItem === 'function'
    );
  }

  _hydrateFromStorage() {
    if (!this._isBrowser()) return;
    try {
      const raw = window.localStorage.getItem(this._storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;

      if (Array.isArray(parsed.documents)) this.documents = parsed.documents;
      if (Array.isArray(parsed.artifacts)) this.artifacts = parsed.artifacts;
      if (Array.isArray(parsed.smartTags)) this.smartTags = parsed.smartTags;
      if (Array.isArray(parsed.threads)) this.threads = parsed.threads;
      if (Array.isArray(parsed.auditLog)) this.auditLog = parsed.auditLog;
      if (Array.isArray(parsed.vaultFiles)) this.vaultFiles = parsed.vaultFiles;
      if (Array.isArray(parsed.smartTemplates)) this.smartTemplates = parsed.smartTemplates;
      if (Array.isArray(parsed.seededTenants)) {
        this._seededTenants = new Set(parsed.seededTenants.map(String));
      }
    } catch {
      // ignore corrupted storage
    }
  }

  _persistToStorage() {
    if (!this._isBrowser()) return;
    try {
      const payload = {
        documents: this.documents,
        artifacts: this.artifacts,
        smartTags: this.smartTags,
        threads: this.threads,
        auditLog: this.auditLog,
        vaultFiles: this.vaultFiles,
        smartTemplates: this.smartTemplates,
        seededTenants: Array.from(this._seededTenants),
      };
      window.localStorage.setItem(this._storageKey, JSON.stringify(payload));
    } catch {
      // ignore quota / storage errors
    }
  }

  // --- AUTH SIMULATION ---
  async login(userId) {
    await this._delay();
    const user = this.users.find(u => u.id === userId);
    if (!user) throw new Error('User not found');
    const tenant = this.tenants.find(t => t.id === user.tenantId);
    return { user, tenant };
  }

  // --- TENANT-SCOPED QUERIES ---
  async getProjects(tenantId) {
    await this._delay();
    if (!tenantId) throw new Error('Unauthorized: No Tenant Context');

    // STRICT FILTERING (RLS Simulation)
    return this.documents
      .filter(d => d.tenantId === tenantId)
      .map(doc => {
        // Hydrate Health Score
        const tags = this.smartTags.filter(t => t.docId === doc.id);
        const errors = tags.filter(t => t.status === 'error').length;
        let health = 100;
        if (tags.length > 0) health = Math.round(((tags.length - errors) / tags.length) * 100);
        return { ...doc, health, tags: tags.length, errors };
      });
  }

  async seedDemoWorkspace(tenantId) {
    await this._delay();
    if (!tenantId) throw new Error('Unauthorized: No Tenant Context');

    if (this._seededTenants.has(String(tenantId))) {
      return { success: true, alreadySeeded: true };
    }

    // Seed a realistic set of IND/eCTD-stage documents so users can immediately "see projects/files"
    const now = Date.now();
    const base = [
      {
        id: `ind-${tenantId}-m1-1571`,
        title: 'IND Module 1.1 — Form FDA 1571',
        stage: 'DRAFTING',
        status: 'DRAFT',
        version: '0.1',
      },
      {
        id: `ind-${tenantId}-m1-cover`,
        title: 'IND Module 1.2 — Cover Letter',
        stage: 'QC REVIEW',
        status: 'READY',
        version: '1.0',
      },
      {
        id: `ind-${tenantId}-m2-5`,
        title: 'Module 2.5 — Clinical Overview (IND)',
        stage: 'DRAFTING',
        status: 'DRAFT',
        version: '0.3',
      },
      {
        id: `ind-${tenantId}-m2-7`,
        title: 'Module 2.7 — Clinical Summary (IND)',
        stage: 'DRAFTING',
        status: 'DRAFT',
        version: '0.2',
      },
      {
        id: `ind-${tenantId}-m3-qos`,
        title: 'Module 3.2.R — Quality Overall Summary (IND)',
        stage: 'QC REVIEW',
        status: 'DRAFT',
        version: '0.7',
      },
      {
        id: `ind-${tenantId}-m5-analyses`,
        title: 'Module 5 — Clinical Summaries & Analyses (placeholder)',
        stage: 'INTAKE',
        status: 'DRAFT',
        version: '0.1',
      },
    ];

    for (let i = 0; i < base.length; i++) {
      const doc = base[i];
      if (this.documents.some((d) => String(d.id) === String(doc.id))) continue;
      this.documents.push({
        id: doc.id,
        tenantId,
        title: doc.title,
        stage: doc.stage,
        status: doc.status,
        version: doc.version,
        editor: tenantId === 'org_biotech' ? 'John Doe' : 'Dr. Sarah J.',
        last_modified: new Date(now - i * 1000 * 60 * 22).toISOString(),
        content:
          'DRAFT (seeded demo)\n\nDrop SmartTags from the Data Room into this document to create traceable tokens.\n\nNext: Upload a DOCX/PDF/XLSX into VAULT and convert it to an editable draft.',
      });
    }

    // Seed a large Smart Template library (hundreds)
    this._seedSmartTemplatesForTenant(tenantId, 250);
    this._seededTenants.add(String(tenantId));
    this._persistToStorage();

    return { success: true, alreadySeeded: false };
  }

  _seedSmartTemplatesForTenant(tenantId, count = 250) {
    const existing = this.smartTemplates.filter((t) => t.tenantId === tenantId);
    if (existing.length >= count) return;

    const targets = [
      { module: '1.1', category: 'Administrative', base: 'Form FDA 1571' },
      { module: '1.2', category: 'Administrative', base: 'Cover Letter' },
      { module: '1.3.1', category: 'Administrative', base: 'Sponsor Contact Information' },
      { module: '2.2', category: 'Summaries', base: 'CTD Introduction' },
      { module: '2.5', category: 'Summaries', base: 'Clinical Overview' },
      { module: '2.7.3', category: 'Summaries', base: 'Clinical Summary — Efficacy' },
      { module: '3.2.S', category: 'Quality', base: 'Drug Substance' },
      { module: '3.2.P', category: 'Quality', base: 'Drug Product' },
      { module: '5.3.5', category: 'Clinical', base: 'CSR — Efficacy' },
    ];

    const startIdx = existing.length;
    for (let i = startIdx; i < count; i++) {
      const t = targets[i % targets.length];
      const id = `tmpl-${tenantId}-${String(i + 1).padStart(4, '0')}`;
      if (this.smartTemplates.some((x) => x.id === id)) continue;
      this.smartTemplates.push({
        id,
        tenantId,
        name: `Module ${t.module} — ${t.base} (Template ${i + 1})`,
        category: t.category,
        module: t.module,
        blocks: [t.module],
        regions: ['US FDA'],
        validated: true,
        updatedAt: new Date(Date.now() - (i % 30) * 86400000).toISOString(),
      });
    }
  }

  async getSmartTemplates(tenantId, { search = '', category = 'all' } = {}) {
    await this._delay();
    if (!tenantId) throw new Error('Unauthorized: No Tenant Context');

    const q = String(search || '').trim().toLowerCase();
    return this.smartTemplates
      .filter((t) => t.tenantId === tenantId)
      .filter((t) => {
        if (category && category !== 'all' && String(t.category).toLowerCase() !== String(category).toLowerCase()) {
          return false;
        }
        if (!q) return true;
        return (
          String(t.name).toLowerCase().includes(q) ||
          String(t.module).toLowerCase().includes(q) ||
          String(t.category).toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  async getVaultFiles(tenantId) {
    await this._delay();
    if (!tenantId) throw new Error('Unauthorized: No Tenant Context');
    return this.vaultFiles
      .filter((f) => f.tenantId === tenantId)
      .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
  }

  async addVaultFile(fileRecord, tenantId) {
    await this._delay();
    if (!tenantId) throw new Error('Unauthorized: No Tenant Context');
    if (!fileRecord || typeof fileRecord !== 'object') throw new Error('Invalid file');

    const id = fileRecord.id || `vault-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const record = {
      id,
      tenantId,
      name: fileRecord.name || 'Untitled',
      type: fileRecord.type || 'bin',
      folder: fileRecord.folder || 'Uploads',
      section: fileRecord.section || 'module1',
      path: fileRecord.path || `/Uploads/${fileRecord.name || id}`,
      sizeBytes: fileRecord.sizeBytes || 0,
      uploadedAt: fileRecord.uploadedAt || new Date().toISOString(),
      source: fileRecord.source || 'upload',
      preview: fileRecord.preview,
      linkedDocId: fileRecord.linkedDocId,
    };

    this.vaultFiles.unshift(record);
    this._persistToStorage();
    return { ...record };
  }

  async createDocumentFromUpload({ tenantId, title, content, html, sourceVaultFileId }) {
    await this._delay();
    if (!tenantId) throw new Error('Unauthorized: No Tenant Context');

    const id = `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const doc = {
      id,
      tenantId,
      title: title || 'Imported Document',
      stage: 'INTAKE',
      status: 'DRAFT',
      version: '0.1',
      editor: tenantId === 'org_biotech' ? 'John Doe' : 'Dr. Sarah J.',
      last_modified: new Date().toISOString(),
      content: typeof content === 'string' ? content : '',
      html: typeof html === 'string' ? html : undefined,
      sourceVaultFileId: sourceVaultFileId || null,
    };
    this.documents.unshift(doc);
    this._persistToStorage();
    return { ...doc };
  }

  async getDocument(docId, tenantId) {
    await this._delay();
    if (!docId) throw new Error('Missing docId');
    if (!tenantId) throw new Error('Unauthorized: No Tenant Context');

    const doc = this.documents.find((d) => String(d.id) === String(docId));
    if (!doc) throw new Error('Document not found');
    if (doc.tenantId !== tenantId) throw new Error('Unauthorized: cross-tenant access');
    return { ...doc };
  }

  async getArtifacts(tenantId) {
    await this._delay();
    if (!tenantId) throw new Error('Unauthorized: No Tenant Context');

    return this.artifacts.filter((a) => a.tenantId === tenantId);
  }

  async getImpactReport(artifactId) {
    await this._delay();
    if (!artifactId) throw new Error('Missing artifactId');

    // In this simulation, artifact IDs are unique per tenant in practice.
    // We select the artifact record and use its tenantId to enforce isolation.
    const artifact = this.artifacts.find((a) => a.id === artifactId && a.tenantId === 'org_acme')
      || this.artifacts.find((a) => a.id === artifactId);

    if (!artifact) throw new Error('Artifact not found');

    const tenantId = artifact.tenantId;
    const impactedTags = this.smartTags.filter(
      (t) => t.tenantId === tenantId && t.sourceId === artifactId
    );

    // Simulate a dataset version bump and a concrete diff (HR_PFS 0.48 -> 0.45)
    const previousVersion = artifact.data_version;
    artifact.data_version = 'v2.1';

    const changes = [];
    let focusAnchorId = null;
    for (const tag of impactedTags) {
      if (tag.variable === 'HR_PFS' && tag.value === '0.48') {
        changes.push({ variable: 'HR_PFS', from: '0.48', to: '0.45', anchorId: tag.id ?? null });
        if (!focusAnchorId && tag.id) focusAnchorId = tag.id;
        tag.value = '0.45';
        tag.dataVersion = artifact.data_version;
        tag.status = 'verified';
      }
    }

    const perDoc = new Map();
    for (const tag of impactedTags) {
      perDoc.set(tag.docId, (perDoc.get(tag.docId) || 0) + 1);
    }

    const affectedDocuments = Array.from(perDoc.entries())
      .map(([docId, count]) => {
        const doc = this.documents.find((d) => d.id === docId && d.tenantId === tenantId);
        return {
          docId,
          docTitle: doc?.title || `Document ${docId}`,
          count,
        };
      })
      .sort((a, b) => b.count - a.count);

    // Record audit log entry as a stand-in for "System Bot" broadcast
    this.auditLog.push({
      id: `audit-${Date.now()}`,
      tenantId,
      type: 'DATASET_INGESTED',
      artifactId,
      fromVersion: previousVersion,
      toVersion: artifact.data_version,
      changes,
      affectedDocuments,
      createdAt: new Date().toISOString(),
    });

    return {
      artifactId,
      totalImpacts: impactedTags.length,
      affectedDocuments,
      changes,
      focusAnchorId,
      fromVersion: previousVersion,
      toVersion: artifact.data_version,
    };
  }

  async injectSystemThread(docId, target, message) {
    await this._delay();
    // In a real DB, this inserts a row into 'threads' table

    const doc = this.documents.find((d) => String(d.id) === String(docId));
    if (!doc) throw new Error('Document not found');

    const derivedAnchorId = (() => {
      if (target && typeof target === 'object') {
        const explicit = target.anchorId ?? target.focusAnchorId;
        if (explicit) return String(explicit);
        if (target.artifactId && String(target.artifactId) === 'tbl-14.2.1') return 'tbl-14.2';
        if (target.artifactId) return String(target.artifactId);
        return null;
      }

      if (String(target) === 'tbl-14.2.1') return 'tbl-14.2';
      return String(target);
    })();

    const anchorId = derivedAnchorId || 'sec-2.1';

    const now = Date.now();
    const thread = {
      id: `sys-${now}`,
      tenantId: doc.tenantId,
      docId: String(docId),
      target,
      anchorId,
      status: 'CRITICAL',
      type: 'SYSTEM',
      comments: [
        {
          id: `c-${now}`,
          author: 'ClinicalSage System',
          role: 'BOT',
          text: message,
          timestamp: new Date().toISOString(),
          actionable: true,
        },
      ],
    };

    this.threads.push(thread);
    return thread;
  }

  async getThreads(docId, tenantId) {
    await this._delay();
    if (!docId) throw new Error('Missing docId');

    const doc = this.documents.find((d) => String(d.id) === String(docId));
    if (!doc) throw new Error('Document not found');

    if (tenantId && doc.tenantId !== tenantId) {
      throw new Error('Unauthorized: cross-tenant access');
    }

    return this.threads
      .filter((t) => String(t.docId) === String(docId) && t.tenantId === doc.tenantId)
      .sort((a, b) => (a.id < b.id ? 1 : -1));
  }
}

export const db = new SaaSDatabase();
