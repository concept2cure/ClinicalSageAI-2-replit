/**
 * TrialSage Delta Comparison Service
 * Provides advanced comparison capabilities between CSRs
 */

const { pool } = require('../db');

/**
 * Extracts structured endpoint data from CSR text and NER results
 * @param {Object} csr - CSR data with text and structured data
 * @returns {Object} - Structured endpoint data
 */
async function extractEndpointData(csr) {
  // Extract from structured data if available
  const endpoints = {
    primary: [],
    secondary: [],
  };

  // Look for endpoint mentions in MISC entity type (simple approach)
  const keywords = ['endpoint', 'outcome', 'efficacy', 'measure'];

  if (csr.structured_data && csr.structured_data.MISC) {
    // Process MISC entities that might be endpoints
    csr.structured_data.MISC.forEach(term => {
      if (keywords.some(keyword => term.toLowerCase().includes(keyword))) {
        if (term.toLowerCase().includes('primary')) {
          endpoints.primary.push(term);
        } else if (term.toLowerCase().includes('secondary')) {
          endpoints.secondary.push(term);
        }
      }
    });
  }

  // If text contains section headers, we can do a more sophisticated extraction
  const text = csr.text || '';
  const primarySection = text.match(
    /primary\s+endpoints?:(.+?)(?:secondary|safety|efficacy|results)/is
  );
  if (primarySection && primarySection[1]) {
    const extracted = primarySection[1]
      .split(/\n|;|•/)
      .map(s => s.trim())
      .filter(s => s.length > 5);
    endpoints.primary = [...new Set([...endpoints.primary, ...extracted])];
  }

  const secondarySection = text.match(
    /secondary\s+endpoints?:(.+?)(?:safety|efficacy|results|discussion)/is
  );
  if (secondarySection && secondarySection[1]) {
    const extracted = secondarySection[1]
      .split(/\n|;|•/)
      .map(s => s.trim())
      .filter(s => s.length > 5);
    endpoints.secondary = [...new Set([...endpoints.secondary, ...extracted])];
  }

  return endpoints;
}

/**
 * Extracts dropout rate and completion information
 * @param {Object} csr - CSR data
 * @returns {Object} - Dropout information
 */
async function extractDropoutData(csr) {
  const dropoutInfo = {
    completion_rate: null,
    dropout_rate: null,
    dropout_reasons: [],
  };

  // Simple regex-based extraction
  const text = csr.text || '';

  // Look for completion rate
  const completionMatch = text.match(/completion rate.{1,30}?(\d+(?:\.\d+)?\s*%)/i);
  if (completionMatch) {
    dropoutInfo.completion_rate = completionMatch[1];
  }

  // Look for dropout rate
  const dropoutMatch = text.match(/dropout rate.{1,30}?(\d+(?:\.\d+)?\s*%)/i);
  if (dropoutMatch) {
    dropoutInfo.dropout_rate = dropoutMatch[1];
  }

  // If we have one but not the other, derive it
  if (dropoutInfo.completion_rate && !dropoutInfo.dropout_rate) {
    const completionPercent = parseFloat(dropoutInfo.completion_rate);
    if (!isNaN(completionPercent)) {
      dropoutInfo.dropout_rate = `${(100 - completionPercent).toFixed(1)}%`;
    }
  }

  // Look for withdrawal reasons
  const withdrawalSection = text.match(
    /(?:withdrawal|discontinuation)(?:\s+reasons?|\s+due\s+to|:)(.+?)(?:results|conclusion|discussion)/is
  );
  if (withdrawalSection && withdrawalSection[1]) {
    const reasons = withdrawalSection[1]
      .split(/\n|;|•/)
      .map(s => s.trim())
      .filter(s => s.length > 5 && s.length < 100); // Filter out very short or long strings

    dropoutInfo.dropout_reasons = reasons;
  }

  return dropoutInfo;
}

/**
 * Compares CSRs and generates comprehensive delta analysis
 * @param {Array} csrIds - Array of CSR IDs to compare
 * @returns {Object} - Delta analysis
 */
async function generateDeltaAnalysis(csrIds) {
  if (!csrIds || csrIds.length < 2) {
    throw new Error('At least two CSR IDs are required for comparison');
  }

  // Get full CSR data
  const csrData = [];
  for (const id of csrIds) {
    const result = await pool.query('SELECT * FROM csrs WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      throw new Error(`CSR with ID ${id} not found`);
    }

    const csr = result.rows[0];
    if (typeof csr.structured_data === 'string') {
      try {
        csr.structured_data = JSON.parse(csr.structured_data);
      } catch (e) {
        console.error(`Error parsing structured_data for CSR ${id}`, e);
      }
    }

    csrData.push(csr);
  }

  // Extract and compare AE keywords (original implementation)
  const aeKeywords1 = csrData[0].structured_data?.MISC || [];
  const aeKeywords2 = csrData[1].structured_data?.MISC || [];
  const diffAeKeywords = Array.from(new Set([...aeKeywords1, ...aeKeywords2])).filter(
    keyword =>
      (aeKeywords1.includes(keyword) && !aeKeywords2.includes(keyword)) ||
      (!aeKeywords1.includes(keyword) && aeKeywords2.includes(keyword))
  );

  // Extract and compare endpoints
  const endpoints1 = await extractEndpointData(csrData[0]);
  const endpoints2 = await extractEndpointData(csrData[1]);

  const primaryEndpointDiffs = Array.from(
    new Set([...endpoints1.primary, ...endpoints2.primary])
  ).filter(
    endpoint =>
      (endpoints1.primary.includes(endpoint) && !endpoints2.primary.includes(endpoint)) ||
      (!endpoints1.primary.includes(endpoint) && endpoints2.primary.includes(endpoint))
  );

  const secondaryEndpointDiffs = Array.from(
    new Set([...endpoints1.secondary, ...endpoints2.secondary])
  ).filter(
    endpoint =>
      (endpoints1.secondary.includes(endpoint) && !endpoints2.secondary.includes(endpoint)) ||
      (!endpoints1.secondary.includes(endpoint) && endpoints2.secondary.includes(endpoint))
  );

  // Extract and compare dropout information
  const dropout1 = await extractDropoutData(csrData[0]);
  const dropout2 = await extractDropoutData(csrData[1]);

  const dropoutReasonDiffs = Array.from(
    new Set([...dropout1.dropout_reasons, ...dropout2.dropout_reasons])
  ).filter(
    reason =>
      (dropout1.dropout_reasons.includes(reason) && !dropout2.dropout_reasons.includes(reason)) ||
      (!dropout1.dropout_reasons.includes(reason) && dropout2.dropout_reasons.includes(reason))
  );

  // Construct delta object
  return {
    csr_ids: csrIds,
    delta: {
      // Original AE keywords comparison
      AE_keywords: diffAeKeywords,
      AE_summary: `Found ${aeKeywords1.length} vs ${aeKeywords2.length} unique AE mentions`,

      // New endpoint comparison
      endpoints: {
        primary: primaryEndpointDiffs,
        secondary: secondaryEndpointDiffs,
        summary: `Primary endpoints: ${endpoints1.primary.length} vs ${endpoints2.primary.length}, 
                  Secondary endpoints: ${endpoints1.secondary.length} vs ${endpoints2.secondary.length}`,
      },

      // New dropout comparison
      dropout: {
        rates: {
          csr1: dropout1.dropout_rate,
          csr2: dropout2.dropout_rate,
        },
        completion: {
          csr1: dropout1.completion_rate,
          csr2: dropout2.completion_rate,
        },
        reasons: dropoutReasonDiffs,
        summary: `Dropout rates: ${dropout1.dropout_rate || 'unknown'} vs ${dropout2.dropout_rate || 'unknown'}`,
      },

      // Overall summary
      summary: `Found ${diffAeKeywords.length} differing AE terms, 
                ${primaryEndpointDiffs.length} differing primary endpoints, 
                and ${dropoutReasonDiffs.length} differing dropout reasons.`,
    },
  };
}

module.exports = {
  generateDeltaAnalysis,
};
