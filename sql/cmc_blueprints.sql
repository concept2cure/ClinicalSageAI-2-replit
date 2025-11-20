-- TrialSage AI-CMC Blueprint Generator Schema

-- CMC Blueprint Templates
CREATE TABLE IF NOT EXISTS cmc_blueprint_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50) DEFAULT 'file-text',
  region VARCHAR(50) NOT NULL,  -- FDA, EMA, PMDA, NMPA, etc.
  category VARCHAR(50) NOT NULL, -- Drug Substance, Drug Product, etc.
  template_version VARCHAR(20) NOT NULL,
  structure JSONB NOT NULL,      -- Hierarchical structure of sections and subsections
  default_content JSONB,         -- Default content templates for sections
  metadata JSONB,                -- Additional metadata
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID
);

-- User-Generated CMC Blueprints
CREATE TABLE IF NOT EXISTS cmc_blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  template_id UUID REFERENCES cmc_blueprint_templates(id),
  project_id UUID, -- Reference to the project this blueprint is associated with
  tenant_id UUID NOT NULL,
  product_name VARCHAR(100),
  structure JSONB NOT NULL,      -- Customized structure based on template
  content JSONB,                 -- Content for each section
  status VARCHAR(50) DEFAULT 'DRAFT',
  version VARCHAR(20) DEFAULT '1.0',
  is_locked BOOLEAN DEFAULT FALSE,
  locked_by UUID,
  locked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID,
  updated_by UUID
);

-- CMC Section Library (Reusable content snippets)
CREATE TABLE IF NOT EXISTS cmc_section_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL,
  subcategory VARCHAR(50),
  content TEXT NOT NULL,
  keywords TEXT[],
  approval_status VARCHAR(20) DEFAULT 'APPROVED',
  tenant_id UUID,  -- NULL means global/system template
  is_public BOOLEAN DEFAULT FALSE,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID
);

-- CMC AI Generation Settings
CREATE TABLE IF NOT EXISTS cmc_ai_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  model_name VARCHAR(50) DEFAULT 'gpt-4o',
  temperature DECIMAL(3,2) DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 2000,
  custom_instructions TEXT,
  content_style VARCHAR(20) DEFAULT 'FORMAL',
  citations_required BOOLEAN DEFAULT TRUE,
  reference_templates JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID
);

-- CMC Revision History
CREATE TABLE IF NOT EXISTS cmc_blueprint_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id UUID NOT NULL REFERENCES cmc_blueprints(id),
  version VARCHAR(20) NOT NULL,
  revision_number INTEGER NOT NULL,
  changes_summary TEXT,
  content JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID
);

-- CMC Generation Prompts Templates
CREATE TABLE IF NOT EXISTS cmc_prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  section_type VARCHAR(50) NOT NULL,
  prompt_template TEXT NOT NULL,
  system_prompt TEXT,
  example_output TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID
);

-- CMC Generation Log
CREATE TABLE IF NOT EXISTS cmc_generation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id UUID NOT NULL REFERENCES cmc_blueprints(id),
  section_path TEXT NOT NULL,  -- JSON path to the section in the structure
  prompt TEXT NOT NULL,
  generated_content TEXT NOT NULL,
  model_used VARCHAR(50) NOT NULL,
  tokens_used INTEGER,
  rating INTEGER,  -- User rating of generation 1-5
  feedback TEXT,   -- User feedback on generation
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_cmc_blueprints_template ON cmc_blueprints(template_id);
CREATE INDEX IF NOT EXISTS idx_cmc_blueprints_tenant ON cmc_blueprints(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cmc_blueprints_project ON cmc_blueprints(project_id);
CREATE INDEX IF NOT EXISTS idx_cmc_section_library_category ON cmc_section_library(category);
CREATE INDEX IF NOT EXISTS idx_cmc_section_library_tenant ON cmc_section_library(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cmc_blueprint_revisions_blueprint ON cmc_blueprint_revisions(blueprint_id);
CREATE INDEX IF NOT EXISTS idx_cmc_generation_log_blueprint ON cmc_generation_log(blueprint_id);
CREATE INDEX IF NOT EXISTS idx_cmc_prompt_templates_section_type ON cmc_prompt_templates(section_type);

-- Insert some default template categories
INSERT INTO cmc_blueprint_templates (name, description, icon, region, category, template_version, structure, default_content, metadata) 
VALUES 
  ('CTD 3.2.S - Drug Substance for Small Molecules', 'Complete blueprint for CTD section 3.2.S for small molecule APIs', 'flask', 'FDA', 'Drug Substance', '1.0',
   '{
     "sections": [
       {
         "id": "3.2.S",
         "title": "Drug Substance",
         "subsections": [
           {
             "id": "3.2.S.1",
             "title": "General Information",
             "subsections": [
               {"id": "3.2.S.1.1", "title": "Nomenclature"},
               {"id": "3.2.S.1.2", "title": "Structure"},
               {"id": "3.2.S.1.3", "title": "General Properties"}
             ]
           },
           {
             "id": "3.2.S.2",
             "title": "Manufacture",
             "subsections": [
               {"id": "3.2.S.2.1", "title": "Manufacturer(s)"},
               {"id": "3.2.S.2.2", "title": "Description of Manufacturing Process and Process Controls"},
               {"id": "3.2.S.2.3", "title": "Control of Materials"},
               {"id": "3.2.S.2.4", "title": "Controls of Critical Steps and Intermediates"},
               {"id": "3.2.S.2.5", "title": "Process Validation and/or Evaluation"},
               {"id": "3.2.S.2.6", "title": "Manufacturing Process Development"}
             ]
           },
           {
             "id": "3.2.S.3",
             "title": "Characterisation",
             "subsections": [
               {"id": "3.2.S.3.1", "title": "Elucidation of Structure and other Characteristics"},
               {"id": "3.2.S.3.2", "title": "Impurities"}
             ]
           },
           {
             "id": "3.2.S.4",
             "title": "Control of Drug Substance",
             "subsections": [
               {"id": "3.2.S.4.1", "title": "Specification"},
               {"id": "3.2.S.4.2", "title": "Analytical Procedures"},
               {"id": "3.2.S.4.3", "title": "Validation of Analytical Procedures"},
               {"id": "3.2.S.4.4", "title": "Batch Analyses"},
               {"id": "3.2.S.4.5", "title": "Justification of Specification"}
             ]
           },
           {
             "id": "3.2.S.5",
             "title": "Reference Standards or Materials"
           },
           {
             "id": "3.2.S.6",
             "title": "Container Closure System"
           },
           {
             "id": "3.2.S.7",
             "title": "Stability",
             "subsections": [
               {"id": "3.2.S.7.1", "title": "Stability Summary and Conclusions"},
               {"id": "3.2.S.7.2", "title": "Post-approval Stability Protocol and Stability Commitment"},
               {"id": "3.2.S.7.3", "title": "Stability Data"}
             ]
           }
         ]
       }
     ]
   }',
   '{
     "3.2.S.1.1": {
       "template": "The chemical name of [PRODUCT_NAME] is [CHEMICAL_NAME]. The compound is also known as [SYNONYMS]. The CAS registry number is [CAS_NUMBER]."
     },
     "3.2.S.1.2": {
       "template": "The structural formula of [PRODUCT_NAME] is as follows: [STRUCTURAL_FORMULA]. The molecular formula is [MOLECULAR_FORMULA] with a molecular weight of [MOLECULAR_WEIGHT] g/mol."
     }
   }',
   '{"api_type": "small_molecule", "complexity_level": "standard"}'
  ),
  
  ('CTD 3.2.P - Drug Product for Oral Solid Dosage', 'Complete blueprint for CTD section 3.2.P for tablets and capsules', 'pill', 'FDA', 'Drug Product', '1.0',
   '{
     "sections": [
       {
         "id": "3.2.P",
         "title": "Drug Product",
         "subsections": [
           {
             "id": "3.2.P.1",
             "title": "Description and Composition of the Drug Product"
           },
           {
             "id": "3.2.P.2",
             "title": "Pharmaceutical Development",
             "subsections": [
               {"id": "3.2.P.2.1", "title": "Components of the Drug Product"},
               {"id": "3.2.P.2.2", "title": "Drug Product"},
               {"id": "3.2.P.2.3", "title": "Manufacturing Process Development"},
               {"id": "3.2.P.2.4", "title": "Container Closure System"},
               {"id": "3.2.P.2.5", "title": "Microbiological Attributes"},
               {"id": "3.2.P.2.6", "title": "Compatibility"}
             ]
           },
           {
             "id": "3.2.P.3",
             "title": "Manufacture",
             "subsections": [
               {"id": "3.2.P.3.1", "title": "Manufacturer(s)"},
               {"id": "3.2.P.3.2", "title": "Batch Formula"},
               {"id": "3.2.P.3.3", "title": "Description of Manufacturing Process and Process Controls"},
               {"id": "3.2.P.3.4", "title": "Controls of Critical Steps and Intermediates"},
               {"id": "3.2.P.3.5", "title": "Process Validation and/or Evaluation"}
             ]
           },
           {
             "id": "3.2.P.4",
             "title": "Control of Excipients",
             "subsections": [
               {"id": "3.2.P.4.1", "title": "Specifications"},
               {"id": "3.2.P.4.2", "title": "Analytical Procedures"},
               {"id": "3.2.P.4.3", "title": "Validation of Analytical Procedures"},
               {"id": "3.2.P.4.4", "title": "Justification of Specifications"},
               {"id": "3.2.P.4.5", "title": "Excipients of Human or Animal Origin"},
               {"id": "3.2.P.4.6", "title": "Novel Excipients"}
             ]
           },
           {
             "id": "3.2.P.5",
             "title": "Control of Drug Product",
             "subsections": [
               {"id": "3.2.P.5.1", "title": "Specification(s)"},
               {"id": "3.2.P.5.2", "title": "Analytical Procedures"},
               {"id": "3.2.P.5.3", "title": "Validation of Analytical Procedures"},
               {"id": "3.2.P.5.4", "title": "Batch Analyses"},
               {"id": "3.2.P.5.5", "title": "Characterisation of Impurities"},
               {"id": "3.2.P.5.6", "title": "Justification of Specification(s)"}
             ]
           },
           {
             "id": "3.2.P.6",
             "title": "Reference Standards or Materials"
           },
           {
             "id": "3.2.P.7",
             "title": "Container Closure System"
           },
           {
             "id": "3.2.P.8",
             "title": "Stability",
             "subsections": [
               {"id": "3.2.P.8.1", "title": "Stability Summary and Conclusion"},
               {"id": "3.2.P.8.2", "title": "Post-approval Stability Protocol and Stability Commitment"},
               {"id": "3.2.P.8.3", "title": "Stability Data"}
             ]
           }
         ]
       }
     ]
   }',
   '{
     "3.2.P.1": {
       "template": "[PRODUCT_NAME] is available as [DOSAGE_FORM] containing [STRENGTH] of [ACTIVE_INGREDIENT]. The product is [DESCRIPTION_OF_APPEARANCE]. The complete list of ingredients includes: [LIST_OF_INGREDIENTS]."
     },
     "3.2.P.3.2": {
       "template": "The batch formula for [PRODUCT_NAME] [DOSAGE_FORM] is presented in Table X. The batch size is [BATCH_SIZE]."
     }
   }',
   '{"dosage_form": "tablet", "route_of_administration": "oral"}'
  ),
  
  ('CTD 3.2.A - Adventitious Agents Safety Evaluation', 'Blueprint for documenting adventitious agents safety for biological products', 'shield', 'FDA', 'Appendices', '1.0',
   '{
     "sections": [
       {
         "id": "3.2.A.2",
         "title": "Adventitious Agents Safety Evaluation",
         "subsections": [
           {
             "id": "3.2.A.2.1",
             "title": "Materials of Biological Origin"
           },
           {
             "id": "3.2.A.2.2",
             "title": "Testing at Appropriate Stages of Production"
           },
           {
             "id": "3.2.A.2.3",
             "title": "Viral Safety Evaluation"
           },
           {
             "id": "3.2.A.2.4",
             "title": "TSE Agent Safety Evaluation"
           }
         ]
       }
     ]
   }',
   '{
     "3.2.A.2.1": {
       "template": "This section provides information on materials of biological origin used in the production of [PRODUCT_NAME]. The following materials of biological origin are used: [LIST_OF_MATERIALS]."
     }
   }',
   '{"product_type": "biological", "safety_concern": "viral_contamination"}'
  );

-- Insert some default prompt templates
INSERT INTO cmc_prompt_templates (name, description, section_type, prompt_template, system_prompt, example_output)
VALUES
  ('Drug Substance Manufacturer', 'Template for generating 3.2.S.2.1 Manufacturer(s) section', '3.2.S.2.1',
   'Please generate a comprehensive 3.2.S.2.1 Manufacturer(s) section for a CTD submission of {{product_name}}. The API is manufactured by {{manufacturer_name}} located at {{manufacturer_address}}. Include appropriate introductory text and table formatting for presenting the manufacturing sites. The manufacturing process includes {{manufacturing_steps}}.',
   'You are an expert regulatory writer specializing in creating Chemistry, Manufacturing, and Controls (CMC) documentation for pharmaceutical regulatory submissions. Ensure all content is compliant with ICH M4Q guidelines and follows a professional, formal tone appropriate for regulatory submissions.',
   'The drug substance {{product_name}} is manufactured by {{manufacturer_name}}. The name and address of the manufacturing facility is provided in Table 3.2.S.2.1-1.\n\nTable 3.2.S.2.1-1: Manufacturer of {{product_name}}\nManufacturer Name: {{manufacturer_name}}\nAddress: {{manufacturer_address}}\nResponsibility: Manufacture, testing, and release of drug substance\n\nThe manufacturing process includes {{manufacturing_steps}} steps which are performed at this facility.'
  ),
  
  ('Specification Table Generator', 'Template for generating specification tables for APIs', 'specification_table',
   'Create a comprehensive specification table for {{product_name}} based on the following test parameters and acceptance criteria: {{test_parameters}}. Format this as a properly structured table suitable for inclusion in section 3.2.S.4.1 of a CTD submission.',
   'You are an expert regulatory writer specializing in creating Chemistry, Manufacturing, and Controls (CMC) documentation for pharmaceutical regulatory submissions. Focus on creating clear, well-structured tables that present analytical specifications in accordance with ICH guidelines.',
   'Table 3.2.S.4.1-1: Specification for {{product_name}}\n\nTest | Analytical Procedure | Acceptance Criteria\n-----|---------------------|--------------------\nAppearance | Visual inspection | White to off-white powder\npH | USP <791> | 5.5 - 7.5\nIdentification | HPLC | Retention time corresponds to reference standard\nAssay | HPLC | 98.0% - 102.0%\nRelated Substances | HPLC | Any individual impurity: Not more than 0.2%\nTotal impurities: Not more than 0.5%\nResidual Solvents | GC | Methanol: Not more than 3000 ppm\nWater Content | Karl Fischer | Not more than 0.5%'
  ),
  
  ('Stability Summary', 'Template for generating stability summary and conclusions', '3.2.S.7.1',
   'Generate a stability summary and conclusion section for {{product_name}} based on the following stability data: {{stability_data}}. Include appropriate summary of long-term, accelerated, and stress testing results. The recommended storage conditions are {{storage_conditions}} and the proposed retest period is {{retest_period}}.',
   'You are an expert regulatory writer specializing in creating Chemistry, Manufacturing, and Controls (CMC) documentation for pharmaceutical regulatory submissions. Ensure the stability summary complies with ICH Q1A(R2) guidelines and presents a clear scientific justification for the proposed retest period.',
   'The stability of {{product_name}} has been evaluated under ICH-defined long-term, accelerated, and stress conditions. Results from these studies are used to establish the retest period and recommended storage conditions.\n\n**Summary of Stability Studies**\n\nLong-term stability studies were conducted at 25°C ± 2°C/60% RH ± 5% RH for up to 36 months. Accelerated stability studies were conducted at 40°C ± 2°C/75% RH ± 5% RH for 6 months. All tested batches remained within the specified acceptance criteria for all tested parameters throughout the stability studies.\n\n**Conclusions**\n\nBased on the available stability data, {{product_name}} is stable under the recommended storage conditions of {{storage_conditions}}. A retest period of {{retest_period}} is proposed when the drug substance is stored in the proposed container closure system under the recommended storage conditions.'
  );

-- Create functions for revision tracking
CREATE OR REPLACE FUNCTION create_cmc_blueprint_revision()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO cmc_blueprint_revisions (
    blueprint_id,
    version,
    revision_number,
    changes_summary,
    content,
    created_by
  ) VALUES (
    NEW.id,
    NEW.version,
    (SELECT COALESCE(MAX(revision_number), 0) + 1 FROM cmc_blueprint_revisions WHERE blueprint_id = NEW.id),
    'Update to blueprint',
    NEW.content,
    NEW.updated_by
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER trg_cmc_blueprint_revision
AFTER UPDATE OF content, structure ON cmc_blueprints
FOR EACH ROW
EXECUTE FUNCTION create_cmc_blueprint_revision();