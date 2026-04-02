/**
 * Document Service
 *
 * Provides document retrieval and text conversion utilities.
 * Document lookup should be wired to real DB queries.
 */

/**
 * Get document by ID
 *
 * @param {string} documentId - The document ID to retrieve
 * @returns {Promise<Object>} - The document object
 */
const getDocumentById = async documentId => {
  // TODO: Wire to real DB query (Drizzle ORM) when document tables are available
  // Return null so callers handle 404 properly — no fabricated data
  return null;
};

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
