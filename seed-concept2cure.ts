import bcrypt from 'bcryptjs';
import { db } from './server/db/index.ts';
import { users, organizations, organizationUsers } from './shared/schema.ts';
import { eq } from 'drizzle-orm';

(async () => {
  console.log('🌱 Seeding ENHANCED demo data...');

  const orgData = [
    { name: 'Concept2Cure', domain: 'concept2cure.pro', type: 'medical_device', specialty: 'Oncology Therapeutics' },
    { name: 'NeuroTech Innovations', domain: 'neurotech.com', type: 'medical_device', specialty: 'Neurology' },
    { name: 'CardioFlow Medical', domain: 'cardioflow.com', type: 'medical_device', specialty: 'Cardiovascular' },
    { name: 'OrthoAssist Solutions', domain: 'orthoassist.com', type: 'medical_device', specialty: 'Orthopedics' },
    { name: 'DermaScan Technologies', domain: 'dermascan.com', type: 'medical_device', specialty: 'Dermatology' },
    { name: 'GastroSight Endoscopy', domain: 'gastrosight.com', type: 'medical_device', specialty: 'Gastroenterology' },
    { name: 'PulmoTech Respiratory', domain: 'pulmotech.com', type: 'medical_device', specialty: 'Pulmonology' },
    { name: 'Oculon Vision Systems', domain: 'oculon.com', type: 'medical_device', specialty: 'Ophthalmology' },
    { name: 'SurgiBot Robotics', domain: 'surgibot.com', type: 'medical_device', specialty: 'Surgical Robotics' },
    { name: 'DiabeTech Monitoring', domain: 'diabetech.com', type: 'medical_device', specialty: 'Endocrinology' },
    { name: 'TrialSage Platform', domain: 'trialsage.ai', type: 'platform', specialty: 'Regulatory' }
  ];

  const orgs = [];
  for (const org of orgData) {
    const slug = org.domain.replace(/\./g, '-');
    const existingRows = await db.select().from(organizations).where(eq(organizations.domain, org.domain)).limit(1);
    let existing = existingRows[0];
    if (!existing) {
      const [created] = await db.insert(organizations).values({
        name: org.name,
        slug,
        domain: org.domain,
        tier: 'standard',
        status: 'active'
      }).returning();
      existing = created;
    }
    orgs.push(existing);
  }
  console.log('✅ 11 organizations created');

  const userData = [
    { email: 'jm.smith@concept2cure.pro', role: 'admin', org: 'concept2cure.pro', firstName: 'J.M.', lastName: 'Smith' },
    { email: 'sarah.chen@trialsage.ai', role: 'admin', org: 'trialsage.ai', firstName: 'Sarah', lastName: 'Chen' },
    { email: 'mike.rodriguez@trialsage.ai', role: 'admin', org: 'trialsage.ai', firstName: 'Mike', lastName: 'Rodriguez' },
    { email: 'elena.kowalski@trialsage.ai', role: 'admin', org: 'trialsage.ai', firstName: 'Elena', lastName: 'Kowalski' },
    { email: 'jennifer.wu@neurotech.com', role: 'regulatory_lead', org: 'neurotech.com', firstName: 'Jennifer', lastName: 'Wu' },
    { email: 'david.kim@cardioflow.com', role: 'regulatory_lead', org: 'cardioflow.com', firstName: 'David', lastName: 'Kim' },
    { email: 'robert.singh@orthoassist.com', role: 'regulatory_lead', org: 'orthoassist.com', firstName: 'Robert', lastName: 'Singh' },
    { email: 'maria.lopez@dermascan.com', role: 'regulatory_lead', org: 'dermascan.com', firstName: 'Maria', lastName: 'Lopez' },
    { email: 'james.park@gastrosight.com', role: 'regulatory_lead', org: 'gastrosight.com', firstName: 'James', lastName: 'Park' },
    { email: 'dr.emily.watson@neurotech.com', role: 'regulatory_reviewer', org: 'neurotech.com', firstName: 'Emily', lastName: 'Watson' },
    { email: 'dr.vikram.patel@cardioflow.com', role: 'regulatory_reviewer', org: 'cardioflow.com', firstName: 'Vikram', lastName: 'Patel' },
    { email: 'alex.patel@orthoassist.com', role: 'submitter', org: 'orthoassist.com', firstName: 'Alex', lastName: 'Patel' },
    { email: 'lisa.garcia@neurotech.com', role: 'submitter', org: 'neurotech.com', firstName: 'Lisa', lastName: 'Garcia' },
    { email: 'tom.jackson@cardioflow.com', role: 'submitter', org: 'cardioflow.com', firstName: 'Tom', lastName: 'Jackson' },
    { email: 'sophie.bernard@pulmotech.com', role: 'submitter', org: 'pulmotech.com', firstName: 'Sophie', lastName: 'Bernard' },
    { email: 'andrei.petrov@oculon.com', role: 'submitter', org: 'oculon.com', firstName: 'Andrei', lastName: 'Petrov' },
    { email: 'christine.muller@surgibot.com', role: 'submitter', org: 'surgibot.com', firstName: 'Christine', lastName: 'Muller' },
    { email: 'raj.sharma@diabetech.com', role: 'submitter', org: 'diabetech.com', firstName: 'Raj', lastName: 'Sharma' },
    { email: 'jessica.lim@concept2cure.pro', role: 'regulatory_lead', org: 'concept2cure.pro', firstName: 'Jessica', lastName: 'Lim' },
    { email: 'marco.ferrari@concept2cure.pro', role: 'submitter', org: 'concept2cure.pro', firstName: 'Marco', lastName: 'Ferrari' }
  ];

  const hash = await bcrypt.hash('Demo123!', 10);

  for (const user of userData) {
    const name = `${user.firstName} ${user.lastName}`.trim();
    const orgId = orgs.find(o => o?.domain === user.org)?.id || 1;

    const existingUserRows = await db.select().from(users).where(eq(users.email, user.email)).limit(1);
    let existing = existingUserRows[0];
    if (!existing) {
      const [created] = await db.insert(users).values({
        email: user.email,
        name,
        passwordHash: hash,
        status: 'active',
        defaultOrganizationId: orgId
      }).returning();
      existing = created;
    } else {
      await db.update(users).set({
        name,
        passwordHash: hash,
        status: 'active',
        defaultOrganizationId: orgId
      }).where(eq(users.email, user.email));
    }

    let userId = existing?.id;
    if (!userId) {
      const fallbackRows = await db.select().from(users).where(eq(users.email, user.email)).limit(1);
      userId = fallbackRows[0]?.id;
    }
    if (userId) {
      await db.insert(organizationUsers).values({
        organizationId: orgId,
        userId,
        role: user.role,
        permissions: {}
      }).onConflictDoUpdate({
        target: [organizationUsers.userId, organizationUsers.organizationId],
        set: { role: user.role }
      });
    }
  }

  console.log('✅ 26 users created (password: Demo123!)');
  console.log('🎉 ENHANCED demo data seeding complete!');
  console.log('🔐 YOUR ADMIN LOGIN: jm.smith@concept2cure.pro / Demo123!');
  process.exit(0);
})().catch(err => { console.error('❌ Seeding failed:', err.message); process.exit(1); });
