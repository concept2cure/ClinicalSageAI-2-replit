/**
 * CERV2 Auto-Save Service — Phase 9 P0
 *
 * Persists all editor state to localStorage with document-keyed storage.
 * Auto-saves on every state change (debounced at 2s).
 * Supports multiple documents via composite key: `cerv2:${docType}:${projectId}`.
 *
 * Stored state:
 *  - deviceContext (device name, predicate, intended use, etc.)
 *  - userSectionContent (user-edited content per section)
 *  - aiSuggestions (AI-generated content per section)
 *  - dismissedSuggestions (Set → Array for JSON)
 *  - validationHints
 *  - attachments metadata (base64 stripped to save quota)
 *  - citations
 *  - reviewState
 *  - sectionStatuses
 *  - lastSavedAt timestamp
 */

const STORAGE_PREFIX = 'cerv2';
const AUTOSAVE_DEBOUNCE_MS = 2000;
const MAX_VERSIONS = 50;

class CERV2AutoSaveService {
  constructor() {
    this._timers = {};
  }

  // ── Key helpers ────────────────────────────────────────────────────────

  _key(docType, projectId = 'default') {
    return `${STORAGE_PREFIX}:${docType}:${projectId}`;
  }

  _versionKey(docType, projectId = 'default') {
    return `${STORAGE_PREFIX}:versions:${docType}:${projectId}`;
  }

  // ── Save ───────────────────────────────────────────────────────────────

  save(docType, state, projectId = 'default') {
    try {
      const key = this._key(docType, projectId);

      // Strip large base64 attachment data to avoid localStorage quota
      let attachments = state.attachments;
      if (attachments) {
        const stripped = {};
        for (const [secId, files] of Object.entries(attachments)) {
          stripped[secId] = (files || []).map(f => ({
            id: f.id,
            filename: f.filename,
            mimeType: f.mimeType,
            size: f.size,
            addedAt: f.addedAt,
            // base64 omitted — re-upload after reload
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
        docType,
        projectId,
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
   */
  saveDebounced(docType, state, projectId = 'default') {
    const timerKey = this._key(docType, projectId);
    if (this._timers[timerKey]) clearTimeout(this._timers[timerKey]);
    this._timers[timerKey] = setTimeout(() => {
      this.save(docType, state, projectId);
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  // ── Load ───────────────────────────────────────────────────────────────

  load(docType, projectId = 'default') {
    try {
      const key = this._key(docType, projectId);
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

  pushVersion(docType, snapshot, projectId = 'default') {
    try {
      const key = this._versionKey(docType, projectId);
      const raw = localStorage.getItem(key);
      const versions = raw ? JSON.parse(raw) : [];

      versions.unshift({
        id: `v${Date.now()}`,
        timestamp: new Date().toISOString(),
        label: snapshot.label || 'Auto-save',
        sectionData: snapshot.sectionData || {},
        deviceContext: snapshot.deviceContext || {},
        docType,
      });

      const trimmed = versions.slice(0, MAX_VERSIONS);
      localStorage.setItem(key, JSON.stringify(trimmed));
      return trimmed[0];
    } catch (err) {
      console.error('[CERV2AutoSave] pushVersion failed:', err);
      return null;
    }
  }

  getVersions(docType, projectId = 'default') {
    try {
      const key = this._versionKey(docType, projectId);
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  getVersion(docType, versionId, projectId = 'default') {
    const versions = this.getVersions(docType, projectId);
    return versions.find(v => v.id === versionId) || null;
  }

  // ── Delete ─────────────────────────────────────────────────────────────

  clear(docType, projectId = 'default') {
    localStorage.removeItem(this._key(docType, projectId));
    localStorage.removeItem(this._versionKey(docType, projectId));
  }

  listSavedDocTypes(projectId = 'default') {
    const prefix = `${STORAGE_PREFIX}:`;
    const types = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix) && !key.includes(':versions:')) {
        const parts = key.split(':');
        if (parts.length >= 3 && (projectId === '*' || parts[2] === projectId)) {
          types.push(parts[1]);
        }
      }
    }
    return types;
  }

  cancelAll() {
    for (const timer of Object.values(this._timers)) clearTimeout(timer);
    this._timers = {};
  }
}

const cerv2AutoSaveService = new CERV2AutoSaveService();
export default cerv2AutoSaveService;
export { CERV2AutoSaveService };
