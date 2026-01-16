export interface DeepCSRData {
  regulatory: {
    submission_id: string;
    regulatory_agency: 'FDA' | 'EMA' | 'Health Canada' | 'Unknown';
    study_id: string;
  };

  protocol: {
    design: {
      type: 'parallel_group' | 'crossover' | 'factorial' | 'single_arm';
      allocation: 'randomized' | 'non_randomized';
      phase: 'Phase 1' | 'Phase 2' | 'Phase 3' | 'Phase 4';
      is_adaptive: boolean;
    };
    endpoints: {
      primary: { description: string; timepoint: string; statistical_method?: string };
    };
  };

  population: {
    enrollment: {
      randomized_n: number;
      completed_n: number;
      discontinued_n: number;
    };
    demographics: {
      age: { mean?: number; median?: number };
      sex: { male_percent: number; female_percent: number };
    };
  };

  safety: {
    adverse_events: {
      overall_incidence: {
        any_ae_percent: number;
        any_sae_percent: number;
        discontinuation_percent: number;
      };
      by_system_organ_class?: Array<{
        soc: string;
        preferred_terms: Array<{ pt: string; count: number; percent: number }>;
      }>;
    };
  };

  _extractionMetadata?: {
    confidenceScore: number;
    missingSections: string[];
  };
}
