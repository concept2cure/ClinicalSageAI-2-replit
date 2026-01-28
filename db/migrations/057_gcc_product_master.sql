-- =============================================================================
-- Migration 057: GCC Polymorphic Product Master
-- =============================================================================
-- Purpose: Unified product catalog for Drugs, Devices, IVDs, and Combinations
-- Compliance: ISO IDMP (11615/11616), FDA UDI/GUDID, EU EUDAMED
-- =============================================================================
-- NO MOCKS. NO STUBS. PRODUCTION-GRADE ONLY.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. CREATE PRODUCT_MASTER SCHEMA
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS product_master;

COMMENT ON SCHEMA product_master IS 
'Polymorphic product catalog unifying Pharma (IDMP) and MedTech (UDI) domains';

-- =============================================================================
-- 2. PRODUCT CATEGORY ENUM
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'product_master' AND t.typname = 'product_category'
    ) THEN
        CREATE TYPE product_master.product_category AS ENUM (
            'PHARMACEUTICAL',       -- Drugs, Biologics (eCTD Module 3)
            'MEDICAL_DEVICE',       -- Class I/II/III Devices (510(k), PMA)
            'IVD',                  -- In Vitro Diagnostics (De Novo, EUA)
            'COMBINATION',          -- Drug-Device Combos (e.g., drug-eluting stent)
            'BIOLOGIC',             -- Blood products, vaccines, gene therapy
            'ADVANCED_THERAPY',     -- ATMPs (EU), CGT (US)
            'GENERIC',              -- ANDA pathway
            'BIOSIMILAR',           -- 351(k) pathway
            'OTC'                   -- Over-the-counter
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'product_master' AND t.typname = 'development_phase'
    ) THEN
        CREATE TYPE product_master.development_phase AS ENUM (
            'DISCOVERY',            -- Target identification
            'PRECLINICAL',          -- Animal studies, toxicology
            'IND_ENABLING',         -- Preparing IND/IMPD
            'PHASE_1',              -- First-in-human
            'PHASE_1B_2A',          -- Dose escalation
            'PHASE_2',              -- Proof of concept
            'PHASE_2B_3',           -- Pivotal planning
            'PHASE_3',              -- Pivotal trials
            'NDA_BLA_FILED',        -- Under FDA review
            'APPROVED',             -- Market authorization granted
            'MARKETED',             -- Commercially available
            'POST_MARKET',          -- Phase 4, REMS
            'WITHDRAWN',            -- Removed from market
            'DISCONTINUED'          -- Development halted
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'product_master' AND t.typname = 'therapeutic_area'
    ) THEN
        CREATE TYPE product_master.therapeutic_area AS ENUM (
            'ONCOLOGY',
            'CARDIOVASCULAR',
            'CNS_NEUROLOGY',
            'IMMUNOLOGY',
            'INFECTIOUS_DISEASE',
            'METABOLIC_ENDOCRINE',
            'RESPIRATORY',
            'GASTROENTEROLOGY',
            'DERMATOLOGY',
            'OPHTHALMOLOGY',
            'HEMATOLOGY',
            'NEPHROLOGY',
            'MUSCULOSKELETAL',
            'RARE_DISEASE',
            'PEDIATRICS',
            'WOMENS_HEALTH',
            'UROLOGY',
            'TRANSPLANT',
            'GENE_CELL_THERAPY',
            'DIGITAL_THERAPEUTICS',
            'DIAGNOSTIC',
            'SURGICAL',
            'IMPLANTABLE',
            'OTHER'
        );
    END IF;
END $$;

-- =============================================================================
-- 3. PRODUCTS TABLE (Super-Type)
-- =============================================================================

CREATE TABLE IF NOT EXISTS product_master.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
    
    -- Product Identification
    proprietary_name TEXT NOT NULL,              -- Brand name (e.g., 'Keytruda')
    established_name TEXT,                       -- Generic/INN name (e.g., 'pembrolizumab')
    internal_project_code TEXT,                  -- R&D code (e.g., 'MK-3475')
    
    -- Classification
    category product_master.product_category NOT NULL,
    therapeutic_area product_master.therapeutic_area,
    development_phase product_master.development_phase DEFAULT 'DISCOVERY',
    
    -- Regulatory Strategy
    primary_indication TEXT,                     -- First approved indication
    orphan_designation BOOLEAN DEFAULT FALSE,
    breakthrough_designation BOOLEAN DEFAULT FALSE,
    fast_track_designation BOOLEAN DEFAULT FALSE,
    priority_review BOOLEAN DEFAULT FALSE,
    accelerated_approval BOOLEAN DEFAULT FALSE,
    
    -- For Combination Products (21 CFR Part 3)
    primary_mode_of_action TEXT,                 -- 'DRUG', 'DEVICE', 'BIOLOGIC'
    lead_center TEXT,                            -- 'CDER', 'CBER', 'CDRH'
    
    -- Cross-Reference to Submissions
    lead_submission_id UUID,                     -- FK added after ectd_v4 reference
    
    -- Metadata
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT DEFAULT 'system',
    
    CONSTRAINT products_proprietary_name_org_unique UNIQUE (org_id, proprietary_name)
);

-- =============================================================================
-- 4. PRODUCT VARIANTS TABLE (SKU/Presentation Layer)
-- =============================================================================
-- Handles regional variations (US Pack vs EU Pack) and strength/form combos

CREATE TABLE IF NOT EXISTS product_master.product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES product_master.products(id) ON DELETE CASCADE,
    
    -- Variant Identification
    sku_number TEXT,
    ndc_code TEXT,                               -- US National Drug Code (11-digit)
    gtin TEXT,                                   -- Global Trade Item Number
    
    -- Regional Targeting
    target_market_region TEXT NOT NULL,          -- 'US', 'EU', 'JP', 'CN', 'GLOBAL'
    
    -- =======================================================================
    -- POLYMORPHIC ATTRIBUTE STORAGE
    -- Stores either IDMP data (Drugs) or UDI data (Devices) or both (Combos)
    -- =======================================================================
    domain_attributes JSONB NOT NULL DEFAULT '{}',
    
    -- Validation Schema Reference (for app-layer validation)
    schema_type TEXT NOT NULL DEFAULT 'GENERIC', -- 'IDMP', 'UDI', 'COMBINATION'
    schema_version TEXT DEFAULT '1.0',
    
    -- Lifecycle
    launch_date DATE,
    sunset_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Full-Text Search Vector (auto-generated)
    search_vector TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('english', COALESCE(sku_number, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(ndc_code, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(gtin, '')), 'A') ||
        setweight(jsonb_to_tsvector('english', domain_attributes, '["string"]'), 'B')
    ) STORED,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT product_variants_sku_unique UNIQUE (product_id, sku_number, target_market_region)
);

-- =============================================================================
-- 5. IDMP SUBSTANCE REGISTRY
-- =============================================================================
-- ISO 11238 Substance Identification

CREATE TABLE IF NOT EXISTS product_master.substances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Substance Identification (ISO 11238)
    substance_id TEXT UNIQUE NOT NULL,           -- GSRS UNII or EMA SMS ID
    substance_name TEXT NOT NULL,                -- INN/USAN name
    substance_type TEXT NOT NULL,                -- 'CHEMICAL', 'PROTEIN', 'NUCLEIC_ACID', 'POLYMER'
    
    -- Chemical Identifiers
    cas_number TEXT,                             -- CAS Registry Number
    inchi_key TEXT,                              -- IUPAC InChI Key
    smiles TEXT,                                 -- Simplified molecular-input line-entry
    molecular_formula TEXT,
    molecular_weight NUMERIC(12, 4),
    
    -- Biological Identifiers
    uniprot_id TEXT,                             -- For proteins
    ncbi_gene_id TEXT,                           -- For gene therapies
    
    -- Regulatory Status
    is_controlled_substance BOOLEAN DEFAULT FALSE,
    dea_schedule TEXT,                           -- 'I', 'II', 'III', 'IV', 'V'
    
    -- Metadata
    source_authority TEXT DEFAULT 'FDA_GSRS',    -- 'FDA_GSRS', 'EMA_SMS', 'WHO_INN'
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 6. PRODUCT-SUBSTANCE JUNCTION (M:N)
-- =============================================================================
-- A product can have multiple substances (combination drugs)

CREATE TABLE IF NOT EXISTS product_master.product_substances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES product_master.products(id) ON DELETE CASCADE,
    substance_id UUID NOT NULL REFERENCES product_master.substances(id) ON DELETE RESTRICT,
    
    -- Role in Product
    role TEXT NOT NULL DEFAULT 'ACTIVE',         -- 'ACTIVE', 'EXCIPIENT', 'ADJUVANT'
    
    -- Strength (ISO 11240)
    strength_value NUMERIC(12, 6),
    strength_unit TEXT,                          -- 'mg', 'mL', 'IU', '%'
    strength_basis TEXT,                         -- 'PER_TABLET', 'PER_ML', 'PER_DOSE'
    
    -- Reference Strength (for salts)
    reference_strength_value NUMERIC(12, 6),
    reference_strength_unit TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT product_substances_unique UNIQUE (product_id, substance_id, role)
);

-- FDA Product Code Database / EU MDR Classification

CREATE TABLE IF NOT EXISTS product_master.device_classifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- FDA Classification
    product_code TEXT UNIQUE,                    -- 3-letter FDA code (e.g., 'DXC')
    device_name TEXT NOT NULL,
    device_class TEXT NOT NULL,                  -- 'I', 'II', 'III'
    
    -- Regulatory Pathway
    regulation_number TEXT,                      -- 21 CFR reference
    submission_type TEXT,                        -- '510K', 'PMA', 'DE_NOVO', 'EXEMPT'
    
    -- GMDN (Global Medical Device Nomenclature)
    gmdn_code TEXT,
    gmdn_term TEXT,
    
    -- EU MDR Classification
    eu_mdr_class TEXT,                           -- 'I', 'IIa', 'IIb', 'III'
    eu_mdr_rule TEXT,                            -- Classification rule number
    
    -- Review Panel
    review_panel TEXT,                           -- 'CH' (Chemistry), 'RA' (Radiology), etc.
    
    -- Special Controls
    requires_clinical_data BOOLEAN DEFAULT FALSE,
    requires_biocompatibility BOOLEAN DEFAULT FALSE,
    requires_sterility BOOLEAN DEFAULT FALSE,
    requires_electrical_safety BOOLEAN DEFAULT FALSE,
    requires_software_validation BOOLEAN DEFAULT FALSE,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 8. UDI-DI REGISTRY (Device Identifiers)
-- =============================================================================
-- FDA GUDID / EU EUDAMED Basic UDI-DI

CREATE TABLE IF NOT EXISTS product_master.udi_identifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id UUID NOT NULL REFERENCES product_master.product_variants(id) ON DELETE CASCADE,
    
    -- UDI-DI (Device Identifier)
    udi_di TEXT NOT NULL,                        -- The actual DI value
    issuing_agency TEXT NOT NULL,                -- 'GS1', 'HIBCC', 'ICCBBA', 'IFA'
    
    -- UDI-PI (Production Identifier) - Template
    has_lot_batch BOOLEAN DEFAULT FALSE,
    has_serial_number BOOLEAN DEFAULT FALSE,
    has_manufacturing_date BOOLEAN DEFAULT FALSE,
    has_expiration_date BOOLEAN DEFAULT FALSE,
    
    -- GUDID Fields
    brand_name TEXT,
    version_model_number TEXT,
    catalog_number TEXT,
    company_name TEXT,
    
    -- Device Characteristics (GUDID)
    mri_safety TEXT,                             -- 'SAFE', 'CONDITIONAL', 'UNSAFE', 'UNKNOWN'
    contains_latex BOOLEAN,
    contains_dehp BOOLEAN,
    contains_nrl BOOLEAN,                        -- Natural Rubber Latex
    
    -- Sterility
    is_sterile BOOLEAN DEFAULT FALSE,
    sterilization_method TEXT,                   -- 'EO', 'RADIATION', 'STEAM', 'DRY_HEAT'
    requires_sterilization_prior_to_use BOOLEAN DEFAULT FALSE,
    
    -- Single Use
    is_single_use BOOLEAN,
    max_reuse_count INT,
    
    -- Implant Status
    is_implantable BOOLEAN DEFAULT FALSE,
    implant_duration TEXT,                       -- 'PERMANENT', 'TEMPORARY', 'SHORT_TERM'
    
    -- Software
    has_software BOOLEAN DEFAULT FALSE,
    software_version TEXT,
    is_software_only BOOLEAN DEFAULT FALSE,      -- SaMD (Software as Medical Device)
    
    -- EU EUDAMED Specifics
    eudamed_basic_udi_di TEXT,                   -- The Basic UDI-DI for EU
    eudamed_registration_status TEXT,
    
    -- GUDID Submission Status
    gudid_public_status TEXT DEFAULT 'DRAFT',    -- 'DRAFT', 'PUBLISHED', 'UNPUBLISHED'
    gudid_publish_date DATE,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT udi_identifiers_unique UNIQUE (udi_di, issuing_agency)
);

-- =============================================================================
-- 9. INDEXES FOR PERFORMANCE
-- =============================================================================

-- Products
CREATE INDEX IF NOT EXISTS idx_products_org ON product_master.products(org_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON product_master.products(category);
CREATE INDEX IF NOT EXISTS idx_products_phase ON product_master.products(development_phase);
CREATE INDEX IF NOT EXISTS idx_products_therapeutic_area ON product_master.products(therapeutic_area);
CREATE INDEX IF NOT EXISTS idx_products_active ON product_master.products(is_active) WHERE is_active = TRUE;

-- Product Variants
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_master.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_region ON product_master.product_variants(target_market_region);
CREATE INDEX IF NOT EXISTS idx_variants_ndc ON product_master.product_variants(ndc_code) WHERE ndc_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_variants_gtin ON product_master.product_variants(gtin) WHERE gtin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_variants_search ON product_master.product_variants USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_variants_domain_attrs ON product_master.product_variants USING GIN(domain_attributes jsonb_path_ops);

-- Substances
CREATE INDEX IF NOT EXISTS idx_substances_name ON product_master.substances(substance_name);
CREATE INDEX IF NOT EXISTS idx_substances_cas ON product_master.substances(cas_number) WHERE cas_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_substances_unii ON product_master.substances(substance_id);

-- UDI
CREATE INDEX IF NOT EXISTS idx_udi_variant ON product_master.udi_identifiers(variant_id);
CREATE INDEX IF NOT EXISTS idx_udi_di ON product_master.udi_identifiers(udi_di);
CREATE INDEX IF NOT EXISTS idx_udi_eudamed ON product_master.udi_identifiers(eudamed_basic_udi_di) WHERE eudamed_basic_udi_di IS NOT NULL;

-- =============================================================================
-- 10. RLS POLICIES (Inherit from identity schema)
-- =============================================================================

ALTER TABLE product_master.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_master.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_master.product_substances ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_master.udi_identifiers ENABLE ROW LEVEL SECURITY;

-- Products: Org-scoped access
DROP POLICY IF EXISTS products_org_isolation ON product_master.products;
CREATE POLICY products_org_isolation ON product_master.products
    FOR ALL
    USING (identity.can_access_org(org_id))
    WITH CHECK (identity.can_write_org(org_id));

-- Variants: Inherit from product
DROP POLICY IF EXISTS variants_org_isolation ON product_master.product_variants;
CREATE POLICY variants_org_isolation ON product_master.product_variants
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM product_master.products p 
            WHERE p.id = product_id AND identity.can_access_org(p.org_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM product_master.products p 
            WHERE p.id = product_id AND identity.can_write_org(p.org_id)
        )
    );

-- Product Substances: Inherit from product
DROP POLICY IF EXISTS product_substances_org_isolation ON product_master.product_substances;
CREATE POLICY product_substances_org_isolation ON product_master.product_substances
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM product_master.products p 
            WHERE p.id = product_id AND identity.can_access_org(p.org_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM product_master.products p 
            WHERE p.id = product_id AND identity.can_write_org(p.org_id)
        )
    );

-- UDI Identifiers: Inherit through variant → product
DROP POLICY IF EXISTS udi_org_isolation ON product_master.udi_identifiers;
CREATE POLICY udi_org_isolation ON product_master.udi_identifiers
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM product_master.product_variants v
            JOIN product_master.products p ON p.id = v.product_id
            WHERE v.id = variant_id AND identity.can_access_org(p.org_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM product_master.product_variants v
            JOIN product_master.products p ON p.id = v.product_id
            WHERE v.id = variant_id AND identity.can_write_org(p.org_id)
        )
    );

-- =============================================================================
-- 11. IDMP/UDI JSON SCHEMA VALIDATION FUNCTIONS
-- =============================================================================

-- Validate IDMP domain_attributes structure
CREATE OR REPLACE FUNCTION product_master.validate_idmp_attributes(attrs JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    -- Required IDMP fields for pharmaceutical products
    IF attrs IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Check for core IDMP structure
    IF attrs ? 'idmp_type' AND attrs ? 'dosage_form' THEN
        RETURN TRUE;
    END IF;
    
    -- Allow empty for non-IDMP products
    RETURN attrs = '{}'::JSONB;
END;
$$;

-- Validate UDI domain_attributes structure
CREATE OR REPLACE FUNCTION product_master.validate_udi_attributes(attrs JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF attrs IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Check for core UDI structure
    IF attrs ? 'device_class' AND attrs ? 'gmdn_code' THEN
        RETURN TRUE;
    END IF;
    
    -- Allow empty for non-UDI products
    RETURN attrs = '{}'::JSONB;
END;
$$;

-- =============================================================================
-- 12. HELPER FUNCTIONS
-- =============================================================================

-- Get full product hierarchy for a submission
CREATE OR REPLACE FUNCTION product_master.get_product_tree(p_product_id UUID)
RETURNS TABLE (
    product_id UUID,
    proprietary_name TEXT,
    category product_master.product_category,
    variant_id UUID,
    sku_number TEXT,
    target_region TEXT,
    domain_attributes JSONB,
    udi_di TEXT,
    substance_name TEXT,
    strength TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT 
        p.id AS product_id,
        p.proprietary_name,
        p.category,
        v.id AS variant_id,
        v.sku_number,
        v.target_market_region AS target_region,
        v.domain_attributes,
        u.udi_di,
        s.substance_name,
        CONCAT(ps.strength_value, ' ', ps.strength_unit) AS strength
    FROM product_master.products p
    LEFT JOIN product_master.product_variants v ON v.product_id = p.id
    LEFT JOIN product_master.udi_identifiers u ON u.variant_id = v.id
    LEFT JOIN product_master.product_substances ps ON ps.product_id = p.id
    LEFT JOIN product_master.substances s ON s.id = ps.substance_id
    WHERE p.id = p_product_id
    ORDER BY v.target_market_region, s.substance_name;
$$;

-- =============================================================================
-- 13. AUDIT TRIGGER FOR PRODUCTS
-- =============================================================================

CREATE OR REPLACE FUNCTION product_master.audit_product_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit.event_log (
            event_category, entity_type, entity_id, entity_name,
            org_id, new_values, event_description
        ) VALUES (
            'CREATE', 'PRODUCT', NEW.id, NEW.proprietary_name,
            NEW.org_id, to_jsonb(NEW), 'Product created: ' || NEW.proprietary_name
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit.event_log (
            event_category, entity_type, entity_id, entity_name,
            org_id, previous_values, new_values, 
            changed_fields, event_description
        ) VALUES (
            'UPDATE', 'PRODUCT', NEW.id, NEW.proprietary_name,
            NEW.org_id, to_jsonb(OLD), to_jsonb(NEW),
            ARRAY(
                SELECT key FROM jsonb_each(to_jsonb(OLD)) old_kv
                WHERE to_jsonb(NEW) ->> key IS DISTINCT FROM old_kv.value::TEXT
            ),
            'Product updated: ' || NEW.proprietary_name
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit.event_log (
            event_category, entity_type, entity_id, entity_name,
            org_id, previous_values, event_description
        ) VALUES (
            'DELETE', 'PRODUCT', OLD.id, OLD.proprietary_name,
            OLD.org_id, to_jsonb(OLD), 'Product deleted: ' || OLD.proprietary_name
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_audit ON product_master.products;
CREATE TRIGGER trg_product_audit
    AFTER INSERT OR UPDATE OR DELETE ON product_master.products
    FOR EACH ROW EXECUTE FUNCTION product_master.audit_product_changes();

-- =============================================================================
-- 14. ENHANCE IDENTITY.ORGANIZATIONS FOR DATA RESIDENCY
-- =============================================================================

ALTER TABLE identity.organizations 
    ADD COLUMN IF NOT EXISTS data_residency_zone TEXT DEFAULT 'US' 
        CHECK (data_residency_zone IN ('US', 'EU', 'JP', 'CN', 'APAC', 'GLOBAL')),
    ADD COLUMN IF NOT EXISTS neon_project_id TEXT,
    ADD COLUMN IF NOT EXISTS federated_coordinator BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN identity.organizations.data_residency_zone IS 
'GDPR/PMDA compliance: Physical region where org data must reside';
COMMENT ON COLUMN identity.organizations.neon_project_id IS 
'Neon DB project ID for multi-region federation';
COMMENT ON COLUMN identity.organizations.federated_coordinator IS 
'TRUE if this org acts as FDW coordinator for cross-region queries';

-- =============================================================================
-- 15. LINK PRODUCTS TO SUBMISSIONS
-- =============================================================================

-- Add product reference to submissions
ALTER TABLE ectd_v4.regulatory_submissions
    ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES product_master.products(id);

CREATE INDEX IF NOT EXISTS idx_submissions_product 
    ON ectd_v4.regulatory_submissions(product_id);

COMMENT ON COLUMN ectd_v4.regulatory_submissions.product_id IS 
'Link to product_master.products for full IDMP/UDI context';

-- =============================================================================
-- 16. MIGRATION METADATA
-- =============================================================================

INSERT INTO common_standards.controlled_vocabularies (
    cv_oid, cv_code, cv_name, cv_description, version_date, is_active
) VALUES 
    ('2.16.840.1.113883.3.26.1.1', 'IDMP_SUBSTANCE', 'ISO 11238 Substance Identifiers', 
     'IDMP substance classification vocabulary', CURRENT_DATE, TRUE),
    ('2.16.840.1.113883.3.26.1.2', 'IDMP_DOSAGE_FORM', 'ISO 11239 Dosage Forms', 
     'IDMP pharmaceutical dose forms', CURRENT_DATE, TRUE),
    ('2.16.840.1.113883.3.26.1.3', 'IDMP_ROUTE', 'ISO 11239 Routes of Administration', 
     'IDMP routes of administration', CURRENT_DATE, TRUE),
    ('2.16.840.1.113883.6.2', 'GMDN', 'Global Medical Device Nomenclature', 
     'Medical device classification codes', CURRENT_DATE, TRUE),
    ('1.3.160', 'GS1_GTIN', 'GS1 Global Trade Item Number', 
     'Product identification for supply chain', CURRENT_DATE, TRUE)
ON CONFLICT DO NOTHING;

COMMIT;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

/*
-- Verify schema creation
SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'product_master';

-- Verify tables
SELECT table_name FROM information_schema.tables WHERE table_schema = 'product_master';

-- Verify enums
SELECT typname FROM pg_type WHERE typnamespace = 'product_master'::regnamespace;

-- Verify RLS policies
SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'product_master';

-- Test product tree function
-- SELECT * FROM product_master.get_product_tree('uuid-here');
*/
