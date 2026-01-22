// Test script for project creation with eCTD hierarchy
import pkg from 'pg';
const { Pool } = pkg;
import * as projectService from './services/projectService.js';

// Use local Docker database for testing
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'clinicalsage',
  user: 'postgres',
  password: 'postgres',
});

async function testProjectCreation() {
  console.log('🧪 Testing Project Creation with eCTD Hierarchy...\n');

  try {
    // Test 1: Create a new IND project
    console.log('📋 Test 1: Creating new IND project...');
    const project = await projectService.createProjectWithHierarchy(
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

    // Test 2: Retrieve the project with hierarchy
    console.log('\n📋 Test 2: Retrieving project with hierarchy...');
    const retrievedProject = await projectService.getProjectById(project.id);

    console.log('✅ Project retrieved successfully!');
    console.log('   - Project Name:', retrievedProject.name);
    console.log('   - Total Nodes:', retrievedProject.node_count);
    console.log('   - Root Node:', retrievedProject.nodes?.name);
    console.log('   - Root Children Count:', retrievedProject.nodes?.children?.length);

    // Print M1-M5 structure
    if (retrievedProject.nodes?.children) {
      console.log('\n📁 eCTD Structure:');
      retrievedProject.nodes.children.forEach((module) => {
        console.log(`   └─ ${module.name} (${module.children?.length || 0} children)`);
        if (module.children && module.children.length > 0 && module.children.length < 10) {
          module.children.forEach((child) => {
            console.log(`      └─ ${child.name} (${child.children?.length || 0} children)`);
          });
        }
      });
    }

    // Test 3: Get all projects
    console.log('\n📋 Test 3: Retrieving all projects for organization...');
    const allProjects = await projectService.getAllProjects(1);
    console.log('✅ Projects retrieved successfully!');
    console.log('   - Total Projects:', allProjects.length);
    allProjects.forEach((p, idx) => {
      console.log(`   ${idx + 1}. ${p.name} (${p.type}) - ${p.node_count} nodes`);
    });

    console.log('\n✅ All tests passed!');
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
