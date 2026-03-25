export type KernelMode = 'enforce' | 'shadow';

export interface AnaPolicyBundle {
  id: string;
  version: string;
  mode: KernelMode;
  immutableRoutePatterns: RegExp[];
  identityExemptRoutePatterns: RegExp[];
  highRiskRegulatoryRoutePatterns: RegExp[];
  protectedAttributeTerms: string[];
  scientificIntegrityTerms: string[];
  biasTermThreshold: number;
  scoreWeights: {
    immutabilityViolation: number;
    biasRisk: number;
    missingActorIdentity: number;
    highRiskMissingActor: number;
    scientificIntegrityRisk: number;
  };
  reviewThreshold: number;
  denyThreshold: number;
}

export const defaultAnaPolicyBundle: AnaPolicyBundle = {
  id: 'ana-1-0-ri-core',
  version: '1.3.0',
  mode: process.env.ANA_KERNEL_MODE === 'shadow' ? 'shadow' : 'enforce',
  immutableRoutePatterns: [/^\/api\/audit\/events/, /^\/api\/audit\/bulk-delete/],
  identityExemptRoutePatterns: [/^\/health$/, /^\/api\/health/, /^\/api\/public/],
  highRiskRegulatoryRoutePatterns: [/^\/api\/cer/, /^\/api\/510k/, /^\/api\/ectd/, /^\/api\/cmc/],
  protectedAttributeTerms: [
    'race',
    'religion',
    'ethnicity',
    'pregnancy',
    'disability',
    'age',
    'gender',
  ],
  scientificIntegrityTerms: [
    'fabricate data',
    'falsify',
    'hide adverse event',
    'invent endpoint result',
    'manipulate trial outcome',
  ],
  biasTermThreshold: 2,
  scoreWeights: {
    immutabilityViolation: 70,
    biasRisk: 35,
    missingActorIdentity: 20,
    highRiskMissingActor: 25,
    scientificIntegrityRisk: 80,
  },
  reviewThreshold: 75,
  denyThreshold: 40,
};
