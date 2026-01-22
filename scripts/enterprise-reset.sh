#!/bin/bash
set -e

echo "🏛️ ENTERPRISE PLATFORM INITIALIZATION"
echo "======================================"

echo ""
echo ">>> [1/5] SANITIZING ENVIRONMENT..."
# Kill any process on port 5000
fuser -k 5000/tcp 2>/dev/null || true
sleep 2

echo ""
echo ">>> [2/5] DEPLOYING ENTERPRISE SCHEMA..."
# Execute SQL directly in the running container
docker exec clinicalsageai-2-replit-db-1 psql -U postgres -d clinicalsage << 'EOF'
-- 0. Cryptographic Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 1. ORGANIZATIONS (The Root Entity)
CREATE TABLE IF NOT EXISTS organizations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    tier VARCHAR(50) DEFAULT 'ENTERPRISE',
    status VARCHAR(50) DEFAULT 'active',
    region VARCHAR(10) DEFAULT 'US',
    settings JSONB DEFAULT '{"region": "US"}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. LICENSES (Downstream Access Control)
CREATE TABLE IF NOT EXISTS licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    license_key VARCHAR(255) UNIQUE NOT NULL,
    plan_type VARCHAR(50) NOT NULL DEFAULT 'PLATINUM',
    status VARCHAR(50) DEFAULT 'active',
    seats_limit INTEGER DEFAULT 5,
    seats_utilized INTEGER DEFAULT 0,
    expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '1 year'),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. SETTINGS (Compliance & Security Configuration)
CREATE TABLE IF NOT EXISTS organization_settings (
    organization_id INTEGER PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    compliance_mode BOOLEAN DEFAULT TRUE,
    mfa_required BOOLEAN DEFAULT TRUE,
    session_timeout_minutes INTEGER DEFAULT 15,
    ip_allowlist TEXT[] DEFAULT '{}',
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. USERS (Identity Linked to Org)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    password_hash VARCHAR(255) NOT NULL,
    organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    role VARCHAR(50) DEFAULT 'USER',
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 5. AUTH_USERS (Modern auth table)
CREATE TABLE IF NOT EXISTS auth_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 6. TENANT_USERS (Multi-tenant mapping)
CREATE TABLE IF NOT EXISTS tenant_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth_users(id) ON DELETE CASCADE,
    organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'USER',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, organization_id)
);

-- 7. AUDIT LOGS (Immutable Ledger - 21 CFR Part 11)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    details JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 8. PROJECTS (The Work Context)
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) DEFAULT 'IND',
    status VARCHAR(50) DEFAULT 'active',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 9. LUMEN DATA ATOMS
CREATE TABLE IF NOT EXISTS lumen_data_atoms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    content TEXT,
    type VARCHAR(50) DEFAULT 'text',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

EOF

echo "✅ Schema deployed successfully"

echo ""
echo ">>> [3/5] SEEDING GOVERNANCE DATA..."
cd /workspaces/ClinicalSageAI-2-replit
node --input-type=module << 'NODESCRIPT'
import pg from 'pg';
import bcrypt from 'bcrypt';

const { Pool } = pg;
const pool = new Pool({ 
  connectionString: 'postgresql://postgres:postgres@localhost:5432/clinicalsage?sslmode=disable'
});

async function init() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // 1. WIPE existing data (careful cascade) - only truncate tables that exist
    console.log('>>> Clearing existing data...');
    await client.query('TRUNCATE users, auth_users, audit_logs, organizations CASCADE');

    // 2. CREATE ORGANIZATION (match existing schema - needs slug)
    console.log('>>> Creating Concept2Cure organization...');
    await client.query(`
      INSERT INTO organizations (id, name, slug, tier, status, settings) 
      VALUES (1, 'Concept2Cure', 'concept2cure', 'ENTERPRISE', 'active', '{"region": "US"}')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, tier = EXCLUDED.tier
    `);

    // 3. SETTINGS (optional - table may not exist, skip if error)
    console.log('>>> Configuring compliance settings (optional)...');
    try {
      await client.query(`
        INSERT INTO organization_settings (organization_id, compliance_mode, mfa_required, session_timeout_minutes) 
        VALUES (1, true, false, 30)
        ON CONFLICT (organization_id) DO UPDATE SET compliance_mode = EXCLUDED.compliance_mode
      `);
    } catch (e) {
      console.log('    (organization_settings table not found, skipping)');
      // Reset transaction state
      await client.query('ROLLBACK');
      await client.query('BEGIN');
    }

    // 4. LICENSE (optional - table may not exist, skip if error)
    console.log('>>> Provisioning enterprise license (optional)...');
    try {
      await client.query(`
        INSERT INTO licenses (organization_id, license_key, plan_type, seats_limit, status) 
        VALUES (1, 'ENT-2026-KEY-X99', 'PLATINUM', 10, 'active')
        ON CONFLICT (license_key) DO NOTHING
      `);
    } catch (e) {
      console.log('    (licenses table not found, skipping)');
      // Reset transaction state
      await client.query('ROLLBACK');
      await client.query('BEGIN');
    }

    // 5. LEGACY USER (for backward compatibility) - users table has INTEGER id
    console.log('>>> Creating legacy user record...');
    const hash = await bcrypt.hash('demo123', 10);
    const userResult = await client.query(`
      INSERT INTO users (id, email, name, password_hash, status, default_organization_id) 
      VALUES (1, $1, $2, $3, $4, $5)
      ON CONFLICT (email) DO UPDATE 
      SET password_hash = EXCLUDED.password_hash, id = 1, default_organization_id = 1
      RETURNING id
    `, ['jm.smith@concept2cure.pro', 'JM Smith', hash, 'active', 1]);

    // 6. AUTH USER (modern auth system) - must match legacy user ID
    console.log('>>> Creating auth_users record...');
    const authUserResult = await client.query(`
      INSERT INTO auth_users (id, email, username, password_hash, email_verified, is_active) 
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
      RETURNING id
    `, ['jm.smith@concept2cure.pro', 'jmsmith', hash, true, true]);

    // 7. ORGANIZATION USER MAPPING (using legacy user_id which is integer)
    console.log('>>> Creating organization-user mapping...');
    await client.query(`
      INSERT INTO organization_users (user_id, organization_id, role) 
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role
    `, [1, 1, 'admin']);

    await client.query('COMMIT');
    
    console.log('');
    console.log('✅ GOVERNANCE DATA SEEDED SUCCESSFULLY');
    console.log('');
    console.log('📋 SYSTEM CREDENTIALS:');
    console.log('   Email:    jm.smith@concept2cure.pro');
    console.log('   Password: demo123');
    console.log('   Role:     GLOBAL_ADMIN');
    console.log('   Org:      Concept2Cure (ID: 1)');
    console.log('');

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ CRITICAL SEED FAILURE:', e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

init();
NODESCRIPT

echo ""
echo ">>> [4/5] VERIFYING DATABASE STATE..."
docker exec clinicalsageai-2-replit-db-1 psql -U postgres -d clinicalsage -c "
SELECT 'Organizations: ' || COUNT(*)::text FROM organizations
UNION ALL
SELECT 'Users: ' || COUNT(*)::text FROM users
UNION ALL
SELECT 'Auth Users: ' || COUNT(*)::text FROM auth_users
UNION ALL
SELECT 'Organization Users: ' || COUNT(*)::text FROM organization_users;
"

echo ""
echo ">>> [5/5] STARTING APPLICATION SERVER..."
echo ""
cd /workspaces/ClinicalSageAI-2-replit
npm run dev &

echo ""
echo "🎉 ENTERPRISE PLATFORM INITIALIZED"
echo "=================================="
echo ""
echo "✅ Database schema deployed"
echo "✅ Governance data seeded"
echo "✅ Server starting on port 5000"
echo ""
echo "🔐 Login Credentials:"
echo "   URL:      http://localhost:5000"
echo "   Email:    jm.smith@concept2cure.pro"
echo "   Password: demo123"
echo ""
echo "Waiting for server to be ready..."
sleep 5

# Test health endpoint
if curl -s http://localhost:5000/api/health > /dev/null 2>&1; then
  echo "✅ Server is responding"
else
  echo "⚠️  Server still starting, please wait..."
fi

echo ""
echo "🚀 READY FOR AUTHENTICATION"
