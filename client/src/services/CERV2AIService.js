/**
 * CERV2 AI Service
 *
 * Client service layer for CERV2 AI auto-populate endpoints.
 * Fetches per-section AI suggestions, equivalence text, and
 * benefit-risk determinations from the mock backend.
 *
 * Phase 7.3 – CERV2 Editor AI Integration
 */

import axios from 'axios';

class CERV2AIService {
  constructor() {
    this.baseUrl = '/api/cerv2/ai';
    this._cache = new Map();
    this._debounceTimers = {};
  }

  // ── Per-section suggestion ─────────────────────────────────────
  /**
   * Fetch an AI suggestion for a specific section/field.
   * @param {string} docType  – "cerv2_510k" | "cerv2_pma" | "cerv2_cer"
   * @param {string} sectionId
   * @param {string} fieldId
   * @param {object} [context] – optional { deviceName, predicateDevice, indication, existingContent }
   * @returns {Promise<{suggestion: string, source: string, docType: string, sectionId: string, fieldId: string}>}
   */
  async fetchSuggestion(docType, sectionId, fieldId = 'main', context = {}) {
    const cacheKey = `${docType}:${sectionId}:${fieldId}`;
    if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

    try {
      const res = await axios.post(`${this.baseUrl}/suggest`, {
        docType,
        sectionId,
        fieldId,
        context,
      });
      const data = res.data;
      this._cache.set(cacheKey, data);
      return data;
    } catch (err) {
      console.error(`[CERV2AIService] Suggest failed for ${sectionId}/${fieldId}:`, err);
      return { suggestion: 'Error fetching suggestion.', source: 'error' };
    }
  }

  /**
   * Debounced variant – waits 600ms after the last call before fetching.
   * Useful for live-typing scenarios.
   */
  fetchSuggestionDebounced(docType, sectionId, fieldId, context = {}) {
    const key = `${sectionId}:${fieldId}`;
    return new Promise(resolve => {
      if (this._debounceTimers[key]) clearTimeout(this._debounceTimers[key]);
      this._debounceTimers[key] = setTimeout(async () => {
        const result = await this.fetchSuggestion(docType, sectionId, fieldId, context);
        resolve(result);
      }, 600);
    });
  }

  // ── Equivalence text ───────────────────────────────────────────
  /**
   * Generate substantial equivalence text (510(k)).
   */
  async fetchEquivalence({ deviceName, predicateDevice, predicateK, similarities, differences }) {
    try {
      const res = await axios.post(`${this.baseUrl}/equivalence`, {
        deviceName,
        predicateDevice,
        predicateK,
        similarities,
        differences,
      });
      return res.data;
    } catch (err) {
      console.error('[CERV2AIService] Equivalence failed:', err);
      return { text: 'Error generating equivalence text.', source: 'error' };
    }
  }

  // ── Benefit-risk text ──────────────────────────────────────────
  /**
   * Generate benefit-risk determination text.
   */
  async fetchBenefitRisk({ docType, deviceName, benefits, risks }) {
    try {
      const res = await axios.post(`${this.baseUrl}/benefit-risk`, {
        docType,
        deviceName,
        benefits,
        risks,
      });
      return res.data;
    } catch (err) {
      console.error('[CERV2AIService] Benefit-risk failed:', err);
      return { text: 'Error generating benefit-risk text.', source: 'error' };
    }
  }

  // ── Deep section analysis (Phase 7.3 enhanced) ────────────────
  /**
   * Fetch enhanced AI analysis for a section with realistic mock content.
   * @param {string} docType
   * @param {string} sectionId
   * @param {string} [content]
   * @param {object} [deviceContext] – { deviceName, manufacturer, predicateDevice, predicateK, intendedUse, deviceClass }
   */
  async analyzeSection(docType, sectionId, content = '', deviceContext = {}) {
    try {
      const res = await axios.post(`${this.baseUrl}/analyze-section`, {
        docType,
        sectionId,
        content,
        deviceContext,
      });
      return res.data;
    } catch (err) {
      console.error('[CERV2AIService] Analyze-section failed:', err);
      return { suggestion: 'Error analyzing section.', source: 'error' };
    }
  }

  // ── Bulk templates ─────────────────────────────────────────────
  /**
   * Fetch all section templates for a given doc type.
   */
  async fetchTemplates(docType) {
    try {
      const res = await axios.get(`${this.baseUrl}/templates/${docType}`);
      return res.data;
    } catch (err) {
      console.error('[CERV2AIService] Templates failed:', err);
      return { docType, templates: {} };
    }
  }

  // ── Cache management ───────────────────────────────────────────
  clearCache() {
    this._cache.clear();
  }

  invalidateSection(docType, sectionId) {
    for (const [key] of this._cache) {
      if (key.startsWith(`${docType}:${sectionId}:`)) {
        this._cache.delete(key);
      }
    }
  }
}

// Singleton export
const cerv2AIService = new CERV2AIService();
export default cerv2AIService;
export { CERV2AIService };
