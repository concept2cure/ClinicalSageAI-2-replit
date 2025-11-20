import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const PROD = 'DP-001';

  await prisma.cmcStageGate.createMany({
    data: [
      {
        productId: PROD,
        name: 'Formulation Development',
        owner: 'Dr. Patel',
        status: 'APPROVED',
        startDate: new Date('2025-06-01'),
        dueDate: new Date('2025-06-20'),
        progress: 100,
      },
      {
        productId: PROD,
        name: 'Method Validation',
        owner: 'Dr. Johnson',
        status: 'READY_FOR_QA',
        startDate: new Date('2025-06-15'),
        dueDate: new Date('2025-07-10'),
        progress: 92,
      },
      {
        productId: PROD,
        name: 'Stability Studies',
        owner: 'A. Rivera',
        status: 'IN_PROGRESS',
        startDate: new Date('2025-06-10'),
        dueDate: new Date('2025-09-10'),
        progress: 60,
      },
      {
        productId: PROD,
        name: 'Specs Finalization (3.2.P.5)',
        owner: 'K. Lee',
        status: 'IN_PROGRESS',
        startDate: new Date('2025-07-05'),
        dueDate: new Date('2025-08-22'),
        progress: 45,
      },
      {
        productId: PROD,
        name: 'Module 3 Authoring',
        owner: 'M. Nguyen',
        status: 'IN_PROGRESS',
        startDate: new Date('2025-07-20'),
        dueDate: new Date('2025-09-01'),
        progress: 50,
      },
      {
        productId: PROD,
        name: 'QA Review & Sign-off',
        owner: 'QA Team',
        status: 'NOT_STARTED',
        startDate: new Date('2025-08-25'),
        dueDate: new Date('2025-09-05'),
        progress: 0,
      },
      {
        productId: PROD,
        name: 'Regulatory Approval',
        owner: 'Reg CMC',
        status: 'NOT_STARTED',
        startDate: new Date('2025-09-06'),
        dueDate: new Date('2025-09-15'),
        progress: 0,
      },
    ],
  });

  await prisma.cmcTask.createMany({
    data: [
      {
        productId: PROD,
        section: '3.2.P.5',
        title: 'Add microbial limits to 3.2.P.5',
        why: 'Rule P5-007 (non-sterile).',
        owner: 'You',
        role: 'Reg Writer',
        priority: 'HIGH',
        status: 'OPEN',
        dueDate: new Date('2025-08-22'),
        link: '/authoring/documents/DP-001/sections/3.2.P.5',
      },
      {
        productId: PROD,
        section: '3.2.P.8',
        title: 'Attach Q1E trend analysis',
        why: 'Rule P8-008 requires stats model.',
        owner: 'You',
        role: 'CMC Analyst',
        priority: 'MEDIUM',
        status: 'IN_REVIEW',
        dueDate: new Date('2025-08-19'),
        link: '/authoring/documents/DP-001/sections/3.2.P.8',
      },
      {
        productId: PROD,
        section: '3.2.P.7',
        title: 'Update CCS description to match stability',
        why: 'X-005 mismatch flagged.',
        owner: 'You',
        role: 'Reg Writer',
        priority: 'CRITICAL',
        status: 'OPEN',
        dueDate: new Date('2025-08-17'),
        link: '/authoring/documents/DP-001/sections/3.2.P.7',
      },
    ],
  });

  await prisma.cmcValidationIssue.createMany({
    data: [
      {
        productId: PROD,
        section: '3.2.P.5',
        ruleId: 'P5-001',
        severity: 'ERROR',
        title: 'Missing justification on Assay limit',
        owner: 'K. Lee',
      },
      {
        productId: PROD,
        section: '3.2.P.8',
        ruleId: 'P8-003',
        severity: 'ERROR',
        title: 'Shelf-life exceeds supported data',
        owner: 'A. Rivera',
      },
      {
        productId: PROD,
        section: '3.2.P.5',
        ruleId: 'P5-007',
        severity: 'WARNING',
        title: 'Microbiological quality not specified',
        owner: 'You',
      },
      {
        productId: PROD,
        section: '3.2.P.8',
        ruleId: 'P8-008',
        severity: 'WARNING',
        title: 'Trend analysis methodology not attached',
        owner: 'You',
      },
    ],
  });

  await prisma.cmcRisk.createMany({
    data: [
      {
        productId: PROD,
        title: 'Dissolution method re-validation may be required',
        owner: 'Dr. Johnson',
        impact: 'HIGH',
        probability: 'MEDIUM',
        mitigation: 'Parallel verification with compendial ref.',
        status: 'OPEN',
      },
      {
        productId: PROD,
        title: 'API lot #102 short expiry for stability extension',
        owner: 'Supply Chain',
        impact: 'MEDIUM',
        probability: 'HIGH',
        mitigation: 'Source additional API; extend retest if justified.',
        status: 'MONITOR',
      },
    ],
  });

  await prisma.cmcMethod.createMany({
    data: [
      { productId: PROD, name: 'Assay (HPLC)', status: 'APPROVED' },
      { productId: PROD, name: 'Related Substances (UPLC)', status: 'APPROVED' },
      { productId: PROD, name: 'Dissolution (USP Apparatus 2)', status: 'IN_VALIDATION' },
      { productId: PROD, name: 'Water Content (KF)', status: 'APPROVED' },
      { productId: PROD, name: 'Identification (IR)', status: 'APPROVED' },
      { productId: PROD, name: 'Microbial Quality (USP <61>/<62>)', status: 'IN_VALIDATION' },
    ],
  });
}

run()
  .then(() => {
    console.log('Seeded');
    process.exit(0);
  })
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
