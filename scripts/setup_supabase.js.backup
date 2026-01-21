import pg from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Check for required environment variables
const requiredEnvVars = ['DATABASE_URL'];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

// Initialize PostgreSQL client
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function setupDatabase() {
  console.log('Setting up TrialSage Vault database...');
  const client = await pool.connect();

  try {
    // Enable the uuid-ossp extension if it doesn't exist
    console.log('Ensuring uuid-ossp extension is enabled...');
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
      console.log('UUID extension enabled successfully');
    } catch (extensionError) {
      // Might not have permissions to create extensions in managed databases
      console.warn(
        `Note: Could not create UUID extension, but continuing: ${extensionError.message}`
      );
    }

    // Create documents table using SQL
    console.log('Creating documents table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS vault_documents (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        title text NOT NULL,
        description text,
        file_path text NOT NULL,
        file_name text NOT NULL,
        mime_type text,
        size bigint,
        content_hash text,
        document_type text,
        category text,
        tags jsonb,
        ai_tags jsonb,
        ai_summary text,
        created_by text NOT NULL,
        tenant_id text NOT NULL,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now()
      );
    `);
    console.log('Documents table created successfully');

    // Create audit_trail table using SQL
    console.log('Creating audit_trail table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS vault_audit_trail (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id text NOT NULL,
        event_type text NOT NULL,
        event_details jsonb,
        ip_address text,
        timestamp timestamp with time zone DEFAULT now()
      );
    `);
    console.log('Audit trail table created successfully');

    // Create users table using SQL
    console.log('Creating users table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS vault_users (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        username text UNIQUE NOT NULL,
        password text NOT NULL,
        email text UNIQUE,
        name text,
        role text DEFAULT 'user',
        tenant_id text NOT NULL,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now()
      );
    `);
    console.log('Users table created successfully');

    // Create admin user if it doesn't exist
    console.log('Creating admin user...');
    const checkAdminQuery = await client.query('SELECT id FROM vault_users WHERE username = $1', [
      'admin',
    ]);

    const existingAdmin = checkAdminQuery.rows.length > 0 ? checkAdminQuery.rows[0] : null;

    if (!existingAdmin) {
      await client.query(`
        INSERT INTO vault_users (
          username, 
          password, 
          email, 
          name, 
          role, 
          tenant_id
        ) VALUES (
          'admin',
          'admin123', -- This would be properly hashed in production
          'admin@trialsage.com',
          'TrialSage Administrator',
          'admin',
          'default'
        )
      `);
      console.log('Admin user created successfully');
    } else {
      console.log('Admin user already exists');
    }

    console.log('TrialSage Vault database setup completed successfully!');
  } catch (error) {
    console.error('Database setup failed:', error);
    process.exit(1);
  } finally {
    // Release the client back to the pool
    client.release();

    // Close the pool
    await pool.end();
    console.log('Database connection closed');
  }
}

// Run the setup
setupDatabase();
