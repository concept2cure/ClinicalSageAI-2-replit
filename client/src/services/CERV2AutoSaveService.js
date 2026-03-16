/**
 * CERV2 Auto-Save Service — Phase 9 P0
 *
 * Persists all editor state to localStorage with document-keyed storage.
 * Auto-saves on every state change (debounced at 2s).
 * Supports multiple documents via composite key: `cerv2:${docType}:${projectId}`.
 *
 * Usage pattern:
 *   autoSaveService.init(docType, projectId);  // set current doc context
 *   autoSaveService.save(state);               // save using stored context
 *   autoSaveService.load();                    // load using stored context
 *   autoSaveService.pushVersion(state, label); // snapshot for version history
 *   autoSaveService.getVersions();             // list all versions
 *
 * Stored state:
 *  - deviceContext (device name, predicate, intended use, etc.)
 *  - userSectionContent (user-edited content per section)
 *  - aiSuggestions (AI-generated content per section)
 *  - dismissedSuggestions (Set → Array for JSON)
 *  - attachments metadata (base64 data stripped to save quota)
 *  - citations
 *  - reviewState
 *  - lastSavedAt timestamp
 */

const STORAGE_PREFIX = 'cerv2';
const AUTOSAVE_DEBOUNCE_MS = 2000;
const SERVER_SYNC_DEBOUNCE_MS = 15000; // Sync to server every 15s (less frequent than localStorage)
const MAX_VERSIONS = 50;

class CERV2AutoSaveService {
  constructor() {
    this._timers = {};
    this._serverTimers = {};
    this._docType = null;
    this._projectId = 'default';
    this._serverDocumentId = null; // Tracks the server-side document ID once created
    this._lastServerSync = null;
  }

  // ── Initialization ─────────────────────────────────────────────────────

  /**
   * Set the current document context. Must be called before other methods.
   */
  init(docType, projectId = 'default') {
    this._docType = docType;
    this._projectId = projectId;
  }

  // ── Key helpers ────────────────────────────────────────────────────────

  _key() {
    return `${STORAGE_PREFIX}:${this._docType}:${this._projectId}`;
  }

  _versionKey() {
    return `${STORAGE_PREFIX}:versions:${this._docType}:${this._projectId}`;
  }

  // ── Save ───────────────────────────────────────────────────────────────

  save(state) {
    if (!this._docType) {
      console.warn('[CERV2AutoSave] save() called before init()');
      return false;
    }
    try {
      const key = this._key();

      // Strip large base64 attachment data to avoid localStorage quota.
      // AttachmentManager creates: { name, size, type, data }
      // We keep name/size/type and drop data (base64 payload).
      let attachments = state.attachments;
      if (attachments) {
        const stripped = {};
        for (const [secId, files] of Object.entries(attachments)) {
          stripped[secId] = (files || []).map(f => ({
            name: f.name,
            size: f.size,
            type: f.type,
            // data (base64) omitted — re-upload after reload
          }));
        }
        attachments = stripped;
      }

      const payload = {
        ...state,
        attachments,
        // Convert Sets to arrays for JSON serialization
        dismissedSuggestions: state.dismissedSuggestions
          ? Array.from(state.dismissedSuggestions)
          : [],
        lastSavedAt: new Date().toISOString(),
        docType: this._docType,
        projectId: this._projectId,
      };
      localStorage.setItem(key, JSON.stringify(payload));
      return true;
    } catch (err) {
      console.error('[CERV2AutoSave] Save failed:', err);
      return false;
    }
  }

  /**
   * Debounced save — waits AUTOSAVE_DEBOUNCE_MS after last call.
   * Also triggers a server sync on a slower cadence.
   */
  saveDebounced(state) {
    const timerKey = this._key();
    if (this._timers[timerKey]) clearTimeout(this._timers[timerKey]);
    this._timers[timerKey] = setTimeout(() => {
      this.save(state);
    }, AUTOSAVE_DEBOUNCE_MS);

    // Server sync on a slower cadence to avoid hammering the API
    if (this._serverTimers[timerKey]) clearTimeout(this._serverTimers[timerKey]);
    this._serverTimers[timerKey] = setTimeout(() => {
      this._syncToServer(state);
    }, SERVER_SYNC_DEBOUNCE_MS);
  }

  /**
   * Sync current state to the server for persistent storage.
   * Non-blocking — failures are logged but don't interrupt the user.
   */
  async _syncToServer(state) {
    if (!this._docType) return;
    try {
      const orgId = localStorage.getItem('currentOrganizationId') || '1';
      const documentId = this._serverDocumentId || 'new';
      const title = state.deviceContext?.deviceName
        ? `${state.deviceContext.deviceName} — ${this._docType}`
        : `CERV2 ${this._docType} Document`;

      const response = await fetch(`/api/cerv2/documents/${documentId}/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': orgId,
        },
        body: JSON.stringify({
          documentType: this._docType,
          title,
          sections: state.userSectionContent || state.sectionData || {},
          metadata: {
            projectId: this._projectId,
            deviceContext: state.deviceContext || {},
            docType: this._docType,
            savedAt: new Date().toISOString(),
          },
        }),
      });

      if (response.ok) {
        const result = await response.json();
        // Remember the server document ID for subsequent saves
        if (result.documentId) {
          this._serverDocumentId = result.documentId;
        }
        this._lastServerSync = new Date().toISOString();
      }
    } catch (err) {
      // Non-critical — localStorage save already succeeded
      console.warn('[CERV2AutoSave] Server sync failed (will retry):', err.message);
    }
  }

  /** Returns the timestamp of the last successful server sync, or null. */
  getLastServerSync() {
    return this._lastServerSync;
  }

  // ── Load ───────────────────────────────────────────────────────────────

  load() {
    if (!this._docType) {
      console.warn('[CERV2AutoSave] load() called before init()');
      return null;
    }
    try {
      const key = this._key();
      const raw = localStorage.getItem(key);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      // Restore Sets from arrays
      if (Array.isArray(parsed.dismissedSuggestions)) {
        parsed.dismissedSuggestions = new Set(parsed.dismissedSuggestions);
      } else {
        parsed.dismissedSuggestions = new Set();
      }
      return parsed;
    } catch (err) {
      console.error('[CERV2AutoSave] Load failed:', err);
      return null;
    }
  }

  // ── Version History ────────────────────────────────────────────────────

  /**
   * Push a version snapshot.
   * @param {Object} snapshot — { sectionData, deviceContext, attachments, citations, reviewState }
   * @param {string} [label] — human-readable label for this version
   */
  pushVersion(snapshot, label = 'Auto-save') {
    if (!this._docType) return null;
    try {
      const key = this._versionKey();
      const raw = localStorage.getItem(key);
      const versions = raw ? JSON.parse(raw) : [];

      versions.unshift({
        id: `v${Date.now()}`,
        timestamp: new Date().toISOString(),
        label,
        state: {
          sectionData: snapshot.sectionData || {},
          deviceContext: snapshot.deviceContext || {},
          attachments: snapshot.attachments || {},
          citations: snapshot.citations || [],
          reviewState: snapshot.reviewState || {},
        },
        docType: this._docType,
      });

      const trimmed = versions.slice(0, MAX_VERSIONS);
      localStorage.setItem(key, JSON.stringify(trimmed));
      return trimmed[0];
    } catch (err) {
      console.error('[CERV2AutoSave] pushVersion failed:', err);
      return null;
    }
  }

  getVersions() {
    if (!this._docType) return [];
    try {
      const key = this._versionKey();
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  getVersion(versionId) {
    const versions = this.getVersions();
    return versions.find(v => v.id === versionId) || null;
  }

  // ── Delete ─────────────────────────────────────────────────────────────

  clear() {
    if (!this._docType) return;
    localStorage.removeItem(this._key());
    localStorage.removeItem(this._versionKey());
  }

  cancelAll() {
    for (const timer of Object.values(this._timers)) clearTimeout(timer);
    for (const timer of Object.values(this._serverTimers)) clearTimeout(timer);
    this._timers = {};
    this._serverTimers = {};
  }
}

const cerv2AutoSaveService = new CERV2AutoSaveService();
export default cerv2AutoSaveService;
export { CERV2AutoSaveService };
