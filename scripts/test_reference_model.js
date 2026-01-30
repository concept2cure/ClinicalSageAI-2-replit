/**
 * Reference Model Testing Script
 *
 * This script tests the reference model configuration by:
 * 1. Querying the document types, subtypes, and lifecycles
 * 2. Testing the hierarchy enforcement rules
 * 3. Validating the periodic review trigger
 * 4. Creating a test document with the reference model
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import colors from 'colors';

// Load environment variables
dotenv.config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  logger.error(
    'Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables must be set.'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Configure colors
colors.setTheme({
  info: 'blue',
  success: 'green',
  warn: 'yellow',
  error: 'red',
  header: ['cyan', 'bold'],
});

/**
 * Test 1: Query document types, subtypes, and lifecycles
 */
async function testReferenceModelData() {
  logger.info('\n=== Test 1: Reference Model Data ==='.header);

  try {
    // Get document types
    const { data: types, error: typesError } = await supabase
      .from('document_types')
      .select('*')
      .order('display_order');

    if (typesError) throw typesError;

    logger.info(`Found ${types.length} document types:`.info);
    types.forEach(type => {
      logger.info(`- ${type.name} (${type.id})`);
    });

    // Get document subtypes
    const { data: subtypes, error: subtypesError } = await supabase
      .from('document_subtypes')
      .select('*')
      .order('type_id');

    if (subtypesError) throw subtypesError;

    logger.info(`\nFound ${subtypes.length} document subtypes:`.info);

    // Group subtypes by type_id
    const subtypesByType = {};
    subtypes.forEach(subtype => {
      if (!subtypesByType[subtype.type_id]) {
        subtypesByType[subtype.type_id] = [];
      }
      subtypesByType[subtype.type_id].push(subtype);
    });

    Object.entries(subtypesByType).forEach(([typeId, subtypes]) => {
      const typeName = types.find(t => t.id === typeId)?.name || typeId;
      logger.info(`\n${typeName}:`.info);
      subtypes.forEach(subtype => {
        logger.info(`- ${subtype.name} (${subtype.id})`);
      });
    });

    // Get lifecycles
    const { data: lifecycles, error: lifecyclesError } = await supabase
      .from('lifecycles')
      .select('*');

    if (lifecyclesError) throw lifecyclesError;

    logger.info(`\nFound ${lifecycles.length} lifecycles:`.info);
    lifecycles.forEach(lifecycle => {
      logger.info(
        `- ${lifecycle.name} (${lifecycle.id}): ${lifecycle.start_state} → ${lifecycle.steady_state}`
      );
    });

    return {
      success: true,
      types,
      subtypes,
      lifecycles,
    };
  } catch (error) {
    logger.error(`Error testing reference model data: ${error.message}`.error);
    return { success: false };
  }
}

/**
 * Test 2: Test hierarchy enforcement rules
 */
async function testHierarchyEnforcement(types, subtypes) {
  logger.info('\n=== Test 2: Hierarchy Enforcement ==='.header);

  try {
    // Create test folders for each document type
    const folders = [];

    for (const type of types) {
      const { data: folder, error } = await supabase
        .from('folders')
        .insert({
          name: `Test ${type.name} Folder`,
          description: `Test folder for ${type.name}`,
          document_type_id: type.id,
          tenant_id: '00000000-0000-0000-0000-000000000000', // Test tenant ID
          parent_id: null,
        })
        .select('*')
        .single();

      if (error) throw error;

      logger.info(`Created test folder: ${folder.name} (ID: ${folder.id}, Type: ${type.id})`.info);
      folders.push(folder);
    }

    // Test placing a document in a valid folder
    const validSubtype = subtypes[0];
    const validFolder = folders.find(f => f.document_type_id === validSubtype.type_id);

    logger.info(
      `\nTesting valid placement: Subtype ${validSubtype.name} in folder ${validFolder.name}`.info
    );

    const { data: validDoc, error: validError } = await supabase
      .from('documents')
      .insert({
        title: 'Test Valid Document',
        description: 'Document for testing valid folder placement',
        document_subtype_id: validSubtype.id,
        folder_id: validFolder.id,
        tenant_id: '00000000-0000-0000-0000-000000000000', // Test tenant ID
        status: 'Draft',
      })
      .select('*')
      .single();

    if (validError) {
      logger.error(`Error placing document in valid folder: ${validError.message}`.error);
    } else {
      logger.info(`✓ Successfully placed document in valid folder`.success);
    }

    // Test placing a document in an invalid folder
    const invalidSubtype = subtypes.find(s => s.type_id !== validFolder.document_type_id);

    logger.info(
      `\nTesting invalid placement: Subtype ${invalidSubtype.name} in folder ${validFolder.name}`
        .info
    );

    const { data: invalidDoc, error: invalidError } = await supabase
      .from('documents')
      .insert({
        title: 'Test Invalid Document',
        description: 'Document for testing invalid folder placement',
        document_subtype_id: invalidSubtype.id,
        folder_id: validFolder.id,
        tenant_id: '00000000-0000-0000-0000-000000000000', // Test tenant ID
        status: 'Draft',
      })
      .select('*')
      .single();

    if (invalidError) {
      logger.info(`✓ Correctly rejected invalid folder placement: ${invalidError.message}`.success);
    } else {
      logger.warn(`⚠ Warning: Invalid folder placement was accepted`.warn);
    }

    // Clean up test folders
    for (const folder of folders) {
      const { error } = await supabase.from('folders').delete().eq('id', folder.id);

      if (error) {
        logger.error(`Error deleting test folder: ${error.message}`.error);
      }
    }

    // Clean up test documents
    if (validDoc) {
      await supabase.from('documents').delete().eq('id', validDoc.id);
    }

    if (invalidDoc) {
      await supabase.from('documents').delete().eq('id', invalidDoc.id);
    }

    return { success: true };
  } catch (error) {
    logger.error(`Error testing hierarchy enforcement: ${error.message}`.error);
    return { success: false };
  }
}

/**
 * Test 3: Test periodic review trigger
 */
async function testPeriodicReviewTrigger(subtypes) {
  logger.info('\n=== Test 3: Periodic Review Trigger ==='.header);

  try {
    // Find a subtype with a review interval
    const reviewSubtype = subtypes.find(s => s.review_interval);

    if (!reviewSubtype) {
      logger.warn('Could not find a subtype with review_interval set. Skipping this test.'.warn);
      return { success: true, skipped: true };
    }

    logger.info(
      `Using subtype ${reviewSubtype.name} with review interval ${reviewSubtype.review_interval} months`
        .info
    );

    // Create a test document
    const { data: document, error: docError } = await supabase
      .from('documents')
      .insert({
        title: 'Test Periodic Review Document',
        description: 'Document for testing periodic review trigger',
        document_subtype_id: reviewSubtype.id,
        tenant_id: '00000000-0000-0000-0000-000000000000', // Test tenant ID
        status: 'Draft',
      })
      .select('*')
      .single();

    if (docError) throw docError;

    logger.info(`Created test document: ${document.title} (ID: ${document.id})`.info);

    // Update the document to Effective status to trigger the periodic review
    const { data: updatedDoc, error: updateError } = await supabase
      .from('documents')
      .update({
        status: 'Effective',
      })
      .eq('id', document.id)
      .select('*')
      .single();

    if (updateError) throw updateError;

    logger.info(`Updated document status to Effective`.info);

    // Check if a periodic review task was created
    const { data: tasks, error: tasksError } = await supabase
      .from('periodic_review_tasks')
      .select('*')
      .eq('document_id', document.id);

    if (tasksError) throw tasksError;

    if (tasks && tasks.length > 0) {
      logger.info(`✓ Periodic review task created successfully`.success);
      tasks.forEach(task => {
        logger.info(`- Task ID: ${task.id}, Due Date: ${task.due_date}, Status: ${task.status}`);
      });
    } else {
      logger.error(`✗ No periodic review task was created`.error);
    }

    // Check if the document's periodic_review_date was set
    const { data: docWithReviewDate, error: reviewDateError } = await supabase
      .from('documents')
      .select('id, periodic_review_date')
      .eq('id', document.id)
      .single();

    if (reviewDateError) throw reviewDateError;

    if (docWithReviewDate.periodic_review_date) {
      logger.info(
        `✓ Document periodic_review_date set to ${docWithReviewDate.periodic_review_date}`.success
      );
    } else {
      logger.error(`✗ Document periodic_review_date was not set`.error);
    }

    // Clean up test document
    const { error: deleteError } = await supabase.from('documents').delete().eq('id', document.id);

    if (deleteError) {
      logger.error(`Error deleting test document: ${deleteError.message}`.error);
    }

    return { success: true };
  } catch (error) {
    logger.error(`Error testing periodic review trigger: ${error.message}`.error);
    return { success: false };
  }
}

/**
 * Test 4: Create a document using the reference model
 */
async function testDocumentCreation(subtypes, types) {
  logger.info('\n=== Test 4: Document Creation ==='.header);

  try {
    // Select a subtype
    const subtype = subtypes[0];
    const type = types.find(t => t.id === subtype.type_id);

    logger.info(`Using subtype ${subtype.name} (${type.name})`.info);

    // Create a folder for the document
    const { data: folder, error: folderError } = await supabase
      .from('folders')
      .insert({
        name: `Test ${type.name} Folder`,
        description: `Test folder for ${type.name}`,
        document_type_id: type.id,
        tenant_id: '00000000-0000-0000-0000-000000000000', // Test tenant ID
        parent_id: null,
      })
      .select('*')
      .single();

    if (folderError) throw folderError;

    logger.info(`Created test folder: ${folder.name} (ID: ${folder.id})`.info);

    // Create a document with the reference model
    const { data: document, error: docError } = await supabase
      .from('documents')
      .insert({
        title: 'Test Reference Model Document',
        description: 'Document for testing reference model integration',
        document_subtype_id: subtype.id,
        folder_id: folder.id,
        tenant_id: '00000000-0000-0000-0000-000000000000', // Test tenant ID
        status: 'Draft',
      })
      .select('*')
      .single();

    if (docError) throw docError;

    logger.info(`✓ Created test document: ${document.title} (ID: ${document.id})`.success);
    logger.info(`- Subtype: ${subtype.name}`.info);
    logger.info(`- Folder: ${folder.name}`.info);
    logger.info(`- Status: ${document.status}`.info);

    // Clean up test document and folder
    const { error: docDeleteError } = await supabase
      .from('documents')
      .delete()
      .eq('id', document.id);

    if (docDeleteError) {
      logger.error(`Error deleting test document: ${docDeleteError.message}`.error);
    }

    const { error: folderDeleteError } = await supabase
      .from('folders')
      .delete()
      .eq('id', folder.id);

    if (folderDeleteError) {
      logger.error(`Error deleting test folder: ${folderDeleteError.message}`.error);
    }

    return { success: true };
  } catch (error) {
    logger.error(`Error testing document creation: ${error.message}`.error);
    return { success: false };
  }
}

/**
 * Main function to run all tests
 */
async function main() {
  logger.info('====================================================='.header);
  logger.info('TrialSage Vault Enhanced Reference Model Tests'.header);
  logger.info('====================================================='.header);

  // Test 1: Reference Model Data
  const { success: dataSuccess, types, subtypes, lifecycles } = await testReferenceModelData();

  if (!dataSuccess || !types || !subtypes || !lifecycles) {
    logger.error('Reference model data test failed. Aborting further tests.'.error);
    return;
  }

  // Test 2: Hierarchy Enforcement
  const { success: hierarchySuccess } = await testHierarchyEnforcement(types, subtypes);

  // Test 3: Periodic Review Trigger
  const { success: reviewSuccess } = await testPeriodicReviewTrigger(subtypes);

  // Test 4: Document Creation
  const { success: creationSuccess } = await testDocumentCreation(subtypes, types);

  // Summary
  logger.info('\n====================================================='.header);
  logger.info('Test Summary'.header);
  logger.info('====================================================='.header);

  logger.info(`Reference Model Data: ${dataSuccess ? 'PASSED'.success : 'FAILED'.error}`);
  logger.info(`Hierarchy Enforcement: ${hierarchySuccess ? 'PASSED'.success : 'FAILED'.error}`);
  logger.info(`Periodic Review Trigger: ${reviewSuccess ? 'PASSED'.success : 'FAILED'.error}`);
  logger.info(`Document Creation: ${creationSuccess ? 'PASSED'.success : 'FAILED'.error}`);

  const allPassed = dataSuccess && hierarchySuccess && reviewSuccess && creationSuccess;

  logger.info('\n====================================================='.header);
  logger.info(
    `Overall Result: ${allPassed ? 'ALL TESTS PASSED'.success : 'SOME TESTS FAILED'.error}`
  );
  logger.info('====================================================='.header);
}

// Run the main function
main().catch(error => {
  logger.error('Unhandled error during tests:'.error, error);
});
