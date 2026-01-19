import { hash } from 'bcrypt';
import { db } from '../../server/db';
import * as schema from '../schema';

export const UserFactory = {
  async create(attrs: Partial<any> = {}) {
    const password = attrs.passwordHash || (await hash('test123', 10));
    const [user] = await db
      .insert(schema.users)
      .values({
        email: `test+${Date.now()}@trialsage.ai`,
        name: 'Test User',
        passwordHash: password,
        defaultOrganizationId: 1,
        ...attrs,
      } as any)
      .returning();
    return user;
  },

  async cleanup() {
    await db.delete(schema.users).where(schema.users.email.like('test+%') as any);
  },
};

export const RegulatoryAtomFactory = {
  async create(submissionId: string, attrs: Partial<any> = {}) {
    const [atom] = await db
      .insert(schema.regulatoryAtoms)
      .values({
        submissionId,
        atomType: 'clinical_evidence',
        atomData: {},
        applicableJurisdictions: ['FDA', 'EU'],
        complianceScore: 0.85,
        ...attrs,
      } as any)
      .returning();
    return atom;
  },
};

export const Cerv2SubmissionFactory = {
  async create(attrs: Partial<any> = {}) {
    const [submission] = await db
      .insert(schema.cerv2Submissions)
      .values({
        submissionId: `TEST-${Date.now()}`,
        deviceName: 'Test Device',
        manufacturerName: 'Test Manufacturer',
        status: 'draft',
        ...attrs,
      } as any)
      .returning();
    return submission;
  },
};
