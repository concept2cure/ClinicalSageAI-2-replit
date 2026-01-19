// @ts-nocheck
// Re-export all from schema.ts for ESM compatibility
export * from './schema.ts';

// Explicitly export the missing identifiers
export {
	deviceDataCenter,
	deviceDataCategories,
	deviceTestStandards,
	projects,
} from './schema';
