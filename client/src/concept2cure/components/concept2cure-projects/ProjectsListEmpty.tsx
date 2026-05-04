/**
 * ProjectsListEmpty — zero-projects + zero-results states for the list.
 * Mirror of design-system/ui_kits/home/ProjectsExtras.jsx (lines 377–408).
 */
import { I } from './icons';

interface Props {
  kind: 'no-projects' | 'no-results';
  onCreate?: () => void;
  onClear?: () => void;
}

export function ProjectsListEmpty({ kind, onCreate, onClear }: Props) {
  if (kind === 'no-projects') {
    return (
      <div className="ple">
        <div className="ple-ico">{I.beaker}</div>
        <div className="ple-title">No projects yet</div>
        <div className="ple-sub">
          A project is a persistent workspace — chats, memory, instructions and files Claude carries across sessions. Start with a template, or build from scratch.
        </div>
        <div className="ple-actions">
          <button type="button" className="prj-btn primary" onClick={onCreate}>
            {I.plus} New project
          </button>
          <button type="button" className="prj-btn" onClick={onCreate}>
            Browse templates
          </button>
        </div>
        <div className="ple-suggest">
          <div className="ple-suggest-h">Suggested starting points</div>
          <ul className="ple-suggest-list">
            <li><span className="ple-suggest-tag">510(k)</span> Class II device — predicate selection, eSTAR drafting, internal QC</li>
            <li><span className="ple-suggest-tag">IND</span> First-in-human study — CMC, nonclinical, clinical protocol, FDA forms</li>
            <li><span className="ple-suggest-tag">CER</span> EU MDR — Article 61 clinical evaluation, FAERS adjudication, PMS</li>
            <li><span className="ple-suggest-tag">NDA</span> CTD modules 1–5, e-CTD bundling, agency response tracking</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="ple ple-noresults">
      <div className="ple-ico">{I.search}</div>
      <div className="ple-title">No projects match your filters</div>
      <div className="ple-sub">Try clearing one or more filters, or search by name, sponsor, or product.</div>
      <button type="button" className="prj-btn" onClick={onClear}>Clear filters</button>
    </div>
  );
}
