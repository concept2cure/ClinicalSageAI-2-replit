-- Supply Chain Management Tables
-- Created: 2026-04-02
-- Purpose: Replace hardcoded mock data with real database tables

CREATE TABLE IF NOT EXISTS supply_chain_suppliers (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  supplier_code TEXT NOT NULL,
  name TEXT NOT NULL,
  supplier_type TEXT,
  qualification_status TEXT DEFAULT 'pending',
  risk_level TEXT DEFAULT 'medium',
  quality_score NUMERIC(5,2),
  delivery_performance NUMERIC(5,2),
  location TEXT,
  certifications JSONB DEFAULT '[]'::jsonb,
  last_audit_date DATE,
  next_audit_date DATE,
  contact TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supply_chain_materials (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  material_code TEXT NOT NULL,
  name TEXT NOT NULL,
  material_type TEXT,
  material_category TEXT,
  cas_number TEXT,
  regulatory_status TEXT DEFAULT 'pending',
  storage_conditions TEXT,
  primary_supplier_id INTEGER REFERENCES supply_chain_suppliers(id),
  quality_grade TEXT,
  specification_version TEXT,
  reorder_point NUMERIC(10,2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supply_chain_batches (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  batch_number TEXT NOT NULL,
  lot_number TEXT,
  material_id INTEGER REFERENCES supply_chain_materials(id),
  batch_status TEXT DEFAULT 'pending',
  manufacturing_status TEXT DEFAULT 'pending',
  qc_status TEXT DEFAULT 'pending',
  release_status TEXT DEFAULT 'not_released',
  manufacturing_date DATE,
  expiry_date DATE,
  batch_size NUMERIC(12,2),
  batch_size_unit TEXT DEFAULT 'kg',
  yield NUMERIC(5,2),
  qp_release_date TEXT,
  qp_released_by TEXT,
  coa_number TEXT,
  current_location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supply_chain_shipments (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  shipment_number TEXT NOT NULL,
  shipment_type TEXT,
  shipment_status TEXT DEFAULT 'pending',
  origin_supplier TEXT,
  destination_address TEXT,
  tracking_number TEXT,
  planned_delivery_date DATE,
  actual_delivery_date DATE,
  temperature_min NUMERIC(5,2),
  temperature_max NUMERIC(5,2),
  cold_chain_intact BOOLEAN,
  gdp_compliance BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supply_chain_temperature_readings (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  shipment_id INTEGER REFERENCES supply_chain_shipments(id),
  reading_time TIMESTAMPTZ NOT NULL,
  temperature NUMERIC(5,2),
  humidity NUMERIC(5,2),
  is_excursion BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supply_chain_deviations (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  client_workspace_id INTEGER,
  deviation_number TEXT NOT NULL,
  deviation_type TEXT,
  severity TEXT DEFAULT 'medium',
  impact TEXT,
  title TEXT NOT NULL,
  description TEXT,
  discovery_date TIMESTAMPTZ,
  discovered_by TEXT,
  status TEXT DEFAULT 'open',
  priority TEXT DEFAULT 'medium',
  assigned_to TEXT,
  shipment_id INTEGER REFERENCES supply_chain_shipments(id),
  batch_id INTEGER,
  reported_by TEXT,
  reported_date DATE,
  due_date DATE,
  capa_required BOOLEAN DEFAULT false,
  regulatory_reporting_required BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supply_chain_inventory (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  material_id TEXT,
  location TEXT,
  batch_number TEXT,
  quantity NUMERIC(12,2),
  unit TEXT DEFAULT 'kg',
  expiry_date DATE,
  status TEXT DEFAULT 'available',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_sc_suppliers_org ON supply_chain_suppliers(organization_id);
CREATE INDEX IF NOT EXISTS idx_sc_materials_org ON supply_chain_materials(organization_id);
CREATE INDEX IF NOT EXISTS idx_sc_batches_org ON supply_chain_batches(organization_id);
CREATE INDEX IF NOT EXISTS idx_sc_shipments_org ON supply_chain_shipments(organization_id);
CREATE INDEX IF NOT EXISTS idx_sc_temp_readings_org ON supply_chain_temperature_readings(organization_id);
CREATE INDEX IF NOT EXISTS idx_sc_deviations_org ON supply_chain_deviations(organization_id);
CREATE INDEX IF NOT EXISTS idx_sc_inventory_org ON supply_chain_inventory(organization_id);
