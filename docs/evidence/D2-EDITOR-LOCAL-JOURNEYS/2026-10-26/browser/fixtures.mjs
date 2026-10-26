export const PROGRAM = 'bbbbbbbb-0000-4000-8000-000000000261';
export const OTHER_PROGRAM = 'bbbbbbbb-0000-4000-8000-000000000262';
export const DOC = 'dddddddd-0000-4000-8000-000000000261';
export const actor = { id: '261', organizationId: '26', email: 'local-handoff@example.test',
  displayName: 'Synthetic author', roles: ['admin'], permissions: ['governed:write'] };
export const sources = [{ kind: 'data-room', sourceId: 41, expectedChecksum: '1'.repeat(64) },
  { kind: 'vault', documentId: '99999999-0000-4000-8000-000000000261', expectedChecksum: '2'.repeat(64) }];
export const document = { id: DOC, title: 'Synthetic diagnostics working document', program_id: PROGRAM,
  status: 'DRAFT', readScope: 'document', section_count: 1, client_program_id: PROGRAM, created_by: '261' };
export const bearer = (visit = 'initial') => `fixture.${btoa(JSON.stringify({ userId: 261, organizationId: 26, visit }))}.synthetic`;
