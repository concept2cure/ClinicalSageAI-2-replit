/**
 * CERV2 Export Service
 *
 * Client service for exporting AI-populated CERV2 documents
 * as PDF, DOCX, and eSTAR ZIP packages.
 *
 * Phase 7.4 – CERV2 Export Pipeline
 */

import axios from 'axios';
import { saveAs } from 'file-saver';

class CERV2ExportService {
  constructor() {
    this.baseUrl = '/api/cerv2/export';
  }

  // ── Helper: download a blob response ───────────────────────────
  _downloadBlob(blob, filename) {
    saveAs(blob, filename);
  }

  // ── Mock data retrieval ────────────────────────────────────────

  /**
   * Fetch mock editor JSON for a doc type (dev/demo use).
   * @param {string} docType – "cerv2_510k" | "cerv2_pma" | "cerv2_cer"
   */
  async getMockEditorJson(docType) {
    try {
      const res = await axios.get(`${this.baseUrl}/mock/${docType}/json`);
      return res.data;
    } catch (err) {
      console.error('[CERV2ExportService] Mock JSON error:', err);
      return { editorJson: null, error: err.message };
    }
  }

  // ── AI section map → TipTap editor JSON ────────────────────────

  /**
   * Convert AI-populated section data into TipTap editor JSON
   * suitable for the export pipeline.
   *
   * @param {string} docType
   * @param {Object} sections – { [sectionId]: { title: string, content: string } }
   * @param {Object} [meta]
   * @returns {Promise<{ editorJson, sectionCount, nodeCount }>}
   */
  async convertAiToEditorJson(docType, sections, meta = {}) {
    try {
      const res = await axios.post(`${this.baseUrl}/ai-to-editor`, {
        docType,
        sections,
        meta,
      });
      return res.data;
    } catch (err) {
      console.error('[CERV2ExportService] AI-to-editor error:', err);
      return { editorJson: null, error: err.message };
    }
  }

  // ── Export: PDF ────────────────────────────────────────────────

  /**
   * Export editor content as PDF (downloads to browser).
   * @param {string} docType
   * @param {Object} editorJson – TipTap JSON { type: 'doc', content: [...] }
   * @param {Object} [meta]
   */
  async exportPdf(docType, editorJson, meta = {}) {
    try {
      const res = await axios.post(
        `${this.baseUrl}/pdf`,
        { docType, content: editorJson, meta },
        { responseType: 'blob' }
      );
      const filename = `${meta.title || docType}_export.pdf`;
      this._downloadBlob(res.data, filename);
      return { success: true, filename };
    } catch (err) {
      console.error('[CERV2ExportService] PDF export error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Export mock PDF (uses server-side mock vault).
   */
  async exportMockPdf(docType) {
    try {
      const res = await axios.get(`${this.baseUrl}/mock/${docType}`, {
        responseType: 'blob',
      });
      const filename = `${docType}_mock_export.pdf`;
      this._downloadBlob(res.data, filename);
      return { success: true, filename };
    } catch (err) {
      console.error('[CERV2ExportService] Mock PDF error:', err);
      return { success: false, error: err.message };
    }
  }

  // ── Export: DOCX ──────────────────────────────────────────────

  /**
   * Export editor content as DOCX (downloads to browser).
   */
  async exportDocx(docType, editorJson, meta = {}) {
    try {
      const res = await axios.post(
        `${this.baseUrl}/docx`,
        { docType, content: editorJson, meta },
        { responseType: 'blob' }
      );
      const filename = `${meta.title || docType}_export.docx`;
      this._downloadBlob(res.data, filename);
      return { success: true, filename };
    } catch (err) {
      console.error('[CERV2ExportService] DOCX export error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Export mock DOCX (uses server-side mock vault).
   */
  async exportMockDocx(docType) {
    try {
      const res = await axios.get(`${this.baseUrl}/mock/${docType}/docx`, {
        responseType: 'blob',
      });
      const filename = `${docType}_mock_export.docx`;
      this._downloadBlob(res.data, filename);
      return { success: true, filename };
    } catch (err) {
      console.error('[CERV2ExportService] Mock DOCX error:', err);
      return { success: false, error: err.message };
    }
  }

  // ── Export: ZIP (eSTAR package) ────────────────────────────────

  /**
   * Export editor content as submission ZIP package.
   * Includes per-section PDFs, combined PDF+DOCX, and optional attachments.
   */
  async exportZip(docType, editorJson, meta = {}, attachments = []) {
    try {
      const res = await axios.post(
        `${this.baseUrl}/zip`,
        { docType, content: editorJson, meta, attachments },
        { responseType: 'blob' }
      );
      const filename = `${meta.title || docType}_export.zip`;
      this._downloadBlob(res.data, filename);
      return { success: true, filename };
    } catch (err) {
      console.error('[CERV2ExportService] ZIP export error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Export mock ZIP (uses server-side mock vault).
   */
  async exportMockZip(docType) {
    try {
      const res = await axios.get(`${this.baseUrl}/mock/${docType}/zip`, {
        responseType: 'blob',
      });
      const filename = `${docType}_mock_eSTAR.zip`;
      this._downloadBlob(res.data, filename);
      return { success: true, filename };
    } catch (err) {
      console.error('[CERV2ExportService] Mock ZIP error:', err);
      return { success: false, error: err.message };
    }
  }

  // ── Full AI Export Pipeline ────────────────────────────────────

  /**
   * Complete pipeline: convert AI section suggestions → editor JSON → export.
   *
   * @param {'pdf'|'docx'|'zip'} format
   * @param {string} docType
   * @param {Object} aiSuggestions – { [sectionId]: suggestionText }
   * @param {Array} sectionOutline – [{ id, label }]
   * @param {Object} [meta]
   * @returns {Promise<{ success, filename?, error? }>}
   */
  async exportFromAiSuggestions(format, docType, aiSuggestions, sectionOutline, meta = {}) {
    // Step 1: Build section map
    const sections = {};
    for (const section of sectionOutline) {
      if (aiSuggestions[section.id]) {
        sections[section.id] = {
          title: section.label,
          content: aiSuggestions[section.id],
        };
      }
    }

    if (Object.keys(sections).length === 0) {
      return { success: false, error: 'No AI suggestions available to export.' };
    }

    // Step 2: Convert to TipTap editor JSON
    const conversionResult = await this.convertAiToEditorJson(docType, sections, meta);
    if (!conversionResult.editorJson) {
      return { success: false, error: conversionResult.error || 'Failed to convert AI data.' };
    }

    const editorJson = conversionResult.editorJson;

    // Step 3: Export in chosen format
    switch (format) {
      case 'pdf':
        return this.exportPdf(docType, editorJson, meta);
      case 'docx':
        return this.exportDocx(docType, editorJson, meta);
      case 'zip':
        return this.exportZip(docType, editorJson, meta);
      default:
        return { success: false, error: `Unknown format: ${format}` };
    }
  }
}

// Singleton export
const cerv2ExportService = new CERV2ExportService();
export default cerv2ExportService;
export { CERV2ExportService };
