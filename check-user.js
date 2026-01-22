const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5432/clinicalsage' });

(async () => {
  try {
    // Check auth_users
    const authResult = await pool.query("SELECT id, email, is_active, email_verified FROM auth_users WHERE email = 'jm.smith@concept2cure.pro'");
    console.log('\n=== auth_users TABLE ===');
    console.log('Count:', authResult.rows.length);
    if (authResult.rows.length > 0) {
      console.log('User:', JSON.stringify(authResult.rows[0], null, 2));
      
      // Check password
      const hashResult = await pool.query("SELECT password_hash FROM auth_users WHERE email = 'jm.smith@concept2cure.pro'");
      const isValid = await bcrypt.compare('demo123', hashResult.rows[0].password_hash);
      console.log('Password valid for demo123:', isValid);
    }
    
    // Check users
    const userResult = await pool.query("SELECT id, email, name, status FROM users WHERE email = 'jm.smith@concept2cure.pro'");
    console.log('\n=== users TABLE ===');
    console.log('Count:', userResult.rows.length);
    if (userResult.rows.length > 0) {
      console.log('User:', JSON.stringify(userResult.rows[0], null, 2));
      
      // Check password
      const hashResult = await pool.query("SELECT password_hash FROM users WHERE email = 'jm.smith@concept2cure.pro'");
      const isValid = await bcrypt.compare('demo123', hashResult.rows[0].password_hash);
      console.log('Password valid for demo123:', isValid);
    }
    
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    await pool.end();
    process.exit(1);
  }
})();
