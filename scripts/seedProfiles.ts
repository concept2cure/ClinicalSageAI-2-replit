import { PrismaClient } from '@prisma/client';

/**
 * Seed script for migrating device profiles from in-memory Map to Prisma database
 *
 * Run this after configuring Prisma and running the initial migration.
 * This will transfer all existing device profiles to the new Postgres database.
 */

// Import the Map data source (adjust path as needed)
// Note: This will need to be modified to access your current in-memory storage
import { getProfiles } from '../server/services/deviceProfileService';

const prisma = new PrismaClient();

async function seedDatabase() {
  try {
    logger.info('Starting device profile migration to Prisma database...');

    // Get all existing profiles from the in-memory Map
    const existingProfiles = getProfiles();
    logger.info(`Found ${existingProfiles.length} profiles to migrate`);

    // Migrate each profile to the Prisma database
    let successCount = 0;
    let errorCount = 0;

    for (const profile of existingProfiles) {
      try {
        await prisma.deviceProfile.upsert({
          where: { id: profile.id },
          create: {
            id: profile.id,
            name: profile.name,
            classification: profile.classification || 'Unknown',
            organizationId: profile.organizationId || null,
            documentation: profile.documentation || null,
            manufacturer: profile.manufacturer || null,
            model: profile.model || null,
            riskLevel: profile.riskLevel || null,
            regulatoryClass: profile.regulatoryClass || null,
            approvalStatus: profile.approvalStatus || null,
          },
          update: {
            name: profile.name,
            classification: profile.classification || 'Unknown',
            organizationId: profile.organizationId || null,
            documentation: profile.documentation || null,
            manufacturer: profile.manufacturer || null,
            model: profile.model || null,
            riskLevel: profile.riskLevel || null,
            regulatoryClass: profile.regulatoryClass || null,
            approvalStatus: profile.approvalStatus || null,
          },
        });

        logger.info(`✓ Migrated profile: ${profile.name} (${profile.id})`);
        successCount++;
      } catch (error) {
        logger.error(`✗ Failed to migrate profile ${profile.name} (${profile.id}):`, error);
        errorCount++;
      }
    }

    logger.info('\nMigration Summary:');
    logger.info(`Total profiles processed: ${existingProfiles.length}`);
    logger.info(`Successfully migrated: ${successCount}`);
    logger.info(`Failed to migrate: ${errorCount}`);
    logger.info('\nMigration complete!');
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed function
seedDatabase();
