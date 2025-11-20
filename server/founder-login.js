/**
 * Add Founder User Script
 *
 * This script directly adds the founder user to the database.
 */

import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';
import { Pool } from 'pg';

const scryptAsync = promisify(scrypt);

// Password hashing function
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const buf = await scryptAsync(password, salt, 64);
  return `${buf.toString('hex')}.${salt}`;
}

async function addFounderUser() {
  try {
    console.log('Connecting to database...');

    // Connect to the database
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    // Check if founder user already exists
    const checkResult = await pool.query('SELECT * FROM users WHERE username = $1', ['Founder']);

    if (checkResult.rows.length > 0) {
      console.log('Founder user already exists. Updating password...');

      // Update password if user exists
      const hashedPassword = await hashPassword('Brielle12s!');

      await pool.query("UPDATE users SET password = $1, role = 'admin' WHERE username = $2", [
        hashedPassword,
        'Founder',
      ]);

      console.log('Founder user password updated!');
    } else {
      console.log('Creating founder user...');

      // Create new founder user
      const hashedPassword = await hashPassword('Brielle12s!');

      await pool.query(
        'INSERT INTO users (username, email, password, role, created_at) VALUES ($1, $2, $3, $4, now())',
        ['Founder', 'founder@concept2cure.ai', hashedPassword, 'admin']
      );

      console.log('Founder user created successfully!');
    }

    await pool.end();
  } catch (error) {
    console.error('Error adding founder user:', error);
  }
}

addFounderUser();
