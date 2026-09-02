import { insertCmcDissolutionProfileSchema } from '../shared/schema';

const candidate = {
  organizationId: 1,
  productName: 'X',
  apparatus: 'USP II (paddle)',
  medium: 'water',
  results: { note: 'not an array' },
};

const r = insertCmcDissolutionProfileSchema.safeParse(candidate);
console.log('insert schema success:', r.success);
if (r.success) {
  console.log('parsed results value:', JSON.stringify((r.data as any).results));
} else {
  console.log('errors:', JSON.stringify(r.error.issues, null, 2));
}
