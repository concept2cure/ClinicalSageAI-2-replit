/**
 * Document Service
 *
 * Provides document retrieval and text conversion utilities.
 *
 * `getDocumentById` resolves a document by id from the canonical document
 * tables. It tries `concept2cure_artifacts` first (which is the working
 * authoring surface and supports both numeric primary keys and
 * `artifact_xxx` external ids), and falls back to `unified_documents` for
 * the workflow / vault surface. Both tables are tenant-scoped by
 * `organization_id`; pass an `organizationId` when one is in context to
 * avoid cross-tenant reads.
 *
 * The returned row is normalized so callers can keep using
 * `convertToText` / `getSectionContent` against it: any `metadata.sections`,
 * `metadata.deviceName`, and `metadata.manufacturer` are surfaced at the
 * top level when present.
 */

const { pool } = require('../db.js');

/**
 * Get document by ID.
 *
 * Backward-compatible signature: callers that already pass a single id
 * keep working. New callers should pass an `organizationId` so the lookup
 * is tenant-scoped (multi-tenant SaaS).
 *
 * @param {string|number} documentId   Numeric primary key, an
 *                                     `artifact_xxx` external id, or a
 *                                     stringified version of either.
 * @param {number} [organizationId]    Optional tenant scope. When provided
 *                                     the lookup adds an
 *                                     `organization_id = $N` predicate.
 * @returns {Promise<Object|null>}     The document row in the shape
 *                                     callers expect, or `null` if not
 *                                     found / on a recoverable schema
 *                                     error.
 */
const getDocumentById = async (documentId, organizationId) => {
  if (documentId === null || documentId === undefined || documentId === '') {
    return null;
  }

  if (!pool || typeof pool.query !== 'function') {
    console.warn('[documentService] getDocumentById called with no pool available', {
      documentId,
      organizationId,
    });
    return null;
  }

  const idStr = String(documentId);
  const numericId = /^-?\d+$/.test(idStr) ? Number(idStr) : null;

  // Try concept2cure_artifacts first — it's the canonical authoring surface
  // and the only table that supports the `artifact_xxx` external id form.
  try {
    const params = [];
    const where = [];
    if (numericId !== null) {
      params.push(numericId, idStr);
      where.push(`(id = $${params.length - 1} OR artifact_id = $${params.length})`);
    } else {
      params.push(idStr);
      where.push(`artifact_id = $${params.length}`);
    }
    if (organizationId !== undefined && organizationId !== null) {
      params.push(organizationId);
      where.push(`organization_id = $${params.length}`);
    }
    const sql = `SELECT * FROM concept2cure_artifacts WHERE ${where.join(' AND ')} LIMIT 1`;
    const result = await pool.query(sql, params);
    if (result.rows && result.rows.length > 0) {
      return normalizeDocumentRow(result.rows[0]);
    }
  } catch (err) {
    if (err && err.code === '42P01') {
      // Table doesn't exist in this environment — log and continue to fallback.
      console.warn('[documentService] concept2cure_artifacts table missing, trying fallback', {
        documentId,
        organizationId,
      });
    } else {
      console.warn('[documentService] concept2cure_artifacts lookup failed', {
        documentId,
        organizationId,
        error: err && err.message,
      });
      return null;
    }
  }

  // Fallback: unified_documents (workflow surface). Only meaningful when
  // the id is numeric — this table uses a serial primary key.
  if (numericId === null) {
    return null;
  }
  try {
    const params = [numericId];
    let sql = 'SELECT * FROM unified_documents WHERE id = $1';
    if (organizationId !== undefined && organizationId !== null) {
      params.push(organizationId);
      sql += ` AND organization_id = $${params.length}`;
    }
    sql += ' LIMIT 1';
    const result = await pool.query(sql, params);
    if (result.rows && result.rows.length > 0) {
      return normalizeDocumentRow(result.rows[0]);
    }
    return null;
  } catch (err) {
    if (err && err.code === '42P01') {
      console.warn('[documentService] unified_documents table missing', {
        documentId,
        organizationId,
      });
      return null;
    }
    console.warn('[documentService] unified_documents lookup failed', {
      documentId,
      organizationId,
      error: err && err.message,
    });
    return null;
  }
};

/**
 * Normalize a raw document row so `convertToText` / `getSectionContent`
 * keep working. We pull `sections`, `deviceName`, and `manufacturer` out
 * of `metadata` when they live there, without mutating the original row.
 */
function normalizeDocumentRow(row) {
  if (!row) return row;
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    ...row,
    title: row.title || metadata.title || null,
    sections: row.sections || metadata.sections || null,
    deviceName: row.deviceName || metadata.deviceName || metadata.device_name || null,
    manufacturer: row.manufacturer || metadata.manufacturer || null,
  };
}

/**
 * Convert document to text format for analysis
 *
 * @param {Object} document - The document object
 * @returns {string} - Text representation of the document
 */
const convertToText = document => {
  if (!document || !document.sections) {
    return '';
  }

  let text = `Title: ${document.title || 'Untitled'}\n`;
  text += `Device: ${document.deviceName || 'Unknown Device'}\n`;
  text += `Manufacturer: ${document.manufacturer || 'Unknown Manufacturer'}\n\n`;

  document.sections.forEach(section => {
    text += `## ${section.title}\n\n`;
    text += `${section.content}\n\n`;
  });

  return text;
};

/**
 * Get content for a specific section
 *
 * @param {Object} document - The document object
 * @param {string} sectionName - The section name to retrieve
 * @returns {string} - The section content
 */
const getSectionContent = (document, sectionName) => {
  if (!document || !document.sections) {
    return null;
  }

  const section = document.sections.find(
    s =>
      s.title.toLowerCase() === sectionName.toLowerCase() ||
      s.id.toLowerCase() === sectionName.toLowerCase()
  );

  return section ? section.content : null;
};

module.exports = {
  getDocumentById,
  convertToText,
  getSectionContent,
};
