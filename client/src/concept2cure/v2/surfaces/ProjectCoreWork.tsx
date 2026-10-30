/** Reach the existing core services from project initiation; never create an app or document here. */
import React, { useState } from 'react';
import { APP_REGISTRY } from '@shared/regulatory/app-registry';
import { I } from '../icons';

interface Props {
  programId: string;
  cmcComposes: boolean;
  available: (id: string) => boolean;
  onNav: (id: string) => void;
}

export function ProjectCoreWork({ programId, cmcComposes, available, onNav }: Props) {
  const [choice, setChoice] = useState({ programId, id: '' });
  const choices = [
    { id: APP_REGISTRY.study_protocol_design.moduleId!, label: APP_REGISTRY.study_protocol_design.label,
      description: 'Design the clinical trial and its protocol together: objectives, population, assessments, statistics, design checks and review.' },
    ...(cmcComposes ? [{ id: 'cmc', label: APP_REGISTRY.cmc.label,
      description: 'Compose Module 3 for this small-molecule US IND using the project’s quality records.' }] : []),
    { id: 'rbm', label: 'Risk-based monitoring',
      description: 'Assess study risks, quality signals and monitoring actions in the existing monitoring records.' },
    { id: 'biostatistics', label: APP_REGISTRY.biostatistics.label,
      description: 'Plan statistical methods and evaluate study-design calculations using the existing tools.' },
  ].filter(item => available(item.id));
  const selected = choice.programId === programId ? choices.find(item => item.id === choice.id) : undefined;
  if (!programId || !choices.length) return null;

  return <section className="pj-sec" aria-labelledby="pj-core-work-h">
    <div className="pj-sec-h"><h2 id="pj-core-work-h">Start work in this project</h2></div>
    <p className="pj-desc">Choose work for this project. Document drafting uses the shared canvas and editor.</p>
    <div className="pj-core-work-controls">
      <label htmlFor="pj-core-work">Core work</label>
      <select id="pj-core-work" value={selected?.id ?? ''}
        aria-describedby="pj-core-work-description"
        onChange={event => setChoice({ programId, id: event.target.value })}>
        <option value="">Choose work</option>
        {choices.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      <button type="button" className="btn ghost" disabled={!selected}
        onClick={() => { if (selected && available(selected.id)) onNav(selected.id); }}>
        Start selected work {I.right}
      </button>
    </div>
    <p id="pj-core-work-description" className="pj-desc" role="status">
      {selected?.description ?? 'Select the work you need to see what it covers.'}
    </p>
  </section>;
}
