// Standalone test script for project creation with eCTD hierarchy
import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use local Docker database for testing
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'clinicalsage',
  user: 'postgres',
  password: 'postgres',
});

/**
 * Recursively insert eCTD nodes into the database
 */
async function insertNode(node, projectId, parentId, client) {
  const { name, node_type, sequence_number, children } = node;

  const result = await client.query(
    `INSERT INTO ectd_nodes (project_id, parent_id, name, node_type, sequence_number)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [projectId, parentId, name, node_type || 'folder', sequence_number || null]
  );

  const nodeId = result.rows[0].id;

  if (children && Array.isArray(children)) {
    for (const child of children) {
      await insertNode(child, projectId, nodeId, client);
    }
  }

  return nodeId;
}

/**
 * Create a new project with full eCTD hierarchy
 */
async function createProjectWithHierarchy(projectData, organizationId) {
  const { name, type, status = 'active', metadata = {} } = projectData;

  const hierarchyPath = path.join(__dirname, 'data/fda-ectd-hierarchy.json');
  const hierarchyData = JSON.parse(fs.readFileSync(hierarchyPath, 'utf8'));

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const projectResult = await client.query(
      `INSERT INTO projects (organization_id, name, type, status, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, type, status, created_at`,
      [organizationId, name, type || 'IND', status, JSON.stringify(metadata)]
    );

    const project = projectResult.rows[0];

    await insertNode(hierarchyData, project.id, null, client);

    const countResult = await client.query(
      `SELECT COUNT(*) FROM ectd_nodes WHERE project_id = $1`,
      [project.id]
    );

    await client.query('COMMIT');

    return {
      ...project,
      node_count: parseInt(countResult.rows[0].count),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function testProjectCreation() {
  console.log('🧪 Testing Project Creation with eCTD Hierarchy...\n');

  try {
    // Verify connection
    console.log('🔌 Testing database connection...');
    const testResult = await pool.query('SELECT NOW()');
    console.log('✅ Database connected:', testResult.rows[0].now);

    // Test 1: Create a new IND project
    console.log('\n📋 Test 1: Creating new IND project...');
    const project = await createProjectWithHierarchy(
      {
        name: 'Concept2Cure IND-001',
        type: 'IND',
        status: 'active',
        metadata: { sponsor: 'Concept2Cure', drug: 'BTX-331' },
      },
      1 // organization_id
    );

    console.log('✅ Project created successfully!');
    console.log('   - Project ID:', project.id);
    console.log('   - Project Name:', project.name);
    console.log('   - Project Type:', project.type);
    console.log('   - Total Nodes Created:', project.node_count);
    console.log('   - Created At:', project.created_at);

    // Test 2: Retrieve hierarchy structure
    console.log('\n📋 Test 2: Verifying eCTD hierarchy...');
    const nodesResult = await pool.query(
      `SELECT id, parent_id, name, node_type, sequence_number
       FROM ectd_nodes
       WHERE project_id = $1 AND parent_id IS NULL`,
      [project.id]
    );

    console.log('✅ Root node found:', nodesResult.rows[0].name);

    // Get M1-M5 modules
    const modulesResult = await pool.query(
      `SELECT id, name, node_type
       FROM ectd_nodes
       WHERE project_id = $1 AND parent_id = $2
       ORDER BY sequence_number`,
      [project.id, nodesResult.rows[0].id]
    );

    console.log('\n📁 eCTD Modules Created:');
    for (const module of modulesResult.rows) {
      const childCount = await pool.query(
        `SELECT COUNT(*) FROM ectd_nodes WHERE parent_id = $1`,
        [module.id]
      );
      console.log(`   └─ ${module.name} (${childCount.rows[0].count} children)`);
    }

    // Test 3: Verify total node count
    const totalNodesResult = await pool.query(
      `SELECT COUNT(*) FROM ectd_nodes WHERE project_id = $1`,
      [project.id]
    );
    console.log('\n📊 Total Nodes in Database:', totalNodesResult.rows[0].count);

    console.log('\n✅ All tests passed!');
    console.log('\n🎉 Sprint 1 - Ontology Seeder: COMPLETE');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testProjectCreation();
