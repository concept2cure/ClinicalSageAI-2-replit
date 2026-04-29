/**
 * Phase 3 Projects — pathway-aware default phases.
 *
 * Verbatim from design-system/ui_kits/home/Projects.jsx (PHASE_PRESETS +
 * buildPhases, lines 20–35).
 */
import type { ProjectPhase, PhaseStatus } from '../types';

export type Preset = '510K' | 'IND' | 'NDA' | 'CER';

export const PHASE_PRESETS: Record<Preset, string[]> = {
  '510K': [
    'Project setup', 'Device description', 'Predicate comparison',
    'Clinical evaluation', 'Performance testing', 'Biocompatibility',
    'Labeling', 'Pre-submission meeting', 'Final submission',
  ],
  IND: [
    'Project setup', 'CMC information', 'Nonclinical studies',
    'Clinical protocol', 'Investigator brochure', 'FDA forms',
    'Internal review', 'IND submission',
  ],
  NDA: [
    'Project setup', 'Module 1 · admin', 'Module 2 · summaries',
    'Module 3 · quality', 'Module 4 · nonclinical', 'Module 5 · clinical',
    'QC review', 'NDA submission',
  ],
  CER: [
    'Project setup', 'Scope and device description', 'Literature search',
    'Clinical data analysis', 'Benefit-risk assessment', 'Conclusions',
    'Expert review', 'Final approval',
  ],
};

export function buildPhases(preset: Preset, currentIdx: number): ProjectPhase[] {
  const names = PHASE_PRESETS[preset] || PHASE_PRESETS['510K'];
  return names.map((name, i): ProjectPhase => {
    const status: PhaseStatus =
      i < currentIdx ? 'completed' : i === currentIdx ? 'current' : 'upcoming';
    return {
      id: `p${i}`,
      name,
      status,
      progress: i < currentIdx ? 100 : i === currentIdx ? 60 : 0,
    };
  });
}
