#!/usr/bin/env node
/** Offline, read-only fixture verification. Not an AnA run or a clinical validation. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function verifySyntheticCsrSource(source, rawBytes) {
  if (source?.format !== 'concept2cure.csr-source.v1' ||
      !/SYNTHETIC/i.test(source.studyInfo?.title ?? '') ||
      !/FICTIONAL DEMO/i.test(source.studyInfo?.sponsor ?? '')) {
    throw new Error('Synthetic-only identity or source format is missing');
  }
  const people = source.participants ?? [];
  if (people.length !== 23 || source.studyInfo.sampleSize !== 23 ||
      new Set(people.map(p => p.subjectId)).size !== 23 ||
      people.some(p => !p.subjectId.startsWith('DEMO-'))) {
    throw new Error('Synthetic participant count or identity is inconsistent');
  }
  const armCounts = source.studyData.treatmentArms.map(arm => ({
    id: arm.armId, n: people.filter(p => p.armId === arm.armId && p.randomized).length,
    declared: arm.randomized,
  }));
  if (armCounts.length !== 2 || armCounts.some(arm => arm.n !== arm.declared) ||
      armCounts.reduce((n, arm) => n + arm.n, 0) !== 23) {
    throw new Error('Arm denominators do not reconcile');
  }
  const endpoints = source.studyData.efficacy ?? [];
  if (endpoints.length !== 2 || endpoints.some(e => e.pValue !== undefined || e.ci !== undefined ||
      !/simulated/i.test(e.display))) {
    throw new Error('Illustrative endpoints contain unsupported statistics or missing labels');
  }
  if (Math.abs(endpoints[0].value - 10 / 12) > 1e-12 ||
      Math.abs(endpoints[1].value - 4 / 11) > 1e-12) {
    throw new Error('Illustrative endpoint fractions do not reconcile');
  }
  return {
    status: 'offline_fixture_verified_only',
    sourceSha256: createHash('sha256').update(rawBytes).digest('hex'),
    syntheticParticipants: 23,
    armCounts,
    illustrativeSuccesses: [10, 4],
    adverseEventRecords: source.studyData.adverseEvents.length,
    realClientCreated: false,
    realProjectCreated: false,
    vaultUploaded: false,
    anaExecuted: false,
    medicalWritingQualified: false,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fixture = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
    '../seed-data/lmn201_synthetic_csr_source_v1.json');
  const raw = readFileSync(fixture);
  try {
    console.log(JSON.stringify(verifySyntheticCsrSource(JSON.parse(raw.toString('utf8')), raw), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
