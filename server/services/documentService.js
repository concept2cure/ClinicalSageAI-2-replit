/**
 * Document Service
 *
 * This is a simplified mock implementation of the document service
 * for testing purposes. In a real application, this would interact
 * with a database and filesystem.
 */

/**
 * Get document by ID
 *
 * @param {string} documentId - The document ID to retrieve
 * @returns {Promise<Object>} - The document object
 */
const getDocumentById = async documentId => {
  // In a real implementation, this would fetch from a database
  const mockDocuments = {
    'sample-cer-1': {
      id: 'sample-cer-1',
      title: 'Clinical Evaluation Report - Acme Medical Device',
      type: 'cer',
      version: '1.0',
      deviceName: 'Acme Medical Device',
      manufacturer: 'Acme Medical',
      createdAt: '2025-01-15T00:00:00Z',
      sections: [
        {
          id: 'executive-summary',
          title: 'Executive Summary',
          content: 'This is a sample executive summary for testing purposes.',
        },
        {
          id: 'clinical-data',
          title: 'Clinical Data',
          content: 'This is sample clinical data content for testing purposes.',
        },
        {
          id: 'safety',
          title: 'Safety',
          content: 'This is sample safety content for testing purposes.',
        },
      ],
    },
  };

  return mockDocuments[documentId];
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
