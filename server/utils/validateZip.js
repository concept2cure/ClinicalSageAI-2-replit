import unzipper from 'unzipper';
import { ichSchema } from './ichSchema.js';

/**
 * Validates a base64-encoded ZIP blob against ICH schema.
 * @param {string} base64Zip - Base64 string of the ZIP contents.
 * @returns {Promise<{ valid: boolean, errors: string[] }>}
 */
export async function validateZip(base64Zip) {
  try {
    const zipBuffer = Buffer.from(base64Zip, 'base64');
    const dirMap = {};

    // Extract entries from the ZIP file
    const directory = await unzipper.Open.buffer(zipBuffer);

    // Map the directory structure
    directory.files.forEach(file => {
      const parts = file.path.split('/');

      if (parts.length < 2) return; // Skip root files

      const module = parts[0];
      const filename = parts[1];

      // Initialize module object if it doesn't exist
      if (!dirMap[module]) {
        dirMap[module] = {};
      }

      // Add file to module
      dirMap[module][filename] = true;
    });

    // Validate against the ICH schema
    await ichSchema.validate(dirMap, { abortEarly: false });
    return {
      valid: true,
      errors: [],
    };
  } catch (err) {
    // Return validation errors
    return {
      valid: false,
      errors: err.errors || [err.message || 'Unknown validation error'],
    };
  }
}
