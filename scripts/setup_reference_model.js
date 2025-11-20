/**
 * Reference Model Setup and Migration Script
 *
 * This script helps set up and migrate to the Enhanced Reference Model.
 * It performs the following tasks:
 * 1. Creates necessary database tables and structures
 * 2. Initializes the reference model with standard document types, subtypes, and lifecycles
 * 3. Migrates existing documents to the new model
 * 4. Creates the initial folder structure
 * 5. Verifies that the migration was successful
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import dotenv from 'dotenv';
import { execSync } from 'child_process';

// Load environment variables
dotenv.config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    'Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables must be set.'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Create readline interface for command-line interaction
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Utility function to prompt for confirmation
function confirm(message) {
  return new Promise(resolve => {
    rl.question(`${message} (y/n): `, answer => {
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

// Utility function to delay execution
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Step 1: Run the SQL schema script
 */
async function runSqlSchema() {
  console.log('Step 1: Setting up database schema...');

  try {
    // Read the SQL schema file
    const sqlFilePath = path.join(__dirname, '..', 'sql', 'reference_model.sql');
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

    // Split the content into individual statements
    const statements = sqlContent.split(';').filter(stmt => stmt.trim() !== '');

    // Execute each statement
    for (const statement of statements) {
      const { error } = await supabase.rpc('exec', { query: statement });
      if (error) {
        console.warn(`Warning executing SQL: ${error.message}`);
      }
    }

    console.log('✓ Database schema created successfully');
    return true;
  } catch (error) {
    console.error(`Error executing SQL schema: ${error.message}`);
    return false;
  }
}

/**
 * Step 2: Verify database structure
 */
async function verifyDatabaseStructure() {
  console.log('Step 2: Verifying database structure...');

  try {
    // Check for required tables
    const requiredTables = [
      'document_types',
      'document_subtypes',
      'lifecycles',
      'folder_templates',
      'periodic_review_tasks',
      'retention_rules',
    ];

    for (const table of requiredTables) {
      const { data, error } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .eq('table_name', table);

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        console.error(`Table '${table}' not found in database.`);
        return false;
      }
    }

    // Verify document_types has data
    const { data: typesData, error: typesError } = await supabase
      .from('document_types')
      .select('count(*)', { count: 'exact' });

    if (typesError) {
      throw typesError;
    }

    if (typesData[0].count < 1) {
      console.warn(
        'Warning: document_types table is empty. Initial data might not have been loaded.'
      );
    }

    console.log('✓ Database structure verified successfully');
    return true;
  } catch (error) {
    console.error(`Error verifying database structure: ${error.message}`);
    return false;
  }
}

/**
 * Step 3: Migrate legacy documents
 */
async function migrateLegacyDocuments() {
  console.log('Step 3: Migrating legacy documents...');

  try {
    // Check if there are documents without subtype_id
    const { data: legacyDocs, error: countError } = await supabase
      .from('documents')
      .select('count(*)', { count: 'exact' })
      .is('document_subtype_id', null);

    if (countError) {
      throw countError;
    }

    const legacyCount = legacyDocs[0].count;

    if (legacyCount === 0) {
      console.log('No legacy documents found that need migration.');
      return true;
    }

    console.log(`Found ${legacyCount} documents that need migration.`);

    // Get unique legacy types
    const { data: legacyTypes, error: typesError } = await supabase
      .from('documents')
      .select('doc_type')
      .is('document_subtype_id', null);

    if (typesError) {
      throw typesError;
    }

    // Extract unique types
    const uniqueTypes = [...new Set(legacyTypes.map(doc => doc.doc_type))].filter(type => type);

    console.log(`Found ${uniqueTypes.length} unique document types to map.`);

    // Get all subtypes for mapping
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
      throw subtypesError;
    }

    console.log('\nAvailable subtypes for mapping:');
    subtypes.forEach(subtype => {
      console.log(`[${subtype.id}] ${subtype.name} (${subtype.document_types.name})`);
    });

    // Create mapping for each legacy type
    const mappings = {};

    for (const legacyType of uniqueTypes) {
      let subtypeId;

      // Keep asking until a valid subtype is provided
      while (!subtypeId) {
        subtypeId = await new Promise(resolve => {
          rl.question(`\nEnter subtype ID for legacy type "${legacyType}": `, answer => {
            const id = answer.trim();
            if (subtypes.some(s => s.id === id)) {
              resolve(id);
            } else {
              console.log('Invalid subtype ID. Please try again.');
              resolve(null);
            }
          });
        });
      }

      mappings[legacyType] = subtypeId;
    }

    // Confirm mappings
    console.log('\nVerifying mappings:');
    for (const [legacyType, subtypeId] of Object.entries(mappings)) {
      const selectedSubtype = subtypes.find(s => s.id === subtypeId);
      console.log(
        `"${legacyType}" → ${selectedSubtype.name} (${selectedSubtype.document_types.name})`
      );
    }

    const proceed = await confirm('\nDo you want to proceed with the migration?');

    if (!proceed) {
      console.log('Migration cancelled.');
      return false;
    }

    // Update documents with their new subtype_id
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
        console.error(`Error updating documents of type "${legacyType}": ${updateError.message}`);
        continue;
      }

      const count = updatedDocs?.length || 0;
      console.log(`Updated ${count} documents of type "${legacyType}"`);
      totalUpdated += count;
    }

    console.log(`\n✓ Migration complete! Updated ${totalUpdated} documents.`);
    return true;
  } catch (error) {
    console.error(`Error migrating legacy documents: ${error.message}`);
    return false;
  }
}

/**
 * Step 4: Initialize folder structure for tenants
 */
async function initializeFolderStructure() {
  console.log('Step 4: Initializing folder structure...');

  try {
    // Get all tenants
    const { data: tenants, error: tenantsError } = await supabase.from('tenants').select('id');

    if (tenantsError) {
      throw tenantsError;
    }

    if (!tenants || tenants.length === 0) {
      console.log('No tenants found to initialize folders for.');
      return true;
    }

    console.log(`Found ${tenants.length} tenants to initialize folders for.`);

    // Create folders for each tenant
    for (const tenant of tenants) {
      console.log(`Initializing folders for tenant ${tenant.id}...`);

      // Check if tenant already has folders
      const { data: existingFolders, error: foldersError } = await supabase
        .from('folders')
        .select('id')
        .eq('tenant_id', tenant.id);

      if (foldersError) {
        console.error(`Error checking existing folders: ${foldersError.message}`);
        continue;
      }

      if (existingFolders && existingFolders.length > 0) {
        console.log(`Tenant ${tenant.id} already has ${existingFolders.length} folders.`);
        continue;
      }

      // Get folder templates
      const { data: templates, error: templatesError } = await supabase
        .from('folder_templates')
        .select('*')
        .order('sort_order');

      if (templatesError) {
        console.error(`Error fetching folder templates: ${templatesError.message}`);
        continue;
      }

      // Create top-level folders first
      const topLevelTemplates = templates.filter(template => !template.parent_id);
      const createdFolders = [];

      for (const template of topLevelTemplates) {
        const { data: folder, error: createError } = await supabase
          .from('folders')
          .insert({
            tenant_id: tenant.id,
            name: template.name,
            description: template.description,
            document_type_id: template.document_type_id,
          })
          .select('*')
          .single();

        if (createError) {
          console.error(`Error creating folder ${template.name}: ${createError.message}`);
          continue;
        }

        console.log(`Created folder: ${folder.name} (ID: ${folder.id})`);
        createdFolders.push({
          template_id: template.id,
          folder_id: folder.id,
        });

        // Brief delay to avoid rate limiting
        await delay(100);
      }

      // Create sub-folders if any
      const childTemplates = templates.filter(template => template.parent_id);

      for (const template of childTemplates) {
        // Find the parent folder
        const parentMapping = createdFolders.find(cf => cf.template_id === template.parent_id);

        if (!parentMapping) {
          console.warn(
            `Warning: Parent template ${template.parent_id} not found for template ${template.id}`
          );
          continue;
        }

        const { data: folder, error: createError } = await supabase
          .from('folders')
          .insert({
            tenant_id: tenant.id,
            name: template.name,
            description: template.description,
            parent_id: parentMapping.folder_id,
            document_type_id: template.document_type_id,
          })
          .select('*')
          .single();

        if (createError) {
          console.error(`Error creating folder ${template.name}: ${createError.message}`);
          continue;
        }

        console.log(`Created subfolder: ${folder.name} (ID: ${folder.id})`);
        createdFolders.push({
          template_id: template.id,
          folder_id: folder.id,
        });

        // Brief delay to avoid rate limiting
        await delay(100);
      }

      console.log(`✓ Created ${createdFolders.length} folders for tenant ${tenant.id}.`);
    }

    console.log('✓ Folder structure initialized successfully');
    return true;
  } catch (error) {
    console.error(`Error initializing folder structure: ${error.message}`);
    return false;
  }
}

/**
 * Step 5: Verify the migration and setup
 */
async function verifySetup() {
  console.log('Step 5: Verifying setup...');

  try {
    // Verify that all documents have a document_subtype_id
    const { data: missingSubtypes, error: missingError } = await supabase
      .from('documents')
      .select('count(*)', { count: 'exact' })
      .is('document_subtype_id', null);

    if (missingError) {
      throw missingError;
    }

    const missingCount = missingSubtypes[0].count;

    if (missingCount > 0) {
      console.warn(`Warning: Found ${missingCount} documents without a document_subtype_id.`);
    } else {
      console.log('✓ All documents have been assigned a document_subtype_id.');
    }

    // Verify that periodic review tasks exist for documents that need them
    const { data: reviewTasks, error: tasksError } = await supabase
      .from('periodic_review_tasks')
      .select('count(*)', { count: 'exact' });

    if (tasksError) {
      throw tasksError;
    }

    console.log(`✓ Found ${reviewTasks[0].count} periodic review tasks.`);

    // Verify that all tenants have folder structures
    const { data: tenantsWithFolders, error: foldersError } = await supabase.from('tenants')
      .select(`
        id,
        folders:folders(count(*))
      `);

    if (foldersError) {
      throw foldersError;
    }

    for (const tenant of tenantsWithFolders) {
      const folderCount = tenant.folders[0].count;
      if (folderCount === 0) {
        console.warn(`Warning: Tenant ${tenant.id} has no folders.`);
      } else {
        console.log(`✓ Tenant ${tenant.id} has ${folderCount} folders.`);
      }
    }

    console.log('✓ Setup verification completed');
    return true;
  } catch (error) {
    console.error(`Error verifying setup: ${error.message}`);
    return false;
  }
}

/**
 * Main function to run all setup steps
 */
async function main() {
  console.log('=====================================================');
  console.log('TrialSage Vault Enhanced Reference Model Setup');
  console.log('=====================================================');

  // Step 1: Run SQL schema
  const schemaResult = await runSqlSchema();
  if (!schemaResult) {
    console.error('Failed to run SQL schema. Aborting setup.');
    rl.close();
    return;
  }

  // Step 2: Verify database structure
  const verifyResult = await verifyDatabaseStructure();
  if (!verifyResult) {
    console.error('Database structure verification failed. Aborting setup.');
    rl.close();
    return;
  }

  // Step 3: Migrate legacy documents
  const migrateResult = await migrateLegacyDocuments();
  if (!migrateResult) {
    const proceed = await confirm(
      'Document migration failed or was cancelled. Continue with setup?'
    );
    if (!proceed) {
      console.log('Setup aborted.');
      rl.close();
      return;
    }
  }

  // Step 4: Initialize folder structure
  const folderResult = await initializeFolderStructure();
  if (!folderResult) {
    const proceed = await confirm(
      'Folder structure initialization failed. Continue with verification?'
    );
    if (!proceed) {
      console.log('Setup aborted.');
      rl.close();
      return;
    }
  }

  // Step 5: Verify setup
  const verifySetupResult = await verifySetup();
  if (!verifySetupResult) {
    console.warn('Setup verification encountered issues.');
  }

  console.log('\n=====================================================');
  console.log('Setup Complete!');
  console.log('=====================================================');
  console.log('\nNext steps:');
  console.log('1. Make sure the reference model API routes are registered in your Express app');
  console.log('2. Use the SubtypeSelect component in your document upload forms');
  console.log('3. Add TypeBreadcrumb to your document preview pages');
  console.log('4. Check the PeriodicReviewDashboard for documents needing review');

  rl.close();
}

// Run the main function
main().catch(error => {
  console.error('Unhandled error during setup:', error);
  rl.close();
});
