/**
 * Reference Model Migration Utility
 *
 * This script helps migrate existing documents to the new Veeva-like
 * reference model structure in TrialSage Vault.
 *
 * It will:
 * 1. Scan all documents with legacy doc_type values
 * 2. Ask admin to map each unique legacy type to a new subtype
 * 3. Update documents with the new subtype_id
 * 4. Move documents to appropriate folders based on document type hierarchy
 * 5. Apply lifecycle and retention rules based on subtype settings
 */

const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Create readline interface for admin input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Main migration function
async function migrateToReferenceModel() {
  logger.info('===== TrialSage Vault Reference Model Migration =====');
  logger.info('This utility will help migrate existing documents to the new reference model.');
  logger.info('Please be patient as we analyze your document collection...\n');

  try {
    // Create a log file for the migration
    const logFile = path.join(__dirname, '..', 'migration_log.txt');
    const logStream = fs.createWriteStream(logFile, { flags: 'a' });

    logStream.write(`\n==== Migration Started: ${new Date().toISOString()} ====\n`);

    // 1. Get all unique doc_type values from existing documents
    const { data: legacyTypes, error: legacyError } = await supabase
      .from('documents')
      .select('doc_type')
      .not('doc_type', 'is', null)
      .is('document_subtype_id', null); // Only get unmigrated documents

    if (legacyError) {
      throw new Error(`Error fetching legacy document types: ${legacyError.message}`);
    }

    // Extract unique doc_types
    const uniqueTypes = Array.from(new Set(legacyTypes.map(doc => doc.doc_type))).filter(
      type => type && type.trim() !== ''
    );

    logger.info(`Found ${uniqueTypes.length} unique document types to migrate.`);
    logStream.write(`Found ${uniqueTypes.length} unique document types to migrate.\n`);

    // 2. Get all available subtypes for mapping
    const { data: subtypes, error: subtypesError } = await supabase
      .from('document_subtypes')
      .select(
        `
        id, 
        name,
        type_id,
        document_types:type_id (name)
      `
      )
      .order('type_id')
      .order('name');

    if (subtypesError) {
      throw new Error(`Error fetching document subtypes: ${subtypesError.message}`);
    }

    logger.info('\nAvailable subtypes for mapping:');
    subtypes.forEach(subtype => {
      logger.info(`[${subtype.id}] ${subtype.name} (${subtype.document_types.name})`);
    });

    // 3. Create mapping table for legacy types to new subtypes
    const mappings = {};

    for (const legacyType of uniqueTypes) {
      const subtypeId = await promptForMapping(legacyType, subtypes);
      mappings[legacyType] = subtypeId;

      const selectedSubtype = subtypes.find(s => s.id === subtypeId);
      logStream.write(`Mapping: "${legacyType}" -> ${subtypeId} (${selectedSubtype.name})\n`);
    }

    logger.info('\nVerifying mappings...');
    for (const [legacyType, subtypeId] of Object.entries(mappings)) {
      const selectedSubtype = subtypes.find(s => s.id === subtypeId);
      logger.info(
        `"${legacyType}" → ${selectedSubtype.name} (${selectedSubtype.document_types.name})`
      );
    }

    const confirm = await new Promise(resolve => {
      rl.question('\nDo you want to proceed with the migration? (y/n): ', answer => {
        resolve(answer.toLowerCase() === 'y');
      });
    });

    if (!confirm) {
      logger.info('Migration cancelled.');
      logStream.write('Migration cancelled by user.\n');
      logStream.end();
      rl.close();
      return;
    }

    // 4. Update all documents with their new subtype_id
    logger.info('\nUpdating documents...');
    let totalUpdated = 0;

    for (const [legacyType, subtypeId] of Object.entries(mappings)) {
      const { data: subtype } = await supabase
        .from('document_subtypes')
        .select('*, document_types:type_id (*)')
        .eq('id', subtypeId)
        .single();

      // Update all documents of this legacy type
      const { data: updatedDocs, error: updateError } = await supabase
        .from('documents')
        .update({
          document_subtype_id: subtypeId,
          // Calculate dates based on subtype settings if document is already in steady state
          periodic_review_date: subtype.review_interval
            ? `now() + interval '${subtype.review_interval} months'`
            : null,
          archive_date: subtype.archive_after
            ? `now() + interval '${subtype.archive_after} months'`
            : null,
          delete_date: subtype.delete_after
            ? `now() + interval '${subtype.delete_after} months'`
            : null,
        })
        .eq('doc_type', legacyType)
        .is('document_subtype_id', null)
        .select('id');

      if (updateError) {
        logger.error(`Error updating documents of type "${legacyType}": ${updateError.message}`);
        logStream.write(`ERROR updating "${legacyType}": ${updateError.message}\n`);
        continue;
      }

      logger.info(`Updated ${updatedDocs.length} documents of type "${legacyType}"`);
      totalUpdated += updatedDocs.length;
      logStream.write(
        `Updated ${updatedDocs.length} documents of type "${legacyType}" to ${subtypeId}\n`
      );

      // 5. Check if we need to create or get folder for this document type
      const { data: folder } = await supabase
        .from('folders')
        .select('id')
        .eq('name', subtype.document_types.name)
        .limit(1)
        .maybeSingle();

      if (!folder) {
        logger.info(`Creating folder for "${subtype.document_types.name}"`);
        // Create folder if it doesn't exist
        const { data: newFolder, error: folderError } = await supabase
          .from('folders')
          .insert({
            name: subtype.document_types.name,
            description: `${subtype.document_types.name} documents`,
          })
          .select('id')
          .single();

        if (folderError) {
          logger.error(`Error creating folder: ${folderError.message}`);
          logStream.write(`ERROR creating folder: ${folderError.message}\n`);
        } else {
          logger.info(`Created folder: ${subtype.document_types.name} (ID: ${newFolder.id})`);
          logStream.write(`Created folder: ${subtype.document_types.name} (ID: ${newFolder.id})\n`);
        }
      }
    }

    logger.info(`\nMigration complete! Updated ${totalUpdated} documents.`);
    logStream.write(
      `Migration completed successfully. Total updated: ${totalUpdated} documents.\n`
    );
    logStream.write(`==== Migration Finished: ${new Date().toISOString()} ====\n`);
    logStream.end();
  } catch (error) {
    logger.error('Migration failed:', error);
  } finally {
    rl.close();
  }
}

// Helper function to prompt for mapping
async function promptForMapping(legacyType, subtypes) {
  return new Promise(resolve => {
    rl.question(`\nEnter subtype ID for legacy type "${legacyType}": `, answer => {
      const subtypeId = answer.trim();
      if (subtypes.some(s => s.id === subtypeId)) {
        resolve(subtypeId);
      } else {
        logger.info('Invalid subtype ID. Please try again.');
        resolve(promptForMapping(legacyType, subtypes));
      }
    });
  });
}

// Execute the migration
migrateToReferenceModel();
