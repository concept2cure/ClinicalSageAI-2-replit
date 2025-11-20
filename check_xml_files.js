/**
 * Check for available ClinicalTrials.gov XML files
 */

import fs from 'fs';
import path from 'path';

// Check if XML files exist in attached_assets
async function checkXmlFiles() {
  const assetsDir = path.join('.', 'attached_assets');
  try {
    const files = fs.readdirSync(assetsDir);
    const xmlFiles = files.filter(file => file.endsWith('.xml') && file.startsWith('NCT'));

    console.log(
      `Found ${xmlFiles.length} ClinicalTrials.gov XML files in attached_assets directory:`
    );
    xmlFiles.forEach(file => console.log(`- ${file}`));

    return xmlFiles.length;
  } catch (error) {
    console.error('Error checking XML files:', error);
    return 0;
  }
}

// Run the check
checkXmlFiles().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
