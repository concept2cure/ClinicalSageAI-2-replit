-- =============================================================================
-- Migration 060: GCC GLSOS Architecture Enhancements
-- =============================================================================
-- Purpose: Fill gaps from GLSOS Unified Architecture spec
-- - Granular product types (Device Class I/II/III)
-- - Regulatory Domain routing (CDER, CDRH, CBER)
-- - Submission Format enum (eCTD v4, eSTAR, RPS)
-- - Product Lifecycle Status
-- - FHIR → eCTD Node linking
-- - Federation routing infrastructure
-- - Type-specific JSONB validators
-- =============================================================================
-- NO MOCKS. NO STUBS. PRODUCTION-GRADE ONLY.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. GRANULAR PRODUCT TYPE ENUM
-- =============================================================================
-- More specific than ProductCategory - determines validation rules

CREATE TYPE product_master.product_type_granular AS ENUM (
    -- Small Molecules (CDER)
    'SMALL_MOLECULE_NME',           -- New Molecular Entity
    'SMALL_MOLECULE_GENERIC',       -- ANDA pathway
    'SMALL_MOLECULE_OTC',           -- Over-the-counter
    
    -- Biologics (CBER/CDER)
    'BIOLOGIC_THERAPEUTIC',         -- mAbs, proteins
    'BIOLOGIC_VACCINE',             -- Preventive vaccines
    'BIOLOGIC_BLOOD_PRODUCT',       -- Plasma derivatives
    'BIOLOGIC_GENE_THERAPY',        -- AAV vectors, etc.
    'BIOLOGIC_CELL_THERAPY',        -- CAR-T, stem cells
    'BIOSIMILAR',                   -- 351(k) pathway
    
    -- Medical Devices (CDRH)
    'DEVICE_CLASS_I',               -- Exempt or 510(k) exempt
    'DEVICE_CLASS_II',              -- 510(k) required
    'DEVICE_CLASS_III',             -- PMA required
    'DEVICE_DE_NOVO',               -- Novel low-moderate risk
    
    -- In Vitro Diagnostics (CDRH/CBER)
    'IVD_CLASS_A',                  -- EU IVDR low risk
    'IVD_CLASS_B',                  -- EU IVDR moderate risk
    'IVD_CLASS_C',                  -- EU IVDR high risk
    'IVD_CLASS_D',                  -- EU IVDR highest risk
    'IVD_CLIA_WAIVED',              -- US simple tests
    'IVD_CLIA_MODERATE',            -- US moderate complexity
    'IVD_CLIA_HIGH',                -- US high complexity
    
    -- Combination Products (OCP)
    'COMBINATION_DRUG_DEVICE',      -- Drug primary mode
    'COMBINATION_DEVICE_DRUG',      -- Device primary mode
    'COMBINATION_BIOLOGIC_DEVICE',  -- Biologic primary mode
    
    -- Software (CDRH)
    'SAMD_CLASS_I',                 -- Software as Medical Device
    'SAMD_CLASS_II',
    'SAMD_CLASS_III',
    'DIGITAL_THERAPEUTIC'           -- DTx (may be device or drug)
);

COMMENT ON TYPE product_master.product_type_granular IS 
'Granular product classification determining regulatory pathway and validation rules';

-- =============================================================================
-- 2. REGULATORY DOMAIN ENUM (FDA Center / EU Body Routing)
-- =============================================================================

CREATE TYPE product_master.regulatory_domain AS ENUM (
    -- FDA Centers
    'CDER',                         -- Center for Drug Evaluation and Research
    'CBER',                         -- Center for Biologics Evaluation and Research
    'CDRH',                         -- Center for Devices and Radiological Health
    'OCP',                          -- Office of Combination Products
    'CVM',                          -- Center for Veterinary Medicine
    'CFSAN',                        -- Center for Food Safety (cosmetics)
    
    -- EMA Committees
    'EMA_CHMP',                     -- Committee for Medicinal Products for Human Use
    'EMA_CVMP',                     -- Committee for Medicinal Products for Veterinary Use
    'EMA_CAT',                      -- Committee for Advanced Therapies
    'EMA_PRAC',                     -- Pharmacovigilance Risk Assessment Committee
    
    -- EU Device Bodies
    'EU_NOTIFIED_BODY',             -- MDR/IVDR review
    'EU_EUDAMED',                   -- Device registration database
    
    -- Japan
    'PMDA_DRUGS',                   -- Pharmaceuticals
    'PMDA_DEVICES',                 -- Medical devices
    
    -- Other
    'HEALTH_CANADA',
    'TGA_AUSTRALIA',
    'ANVISA_BRAZIL',
    'NMPA_CHINA'
);

COMMENT ON TYPE product_master.regulatory_domain IS 
'Regulatory body/center that reviews submissions for this product type';

-- =============================================================================
-- 3. SUBMISSION FORMAT ENUM
-- =============================================================================

CREATE TYPE ectd_v4.submission_format AS ENUM (
    -- Electronic CTD
    'ECTD_V3_2_2',                  -- Legacy XML backbone
    'ECTD_V4_0',                    -- HL7 RPS backbone
    
    -- Medical Device Formats
    'ESTAR_510K',                   -- FDA eSTAR for 510(k)
    'ESTAR_PMA',                    -- FDA eSTAR for PMA
    'ESTAR_DE_NOVO',                -- FDA eSTAR for De Novo
    'EUDAMED_XML',                  -- EU EUDAMED bulk upload
    'STED',                         -- Summary Technical Documentation
    
    -- Structured Data
    'FHIR_PQ_CMC',                  -- HL7 FHIR for Quality
    'FHIR_SPL',                     -- Structured Product Labeling
    'HL7_RPS',                      -- HL7 Regulated Product Submission
    
    -- Legacy/Other
    'NON_ECTD_PDF',                 -- Paper-on-Glass
    'PAPER'                         -- Physical submission
);

COMMENT ON TYPE ectd_v4.submission_format IS 
'Technical format of the regulatory submission package';

-- =============================================================================
-- 4. PRODUCT LIFECYCLE STATUS ENUM
-- =============================================================================

CREATE TYPE product_master.product_lifecycle_status AS ENUM (
    -- Pre-Market
    'CONCEPT',                      -- Early ideation
    'DISCOVERY',                    -- Target identification
    'PRECLINICAL',                  -- Animal studies
    'IND_FILED',                    -- IND/IMPD submitted
    'CLINICAL_PHASE_1',
    'CLINICAL_PHASE_2',
    'CLINICAL_PHASE_3',
    'CLINICAL_COMPLETE',            -- All trials done
    
    -- Regulatory Review
    'NDA_BLA_FILED',                -- Under FDA review
    'MAA_FILED',                    -- Under EMA review
    '510K_FILED',                   -- Device under review
    'PMA_FILED',
    'REVIEW_COMPLETE',
    
    -- Post-Market
    'APPROVED',                     -- Authorization granted
    'MARKETED',                     -- Commercially available
    'LIFECYCLE_MANAGEMENT',         -- Line extensions, sNDAs
    
    -- Withdrawal/End
    'SUSPENDED',                    -- Temporary market suspension
    'WITHDRAWN_SAFETY',             -- Safety-related withdrawal
    'WITHDRAWN_COMMERCIAL',         -- Business decision
    'DISCONTINUED',                 -- No longer manufactured
    'SUNSET'                        -- End of life
);

COMMENT ON TYPE product_master.product_lifecycle_status IS 
'Current status in product lifecycle from discovery to market withdrawal';

-- =============================================================================
-- 5. ENHANCE PRODUCTS TABLE
-- =============================================================================

ALTER TABLE product_master.products
    ADD COLUMN IF NOT EXISTS product_type_granular product_master.product_type_granular,
    ADD COLUMN IF NOT EXISTS regulatory_domain product_master.regulatory_domain,
    ADD COLUMN IF NOT EXISTS lifecycle_status product_master.product_lifecycle_status DEFAULT 'CONCEPT',
    ADD COLUMN IF NOT EXISTS lead_center TEXT,              -- Primary FDA center if OCP
    ADD COLUMN IF NOT EXISTS requires_clinical_trials BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS estimated_approval_date DATE,
    ADD COLUMN IF NOT EXISTS actual_approval_date DATE,
    ADD COLUMN IF NOT EXISTS first_market_date DATE,
    ADD COLUMN IF NOT EXISTS patent_expiry_date DATE;

-- Index for lifecycle queries
CREATE INDEX IF NOT EXISTS idx_products_lifecycle 
    ON product_master.products(lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_products_regulatory_domain 
    ON product_master.products(regulatory_domain);
CREATE INDEX IF NOT EXISTS idx_products_type_granular 
    ON product_master.products(product_type_granular);

COMMENT ON COLUMN product_master.products.product_type_granular IS 
'Granular classification determining validation rules and regulatory pathway';
COMMENT ON COLUMN product_master.products.regulatory_domain IS 
'Primary regulatory body/center for this product';
COMMENT ON COLUMN product_master.products.lifecycle_status IS 
'Current stage in product lifecycle';

-- =============================================================================
-- 6. ENHANCE REGULATORY_SUBMISSIONS TABLE
-- =============================================================================

ALTER TABLE ectd_v4.regulatory_submissions
    ADD COLUMN IF NOT EXISTS submission_format ectd_v4.submission_format DEFAULT 'ECTD_V4_0',
    ADD COLUMN IF NOT EXISTS is_fhir_enabled BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS kasa_eligible BOOLEAN DEFAULT FALSE,         -- FDA KASA program
    ADD COLUMN IF NOT EXISTS primary_contact_id UUID,
    ADD COLUMN IF NOT EXISTS regulatory_agent_id UUID,                    -- US Agent for foreign sponsors
    ADD COLUMN IF NOT EXISTS estimated_review_months INT,
    ADD COLUMN IF NOT EXISTS pdufa_goal_date DATE,                        -- User fee deadline
    ADD COLUMN IF NOT EXISTS mdufa_goal_date DATE;                        -- Device user fee deadline

CREATE INDEX IF NOT EXISTS idx_submissions_format 
    ON ectd_v4.regulatory_submissions(submission_format);
CREATE INDEX IF NOT EXISTS idx_submissions_kasa 
    ON ectd_v4.regulatory_submissions(kasa_eligible) WHERE kasa_eligible = TRUE;

COMMENT ON COLUMN ectd_v4.regulatory_submissions.submission_format IS 
'Technical format: eCTD v4.0, eSTAR, FHIR, etc.';
COMMENT ON COLUMN ectd_v4.regulatory_submissions.kasa_eligible IS 
'TRUE if submission qualifies for FDA Knowledge-Aided Assessment program';

-- =============================================================================
-- 7. ENHANCE FHIR RESOURCES - LINK TO ECTD NODES
-- =============================================================================

ALTER TABLE fhir.resources
    ADD COLUMN IF NOT EXISTS linked_cou_id UUID 
        REFERENCES ectd_v4.context_of_use_elements(id),
    ADD COLUMN IF NOT EXISTS is_primary_source BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS generates_pdf BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS pdf_template_id TEXT;

CREATE INDEX IF NOT EXISTS idx_fhir_linked_cou 
    ON fhir.resources(linked_cou_id) WHERE linked_cou_id IS NOT NULL;

COMMENT ON COLUMN fhir.resources.linked_cou_id IS 
'Links FHIR resource to specific eCTD Context of Use element (dual-publishing)';
COMMENT ON COLUMN fhir.resources.is_primary_source IS 
'TRUE if FHIR is source of truth; FALSE if derived from document';
COMMENT ON COLUMN fhir.resources.generates_pdf IS 
'TRUE if system should auto-generate PDF from this FHIR resource';

-- =============================================================================
-- 8. ENHANCE ORGANIZATIONS - FEDERATION ROUTING
-- =============================================================================

ALTER TABLE identity.organizations
    ADD COLUMN IF NOT EXISTS home_region TEXT DEFAULT 'US' 
        CHECK (home_region IN ('US', 'EU', 'JP', 'CN', 'APAC', 'LATAM', 'MEA')),
    ADD COLUMN IF NOT EXISTS routing_priority TEXT[] DEFAULT ARRAY['US'],
    ADD COLUMN IF NOT EXISTS requires_local_agent BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS local_agent_org_id UUID REFERENCES identity.organizations(id),
    ADD COLUMN IF NOT EXISTS data_processing_agreement_date DATE,
    ADD COLUMN IF NOT EXISTS gdpr_compliant BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS hipaa_compliant BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN identity.organizations.home_region IS 
'Primary data residency region for federation routing';
COMMENT ON COLUMN identity.organizations.routing_priority IS 
'Ordered list of regions for read replica routing';
COMMENT ON COLUMN identity.organizations.local_agent_org_id IS 
'US Agent or EU Authorized Representative organization';

-- =============================================================================
-- 9. JSONB VALIDATION FUNCTIONS (Type-Specific)
-- =============================================================================

-- Validate IDMP structure for pharmaceutical products
CREATE OR REPLACE FUNCTION product_master.validate_idmp_variant(
    p_domain_attributes JSONB,
    p_product_type product_master.product_type_granular
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_errors JSONB := '[]'::JSONB;
BEGIN
    -- Only validate for pharma types
    IF p_product_type NOT IN (
        'SMALL_MOLECULE_NME', 'SMALL_MOLECULE_GENERIC', 'SMALL_MOLECULE_OTC',
        'BIOLOGIC_THERAPEUTIC', 'BIOLOGIC_VACCINE', 'BIOSIMILAR'
    ) THEN
        RETURN jsonb_build_object('valid', TRUE, 'errors', v_errors);
    END IF;
    
    -- Required IDMP fields (ISO 11615/11616)
    IF NOT (p_domain_attributes ? 'dosage_form') THEN
        v_errors := v_errors || jsonb_build_object(
            'field', 'dosage_form',
            'message', 'ISO 11239 Dosage Form is required for pharmaceutical products'
        );
    END IF;
    
    IF NOT (p_domain_attributes ? 'route_of_administration') THEN
        v_errors := v_errors || jsonb_build_object(
            'field', 'route_of_administration',
            'message', 'ISO 11239 Route of Administration is required'
        );
    END IF;
    
    IF NOT (p_domain_attributes ? 'strength') THEN
        v_errors := v_errors || jsonb_build_object(
            'field', 'strength',
            'message', 'ISO 11240 Strength is required'
        );
    END IF;
    
    RETURN jsonb_build_object(
        'valid', jsonb_array_length(v_errors) = 0,
        'errors', v_errors
    );
END;
$$;

-- Validate UDI structure for medical devices
CREATE OR REPLACE FUNCTION product_master.validate_udi_variant(
    p_domain_attributes JSONB,
    p_product_type product_master.product_type_granular
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_errors JSONB := '[]'::JSONB;
BEGIN
    -- Only validate for device types
    IF p_product_type NOT IN (
        'DEVICE_CLASS_I', 'DEVICE_CLASS_II', 'DEVICE_CLASS_III', 'DEVICE_DE_NOVO',
        'IVD_CLASS_A', 'IVD_CLASS_B', 'IVD_CLASS_C', 'IVD_CLASS_D',
        'SAMD_CLASS_I', 'SAMD_CLASS_II', 'SAMD_CLASS_III'
    ) THEN
        RETURN jsonb_build_object('valid', TRUE, 'errors', v_errors);
    END IF;
    
    -- Required GUDID/EUDAMED fields
    IF NOT (p_domain_attributes ? 'device_description') THEN
        v_errors := v_errors || jsonb_build_object(
            'field', 'device_description',
            'message', 'Device Description is required for GUDID/EUDAMED'
        );
    END IF;
    
    IF NOT (p_domain_attributes ? 'gmdn_code') THEN
        v_errors := v_errors || jsonb_build_object(
            'field', 'gmdn_code',
            'message', 'GMDN Code is required for device classification'
        );
    END IF;
    
    -- Class II/III require clinical data flag
    IF p_product_type IN ('DEVICE_CLASS_II', 'DEVICE_CLASS_III') THEN
        IF NOT (p_domain_attributes ? 'clinical_data_required') THEN
            v_errors := v_errors || jsonb_build_object(
                'field', 'clinical_data_required',
                'message', 'Must specify if clinical data is required for Class II/III'
            );
        END IF;
    END IF;
    
    -- IVD-specific
    IF p_product_type LIKE 'IVD_%' THEN
        IF NOT (p_domain_attributes ? 'intended_purpose') THEN
            v_errors := v_errors || jsonb_build_object(
                'field', 'intended_purpose',
                'message', 'Intended Purpose is required for IVD products'
            );
        END IF;
        IF NOT (p_domain_attributes ? 'analytes') THEN
            v_errors := v_errors || jsonb_build_object(
                'field', 'analytes',
                'message', 'Analyte list is required for IVD products'
            );
        END IF;
    END IF;
    
    -- SaMD-specific
    IF p_product_type LIKE 'SAMD_%' THEN
        IF NOT (p_domain_attributes ? 'software_version') THEN
            v_errors := v_errors || jsonb_build_object(
                'field', 'software_version',
                'message', 'Software Version is required for SaMD products'
            );
        END IF;
        IF NOT (p_domain_attributes ? 'cybersecurity_controls') THEN
            v_errors := v_errors || jsonb_build_object(
                'field', 'cybersecurity_controls',
                'message', 'Cybersecurity Controls documentation is required'
            );
        END IF;
    END IF;
    
    RETURN jsonb_build_object(
        'valid', jsonb_array_length(v_errors) = 0,
        'errors', v_errors
    );
END;
$$;

-- Unified validation function
CREATE OR REPLACE FUNCTION product_master.validate_variant_attributes(
    p_variant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_product_type product_master.product_type_granular;
    v_domain_attributes JSONB;
    v_idmp_result JSONB;
    v_udi_result JSONB;
    v_all_errors JSONB := '[]'::JSONB;
BEGIN
    -- Get variant and product info
    SELECT p.product_type_granular, pv.domain_attributes
    INTO v_product_type, v_domain_attributes
    FROM product_master.product_variants pv
    JOIN product_master.products p ON p.id = pv.product_id
    WHERE pv.id = p_variant_id;
    
    IF v_product_type IS NULL THEN
        RETURN jsonb_build_object(
            'valid', FALSE,
            'errors', jsonb_build_array(
                jsonb_build_object('message', 'Product type not set - cannot validate')
            )
        );
    END IF;
    
    -- Run appropriate validators
    v_idmp_result := product_master.validate_idmp_variant(v_domain_attributes, v_product_type);
    v_udi_result := product_master.validate_udi_variant(v_domain_attributes, v_product_type);
    
    -- Combine errors
    IF NOT (v_idmp_result ->> 'valid')::BOOLEAN THEN
        v_all_errors := v_all_errors || (v_idmp_result -> 'errors');
    END IF;
    IF NOT (v_udi_result ->> 'valid')::BOOLEAN THEN
        v_all_errors := v_all_errors || (v_udi_result -> 'errors');
    END IF;
    
    RETURN jsonb_build_object(
        'valid', jsonb_array_length(v_all_errors) = 0,
        'product_type', v_product_type,
        'errors', v_all_errors
    );
END;
$$;

-- =============================================================================
-- 10. REGULATORY DOMAIN ROUTING FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION product_master.get_regulatory_domain(
    p_product_type product_master.product_type_granular
)
RETURNS product_master.regulatory_domain
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    RETURN CASE 
        -- CDER (Small Molecules, Some Biologics)
        WHEN p_product_type IN ('SMALL_MOLECULE_NME', 'SMALL_MOLECULE_GENERIC', 'SMALL_MOLECULE_OTC')
            THEN 'CDER'::product_master.regulatory_domain
        WHEN p_product_type IN ('BIOLOGIC_THERAPEUTIC', 'BIOSIMILAR')
            THEN 'CDER'::product_master.regulatory_domain  -- Most therapeutic biologics moved to CDER
            
        -- CBER (Vaccines, Blood, Gene/Cell Therapy)
        WHEN p_product_type IN ('BIOLOGIC_VACCINE', 'BIOLOGIC_BLOOD_PRODUCT', 'BIOLOGIC_GENE_THERAPY', 'BIOLOGIC_CELL_THERAPY')
            THEN 'CBER'::product_master.regulatory_domain
            
        -- CDRH (Devices, IVDs, SaMD)
        WHEN p_product_type IN ('DEVICE_CLASS_I', 'DEVICE_CLASS_II', 'DEVICE_CLASS_III', 'DEVICE_DE_NOVO')
            THEN 'CDRH'::product_master.regulatory_domain
        WHEN p_product_type LIKE 'IVD_%'
            THEN 'CDRH'::product_master.regulatory_domain
        WHEN p_product_type LIKE 'SAMD_%'
            THEN 'CDRH'::product_master.regulatory_domain
        WHEN p_product_type = 'DIGITAL_THERAPEUTIC'
            THEN 'CDRH'::product_master.regulatory_domain
            
        -- OCP (Combination Products)
        WHEN p_product_type LIKE 'COMBINATION_%'
            THEN 'OCP'::product_master.regulatory_domain
            
        ELSE 'CDER'::product_master.regulatory_domain  -- Default
    END;
END;
$$;

-- =============================================================================
-- 11. SUBMISSION FORMAT RECOMMENDATION FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION ectd_v4.recommend_submission_format(
    p_product_type product_master.product_type_granular,
    p_authority_id TEXT,
    p_application_type TEXT
)
RETURNS ectd_v4.submission_format
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    -- FDA Device Submissions → eSTAR
    IF p_authority_id = 'US_FDA' AND p_product_type IN (
        'DEVICE_CLASS_I', 'DEVICE_CLASS_II', 'DEVICE_CLASS_III', 'DEVICE_DE_NOVO',
        'IVD_CLIA_WAIVED', 'IVD_CLIA_MODERATE', 'IVD_CLIA_HIGH',
        'SAMD_CLASS_I', 'SAMD_CLASS_II', 'SAMD_CLASS_III'
    ) THEN
        RETURN CASE p_application_type
            WHEN '510K' THEN 'ESTAR_510K'::ectd_v4.submission_format
            WHEN 'PMA' THEN 'ESTAR_PMA'::ectd_v4.submission_format
            WHEN 'DE_NOVO' THEN 'ESTAR_DE_NOVO'::ectd_v4.submission_format
            ELSE 'ESTAR_510K'::ectd_v4.submission_format
        END;
    END IF;
    
    -- EU Device Submissions → EUDAMED
    IF p_authority_id IN ('EU_EMA', 'EU_NOTIFIED_BODY') AND p_product_type LIKE 'DEVICE_%' THEN
        RETURN 'EUDAMED_XML'::ectd_v4.submission_format;
    END IF;
    
    -- EU IVD → EUDAMED
    IF p_authority_id IN ('EU_EMA', 'EU_NOTIFIED_BODY') AND p_product_type LIKE 'IVD_CLASS_%' THEN
        RETURN 'EUDAMED_XML'::ectd_v4.submission_format;
    END IF;
    
    -- Pharma/Biologics → eCTD v4.0
    IF p_product_type IN (
        'SMALL_MOLECULE_NME', 'SMALL_MOLECULE_GENERIC', 'SMALL_MOLECULE_OTC',
        'BIOLOGIC_THERAPEUTIC', 'BIOLOGIC_VACCINE', 'BIOSIMILAR',
        'BIOLOGIC_GENE_THERAPY', 'BIOLOGIC_CELL_THERAPY'
    ) THEN
        RETURN 'ECTD_V4_0'::ectd_v4.submission_format;
    END IF;
    
    -- Default to eCTD v4.0
    RETURN 'ECTD_V4_0'::ectd_v4.submission_format;
END;
$$;

-- =============================================================================
-- 12. FEDERATION ROUTING VIEW
-- =============================================================================

CREATE OR REPLACE VIEW identity.org_federation_routing AS
SELECT 
    o.id AS org_id,
    o.legal_name,
    o.home_region,
    o.neon_project_id,
    o.routing_priority,
    o.data_residency_zone,
    o.federated_coordinator,
    o.gdpr_compliant,
    o.hipaa_compliant,
    CASE 
        WHEN o.home_region = 'EU' THEN 'aws-eu-central-1'
        WHEN o.home_region = 'JP' THEN 'aws-ap-northeast-1'
        WHEN o.home_region = 'CN' THEN 'aws-cn-north-1'
        WHEN o.home_region = 'APAC' THEN 'aws-ap-southeast-1'
        ELSE 'aws-us-east-1'
    END AS recommended_aws_region,
    la.legal_name AS local_agent_name
FROM identity.organizations o
LEFT JOIN identity.organizations la ON la.id = o.local_agent_org_id;

COMMENT ON VIEW identity.org_federation_routing IS 
'Federation routing configuration for multi-region data residency';

-- =============================================================================
-- 13. PRODUCT TYPE → REGULATORY PATHWAY MAPPING VIEW
-- =============================================================================

CREATE OR REPLACE VIEW product_master.regulatory_pathway_matrix AS
SELECT 
    pt.enumlabel AS product_type,
    product_master.get_regulatory_domain(pt.enumlabel::product_master.product_type_granular) AS fda_center,
    CASE pt.enumlabel
        WHEN 'SMALL_MOLECULE_NME' THEN 'NDA (505(b)(1))'
        WHEN 'SMALL_MOLECULE_GENERIC' THEN 'ANDA (505(j))'
        WHEN 'BIOLOGIC_THERAPEUTIC' THEN 'BLA (351(a))'
        WHEN 'BIOSIMILAR' THEN 'BLA (351(k))'
        WHEN 'BIOLOGIC_VACCINE' THEN 'BLA (351(a))'
        WHEN 'BIOLOGIC_GENE_THERAPY' THEN 'BLA (351(a)) + RMAT'
        WHEN 'BIOLOGIC_CELL_THERAPY' THEN 'BLA (351(a)) + RMAT'
        WHEN 'DEVICE_CLASS_I' THEN '510(k) Exempt or Registration'
        WHEN 'DEVICE_CLASS_II' THEN '510(k)'
        WHEN 'DEVICE_CLASS_III' THEN 'PMA'
        WHEN 'DEVICE_DE_NOVO' THEN 'De Novo'
        WHEN 'IVD_CLIA_WAIVED' THEN '510(k) or CLIA Waiver'
        WHEN 'IVD_CLIA_MODERATE' THEN '510(k)'
        WHEN 'IVD_CLIA_HIGH' THEN '510(k) or PMA'
        WHEN 'SAMD_CLASS_II' THEN '510(k) + Cybersecurity'
        WHEN 'SAMD_CLASS_III' THEN 'PMA + Cybersecurity'
        WHEN 'COMBINATION_DRUG_DEVICE' THEN 'NDA/BLA (Lead CDER)'
        WHEN 'COMBINATION_DEVICE_DRUG' THEN 'PMA/510(k) (Lead CDRH)'
        ELSE 'Review Required'
    END AS us_pathway,
    CASE pt.enumlabel
        WHEN 'SMALL_MOLECULE_NME' THEN 'MAA (Centralised)'
        WHEN 'SMALL_MOLECULE_GENERIC' THEN 'Generic (Decentralised)'
        WHEN 'BIOLOGIC_THERAPEUTIC' THEN 'MAA (Centralised - Mandatory)'
        WHEN 'BIOSIMILAR' THEN 'MAA (Centralised - Mandatory)'
        WHEN 'BIOLOGIC_GENE_THERAPY' THEN 'MAA (Centralised - ATMP)'
        WHEN 'BIOLOGIC_CELL_THERAPY' THEN 'MAA (Centralised - ATMP)'
        WHEN 'DEVICE_CLASS_I' THEN 'Self-Declaration + EUDAMED'
        WHEN 'DEVICE_CLASS_II' THEN 'Notified Body (MDR)'
        WHEN 'DEVICE_CLASS_III' THEN 'Notified Body (MDR)'
        WHEN 'IVD_CLASS_A' THEN 'Self-Declaration (IVDR)'
        WHEN 'IVD_CLASS_B' THEN 'Notified Body (IVDR)'
        WHEN 'IVD_CLASS_C' THEN 'Notified Body (IVDR)'
        WHEN 'IVD_CLASS_D' THEN 'Notified Body (IVDR) + EU RL'
        ELSE 'Review Required'
    END AS eu_pathway
FROM pg_enum pt
JOIN pg_type t ON pt.enumtypid = t.oid
WHERE t.typname = 'product_type_granular';

COMMENT ON VIEW product_master.regulatory_pathway_matrix IS 
'Reference mapping of product types to US and EU regulatory pathways';

-- =============================================================================
-- 14. AUDIT INTEGRATION
-- =============================================================================

-- Log product lifecycle transitions
CREATE OR REPLACE FUNCTION product_master.audit_lifecycle_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF OLD.lifecycle_status IS DISTINCT FROM NEW.lifecycle_status THEN
        INSERT INTO audit.event_log (
            event_category, entity_type, entity_id, entity_name,
            org_id, previous_values, new_values, event_description
        ) VALUES (
            'LIFECYCLE_TRANSITION', 'PRODUCT', NEW.id, NEW.proprietary_name,
            NEW.org_id,
            jsonb_build_object('lifecycle_status', OLD.lifecycle_status),
            jsonb_build_object('lifecycle_status', NEW.lifecycle_status),
            'Product lifecycle: ' || COALESCE(OLD.lifecycle_status::TEXT, 'NULL') || 
            ' → ' || NEW.lifecycle_status::TEXT
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_product_lifecycle_audit
    AFTER UPDATE ON product_master.products
    FOR EACH ROW
    WHEN (OLD.lifecycle_status IS DISTINCT FROM NEW.lifecycle_status)
    EXECUTE FUNCTION product_master.audit_lifecycle_transition();

-- =============================================================================
-- 15. SEED REGULATORY KNOWLEDGE FOR AI
-- =============================================================================

INSERT INTO ai.regulatory_knowledge (
    document_code, document_title, document_version, issuing_authority,
    document_type, applicable_domains, applicable_modules, keywords
) VALUES 
    ('FDA_SAMD_2017', 'Software as a Medical Device (SaMD): Clinical Evaluation', '2017', 'FDA',
     'GUIDANCE', ARRAY['DEVICE'], NULL, 
     ARRAY['SaMD', 'software', 'clinical evaluation', 'AI', 'machine learning', 'digital health']),
    
    ('FDA_CYBERSECURITY_2023', 'Cybersecurity in Medical Devices: QSR Considerations', '2023', 'FDA',
     'GUIDANCE', ARRAY['DEVICE', 'IVD'], NULL,
     ARRAY['cybersecurity', 'SBOM', 'threat modeling', 'vulnerability', 'software']),
    
    ('EU_AI_ACT_2024', 'EU Artificial Intelligence Act', '2024', 'EU',
     'REGULATION', ARRAY['DEVICE', 'IVD', 'PHARMA'], NULL,
     ARRAY['AI', 'artificial intelligence', 'high-risk', 'algorithm', 'machine learning', 'transparency']),
    
    ('FDA_510K_GUIDANCE', 'The 510(k) Program: Evaluating Substantial Equivalence', '2014', 'FDA',
     'GUIDANCE', ARRAY['DEVICE'], NULL,
     ARRAY['510k', 'substantial equivalence', 'predicate', 'device classification']),
    
    ('FDA_BREAKTHROUGH_DEVICE', 'Breakthrough Devices Program', '2018', 'FDA',
     'GUIDANCE', ARRAY['DEVICE', 'IVD'], NULL,
     ARRAY['breakthrough', 'expedited', 'life-threatening', 'irreversibly debilitating']),
    
    ('ICH_Q12', 'Technical and Regulatory Considerations for Pharmaceutical Product Lifecycle Management', 'R1', 'ICH',
     'GUIDANCE', ARRAY['PHARMA'], ARRAY['M3'], 
     ARRAY['lifecycle', 'post-approval', 'change management', 'established conditions']),
    
    ('FDA_COMBINATION_PRODUCT', 'Combination Product Guidance', '2022', 'FDA',
     'GUIDANCE', ARRAY['PHARMA', 'DEVICE'], NULL,
     ARRAY['combination product', 'primary mode of action', 'OCP', 'drug-device']),
    
    ('EU_MDR_2017_745', 'Medical Device Regulation', '2017/745', 'EU',
     'REGULATION', ARRAY['DEVICE'], NULL,
     ARRAY['MDR', 'CE marking', 'notified body', 'UDI', 'clinical evaluation', 'PMCF']),
    
    ('EU_IVDR_2017_746', 'In Vitro Diagnostic Regulation', '2017/746', 'EU',
     'REGULATION', ARRAY['IVD'], NULL,
     ARRAY['IVDR', 'CE marking', 'performance evaluation', 'companion diagnostic', 'CDx'])
ON CONFLICT DO NOTHING;

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

/*
-- Verify new enums
SELECT enumlabel FROM pg_enum 
WHERE enumtypid = 'product_master.product_type_granular'::regtype;

-- Verify regulatory domain routing
SELECT product_master.get_regulatory_domain('DEVICE_CLASS_II');
SELECT product_master.get_regulatory_domain('BIOLOGIC_VACCINE');
SELECT product_master.get_regulatory_domain('COMBINATION_DRUG_DEVICE');

-- Verify submission format recommendation
SELECT ectd_v4.recommend_submission_format('DEVICE_CLASS_II', 'US_FDA', '510K');
SELECT ectd_v4.recommend_submission_format('SMALL_MOLECULE_NME', 'US_FDA', 'NDA');

-- Verify pathway matrix view
SELECT * FROM product_master.regulatory_pathway_matrix LIMIT 10;

-- Verify federation routing view
SELECT * FROM identity.org_federation_routing;

-- Test variant validation (requires product with type set)
-- SELECT product_master.validate_variant_attributes('variant-uuid-here');
*/
