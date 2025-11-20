/**
 * eCTD Folder Builder
 *
 * This module dynamically creates the eCTD folder structure according to ICH standards
 * and prepares for document packaging and submission.
 */

import fs from 'fs';
import path from 'path';

/**
 * Creates the standard eCTD folder structure
 * @param {string} basePath - The base directory where the eCTD structure will be created
 * @returns {Object} - Object with status and created folders
 */
function createEctdStructure(basePath) {
  const folders = [
    'submission/0000/m1/us/1.1-forms',
    'submission/0000/m1/us/1.2-cover',
    'submission/0000/m1/us/1.3-administrative-information',
    'submission/0000/m2/2.1-table-of-contents',
    'submission/0000/m2/2.2-introduction',
    'submission/0000/m2/2.3-quality-overall-summary',
    'submission/0000/m2/2.4-nonclinical-overview',
    'submission/0000/m2/2.5-clinical-overview',
    'submission/0000/m2/2.6-nonclinical-written-and-tabulated-summaries',
    'submission/0000/m2/2.7-clinical-summary',
    'submission/0000/m3/3.1-table-of-contents',
    'submission/0000/m3/3.2-body-of-data',
    'submission/0000/m3/3.3-literature-references',
    'submission/0000/m4/4.1-table-of-contents',
    'submission/0000/m4/4.2-study-reports',
    'submission/0000/m4/4.3-literature-references',
    'submission/0000/m5/5.1-table-of-contents',
    'submission/0000/m5/5.2-tabular-listing-of-all-clinical-studies',
    'submission/0000/m5/5.3-clinical-study-reports',
    'submission/0000/m5/5.4-literature-references',
    'submission/util/dtd',
    'submission/util/stylesheet',
  ];

  const createdFolders = [];

  try {
    for (const folder of folders) {
      const fullPath = path.join(basePath, folder);
      fs.mkdirSync(fullPath, { recursive: true });
      createdFolders.push(fullPath);
      console.log(`Created folder: ${fullPath}`);
    }

    return {
      status: 'success',
      message: 'eCTD folder structure created successfully',
      folders: createdFolders,
    };
  } catch (error) {
    console.error(`Error creating folder structure: ${error.message}`);
    return {
      status: 'error',
      message: `Failed to create eCTD structure: ${error.message}`,
      folders: createdFolders,
    };
  }
}

/**
 * Saves a document to the specified target folder
 * @param {Object} doc - Document object with filename and content
 * @param {string} targetFolder - Path to the target folder
 * @returns {Object} - Result of save operation
 */
function saveDocument(doc, targetFolder) {
  try {
    const { filename, content } = doc;
    const fullPath = path.join(targetFolder, filename);

    // Create directory if it doesn't exist
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });

    // Write file based on content type (Buffer or string)
    if (Buffer.isBuffer(content)) {
      fs.writeFileSync(fullPath, content);
    } else {
      fs.writeFileSync(fullPath, content, 'utf8');
    }

    return {
      status: 'success',
      message: 'Document saved successfully',
      path: fullPath,
    };
  } catch (error) {
    console.error(`Error saving document: ${error.message}`);
    return {
      status: 'error',
      message: `Failed to save document: ${error.message}`,
    };
  }
}

/**
 * Maps a document to the appropriate eCTD folder based on document type and metadata
 * @param {Object} document - Document with type and metadata
 * @param {string} basePath - Base path of the eCTD structure
 * @returns {string} - Target folder path
 */
function mapDocumentToFolder(document, basePath) {
  const { type, metadata } = document;

  // Default mapping logic based on document type
  switch (type) {
    case 'form_1571':
      return path.join(basePath, 'submission/0000/m1/us/1.1-forms');

    case 'cover_letter':
      return path.join(basePath, 'submission/0000/m1/us/1.2-cover');

    case 'investigator_brochure':
      return path.join(basePath, 'submission/0000/m1/us/1.3-administrative-information');

    case 'protocol':
      return path.join(basePath, 'submission/0000/m5/5.3-clinical-study-reports');

    case 'cmc':
      return path.join(basePath, 'submission/0000/m3/3.2-body-of-data');

    case 'nonclinical':
      return path.join(basePath, 'submission/0000/m4/4.2-study-reports');

    default:
      // More sophisticated mapping could use metadata for precise placement
      return path.join(basePath, 'submission/0000/m1/us');
  }
}

/**
 * Validates the eCTD structure for completeness and compliance
 * @param {string} basePath - The base directory of the eCTD structure
 * @returns {Object} - Validation results with missing required components
 */
function validateEctdStructure(basePath) {
  const requiredFiles = [
    { path: 'submission/0000/m1/us/1.1-forms', files: ['form-1571.pdf'] },
    { path: 'submission/0000/m1/us/1.2-cover', files: ['cover-letter.pdf'] },
  ];

  const missingItems = [];

  for (const required of requiredFiles) {
    const folderPath = path.join(basePath, required.path);

    // Check if folder exists
    if (!fs.existsSync(folderPath)) {
      missingItems.push({
        type: 'folder',
        path: required.path,
        message: 'Required folder is missing',
      });
      continue;
    }

    // Check required files
    for (const file of required.files) {
      const filePath = path.join(folderPath, file);
      if (!fs.existsSync(filePath)) {
        missingItems.push({
          type: 'file',
          path: path.join(required.path, file),
          message: 'Required file is missing',
        });
      }
    }
  }

  return {
    valid: missingItems.length === 0,
    missingItems: missingItems,
  };
}

export { createEctdStructure, saveDocument, mapDocumentToFolder, validateEctdStructure };
