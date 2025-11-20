/**
 * TypeScript type definitions for CMC (Chemistry, Manufacturing, and Controls) module
 */

// Molecular Structure types
export interface Ingredient {
  name: string;
  function: string;
  amount: string;
}

export interface Formulation {
  dosageForm: string;
  routeOfAdministration: string;
  ingredients?: Ingredient[];
}

export interface MolecularStructure {
  moleculeName: string;
  molecularFormula: string;
  smiles?: string;
  inchi?: string;
  molecularWeight?: string;
  synthesisPathway?: string;
  analyticalMethods?: string[];
  formulation?: Formulation;
}

// CMC Blueprint Generator response types
export interface SectionMetadata {
  sectionId: string;
  generatedAt: string;
  model: string;
  tokens: number;
  error?: boolean;
  errorMessage?: string;
}

export interface ContentSubsection {
  title: string;
  content: string;
  subsections?: ContentSubsection[];
}

export interface SectionContent {
  title: string;
  content: string;
  subsections: ContentSubsection[];
  metadata: SectionMetadata;
}

export interface Diagram {
  url: string;
  revisedPrompt?: string;
  generatedAt: string;
  error?: boolean;
  errorMessage?: string;
}

export interface CMCBlueprintResponse {
  drugSubstance: Record<string, SectionContent>;
  drugProduct: Record<string, SectionContent>;
  diagrams: Record<string, Diagram>;
  metadata: {
    generatedAt: string;
    molecule: {
      name: string;
      formula: string;
    };
  };
}

export interface CompositionItem {
  name: string;
  amount: string;
  function: string;
  reference: string;
}

export interface DrugProductComposition {
  activeIngredient: CompositionItem;
  inactiveIngredients: CompositionItem[];
}

export interface P1SectionContent extends SectionContent {
  composition: DrugProductComposition;
  description: string;
  containerClosure: string;
}

// Molecular Properties types
export interface MolecularProperties {
  iupacName: string;
  molecularWeight: number;
  exactMass: number;
  logP: number;
  hbondDonors: number;
  hbondAcceptors: number;
  rotatableBonds: number;
  tpsa: number;
  appearance: string;
  solubility: string;
  therapeuticClass: string;
  metadata: {
    identifier: string;
    identifierType: string;
    generatedAt: string;
    source: string;
    model: string;
  };
}

// CMC Analysis types
export interface CrystallineStructure {
  description: string;
  crystalSystem: string;
  spaceGroup?: string;
  unitCellDimensions?: {
    a?: number;
    b?: number;
    c?: number;
    alpha?: number;
    beta?: number;
    gamma?: number;
  };
  visualizations?: string[];
}

export interface PolymorprhAnalysis {
  name: string;
  description: string;
  stabilityData?: Record<string, string | number>;
  recommendedForm?: string;
  visualizations?: string[];
}

export interface StabilityData {
  condition: string;
  duration: string;
  results: Record<string, string | number>;
  conclusion: string;
}

export interface ManufacturingRisk {
  riskType: string;
  description: string;
  likelihood: 'Low' | 'Medium' | 'High';
  impact: 'Low' | 'Medium' | 'High';
  mitigationStrategy?: string;
}

export interface ManufacturingRiskAssessment {
  identifiedRisks: ManufacturingRisk[];
  overallRiskLevel: 'Low' | 'Medium' | 'High';
  recommendedControls: string[];
  conclusion: string;
}
