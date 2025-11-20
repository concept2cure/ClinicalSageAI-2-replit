/**
 * Add Founder User Script
 *
 * This script adds a specific founder user account with admin privileges
 * to the TrialSage platform.
 */

import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from '../shared/schema.js';
import { eq } from 'drizzle-orm';
import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

// Password hashing function
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const buf = await scryptAsync(password, salt, 64);
  return `${buf.toString('hex')}.${salt}`;
}

async function addFounderUser() {
  try {
    // Connect to the database
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const db = drizzle(pool, { schema });

    console.log('Connected to database, checking for existing founder account...');

    // Check if the founder account already exists
    const existingUser = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, 'Founder'))
      .execute();

    if (existingUser.length > 0) {
      console.log('Founder account already exists. Updating password...');

      // Update the existing founder account
      await db
        .update(schema.users)
        .set({
          password: await hashPassword('Brielle12s!'),
          role: 'admin',
        })
        .where(eq(schema.users.username, 'Founder'))
        .execute();

      console.log('Founder account password updated successfully!');
    } else {
      console.log('Creating new founder account...');

      // Create the founder account
      await db
        .insert(schema.users)
        .values({
          username: 'Founder',
          email: 'founder@concept2cure.ai',
          password: await hashPassword('Brielle12s!'),
          fullName: 'TrialSage Founder',
          company: 'Concept2Cure.AI',
          role: 'admin',
        })
        .execute();

      console.log('Founder account created successfully!');
    }

    await pool.end();
  } catch (error) {
    console.error('Error adding founder user:', error);
    process.exit(1);
  }
}

addFounderUser();
