import { db } from '../db.js';
import { 
  projects, 
  projectWorkflowStages, 
  projectTasks,
  medicalDevices,
  sharepoint_files
} from '../../shared/schema.js';
import { sql } from 'drizzle-orm';

async function seedDemoProjects() {
  try {
    console.log('🌱 Starting demo project seeding...');
    
    const tenantId = '7'; // Default tenant
    const userId = '1'; // Default user
    const timestamp = new Date().toISOString();

    // ===== PROJECT 1: Early-Stage (Stage 3) - NeuroFlex TENS Patch =====
    console.log('Creating Project 1: NeuroFlex TENS Patch (Early-Stage)...');
    
    const project1 = await db.insert(projects).values({
      id: 'demo-neuroflex-' + Date.now(),
      tenant_id: tenantId,
      project_name: 'NeuroFlex TENS Patch - 510(k) Submission',
      device_name: 'NeuroFlex Transcutaneous Electrical Nerve Stimulator',
      project_type: 'medical_device',
      status: 'active',
      current_stage: 3,
      regulatory_pathway: '510(k)',
      device_class: 'II',
      product_code: 'IPF',
      intended_use: 'The NeuroFlex TENS Patch is intended for temporary relief of pain associated with sore and aching muscles in the shoulder, waist, back, arm, and leg due to strain from exercise or normal household and work activities.',
      manufacturer: 'NeuroTech Medical Innovations Inc.',
      created_by: userId,
      created_at: timestamp,
      updated_at: timestamp,
      completion_percentage: 45,
      risk_score: 'low',
      metadata: {
        predicate_devices: ['K182234', 'K191435'],
        submission_type: 'Traditional 510(k)',
        target_submission_date: '2024-07-15',
        fda_branch: 'Neurological Devices',
        established_name: 'Transcutaneous Electrical Nerve Stimulator',
        proprietary_name: 'NeuroFlex TENS Patch',
        indications_for_use_changes: 'No significant changes from predicate',
        device_modifications: 'Improved adhesive material, smaller form factor'
      }
    }).returning();

    // Add workflow stages for Project 1
    const stages1 = [
      { stage: 1, status: 'completed', name: 'Device Intake & Classification', completion: 100 },
      { stage: 2, status: 'completed', name: 'Predicate Analysis', completion: 100 },
      { stage: 3, status: 'in_progress', name: 'Performance Testing', completion: 65 },
      { stage: 4, status: 'pending', name: 'Clinical Evaluation', completion: 0 },
      { stage: 5, status: 'pending', name: 'Regulatory Strategy', completion: 0 },
      { stage: 6, status: 'pending', name: 'FDA Forms & Documentation', completion: 0 },
      { stage: 7, status: 'pending', name: 'Submission & Tracking', completion: 0 }
    ];

    for (const stage of stages1) {
      await db.insert(projectWorkflowStages).values({
        project_id: project1[0].id,
        stage_number: stage.stage,
        stage_name: stage.name,
        status: stage.status,
        completion_percentage: stage.completion,
        started_at: stage.status !== 'pending' ? timestamp : null,
        completed_at: stage.status === 'completed' ? timestamp : null,
        metadata: {
          requirements: getStageRequirements(stage.stage),
          evidence_collected: stage.status === 'completed'
        }
      });
    }

    // Add sample tasks for Project 1
    await db.insert(projectTasks).values([
      {
        project_id: project1[0].id,
        task_name: 'Complete electrical safety testing',
        description: 'IEC 60601-1 testing for electrical safety',
        status: 'completed',
        priority: 'high',
        stage_number: 3,
        assigned_to: userId,
        due_date: timestamp,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        project_id: project1[0].id,
        task_name: 'Submit biocompatibility samples',
        description: 'Send samples for ISO 10993 testing',
        status: 'in_progress',
        priority: 'high',
        stage_number: 3,
        assigned_to: userId,
        due_date: timestamp,
        created_at: timestamp,
        updated_at: timestamp
      }
    ]);

    // ===== PROJECT 2: Mid-Stage (Stage 5) - AeroSpire Smart Spirometer =====
    console.log('Creating Project 2: AeroSpire Smart Spirometer (Mid-Stage)...');
    
    const project2 = await db.insert(projects).values({
      id: 'demo-aerospire-' + Date.now() + 1,
      tenant_id: tenantId,
      project_name: 'AeroSpire Smart Spirometer - 510(k) Submission',
      device_name: 'AeroSpire Digital Spirometry System',
      project_type: 'medical_device',
      status: 'active',
      current_stage: 5,
      regulatory_pathway: '510(k)',
      device_class: 'II',
      product_code: 'BZG',
      intended_use: 'The AeroSpire Smart Spirometer is intended to measure lung function parameters including FEV1, FVC, and PEF for diagnostic spirometry in clinical and home settings.',
      manufacturer: 'Respiratory Innovations LLC',
      created_by: userId,
      created_at: timestamp,
      updated_at: timestamp,
      completion_percentage: 72,
      risk_score: 'medium',
      metadata: {
        predicate_devices: ['K201876', 'K193421'],
        submission_type: 'Traditional 510(k)',
        target_submission_date: '2024-05-20',
        fda_branch: 'Anesthesiology Devices',
        established_name: 'Diagnostic Spirometer',
        proprietary_name: 'AeroSpire Smart Spirometer',
        indications_for_use_changes: 'Added home-use indication',
        device_modifications: 'AI-powered analysis, cloud connectivity, mobile app integration'
      }
    }).returning();

    // Add workflow stages for Project 2
    const stages2 = [
      { stage: 1, status: 'completed', name: 'Device Intake & Classification', completion: 100 },
      { stage: 2, status: 'completed', name: 'Predicate Analysis', completion: 100 },
      { stage: 3, status: 'completed', name: 'Performance Testing', completion: 100 },
      { stage: 4, status: 'completed', name: 'Clinical Evaluation', completion: 100 },
      { stage: 5, status: 'in_progress', name: 'Regulatory Strategy', completion: 85 },
      { stage: 6, status: 'pending', name: 'FDA Forms & Documentation', completion: 30 },
      { stage: 7, status: 'pending', name: 'Submission & Tracking', completion: 0 }
    ];

    for (const stage of stages2) {
      await db.insert(projectWorkflowStages).values({
        project_id: project2[0].id,
        stage_number: stage.stage,
        stage_name: stage.name,
        status: stage.status,
        completion_percentage: stage.completion,
        started_at: stage.status !== 'pending' ? timestamp : null,
        completed_at: stage.status === 'completed' ? timestamp : null,
        metadata: {
          requirements: getStageRequirements(stage.stage),
          evidence_collected: stage.status === 'completed'
        }
      });
    }

    // Add sample tasks for Project 2
    await db.insert(projectTasks).values([
      {
        project_id: project2[0].id,
        task_name: 'FDA Pre-submission meeting preparation',
        description: 'Prepare Q-sub package for FDA meeting',
        status: 'in_progress',
        priority: 'high',
        stage_number: 5,
        assigned_to: userId,
        due_date: timestamp,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        project_id: project2[0].id,
        task_name: 'Clinical study report finalization',
        description: 'Complete statistical analysis and report',
        status: 'completed',
        priority: 'high',
        stage_number: 4,
        assigned_to: userId,
        due_date: timestamp,
        created_at: timestamp,
        updated_at: timestamp
      }
    ]);

    // ===== PROJECT 3: Late-Stage (Stage 7) - CardioGuardian Implantable Loop Recorder =====
    console.log('Creating Project 3: CardioGuardian ILR (Late-Stage)...');
    
    const project3 = await db.insert(projects).values({
      id: 'demo-cardioguardian-' + Date.now() + 2,
      tenant_id: tenantId,
      project_name: 'CardioGuardian ILR - 510(k) Submission',
      device_name: 'CardioGuardian Implantable Loop Recorder',
      project_type: 'medical_device',
      status: 'active',
      current_stage: 7,
      regulatory_pathway: '510(k)',
      device_class: 'II',
      product_code: 'DSI',
      intended_use: 'The CardioGuardian ILR is intended for continuous cardiac monitoring and arrhythmia detection in patients with clinical syndromes or situations at increased risk of cardiac arrhythmias.',
      manufacturer: 'Cardiac Monitoring Systems Inc.',
      created_by: userId,
      created_at: timestamp,
      updated_at: timestamp,
      completion_percentage: 95,
      risk_score: 'medium',
      metadata: {
        predicate_devices: ['K203159', 'K211847'],
        submission_type: 'Traditional 510(k)',
        target_submission_date: '2024-03-01',
        fda_branch: 'Cardiovascular Devices',
        established_name: 'Implantable Loop Recorder',
        proprietary_name: 'CardioGuardian ILR System',
        indications_for_use_changes: 'No changes from predicate',
        device_modifications: 'Extended battery life, enhanced AI detection algorithms, smaller form factor'
      }
    }).returning();

    // Add workflow stages for Project 3
    const stages3 = [
      { stage: 1, status: 'completed', name: 'Device Intake & Classification', completion: 100 },
      { stage: 2, status: 'completed', name: 'Predicate Analysis', completion: 100 },
      { stage: 3, status: 'completed', name: 'Performance Testing', completion: 100 },
      { stage: 4, status: 'completed', name: 'Clinical Evaluation', completion: 100 },
      { stage: 5, status: 'completed', name: 'Regulatory Strategy', completion: 100 },
      { stage: 6, status: 'completed', name: 'FDA Forms & Documentation', completion: 100 },
      { stage: 7, status: 'in_progress', name: 'Submission & Tracking', completion: 75 }
    ];

    for (const stage of stages3) {
      await db.insert(projectWorkflowStages).values({
        project_id: project3[0].id,
        stage_number: stage.stage,
        stage_name: stage.name,
        status: stage.status,
        completion_percentage: stage.completion,
        started_at: timestamp,
        completed_at: stage.status === 'completed' ? timestamp : null,
        metadata: {
          requirements: getStageRequirements(stage.stage),
          evidence_collected: true,
          fda_interaction: stage.stage === 7 ? 'Pre-submission meeting completed' : null
        }
      });
    }

    // Add sample tasks for Project 3
    await db.insert(projectTasks).values([
      {
        project_id: project3[0].id,
        task_name: 'FDA eCopy preparation',
        description: 'Prepare electronic submission package',
        status: 'in_progress',
        priority: 'high',
        stage_number: 7,
        assigned_to: userId,
        due_date: timestamp,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        project_id: project3[0].id,
        task_name: 'Final quality review',
        description: 'QA review of complete 510(k) package',
        status: 'in_progress',
        priority: 'high',
        stage_number: 7,
        assigned_to: userId,
        due_date: timestamp,
        created_at: timestamp,
        updated_at: timestamp
      }
    ]);

    // Add sample evidence files for all projects
    console.log('Adding evidence files for all projects...');
    
    const evidenceFiles = [
      // Project 1 files
      { project: project1[0].id, filename: 'NF_Design_Control_Matrix.pdf', category: 'design_controls', stage: 1, status: 'pending' },
      { project: project1[0].id, filename: 'NF_Predicate_Comparison_Table.xlsx', category: 'regulatory', stage: 2, status: 'under_review' },
      { project: project1[0].id, filename: 'NF_IEC_60601_Test_Report.pdf', category: 'test_report', stage: 3, status: 'under_review' },
      { project: project1[0].id, filename: 'NF_Biocompatibility_ISO10993.pdf', category: 'test_report', stage: 3, status: 'pending' },
      { project: project1[0].id, filename: 'NF_Risk_Management_ISO14971.pdf', category: 'risk_management', stage: 3, status: 'pending' },
      
      // Project 2 files  
      { project: project2[0].id, filename: 'AS_Device_Master_Record.pdf', category: 'quality', stage: 1, status: 'approved' },
      { project: project2[0].id, filename: 'AS_Clinical_Protocol.pdf', category: 'clinical', stage: 4, status: 'approved' },
      { project: project2[0].id, filename: 'AS_Clinical_Study_Report.pdf', category: 'clinical', stage: 4, status: 'approved' },
      { project: project2[0].id, filename: 'AS_Software_V&V_Report.pdf', category: 'test_report', stage: 3, status: 'approved' },
      { project: project2[0].id, filename: 'AS_Human_Factors_Report.pdf', category: 'test_report', stage: 4, status: 'under_review' },
      { project: project2[0].id, filename: 'AS_FDA_PreSub_Response.pdf', category: 'regulatory', stage: 5, status: 'under_review' },
      
      // Project 3 files (comprehensive for late stage)
      { project: project3[0].id, filename: 'CG_510k_Summary.pdf', category: 'regulatory', stage: 6, status: 'approved' },
      { project: project3[0].id, filename: 'CG_Substantial_Equivalence.pdf', category: 'regulatory', stage: 6, status: 'approved' },
      { project: project3[0].id, filename: 'CG_Clinical_Study_Full.pdf', category: 'clinical', stage: 4, status: 'approved' },
      { project: project3[0].id, filename: 'CG_Biocompatibility_Complete.pdf', category: 'test_report', stage: 3, status: 'approved' },
      { project: project3[0].id, filename: 'CG_MRI_Safety_Report.pdf', category: 'test_report', stage: 3, status: 'approved' },
      { project: project3[0].id, filename: 'CG_Sterilization_Validation.pdf', category: 'test_report', stage: 3, status: 'approved' },
      { project: project3[0].id, filename: 'CG_FDA_Form_3514.pdf', category: 'fda_forms', stage: 6, status: 'approved' },
      { project: project3[0].id, filename: 'CG_FDA_Form_3601.pdf', category: 'fda_forms', stage: 6, status: 'approved' },
      { project: project3[0].id, filename: 'CG_eCopy_DVD.zip', category: 'submission', stage: 7, status: 'under_review' }
    ];

    for (const file of evidenceFiles) {
      await db.insert(sharepoint_files).values({
        tenant_id: tenantId,
        filename: file.filename,
        category: file.category,
        device_name: file.project.includes('neuroflex') ? 'NeuroFlex TENS' : 
                     file.project.includes('aerospire') ? 'AeroSpire Spirometer' : 
                     'CardioGuardian ILR',
        test_date: timestamp,
        test_standard: file.category === 'test_report' ? 'ISO/IEC Standards' : null,
        device_component: file.category,
        uploaded_by: userId,
        file_size: Math.floor(Math.random() * 5000000) + 500000, // Random size 0.5-5MB
        content_type: file.filename.endsWith('.pdf') ? 'application/pdf' : 
                      file.filename.endsWith('.xlsx') ? 'application/vnd.ms-excel' : 
                      'application/zip',
        version: 1,
        is_current: true,
        fda_requirement: mapToFDARequirement(file.category),
        workflow_stage: file.stage,
        project_id: file.project,
        regulatory_status: file.status,
        created_at: timestamp,
        updated_at: timestamp
      });
    }

    // Add medical device records
    console.log('Adding medical device records...');
    
    await db.insert(medicalDevices).values([
      {
        tenant_id: tenantId,
        device_name: 'NeuroFlex TENS Patch',
        device_type: 'Transcutaneous Electrical Nerve Stimulator',
        device_class: 'II',
        product_code: 'IPF',
        regulation_number: '882.5890',
        manufacturer: 'NeuroTech Medical Innovations Inc.',
        intended_use: 'Temporary relief of pain',
        project_id: project1[0].id,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        tenant_id: tenantId,
        device_name: 'AeroSpire Smart Spirometer',
        device_type: 'Diagnostic Spirometer',
        device_class: 'II',
        product_code: 'BZG',
        regulation_number: '868.1840',
        manufacturer: 'Respiratory Innovations LLC',
        intended_use: 'Lung function measurement',
        project_id: project2[0].id,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        tenant_id: tenantId,
        device_name: 'CardioGuardian ILR',
        device_type: 'Implantable Loop Recorder',
        device_class: 'II',
        product_code: 'DSI',
        regulation_number: '870.2920',
        manufacturer: 'Cardiac Monitoring Systems Inc.',
        intended_use: 'Continuous cardiac monitoring',
        project_id: project3[0].id,
        created_at: timestamp,
        updated_at: timestamp
      }
    ]);

    console.log('✅ Demo projects created successfully!');
    console.log('');
    console.log('📊 Summary:');
    console.log('1. NeuroFlex TENS Patch - Stage 3 (45% complete) - Early stage with active testing');
    console.log('2. AeroSpire Smart Spirometer - Stage 5 (72% complete) - Mid-stage with clinical data');
    console.log('3. CardioGuardian ILR - Stage 7 (95% complete) - Late stage ready for submission');
    console.log('');
    console.log('Each project includes:');
    console.log('- Complete device information');
    console.log('- Workflow stage progression');
    console.log('- Associated tasks');
    console.log('- Evidence files mapped to FDA requirements');
    console.log('- Medical device records');
    
    return {
      project1: project1[0],
      project2: project2[0],
      project3: project3[0]
    };

  } catch (error) {
    console.error('❌ Error seeding demo projects:', error);
    throw error;
  }
}

function getStageRequirements(stage: number): string[] {
  const requirements: { [key: number]: string[] } = {
    1: ['Device classification', 'Product code determination', 'Regulatory pathway selection'],
    2: ['Predicate device identification', 'Substantial equivalence analysis', 'Comparison tables'],
    3: ['Bench testing', 'Biocompatibility', 'Electrical safety', 'Software validation'],
    4: ['Clinical protocol', 'IRB approval', 'Clinical data collection', 'Statistical analysis'],
    5: ['Pre-submission meeting', 'Regulatory strategy document', 'FDA feedback incorporation'],
    6: ['510(k) summary', 'FDA forms', 'Truthful and accurate statement', 'Financial disclosure'],
    7: ['eCopy preparation', 'FDA submission', 'Acknowledgment letter', 'Interactive review']
  };
  return requirements[stage] || [];
}

function mapToFDARequirement(category: string): string {
  const mapping: { [key: string]: string } = {
    'design_controls': 'device_desc',
    'test_report': 'performance',
    'clinical': 'clinical_data',
    'regulatory': 'substantial_equiv',
    'risk_management': 'software_val',
    'quality': 'device_desc',
    'fda_forms': 'administrative',
    'submission': 'administrative'
  };
  return mapping[category] || 'device_desc';
}

// Execute the seeding
seedDemoProjects()
  .then(() => {
    console.log('🎉 Demo project seeding completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to seed demo projects:', error);
    process.exit(1);
  });

export { seedDemoProjects };