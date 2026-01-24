-- Seed CMC documents and sections for the demo process
-- This creates P.3 Manufacturing Process documents to support the CMC workflow

-- Insert a demo P.3 document for the existing Tablet DP v1 process
WITH demo_process AS (
  SELECT process_id, product_id, name FROM cmc_processes WHERE name = 'Tablet DP v1' LIMIT 1
)
INSERT INTO cmc_documents (title, product_id, type, status, version, created_by)
SELECT 
  'P.3 Manufacturing Process — ' || dp.name,
  dp.product_id,
  'P3_MANUFACTURING',
  'DRAFT',
  1,
  'System'
FROM demo_process dp;

-- Insert sections for the P.3 document
WITH demo_doc AS (
  SELECT doc_id FROM cmc_documents 
  WHERE title LIKE 'P.3 Manufacturing Process — Tablet DP v1' 
  LIMIT 1
)
INSERT INTO cmc_sections (doc_id, title, path, content_md, section_order) VALUES
(
  (SELECT doc_id FROM demo_doc),
  'Manufacturing Process Overview',
  'Module 3 > 3.2.P.3 Manufacturing Process > Overview',
  '# Manufacturing Process Overview

## Process Summary
The manufacturing process for Tablet DP v1 consists of three main unit operations:

1. **Blend** - Initial mixing of raw materials
2. **Granulate** - High shear granulation for particle formation  
3. **Dry** - Fluid bed drying to achieve target moisture content

## Process Flow
```
Raw Materials → Blend → Granulate → Dry → Final Product
```

## Critical Parameters
- Blend Time: 15 ± 3 minutes
- Inlet Temperature: 55 ± 5°C
- Granulation Liquid Addition Rate: 5-10 mL/min

## Manufacturing Location
Primary manufacturing site with full GMP compliance and FDA registration.
',
  1
),
(
  (SELECT doc_id FROM demo_doc),
  'Unit Operation Details', 
  'Module 3 > 3.2.P.3 Manufacturing Process > Unit Operations',
  '# Unit Operation Details

## Blend Operation
**Equipment**: High-efficiency V-blender
**Batch Size**: 50 kg
**Critical Parameters**:
- Blend Time: 15 minutes (target)
- Speed: 12 RPM
- Loading: 60% of total capacity

**Controls**:
- Time monitoring with automatic stop
- Visual inspection for homogeneity
- Sampling at 5-minute intervals

## Granulation Operation  
**Equipment**: High shear granulator
**Process**:
1. Dry mixing: 2 minutes at low speed
2. Liquid addition: 8 minutes at medium speed
3. Wet massing: 3 minutes at high speed

**Critical Parameters**:
- Liquid addition rate: 7.5 mL/min
- Impeller speed: 300-500 RPM
- Chopper speed: 1500 RPM

## Drying Operation
**Equipment**: Fluid bed dryer
**Process**:
- Inlet Temperature: 55°C (target)
- Outlet Temperature: 35-40°C
- Drying time: 15-20 minutes
- Air flow rate: 150 m³/h

**End Point Criteria**:
- Loss on Drying: ≤ 3.0%
- Visual assessment: Free-flowing granules
',
  2
),
(
  (SELECT doc_id FROM demo_doc),
  'Process Controls and Monitoring',
  'Module 3 > 3.2.P.3 Manufacturing Process > Controls',
  '# Process Controls and Monitoring

## In-Process Controls
1. **Raw Material Identity Testing**
   - All materials verified before use
   - Certificate of Analysis review
   - Identity confirmation via FTIR

2. **Blend Uniformity**
   - Sampling at 3 locations
   - Content uniformity testing
   - Acceptance criteria: RSD ≤ 5.0%

3. **Granule Quality Attributes**
   - Particle size distribution
   - Bulk and tapped density
   - Flow properties (Carr Index)

## Environmental Controls
- Temperature: 20-25°C
- Relative Humidity: 30-50%
- Positive pressure maintained
- HEPA filtered air supply

## Documentation Requirements
- Batch production records
- In-process test results
- Environmental monitoring data
- Equipment cleaning verification
',
  3
);

-- Insert additional documents for completeness
WITH demo_process AS (
  SELECT process_id, product_id, name FROM cmc_processes WHERE name = 'Tablet DP v1' LIMIT 1
)
INSERT INTO cmc_documents (title, product_id, type, status, version, created_by)
SELECT 
  'P.3 Manufacturing Process — ' || dp.name || ' (Version 2)',
  dp.product_id,
  'P3_MANUFACTURING', 
  'REVIEW',
  2,
  'Process Engineer'
FROM demo_process dp;