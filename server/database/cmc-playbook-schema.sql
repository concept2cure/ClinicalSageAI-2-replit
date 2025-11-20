-- CMC Playbook Database Schema
-- Tables for CMC workflow, checklist, and AI tool management

-- CMC Workflow Instances
CREATE TABLE IF NOT EXISTS cmc_workflow_instances (
    id VARCHAR(255) PRIMARY KEY,
    template_id VARCHAR(255) NOT NULL,
    organization_id INTEGER NOT NULL,
    project_name VARCHAR(255) NOT NULL,
    assigned_team JSONB DEFAULT '[]',
    status VARCHAR(50) DEFAULT 'active',
    progress INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

-- CMC Workflow Tasks
CREATE TABLE IF NOT EXISTS cmc_workflow_tasks (
    id VARCHAR(255) PRIMARY KEY,
    workflow_instance_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    task_order INTEGER NOT NULL,
    estimated_hours INTEGER,
    actual_hours INTEGER,
    status VARCHAR(50) DEFAULT 'pending',
    assigned_to VARCHAR(255),
    due_date TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (workflow_instance_id) REFERENCES cmc_workflow_instances(id) ON DELETE CASCADE
);

-- CMC Checklist Instances
CREATE TABLE IF NOT EXISTS cmc_checklist_instances (
    id VARCHAR(255) PRIMARY KEY,
    template_id VARCHAR(255) NOT NULL,
    organization_id INTEGER NOT NULL,
    project_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    progress INTEGER DEFAULT 0,
    items_completed INTEGER DEFAULT 0,
    total_items INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

-- CMC Checklist Items
CREATE TABLE IF NOT EXISTS cmc_checklist_items (
    id VARCHAR(255) PRIMARY KEY,
    checklist_instance_id VARCHAR(255) NOT NULL,
    item_text TEXT NOT NULL,
    item_order INTEGER NOT NULL,
    is_completed BOOLEAN DEFAULT FALSE,
    completed_by VARCHAR(255),
    completed_at TIMESTAMP,
    notes TEXT,
    evidence_files JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (checklist_instance_id) REFERENCES cmc_checklist_instances(id) ON DELETE CASCADE
);

-- CMC AI Tool Executions
CREATE TABLE IF NOT EXISTS cmc_ai_tool_executions (
    id VARCHAR(255) PRIMARY KEY,
    organization_id INTEGER NOT NULL,
    command VARCHAR(255) NOT NULL,
    drug_name VARCHAR(255),
    context JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'pending',
    result JSONB,
    execution_time_seconds INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

-- CMC Workflows (Base Templates)
CREATE TABLE IF NOT EXISTS cmc_workflows (
    id VARCHAR(255) PRIMARY KEY,
    organization_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    estimated_time VARCHAR(100),
    total_tasks INTEGER DEFAULT 0,
    priority VARCHAR(50) DEFAULT 'medium',
    template_data JSONB DEFAULT '{}',
    is_template BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

-- CMC Guideline Access Log
CREATE TABLE IF NOT EXISTS cmc_guideline_access (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL,
    guideline_id VARCHAR(255) NOT NULL,
    guideline_name VARCHAR(255) NOT NULL,
    accessed_by VARCHAR(255),
    access_type VARCHAR(50) DEFAULT 'view',
    accessed_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cmc_workflow_instances_org_id ON cmc_workflow_instances(organization_id);
CREATE INDEX IF NOT EXISTS idx_cmc_workflow_tasks_workflow_id ON cmc_workflow_tasks(workflow_instance_id);
CREATE INDEX IF NOT EXISTS idx_cmc_checklist_instances_org_id ON cmc_checklist_instances(organization_id);
CREATE INDEX IF NOT EXISTS idx_cmc_checklist_items_checklist_id ON cmc_checklist_items(checklist_instance_id);
CREATE INDEX IF NOT EXISTS idx_cmc_ai_executions_org_id ON cmc_ai_tool_executions(organization_id);
CREATE INDEX IF NOT EXISTS idx_cmc_workflows_org_id ON cmc_workflows(organization_id);
CREATE INDEX IF NOT EXISTS idx_cmc_guideline_access_org_id ON cmc_guideline_access(organization_id);

-- Insert default workflow templates
INSERT INTO cmc_workflows (id, organization_id, name, description, category, estimated_time, total_tasks, priority, template_data) VALUES
('ind-cmc-template', 0, 'IND CMC Package', 'Complete Chemistry, Manufacturing, and Controls package for IND submission', 'submission', '4-6 weeks', 6, 'high', '{"steps": ["Drug Substance Characterization", "Manufacturing Process", "Container Closure", "Stability Protocol", "Analytical Methods", "Quality Specifications"]}'),
('nda-cmc-template', 0, 'NDA/BLA CMC Module 3', 'Comprehensive Module 3 Quality section for NDA/BLA submission', 'submission', '12-16 weeks', 24, 'critical', '{"steps": ["3.2.S Drug Substance", "3.2.P Drug Product", "3.2.A Appendices", "Regional Requirements"]}'),
('annual-product-review-template', 0, 'Annual Product Review (APR)', 'EU Annual Product Review for marketing authorization maintenance', 'post-market', '6-8 weeks', 15, 'high', '{"steps": ["Quality Review", "Non-clinical Review", "Clinical Review", "Risk Assessment", "Benefit-Risk Analysis"]}'),
('method-validation-template', 0, 'Analytical Method Validation', 'ICH Q2(R1) compliant analytical method validation protocol', 'analytical', '3-4 weeks', 8, 'high', '{"steps": ["Specificity", "Linearity", "Accuracy", "Precision", "Detection Limit", "Quantitation Limit", "Robustness", "System Suitability"]}'),
('qbd-development-template', 0, 'Quality by Design Development', 'ICH Q8/Q9/Q10 QbD approach for pharmaceutical development', 'development', '6-8 weeks', 12, 'high', '{"steps": ["QTPP Definition", "CQA Identification", "Risk Assessment", "DOE Studies", "Control Strategy", "Lifecycle Management"]}'),
('change-control-template', 0, 'Post-Approval Change Control', 'ICH Q12 compliant change control and variation management', 'change-control', '4-8 weeks', 10, 'high', '{"steps": ["Change Classification", "Risk Assessment", "Impact Analysis", "Validation Studies", "Regulatory Filing", "Implementation"]}'),
('tech-transfer-template', 0, 'Technology Transfer', 'Manufacturing site technology transfer and qualification', 'manufacturing', '8-12 weeks', 18, 'critical', '{"steps": ["Transfer Protocol", "Process Qualification", "Method Transfer", "Validation Studies", "Site Assessment", "Documentation"]}'),
('comparability-template', 0, 'Comparability Assessment', 'Pre and post-change comparability studies for manufacturing changes', 'assessment', '6-10 weeks', 14, 'high', '{"steps": ["Comparability Protocol", "Quality Testing", "Impurity Profiling", "Dissolution Studies", "Stability Assessment", "Statistical Analysis"]}'),
('dissolution-dev-template', 0, 'Dissolution Method Development', 'Biorelevant dissolution method development and validation', 'analytical', '4-6 weeks', 12, 'medium', '{"steps": ["Medium Selection", "Apparatus Selection", "Condition Optimization", "Method Validation", "IVIVC Assessment", "Documentation"]}'),
('cleaning-validation-template', 0, 'Cleaning Validation', 'Multi-product facility cleaning validation and verification', 'validation', '3-5 weeks', 9, 'medium', '{"steps": ["Cleaning Procedure", "Acceptance Criteria", "Analytical Methods", "Worst-case Selection", "Validation Studies", "Documentation"]}'),
('process-validation-template', 0, 'Process Validation', 'Stage 2 process performance qualification per FDA guidance', 'validation', '8-12 weeks', 16, 'critical', '{"steps": ["Validation Protocol", "Batch Manufacturing", "IPCs Monitoring", "Quality Testing", "Statistical Analysis", "Final Report"]}'),
('stability-supplement-template', 0, 'Stability Data Supplement', 'Comprehensive stability data analysis and shelf-life justification', 'stability', '2-3 weeks', 5, 'medium', '{"steps": ["Study Design Review", "Data Analysis", "Statistical Evaluation", "Shelf-life Justification", "Report Generation"]}')
ON CONFLICT (id) DO NOTHING;