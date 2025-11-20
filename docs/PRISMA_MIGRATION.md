# Migrating Device Profile Service to Prisma

This document provides step-by-step instructions for migrating the Device Profile service from an in-memory Map to a real PostgreSQL database using Prisma.

## Prerequisites

- Ensure PostgreSQL is set up and running
- Have a valid DATABASE_URL connection string available
- The unified device profile API is fully tested and working

## Migration Steps

### 1. Set Up Database Connection

Add your PostgreSQL connection string to your environment variables:

```
DATABASE_URL="postgresql://username:password@host:port/dbname?schema=public"
```

This can be added in Replit Secrets or your `.env` file for local development. You can use Heroku Postgres, Supabase, or another PostgreSQL provider for your database.

### 2. Install Prisma

```bash
npm install prisma @prisma/client
npx prisma init
```

This will create a `prisma/` folder with necessary configuration files.

### 3. Define the DeviceProfile Schema

Edit `prisma/schema.prisma` to include the DeviceProfile model:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model DeviceProfile {
  id             String   @id @default(uuid())
  name           String
  classification String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  organizationId Int?     // For multi-tenancy

  // Add any additional fields needed here
  documentation  String?
  manufacturer   String?
  model          String?
  riskLevel      String?
  regulatoryClass String?
  approvalStatus String?

  // Add relations if needed
  // e.g., submissions   FDA510kSubmission[]
}
```

### 4. Run Your First Migration

```bash
npx prisma migrate dev --name init_device_profiles
```

This creates the necessary database tables according to your schema.

### 5. Generate the Prisma Client

```bash
npx prisma generate
```

This produces the necessary client code in `node_modules/@prisma/client` for your application to interact with the database.

### 5. Update the DeviceProfile Service

Update the existing service to use Prisma instead of the in-memory Map:

```typescript
// server/services/deviceProfileService.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// List all profiles with optional tenant filtering
export function listProfiles(organizationId?: number) {
  return prisma.deviceProfile.findMany({
    where: organizationId ? { organizationId } : {},
    orderBy: { createdAt: 'desc' },
  });
}

// Get a single profile by ID
export function getProfile(id: string) {
  return prisma.deviceProfile.findUnique({
    where: { id },
  });
}

// Create a new profile
export function createProfile(data: {
  name: string;
  classification: string;
  organizationId?: number;
  // Add other fields as needed
}) {
  return prisma.deviceProfile.create({ data });
}

// Update an existing profile
export function updateProfile(
  id: string,
  data: Partial<{
    name: string;
    classification: string;
    organizationId?: number;
    // Add other fields as needed
  }>
) {
  return prisma.deviceProfile.update({
    where: { id },
    data,
  });
}

// Delete a profile
export function deleteProfile(id: string) {
  return prisma.deviceProfile.delete({
    where: { id },
  });
}
```

### 6. Remove the Old Map Logic

Delete the lines importing or instantiating your old `Map` store in the device profile service. Make sure all imports now point to the Prisma-backed service.

### 7. Seed Existing Data (Optional)

If you need to migrate your existing in-memory data to the database, create a script:

```typescript
// scripts/seedProfiles.ts
import { PrismaClient } from '@prisma/client';
import oldProfiles from '../server/services/deviceProfileMapData'; // wherever you export your Map data

const prisma = new PrismaClient();
async function seed() {
  for (const p of oldProfiles) {
    await prisma.deviceProfile.upsert({
      where: { id: p.id },
      update: { ...p },
      create: { ...p },
    });
    console.log(`Migrated profile: ${p.name}`);
  }
  console.log('Seed complete');
  process.exit();
}
seed()
  .catch(e => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

Run the script to perform the migration:

```bash
npx ts-node scripts/seedProfiles.ts
```

### 8. Update Tests

Modify the existing tests to work with the Prisma database instead of the in-memory Map:

- Use a test database or transactions for testing
- Add setup/teardown code to clean the database between tests
- Consider using mocks for unit tests to avoid database dependencies

### 9. Verify the Migration

After completing the migration:

1. **Restart your server**: your unified routes now hit Postgres instead of the in-memory Map
2. Run all tests to verify functionality
3. Manually test the device profile API endpoints
4. Test both the 510(k) intake and Device Profiles dashboard: create, edit, delete profiles
5. Restart the app and confirm the data persists
6. Check for any performance differences
7. Verify multi-tenant isolation if applicable

### 10. Commit & Deploy

```bash
git add prisma/ server/services/deviceProfileService.ts
git commit -m "Migrate DeviceProfileService to Prisma/Postgres"
```

Deploy to your staging environment (ensuring `DATABASE_URL` is set), run `prisma migrate deploy`, and you're live with a real database.

## Benefits of Using Prisma

- **Data Persistence**: Profiles persist between server restarts
- **Type Safety**: Strong TypeScript integration
- **Schema Validation**: Enforced at the database level
- **Migrations**: Automatic schema migrations
- **Relations**: Easy handling of related data
- **Filtering & Sorting**: Advanced query capabilities
- **Transactions**: ACID compliant operations

## Future Enhancements

- Add database indexes for frequently queried fields
- Implement database-level pagination for large datasets
- Add soft delete functionality if needed
- Consider implementing a caching layer for frequently accessed profiles
