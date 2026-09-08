/* global React, I */

/* Projects — Claude-style project workspace.
   Two states: project LIST (all projects you own) and project DETAIL (one
   project with its chats + memory + instructions + files + timeline + config).
   State is local — no router; clicking a list row drills in, the back link returns.

   Adds two surfaces sourced from the v2 codebase:
   • ProjectTimeline      — mini variant on list rows, full variant above chats.
     Pathway-aware default phases for 510(k) / IND / NDA / CER.
   • ProjectConfigPanel   — right Sheet flyout (4 tabs: General / Instructions /
     Team / Compliance) opened by the gear icon next to project name.
   Both kept tight to the existing token surface — same type sizes, same
   monochrome with one accent color. */

/* ──────────────────────────────────────
   Default phases by submission pathway — mirrors v2:
   components/projects/ProjectTimeline.tsx > DEFAULT_PHASES
   ────────────────────────────────────── */
const PHASE_PRESETS = {
  '510K': ['Project setup', 'Device description', 'Predicate comparison', 'Clinical evaluation', 'Performance testing', 'Biocompatibility', 'Labeling', 'Pre-submission meeting', 'Final submission'],
  IND:    ['Project setup', 'CMC information', 'Nonclinical studies', 'Clinical protocol', 'Investigator brochure', 'FDA forms', 'Internal review', 'IND submission'],
  NDA:    ['Project setup', 'Module 1 · admin', 'Module 2 · summaries', 'Module 3 · quality', 'Module 4 · nonclinical', 'Module 5 · clinical', 'QC review', 'NDA submission'],
  CER:    ['Project setup', 'Scope and device description', 'Literature search', 'Clinical data analysis', 'Benefit-risk assessment', 'Conclusions', 'Expert review', 'Final approval'],
};

function buildPhases(preset, currentIdx) {
  const names = PHASE_PRESETS[preset] || PHASE_PRESETS['510K'];
  return names.map((name, i) => ({
    id: `p${i}`,
    name,
    status: i < currentIdx ? 'completed' : i === currentIdx ? 'current' : 'upcoming',
    progress: i < currentIdx ? 100 : i === currentIdx ? 60 : 0,
  }));
}

const PR_PROJECTS = [
  {
    id: 'c2c-ana',
    name: 'Concept2cure AnA 1.0 Skills',
    desc: 'this is a claud code project for concept2cure AnA 1.0',
    starred: true,
    chats: [
      { id: 'c1', title: 'Pitching Concept2cure to Medidata executives', last: '6 days ago' },
      { id: 'c2', title: 'Concept2Cure equity and royalty deal structure', last: '6 days ago' },
      { id: 'c3', title: 'Aligning Claude Code UI with ChatGPT interface', last: '20 days ago' },
      { id: 'c4', title: 'Adding skill.md to Claude code project', last: '22 days ago' },
    ],
    memory: {
      enabled: true,
      summary: 'Purpose & context: JM Smith is the founder of Concept2Cure (C2C), an AI-powered regulatory intelligence SaaS platform for life sciences…',
      updated: '4 days ago',
    },
    instructions: '',
    files: [
      { name: 'WO-06_CONSISTENCY_CLEANUP.md',                  lines: 192, kind: 'MD' },
      { name: 'WO-05_FINAL_AUDIT_AND_POLISH….md',              lines: 209, kind: 'MD' },
      { name: 'SKILL[1].md',                                    lines: 484, kind: 'MD' },
      { name: 'CLAUDE_MD_UI_CONVERGENCE_SECTION[1].md',         lines: 111, kind: 'MD' },
      { name: 'CLAUDE_CODE_PROMPT_UI_CONVERGENCE[1].md',        lines: 101, kind: 'MD' },
      { name: 'ANA_UI_MASTER_WORK_ORDER[1].md',                 lines: 267, kind: 'MD' },
      { name: 'ANA_CHATGPT_PARITY_UI_DESIGN[1].md',             lines: 621, kind: 'MD' },
    ],
    capacityPct: 1,
    submissionType: '510K', submissionTypeLabel: '510(k)',
    product: 'AnA 1.0 RI', sponsor: 'Concept2Cure', targetAgency: 'FDA',
    targetDate: '2026-09-15', status: 'active',
    phases: buildPhases('510K', 2), daysToTarget: 142,
  },
  {
    id: 'mdx-510k',
    name: 'OR-801 510(k) submission',
    desc: 'Class II orthopedic screw — predicate workup, eSTAR drafting, internal QC.',
    starred: false,
    chats: [
      { id: 'c1', title: 'Substantial equivalence draft v3', last: '2 days ago' },
      { id: 'c2', title: 'Predicate K221847 mismatch resolution', last: '4 days ago' },
      { id: 'c3', title: 'Biocompatibility report — supplier signature', last: '1 week ago' },
    ],
    memory: { enabled: true, summary: 'OR-801 is a Class II orthopedic screw system pursuing 510(k). Predicate K221847 selected; biocompatibility pending supplier signature.', updated: '1 day ago' },
    instructions: 'Always cite the FDA reference in parentheses. Use sentence case. Default to 21 CFR 807.92 ordering.',
    files: [
      { name: 'OR-801_predicate_workup.md',           lines: 142, kind: 'MD' },
      { name: 'OR-801_eSTAR_outline.md',              lines: 88,  kind: 'MD' },
      { name: 'biocompat_summary_v2.pdf',             lines: 36,  kind: 'PDF' },
    ],
    capacityPct: 4,
    submissionType: '510K', submissionTypeLabel: '510(k)',
    product: 'OR-801 orthopedic screw', sponsor: 'BioNova Therapeutics', targetAgency: 'FDA',
    targetDate: '2026-06-30', status: 'in_review',
    phases: buildPhases('510K', 5), daysToTarget: 65,
  },
  {
    id: 'biopharma-nda',
    name: 'NDA 212345 — BX-204 oral',
    desc: 'Oral CGM-adjacent compound; CMC + clinical sections in active drafting.',
    starred: false,
    chats: [
      { id: 'c1', title: 'CMC §3.2.S drug substance — outline', last: 'today' },
      { id: 'c2', title: 'Clinical section 2.5 — Module 2 sweep', last: '3 days ago' },
    ],
    memory: { enabled: false, summary: '', updated: '' },
    instructions: '',
    files: [
      { name: 'BX-204_clinical_overview.md',          lines: 244, kind: 'MD' },
      { name: 'BX-204_module2_2.5.md',                lines: 312, kind: 'MD' },
      { name: 'CMC_drug_substance_3.2.S.md',          lines: 198, kind: 'MD' },
    ],
    capacityPct: 6,
    submissionType: 'NDA', submissionTypeLabel: 'NDA',
    product: 'BX-204 oral', sponsor: 'Concept2Cure', targetAgency: 'FDA',
    targetDate: '2027-02-01', status: 'active',
    phases: buildPhases('NDA', 3), daysToTarget: 290,
  },
  {
    id: 'eu-mdr-iv415',
    name: 'IV-415 EU MDR — companion Dx',
    desc: 'Article 61 clinical evaluation, FAERS adjudication, notified body Q1 review.',
    starred: false,
    chats: [
      { id: 'c1', title: 'FAERS signal adjudication — 3 events', last: '5 hours ago' },
      { id: 'c2', title: 'Article 61 PMS plan v0.4', last: '2 days ago' },
    ],
    memory: { enabled: true, summary: 'IV-415 is a Class III companion diagnostic; EU MDR Article 61. 1,842 literature hits, 47 FAERS signals.', updated: '5 hours ago' },
    instructions: '',
    files: [
      { name: 'IV-415_CER_outline.md',                lines: 187, kind: 'MD' },
      { name: 'FAERS_signals_2026Q3.csv',             lines: 47,  kind: 'CSV' },
    ],
    capacityPct: 2,
    submissionType: 'CER', submissionTypeLabel: 'EU MDR CER',
    product: 'IV-415 companion Dx', sponsor: 'Concept2Cure EU', targetAgency: 'EMA',
    targetDate: '2026-12-15', status: 'in_review',
    phases: buildPhases('CER', 4), daysToTarget: 233,
  },
];

/* ─────────────────────────────────────────────────────────
   List view
   ───────────────────────────────────────────────────────── */
function ProjectsList({ onOpen, onCreate, onOpenSwitcher, onOpenNotifications }) {
  const [query, setQuery] = React.useState('');
  const [filters, setFilters] = React.useState({ type: [], status: [], agency: [], owner: [], activity: [] });
  const [savedView, setSavedView] = React.useState(null);
  const [selected, setSelected] = React.useState([]);
  const [archiveTarget, setArchiveTarget] = React.useState(null); // { project, mode }

  // simulate empty-state via Tweak (no-op default — projects always render)
  const allProjects = PR_PROJECTS;

  const matches = (p) => {
    if (query) {
      const hay = (p.name + ' ' + p.desc + ' ' + (p.product || '') + ' ' + (p.sponsor || '')).toLowerCase();
      if (!hay.includes(query.toLowerCase())) return false;
    }
    if (filters.type.length && !filters.type.includes(p.submissionTypeLabel)) return false;
    if (filters.status.length) {
      const sLabel = ({ active: 'Active', in_review: 'In review', submitted: 'Submitted', draft: 'Draft', archived: 'Archived' })[p.status] || '';
      if (!filters.status.includes(sLabel)) return false;
    }
    if (filters.agency.length && !filters.agency.includes(p.targetAgency)) return false;
    return true;
  };

  const filtered = allProjects.filter(matches);

  function applySavedView(v) {
    if (savedView === v.id) { setSavedView(null); setFilters({ type: [], status: [], agency: [], owner: [], activity: [] }); return; }
    setSavedView(v.id);
    setFilters({ type: [], status: [], agency: [], owner: [], activity: [], ...v.filters });
  }
  function clearFilters() { setFilters({ type: [], status: [], agency: [], owner: [], activity: [] }); setSavedView(null); }

  const totalChips = Object.values(filters).reduce((n, arr) => n + (arr ? arr.length : 0), 0);

  return (
    <div className="prj-list-root" data-screen-label="01 Projects · list">
      <header className="prj-list-head">
        <div>
          <h1 className="prj-list-title">Projects</h1>
          <p className="prj-list-sub">Persistent workspaces with chats, memory, instructions and shared files.</p>
        </div>
        <div className="prj-list-head-r">
          <button className="prj-icon-btn" title="Notifications" onClick={onOpenNotifications}>
            {I.bell || I.notification || '◯'}
            <span className="prj-bell-dot" aria-hidden="true"/>
          </button>
          <button className="prj-icon-btn" title="Quick switch (⌘K)" onClick={onOpenSwitcher}>{I.search || '🔍'}</button>
          <button className="prj-btn primary" onClick={onCreate}><span>{I.plus}</span><span>New project</span></button>
        </div>
      </header>

      {allProjects.length > 0 && (
        <ProjectsListFilters
          filters={filters}
          onChange={setFilters}
          savedView={savedView}
          onSavedView={applySavedView}
          query={query}
          onQuery={setQuery}
        />
      )}

      <ProjectsListBulkBar
        count={selected.length}
        onClear={() => setSelected([])}
        onArchive={() => { setArchiveTarget({ project: { name: `${selected.length} projects`, id: 'bulk', chats: [], files: [] }, mode: 'archive' }); }}
        onExport={() => {}}
        onTransfer={() => {}}
        onDelete={() => { setArchiveTarget({ project: { name: `${selected.length} projects`, id: 'bulk', chats: [], files: [] }, mode: 'delete' }); }}
      />

      {allProjects.length === 0 && (
        <ProjectsListEmpty kind="no-projects" onCreate={onCreate}/>
      )}
      {allProjects.length > 0 && filtered.length === 0 && (
        <ProjectsListEmpty kind="no-results" onClear={clearFilters}/>
      )}

      <div className="prj-list-rows">
        {filtered.map(p => {
          const checked = selected.includes(p.id);
          return (
            <div key={p.id} className={`prj-list-row-wrap ${checked ? 'is-checked' : ''}`}>
              <label className="prj-list-row-check" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setSelected(s => e.target.checked ? [...s, p.id] : s.filter(x => x !== p.id))}
                />
              </label>
              <button className="prj-list-row" onClick={() => onOpen(p.id)}>
                <div className="prj-list-row-l">
                  <div className="prj-list-row-name">
                    {p.name}
                    {p.starred && <span className="prj-list-star" aria-label="Starred">{I.star || '★'}</span>}
                  </div>
                  <div className="prj-list-row-desc">{p.desc}</div>
                </div>
                <div className="prj-list-row-r">
                  {p.phases && (
                    <div className="prj-list-mini" aria-label={`Submission progress — ${Math.round((p.phases.filter(x=>x.status==='completed').length / p.phases.length) * 100)}%`}>
                      <div className="prj-list-mini-track">
                        <div className="prj-list-mini-fill" style={{ width: `${Math.round((p.phases.filter(x=>x.status==='completed').length / p.phases.length) * 100)}%` }}/>
                      </div>
                      <span className="prj-list-mini-lbl">{p.submissionTypeLabel} · {p.phases.filter(x=>x.status==='completed').length}/{p.phases.length}</span>
                    </div>
                  )}
                  <span className="prj-list-count">{p.chats.length} chat{p.chats.length === 1 ? '' : 's'}</span>
                  <span className="prj-list-files">{p.files.length} file{p.files.length === 1 ? '' : 's'}</span>
                </div>
              </button>
            </div>
          );
        })}
      </div>

      <ProjectArchiveModal
        open={!!archiveTarget}
        project={archiveTarget?.project}
        mode={archiveTarget?.mode}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => { setArchiveTarget(null); setSelected([]); }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Detail view — chat list (left) + memory/instructions/files (right)
   ───────────────────────────────────────────────────────── */
function ProjectDetail({ project, onBack }) {
  const [composer, setComposer] = React.useState('');
  const [configOpen, setConfigOpen] = React.useState(false);
  const [archiveMode, setArchiveMode] = React.useState(null); // 'archive'|'delete'|'restore'|null
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [tab, setTab] = React.useState('chats');

  // Cmd+F / Ctrl+F → project-internal search
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!project) return null;

  const TABS = [
    { id: 'chats',        label: 'Chats',        count: project.chats.length },
    { id: 'memory',       label: 'Memory',       count: null },
    { id: 'instructions', label: 'Instructions', count: null },
    { id: 'files',        label: 'Files',        count: project.files.length },
    { id: 'linked',       label: 'Linked',       count: ((typeof PLNK_LINKS !== 'undefined' && PLNK_LINKS[project.id]) || []).length || null },
    { id: 'activity',     label: 'Activity',     count: ((typeof PACT_EVENTS !== 'undefined' && PACT_EVENTS[project.id]) || []).length || null },
  ];

  return (
    <div className="prj-root" data-screen-label={`01 Projects · ${project.name}`}>
      <button className="prj-back" onClick={onBack}>
        <span className="prj-back-ico">{I.arrowLeft}</span>
        <span>All projects</span>
      </button>

      <header className="prj-head">
        <h1 className="prj-title">{project.name}</h1>
        <div className="prj-head-r">
          <button className="prj-icon-btn" title="Search this project (⌘F)" onClick={() => setSearchOpen(true)}>{I.search || '🔍'}</button>
          <button className="prj-icon-btn" title="Configure project" onClick={() => setConfigOpen(true)} data-testid="open-config">{I.settings || '⚙'}</button>
          <ProjectMoreMenu onArchive={() => setArchiveMode('archive')} onDelete={() => setArchiveMode('delete')} onDuplicate={() => {}} onExport={() => {}}/>
          <button className="prj-icon-btn" title="Star" data-on={project.starred}>{I.star || '★'}</button>
        </div>
      </header>
      <p className="prj-desc">{project.desc}</p>

      <nav className="prj-tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className="prj-tab" data-active={tab === t.id} onClick={() => setTab(t.id)}>
            <span>{t.label}</span>
            {t.count != null && <span className="prj-tab-count">{t.count}</span>}
          </button>
        ))}
      </nav>

      {tab === 'chats' && (
      <div className="prj-grid">
        {/* MAIN COLUMN */}
        <section className="prj-main">

          {/* Timeline — full variant */}
          {project.phases && <ProjectTimeline project={project} />}

          {/* Composer */}
          <div className="prj-composer">
            <textarea
              placeholder="How can I help you today?"
              value={composer}
              onChange={e => setComposer(e.target.value)}
              rows={1}
            />
            <div className="prj-composer-foot">
              <button className="prj-composer-attach" title="Attach">{I.plus}</button>
              <div className="prj-composer-spacer"/>
              <button className="prj-model">
                <span>Opus 4.7</span>
                <span className="prj-model-mode">Adaptive</span>
                <span className="prj-model-caret">{I.down}</span>
              </button>
              <button className="prj-mic" title="Voice">{I.mic || '🎙'}</button>
            </div>
          </div>

          {/* Chats list */}
          <ul className="prj-chats">
            {project.chats.map(c => (
              <li key={c.id} className="prj-chat-row">
                <button className="prj-chat-btn">
                  <span className="prj-chat-title">{c.title}</span>
                  <span className="prj-chat-last">Last message {c.last}</span>
                </button>
              </li>
            ))}
            {project.chats.length === 0 && (
              <li className="prj-chats-empty">No chats yet. Start one above.</li>
            )}
          </ul>
        </section>
      

        {/* SIDE PANEL */}
        <aside className="prj-side">
          {/* Memory */}
          <section className="prj-side-card">
            <header className="prj-side-h">
              <h2>Memory</h2>
              <div className="prj-side-h-r">
                <span className="prj-only-you">{I.lock || ''} Only you</span>
                <button className="prj-icon-btn" title="Edit memory">{I.attach || '✎'}</button>
              </div>
            </header>
            {project.memory.enabled ? (
              <>
                <p className="prj-memory-body">{project.memory.summary}</p>
                <p className="prj-memory-meta">Last updated {project.memory.updated}</p>
              </>
            ) : (
              <p className="prj-memory-empty">Memory is off for this project.</p>
            )}
          </section>

          {/* Instructions */}
          <section className="prj-side-card">
            <header className="prj-side-h">
              <h2>Instructions</h2>
              <button className="prj-icon-btn" title="Add instructions">{I.plus}</button>
            </header>
            {project.instructions ? (
              <p className="prj-instructions">{project.instructions}</p>
            ) : (
              <p className="prj-instructions-empty">Add instructions to tailor Claude's responses.</p>
            )}
          </section>

          {/* Files */}
          <section className="prj-side-card">
            <header className="prj-side-h">
              <h2>Files</h2>
              <button className="prj-icon-btn" title="Add file">{I.plus}</button>
            </header>
            <div className="prj-cap">
              <div className="prj-cap-track"><div className="prj-cap-fill" style={{ width: `${project.capacityPct}%` }}/></div>
              <div className="prj-cap-lbl">{project.capacityPct}% of project capacity used</div>
            </div>
            <div className="prj-files">
              {project.files.map(f => (
                <button key={f.name} className="prj-file">
                  <span className="prj-file-name">{f.name}</span>
                  <span className="prj-file-lines">{f.lines} lines</span>
                  <span className="prj-file-kind">{f.kind}</span>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>
      )}

      {tab === 'memory' && <ProjectMemoryScreen project={project} />}
      {tab === 'instructions' && <ProjectInstructionsScreen project={project} />}
      {tab === 'files' && <ProjectFilesScreen project={project} />}
      {tab === 'linked' && <ProjectLinkedScreen project={project} />}
      {tab === 'activity' && <ProjectActivityScreen project={project} />}

      {/* Project-internal search (Cmd+F when in detail) */}
      <ProjectInternalSearch open={searchOpen} project={project} onClose={() => setSearchOpen(false)} onJump={(t) => { setSearchOpen(false); setTab(t); }}/>

      {/* Right Sheet — config panel */}
      <ProjectConfigPanel project={project} open={configOpen} onClose={() => setConfigOpen(false)} />

      {/* Archive / restore / delete */}
      <ProjectArchiveModal open={!!archiveMode} project={project} mode={archiveMode} onClose={() => setArchiveMode(null)} onConfirm={() => setArchiveMode(null)}/>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   ProjectMoreMenu — ⋯ dropdown on the detail head
   ───────────────────────────────────────────────────────── */
function ProjectMoreMenu({ onArchive, onDelete, onDuplicate, onExport }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);
  return (
    <div className="pmm" ref={ref}>
      <button className="prj-icon-btn" title="More" onClick={() => setOpen(o => !o)}>{I.dots || I.more || '⋯'}</button>
      {open && (
        <div className="pmm-menu" role="menu">
          <button className="pmm-row" onClick={() => { setOpen(false); onDuplicate(); }}>{I.copy || I.fileText || '⎘'} <span>Duplicate as template</span></button>
          <button className="pmm-row" onClick={() => { setOpen(false); onExport(); }}>{I.download || '↓'} <span>Export project (ZIP)</span></button>
          <div className="pmm-sep"/>
          <button className="pmm-row" onClick={() => { setOpen(false); onArchive(); }}>{I.archive || '〈'} <span>Archive project</span></button>
          <button className="pmm-row is-danger" onClick={() => { setOpen(false); onDelete(); }}>{I.trash || '✕'} <span>Delete project…</span></button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   ProjectMemoryScreen — full screen Memory view.
   Inspired by v2 AnAMemory.tsx — header, status, knowledge graph
   summary, recent learnings, controls.
   ───────────────────────────────────────────────────────── */
const PMEM_LEARNINGS = {
  'or-801': [
    { when: '1 day ago',   kind: 'predicate',     text: 'Predicate K221847 confirmed equivalent for indication and material — orthopedic surgeons reviewed.' },
    { when: '2 days ago',  kind: 'biocompat',     text: 'Biocompatibility supplier signature pending; ISO 10993-5 cytotoxicity in progress.' },
    { when: '3 days ago',  kind: 'design',        text: 'Final OR-801 dimensions locked — 3.5/4.0/4.5/5.0 mm cortical screws.' },
    { when: '5 days ago',  kind: 'eSTAR',         text: 'eSTAR section 12.2 (sterilization) expects ISO 11135 EO; EtO residuals must follow ISO 10993-7.' },
    { when: '1 week ago',  kind: 'pre-sub',       text: 'Q-Sub feedback FDA-2025-Q-1083: agency requested clarification on torque-strength to predicate ratio.' },
  ],
  'pr-1': [
    { when: '4 days ago',  kind: 'project',       text: 'Concept2Cure AnA 1.0 skill — multi-region application registry seed JSON drafted.' },
    { when: '6 days ago',  kind: 'design',        text: 'Region picker confirmed: US, EU, UK, Canada, Japan, Switzerland in v1.' },
    { when: '8 days ago',  kind: 'compliance',    text: '21 CFR Part 11 audit trail enabled for memory writes; SHA-256 integrity verified.' },
  ],
  'nda-bx204': [
    { when: '6 hours ago', kind: 'cmc',           text: 'BX-204 drug substance specification finalized — 99.2% HPLC purity, 6 impurities controlled.' },
    { when: '2 days ago',  kind: 'clinical',      text: 'Phase 3 study CTQ-204-301 met primary endpoint (HbA1c reduction 0.84%, p<0.001).' },
    { when: '4 days ago',  kind: 'nonclinical',   text: 'Carcinogenicity 2-year rat study negative; tox margin 32x at NOAEL.' },
  ],
  'iv-415-cer': [
    { when: '5 hours ago', kind: 'literature',    text: '1,842 unique publications retrieved; 47 relevant after appraisal.' },
    { when: '1 day ago',   kind: 'pms',           text: 'FAERS 2026-Q3 — 47 signals reviewed, 3 require benefit-risk update.' },
    { when: '3 days ago',  kind: 'classification', text: 'Article 61 confirmed; Class III companion Dx pathway under MDR.' },
  ],
};

function ProjectMemoryScreen({ project }) {
  const [enabled, setEnabled] = React.useState(project.memory.enabled);
  const learnings = PMEM_LEARNINGS[project.id] || [];

  return (
    <div className="pmem" data-screen-label={`Memory · ${project.name}`}>
      <header className="pmem-head">
        <div>
          <div className="pmem-eyebrow">Project memory</div>
          <h2 className="pmem-title">What Claude remembers across this project</h2>
          <p className="pmem-sub">Memory persists across all chats in {project.name}. It captures decisions, regulatory rationale, predicate selections, and supplier commitments — so you don't have to repeat them.</p>
        </div>
        <div className="pmem-head-r">
          <span className="pmem-only-you">{I.lock || ''} Only you</span>
          <button className={`pmem-toggle ${enabled ? 'is-on' : ''}`} onClick={() => setEnabled(!enabled)} aria-pressed={enabled}>
            <span className="pmem-toggle-knob"/>
          </button>
        </div>
      </header>

      {!enabled && (
        <div className="pmem-off">
          <div className="pmem-off-ico">{I.lock || '◯'}</div>
          <div>
            <div className="pmem-off-title">Memory is off for this project</div>
            <div className="pmem-off-sub">Turn it on to let Claude carry context between chats. Off projects work like single conversations — nothing is remembered after a session ends.</div>
          </div>
          <button className="prj-btn primary" onClick={() => setEnabled(true)}>Turn on memory</button>
        </div>
      )}

      {enabled && (
        <>
          {/* Summary card */}
          <section className="pmem-card">
            <header className="pmem-card-h">
              <h3 className="pmem-h3">Summary</h3>
              <span className="pmem-meta">Updated {project.memory.updated || 'just now'}</span>
            </header>
            <p className="pmem-summary">{project.memory.summary || 'No summary yet — Claude will build one as you work.'}</p>
          </section>

          {/* Stats strip */}
          <section className="pmem-stats">
            <div className="pmem-stat">
              <span className="pmem-stat-num">{learnings.length}</span>
              <span className="pmem-stat-lbl">learnings stored</span>
            </div>
            <div className="pmem-stat">
              <span className="pmem-stat-num">{project.chats.length}</span>
              <span className="pmem-stat-lbl">chats indexed</span>
            </div>
            <div className="pmem-stat">
              <span className="pmem-stat-num">{project.files.length}</span>
              <span className="pmem-stat-lbl">files referenced</span>
            </div>
            <div className="pmem-stat">
              <span className="pmem-stat-num">SHA-256</span>
              <span className="pmem-stat-lbl">integrity verified</span>
            </div>
          </section>

          {/* Recent learnings */}
          <section className="pmem-card">
            <header className="pmem-card-h">
              <h3 className="pmem-h3">Recent learnings</h3>
              <button className="pcp-link">View all</button>
            </header>
            <ul className="pmem-list">
              {learnings.length === 0 && (
                <li className="pmem-empty">Nothing learned yet. Start a chat — Claude will record key decisions here.</li>
              )}
              {learnings.map((l, i) => (
                <li key={i} className="pmem-row">
                  <span className="pmem-row-when">{l.when}</span>
                  <span className="pmem-row-kind">{l.kind}</span>
                  <span className="pmem-row-text">{l.text}</span>
                  <button className="prj-icon-btn pmem-row-x" title="Forget this">{I.close || '✕'}</button>
                </li>
              ))}
            </ul>
          </section>

          {/* Controls */}
          <section className="pmem-card">
            <header className="pmem-card-h">
              <h3 className="pmem-h3">Controls</h3>
            </header>
            <div className="pmem-controls">
              <button className="prj-btn">Export memory</button>
              <button className="prj-btn">Audit trail</button>
              <button className="pmem-danger">Forget everything in this project</button>
            </div>
            <p className="pmem-note">Forgetting is final — once cleared, Claude will start fresh in this project. Audit-trail entries (who turned memory on/off, what was forgotten and when) are retained per 21 CFR Part 11.</p>
          </section>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   ProjectInstructionsScreen — full screen instructions editor.
   ───────────────────────────────────────────────────────── */
const PINSTR_TEMPLATES = [
  { id: 'fda-510k',  label: 'FDA 510(k) drafting',     hint: 'Cite 21 CFR 807.92, sentence case, predicate-first', body: 'Always cite the FDA reference in parentheses. Use sentence case throughout. Default to 21 CFR 807.92 ordering. When discussing substantial equivalence, lead with the predicate device characteristics, then describe differences.' },
  { id: 'eu-mdr',    label: 'EU MDR CER',               hint: 'MEDDEV 2.7/1 Rev 4 structure, Article 61',           body: 'Follow MEDDEV 2.7/1 Rev 4 section ordering. Cite Article 61 of the MDR for clinical evaluation requirements. Use British English spelling. Always note the device class (I, IIa, IIb, III) and conformity-assessment route.' },
  { id: 'eCTD',      label: 'eCTD authoring',           hint: 'CTD module structure, granularity, leaf metadata',  body: 'Follow ICH CTD module structure (M1 regional, M2 summaries, M3 quality, M4 nonclinical, M5 clinical). Each leaf must include eCTD operation (new/replace/append/delete), MD5 checksum reference, and STF if applicable.' },
  { id: 'house',     label: 'House style',              hint: 'Sentence case, no emoji, numbers over adjectives',  body: 'Sentence case throughout. No emoji. No exclamation marks. Prefer numbers over adjectives ("28% reduction" not "significant reduction"). Be direct and specific. When uncertain, ask before assuming.' },
];

function ProjectInstructionsScreen({ project }) {
  const [text, setText] = React.useState(project.instructions || '');
  const [active, setActive] = React.useState(!!project.instructions);
  const charCount = text.length;
  const limit = 5000;

  function applyTemplate(t) {
    const next = text ? `${text}\n\n${t.body}` : t.body;
    if (next.length <= limit) setText(next);
  }

  return (
    <div className="pinstr" data-screen-label={`Instructions · ${project.name}`}>
      <header className="pinstr-head">
        <div>
          <div className="pinstr-eyebrow">Project instructions</div>
          <h2 className="pinstr-title">Tailor Claude for this project</h2>
          <p className="pinstr-sub">Instructions are injected into every chat in this project — set the regulatory context, citation style, and house preferences once.</p>
        </div>
        <div className="pinstr-head-r">
          <span className={`pinstr-status ${active ? 'is-on' : ''}`}>
            <span className="pinstr-status-dot"/>
            {active ? 'Active' : 'Inactive'}
          </span>
        </div>
      </header>

      <div className="pinstr-body">
        {/* Editor */}
        <div className="pinstr-editor-wrap">
          <div className="pinstr-editor-head">
            <span className="pinstr-editor-lbl">Instructions</span>
            <span className={`pinstr-count ${charCount > limit * 0.9 ? 'is-warn' : ''}`}>{charCount.toLocaleString()} / {limit.toLocaleString()} characters</span>
          </div>
          <textarea
            className="pinstr-editor"
            value={text}
            onChange={(e) => e.target.value.length <= limit && setText(e.target.value)}
            placeholder="Add custom instructions for Claude in this project. Be direct and specific — Claude will follow these in every chat. For example:

• Focus on FDA Class II device requirements
• Always cite 21 CFR 820 when discussing QMS
• Our predicate device is K221847 — assume substantial equivalence to it unless stated otherwise
• Output format: numbered sections, sentence case, citations in parentheses"
            rows={18}
          />
          <div className="pinstr-editor-foot">
            <button className="prj-btn" onClick={() => setText('')} disabled={!text}>Clear</button>
            <div className="pinstr-spacer"/>
            <button className="prj-btn" onClick={() => setActive(false)} disabled={!active}>Pause</button>
            <button className="prj-btn primary" onClick={() => setActive(true)}>{active ? 'Save' : 'Save and activate'}</button>
          </div>
        </div>

        {/* Templates rail */}
        <aside className="pinstr-rail">
          <div className="pinstr-rail-h">Quick templates</div>
          <div className="pinstr-rail-list">
            {PINSTR_TEMPLATES.map(t => (
              <button key={t.id} className="pinstr-tmpl" onClick={() => applyTemplate(t)}>
                <div className="pinstr-tmpl-label">{t.label}</div>
                <div className="pinstr-tmpl-hint">{t.hint}</div>
              </button>
            ))}
          </div>

          <div className="pinstr-rail-h pinstr-rail-h-2">Tips</div>
          <ul className="pinstr-tips">
            <li>Be specific — "always cite 21 CFR 820" works better than "be regulatory".</li>
            <li>Lead with the most important rules — Claude follows order of mention.</li>
            <li>Combine templates by clicking more than one — they append.</li>
            <li>Instructions are scoped to this project. Other projects are unaffected.</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   ProjectFilesScreen — full screen files browser.
   Filter, sort, group-by, drag-drop affordance, capacity bar.
   ───────────────────────────────────────────────────────── */
function ProjectFilesScreen({ project }) {
  const [query, setQuery] = React.useState('');
  const [sort, setSort] = React.useState('recent'); // recent | name | size | kind
  const [groupBy, setGroupBy] = React.useState('kind'); // kind | none

  // augment files with mock metadata so the screen reads like a real vault
  const augmented = React.useMemo(() => {
    return project.files.map((f, i) => ({
      ...f,
      uploaded: ['12 hours ago', '1 day ago', '2 days ago', '4 days ago', '1 week ago'][i % 5],
      size: f.lines ? `${(f.lines * 0.082).toFixed(1)} KB` : '—',
      author: i % 2 ? 'JM Smith' : 'A Park',
    }));
  }, [project.files]);

  const filtered = augmented.filter(f => f.name.toLowerCase().includes(query.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'size') return (b.lines || 0) - (a.lines || 0);
    if (sort === 'kind') return a.kind.localeCompare(b.kind);
    return 0; // recent — preserve order
  });

  const groups = React.useMemo(() => {
    if (groupBy !== 'kind') return [{ key: 'all', items: sorted }];
    const g = {};
    for (const f of sorted) { (g[f.kind] = g[f.kind] || []).push(f); }
    return Object.entries(g).map(([k, items]) => ({ key: k, items }));
  }, [sorted, groupBy]);

  return (
    <div className="pfiles" data-screen-label={`Files · ${project.name}`}>
      <header className="pfiles-head">
        <div>
          <div className="pfiles-eyebrow">Project files</div>
          <h2 className="pfiles-title">{project.files.length} files in this project</h2>
          <p className="pfiles-sub">Files added here are available to every chat. Claude can read, cite, and update them — and tracks which sections of which files informed each answer.</p>
        </div>
        <div className="pfiles-head-r">
          <button className="prj-btn">Drop folder</button>
          <button className="prj-btn primary">{I.plus} Add files</button>
        </div>
      </header>

      {/* Capacity */}
      <div className="pfiles-cap">
        <div className="pfiles-cap-head">
          <span>Project capacity</span>
          <span className="pfiles-cap-pct">{project.capacityPct}% used</span>
        </div>
        <div className="prj-cap-track"><div className="prj-cap-fill" style={{width: `${project.capacityPct}%`}}/></div>
      </div>

      {/* Toolbar */}
      <div className="pfiles-tools">
        <div className="pfiles-search">
          <span className="pfiles-search-ico">{I.search || '🔍'}</span>
          <input
            className="pfiles-search-input"
            placeholder={`Search ${project.files.length} files…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="pfiles-tool-group">
          <span className="pfiles-tool-lbl">Sort</span>
          <select className="pfiles-select" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recent">Recent</option>
            <option value="name">Name</option>
            <option value="size">Size</option>
            <option value="kind">Type</option>
          </select>
        </div>
        <div className="pfiles-tool-group">
          <span className="pfiles-tool-lbl">Group by</span>
          <select className="pfiles-select" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            <option value="kind">Type</option>
            <option value="none">None</option>
          </select>
        </div>
      </div>

      {/* Groups */}
      {sorted.length === 0 && (
        <div className="pfiles-empty">
          <div className="pfiles-empty-ico">{I.file || '◯'}</div>
          <div className="pfiles-empty-title">No files match "{query}"</div>
          <div className="pfiles-empty-sub">Try a different search, or drop files into the project to add them.</div>
        </div>
      )}

      {groups.map(g => (
        <section key={g.key} className="pfiles-group">
          {groupBy === 'kind' && (
            <div className="pfiles-group-h">
              <span className="pfiles-group-name">{g.key}</span>
              <span className="pfiles-group-count">{g.items.length}</span>
            </div>
          )}
          <div className="pfiles-table">
            <div className="pfiles-th">
              <span>Name</span>
              <span>Author</span>
              <span>Updated</span>
              <span>Size</span>
              <span>Lines</span>
            </div>
            {g.items.map(f => (
              <button key={f.name} className="pfiles-tr">
                <span className="pfiles-tr-name">
                  <span className="pfiles-tr-kind">{f.kind}</span>
                  <span className="pfiles-tr-fname">{f.name}</span>
                </span>
                <span className="pfiles-tr-author">{f.author}</span>
                <span className="pfiles-tr-when">{f.uploaded}</span>
                <span className="pfiles-tr-size">{f.size}</span>
                <span className="pfiles-tr-lines">{f.lines || '—'}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   ProjectTimeline — full variant
   Mirrors v2 ProjectTimeline (FullTimeline). Vertical phase list
   with status dots, connector line, in-progress phase highlighted.
   ───────────────────────────────────────────────────────── */
function ProjectTimeline({ project }) {
  const phases = project.phases || [];
  const completed = phases.filter(p => p.status === 'completed').length;
  const overall = Math.round((completed / phases.length) * 100);

  return (
    <section className="ptl">
      <header className="ptl-head">
        <div>
          <h2 className="ptl-h2">{project.submissionTypeLabel} submission timeline</h2>
          <p className="ptl-sub">{phases.length} phases · {completed} complete · {overall}% overall</p>
        </div>
        {project.daysToTarget != null && (
          <div className="ptl-head-r">
            <span className="ptl-days-num">{project.daysToTarget}</span>
            <span className="ptl-days-lbl">days to target</span>
          </div>
        )}
      </header>

      {/* Overall progress bar */}
      <div className="ptl-bar">
        <div className="ptl-bar-fill" style={{ width: `${overall}%` }} />
      </div>

      {/* Phase list */}
      <ul className="ptl-list">
        {phases.map((p, i) => {
          const isLast = i === phases.length - 1;
          return (
            <li key={p.id} className="ptl-row" data-status={p.status}>
              {!isLast && <span className="ptl-line" data-prev={p.status === 'completed' ? 'done' : 'todo'} aria-hidden="true" />}
              <span className="ptl-dot" data-status={p.status}>
                {p.status === 'completed' && <span className="ptl-check">{I.check || '✓'}</span>}
                {p.status === 'current' && <span className="ptl-cur" />}
              </span>
              <div className="ptl-row-body">
                <div className="ptl-row-name-row">
                  <span className="ptl-row-name">{p.name}</span>
                  {p.status === 'current' && <span className="ptl-pill">In progress</span>}
                </div>
                {p.status === 'current' && p.progress > 0 && p.progress < 100 && (
                  <div className="ptl-row-bar">
                    <div className="ptl-row-bar-fill" style={{ width: `${p.progress}%` }} />
                  </div>
                )}
              </div>
              <span className="ptl-row-pct" data-status={p.status}>{p.status === 'completed' ? '100%' : p.status === 'current' ? `${p.progress}%` : '—'}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────
   ProjectConfigPanel — right Sheet, 4 tabs
   Mirrors v2 ProjectConfigPanel. Stays open while chatting (modal=false
   semantics) — clicking outside does NOT close it; only the close button
   or Esc does. Auto-saves on blur in the v2 implementation; here it's
   a hi-fi mock so changes are local-state only.
   ───────────────────────────────────────────────────────── */
const PCP_TABS = [
  { id: 'general',      label: 'General',      icon: 'settings' },
  { id: 'instructions', label: 'Instructions', icon: 'file' },
  { id: 'team',         label: 'Team',         icon: 'users' },
  { id: 'compliance',   label: 'Compliance',   icon: 'shieldCheck' },
];

const PCP_SUBMISSION_TYPES = [
  { v: '510K', l: '510(k)' },
  { v: 'IND',  l: 'IND' },
  { v: 'NDA',  l: 'NDA' },
  { v: 'BLA',  l: 'BLA' },
  { v: 'PMA',  l: 'PMA' },
  { v: 'MAA',  l: 'MAA' },
  { v: 'DE_NOVO', l: 'De Novo' },
  { v: 'EUA',  l: 'EUA' },
  { v: 'IVDR', l: 'IVDR' },
];
const PCP_AGENCIES = ['FDA', 'EMA', 'PMDA', 'Health Canada'];
const PCP_STATUSES = [
  { v: 'draft',     l: 'Draft' },
  { v: 'active',    l: 'Active' },
  { v: 'in_review', l: 'In review' },
  { v: 'submitted', l: 'Submitted' },
  { v: 'archived',  l: 'Archived' },
];

function ProjectConfigPanel({ project, open, onClose }) {
  const [tab, setTab] = React.useState('general');
  const [form, setForm] = React.useState(null);
  const [instructions, setInstructions] = React.useState('');

  // Reset form when opening or switching projects
  React.useEffect(() => {
    if (open && project) {
      setForm({
        name: project.name || '',
        submissionType: project.submissionType || '510K',
        product: project.product || '',
        sponsor: project.sponsor || '',
        targetAgency: project.targetAgency || 'FDA',
        targetDate: project.targetDate || '',
        status: project.status || 'draft',
        description: project.desc || '',
      });
      setInstructions(project.instructions || '');
    }
  }, [open, project && project.id]);

  // Esc to close
  React.useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !project || !form) return null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="pcp" role="dialog" aria-label="Project configuration">
      <div className="pcp-sheet">
        <header className="pcp-head">
          <div>
            <h2 className="pcp-h2">Project configuration</h2>
            <p className="pcp-sub">Configure project settings, instructions, and compliance.</p>
          </div>
          <button className="pcp-close" onClick={onClose} aria-label="Close">{I.close || '✕'}</button>
        </header>

        {/* Tabs */}
        <nav className="pcp-tabs" role="tablist" aria-label="Configuration tabs">
          {PCP_TABS.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className="pcp-tab"
              data-active={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              <span className="pcp-tab-ico">{I[t.icon] || ''}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="pcp-body">

          {tab === 'general' && (
            <div className="pcp-tab-body">
              <Field label="Project name">
                <input className="pcp-input" value={form.name} onChange={e => set('name', e.target.value)} />
              </Field>

              <Field label="Submission type">
                <select className="pcp-select" value={form.submissionType} onChange={e => set('submissionType', e.target.value)}>
                  {PCP_SUBMISSION_TYPES.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </Field>

              <Field label="Product / device name">
                <input className="pcp-input" value={form.product} onChange={e => set('product', e.target.value)} placeholder="e.g. CardioFlow heart monitor" />
              </Field>

              <Field label="Sponsor">
                <input className="pcp-input" value={form.sponsor} onChange={e => set('sponsor', e.target.value)} placeholder="e.g. Acme Biotech, Inc." />
              </Field>

              <Field label="Target agency">
                <div className="pcp-radios" role="radiogroup">
                  {PCP_AGENCIES.map(a => (
                    <button
                      key={a}
                      type="button"
                      role="radio"
                      aria-checked={form.targetAgency === a}
                      data-active={form.targetAgency === a}
                      className="pcp-radio"
                      onClick={() => set('targetAgency', a)}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Target submission date">
                <input className="pcp-input" type="date" value={form.targetDate} onChange={e => set('targetDate', e.target.value)} />
              </Field>

              <Field label="Status">
                <select className="pcp-select" value={form.status} onChange={e => set('status', e.target.value)}>
                  {PCP_STATUSES.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </Field>

              <Field label="Description" optional>
                <textarea className="pcp-textarea" rows={3} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Brief description of the project…" />
              </Field>
            </div>
          )}

          {tab === 'instructions' && (
            <div className="pcp-tab-body">
              <div className="pcp-section-head">
                <div>
                  <h3 className="pcp-h3">Custom instructions</h3>
                  <p className="pcp-section-sub">Project-specific guidance injected into every Claude conversation.</p>
                </div>
                <span className="pcp-badge" data-tone="ok">Active</span>
              </div>

              <textarea
                className="pcp-textarea pcp-mono"
                rows={10}
                value={instructions}
                onChange={e => e.target.value.length <= 5000 && setInstructions(e.target.value)}
                placeholder="Add custom instructions for Claude in this project. For example: focus on FDA Class II device requirements. Always cite 21 CFR 820 when discussing QMS. Our predicate device is…"
              />

              <div className="pcp-instr-meta">
                <span>{instructions.length.toLocaleString()} / 5,000 characters</span>
                <button className="pcp-link" onClick={() => setInstructions('')} disabled={!instructions}>Reset to default</button>
              </div>

              <p className="pcp-note">
                These instructions are injected into every Claude conversation within this project. They help Claude understand your regulatory context, product specifics, and preferred output style.
              </p>
            </div>
          )}

          {tab === 'team' && (
            <div className="pcp-tab-body">
              <div className="pcp-card">
                <div className="pcp-card-head">
                  <h3 className="pcp-h3">Invite members</h3>
                  <span className="pcp-badge" data-tone="ok">{(PCP_MEMBERS[project.id] || []).length} active</span>
                </div>
                <p className="pcp-section-sub">Add by email. New members receive an invitation with the role you specify.</p>
                <div className="pcp-invite-row">
                  <input className="pcp-input" placeholder="name@company.com"/>
                  <select className="pcp-select pcp-invite-role" defaultValue="Editor">
                    {PCP_ROLES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
                  </select>
                  <button className="pcp-btn primary">Send invite</button>
                </div>
              </div>

              <div className="pcp-card">
                <h3 className="pcp-h3">Members</h3>
                <ul className="pcp-mem-list">
                  {(PCP_MEMBERS[project.id] || []).map(m => (
                    <li key={m.id} className="pcp-mem-row">
                      <span className="pcp-mem-avatar" aria-hidden="true">{m.name.split(' ').map(s => s[0]).join('').slice(0, 2)}</span>
                      <div className="pcp-mem-body">
                        <div className="pcp-mem-name">{m.name}</div>
                        <div className="pcp-mem-email">{m.email} · active {m.last}</div>
                      </div>
                      <select className="pcp-select pcp-mem-role" defaultValue={m.role}>
                        {PCP_ROLES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
                      </select>
                      <button className="pcp-link is-danger" disabled={m.role === 'Owner'}>Remove</button>
                    </li>
                  ))}
                </ul>
                <div className="pcp-roles-legend">
                  {PCP_ROLES.map(r => (
                    <div key={r.v} className="pcp-role-meta"><span className="pcp-role-name">{r.l}</span><span className="pcp-role-hint">{r.hint}</span></div>
                  ))}
                </div>
              </div>

              <div className="pcp-card">
                <div className="pcp-card-head">
                  <h3 className="pcp-h3">SSO group bindings</h3>
                  <span className="pcp-badge" data-tone="ok">SAML / OIDC</span>
                </div>
                <p className="pcp-section-sub">Map identity-provider groups to project roles.</p>
                <ul className="pcp-sso-list">
                  {PCP_SSO_GROUPS.map(g => (
                    <li key={g.id} className="pcp-sso-row">
                      <div className="pcp-sso-body">
                        <div className="pcp-sso-name">{g.name}</div>
                        <div className="pcp-sso-meta">{g.count} members</div>
                      </div>
                      <select className="pcp-select pcp-sso-role" defaultValue={g.mapped || ''}>
                        <option value="">Not mapped</option>
                        {PCP_ROLES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
                      </select>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {tab === 'settings' && (
            <div className="pcp-tab-body">
              <div className="pcp-card">
                <h3 className="pcp-h3">Templates</h3>
                <p className="pcp-section-sub">Save this project as a starting point, or apply an existing template.</p>
                <div className="pcp-tmpl-row">
                  <button className="pcp-btn">Save as template</button>
                  <button className="pcp-btn">Apply template…</button>
                </div>
                <div className="pcp-tmpl-list">
                  <div className="pcp-tmpl-item">
                    <div className="pcp-tmpl-item-l">
                      <div className="pcp-tmpl-name">FDA 510(k) starter · Class II</div>
                      <div className="pcp-tmpl-meta">9 phases · 12 sections · 4 milestone gates</div>
                    </div>
                    <span className="pcp-pill-out">In use</span>
                  </div>
                  <div className="pcp-tmpl-item">
                    <div className="pcp-tmpl-item-l">
                      <div className="pcp-tmpl-name">EU MDR CER · Class III</div>
                      <div className="pcp-tmpl-meta">8 phases · MEDDEV 2.7/1 Rev 4 ordering</div>
                    </div>
                    <button className="pcp-link">Apply</button>
                  </div>
                  <div className="pcp-tmpl-item">
                    <div className="pcp-tmpl-item-l">
                      <div className="pcp-tmpl-name">eCTD M2–M5 · NDA</div>
                      <div className="pcp-tmpl-meta">8 phases · ICH CTD module structure</div>
                    </div>
                    <button className="pcp-link">Apply</button>
                  </div>
                </div>
              </div>

              <div className="pcp-card">
                <h3 className="pcp-h3">Retention policy</h3>
                <p className="pcp-section-sub">Audit-trail entries are retained per 21 CFR Part 11 §11.10(c).</p>
                <Field label="Retention period">
                  <select className="pcp-select" defaultValue="7y">
                    <option value="3y">3 years</option>
                    <option value="5y">5 years</option>
                    <option value="7y">7 years (FDA recommended)</option>
                    <option value="10y">10 years</option>
                    <option value="forever">Forever</option>
                  </select>
                </Field>
                <Field label="Soft-delete window">
                  <select className="pcp-select" defaultValue="30d">
                    <option value="7d">7 days</option>
                    <option value="30d">30 days</option>
                    <option value="90d">90 days</option>
                  </select>
                </Field>
              </div>

              <div className="pcp-card">
                <h3 className="pcp-h3">Export project</h3>
                <p className="pcp-section-sub">Self-contained bundle. Audit trail and SHA-256 manifest included.</p>
                <div className="pcp-export-list">
                  <button className="pcp-export-btn">
                    <div className="pcp-export-name">ZIP archive</div>
                    <div className="pcp-export-meta">All chats, files, memory, instructions · ≈3.4 MB</div>
                  </button>
                  <button className="pcp-export-btn">
                    <div className="pcp-export-name">eCTD bundle</div>
                    <div className="pcp-export-meta">M1–M5 with index.xml · ready for FDA ESG · ≈9 MB</div>
                  </button>
                  <button className="pcp-export-btn">
                    <div className="pcp-export-name">Audit trail · inspection PDF</div>
                    <div className="pcp-export-meta">Tamper-evident, signed · 21 CFR Part 11</div>
                  </button>
                </div>
              </div>

              <div className="pcp-card pcp-danger-zone">
                <div className="pcp-card-head">
                  <h3 className="pcp-h3">Danger zone</h3>
                  <span className="pcp-badge" data-tone="warn">Owner only</span>
                </div>
                <div className="pcp-danger-row">
                  <div>
                    <div className="pcp-danger-name">Archive project</div>
                    <div className="pcp-danger-sub">Move out of active list. Data preserved.</div>
                  </div>
                  <button className="pcp-btn">Archive</button>
                </div>
                <div className="pcp-danger-row">
                  <div>
                    <div className="pcp-danger-name">Transfer ownership</div>
                    <div className="pcp-danger-sub">Hand off Owner role to another member. You become Editor.</div>
                  </div>
                  <button className="pcp-btn">Transfer</button>
                </div>
                <div className="pcp-danger-row">
                  <div>
                    <div className="pcp-danger-name is-danger">Delete project</div>
                    <div className="pcp-danger-sub">Soft-delete now, permanent after the retention window.</div>
                  </div>
                  <button className="pcp-btn is-danger">Delete…</button>
                </div>
              </div>
            </div>
          )}

          {tab === 'compliance' && (
            <div className="pcp-tab-body">
              {/* 21 CFR Part 11 */}
              <div className="pcp-card">
                <div className="pcp-card-head">
                  <h3 className="pcp-h3"><span className="pcp-ico-inline">{I.shieldCheck || ''}</span> 21 CFR Part 11 compliance</h3>
                  <span className="pcp-badge" data-tone="ok">Enabled</span>
                </div>
                <p className="pcp-section-sub">Electronic records and signatures comply with FDA 21 CFR Part 11 requirements. Audit trails, access controls, and data integrity measures are enforced.</p>
                <div className="pcp-stats">
                  <div className="pcp-stat"><span className="pcp-stat-k">Audit trail</span><span className="pcp-stat-v">12 entries</span></div>
                  <div className="pcp-stat"><span className="pcp-stat-k">E-signatures</span><span className="pcp-stat-v">3 recorded</span></div>
                </div>
              </div>

              {/* Audit trail */}
              <div className="pcp-card">
                <h3 className="pcp-h3">Audit trail</h3>
                <p className="pcp-section-sub">All project changes are automatically tracked with user identity, timestamp, and action details. The audit trail is append-only and tamper-evident.</p>
                <div className="pcp-pill-row">
                  <span className="pcp-pill-out">Append-only</span>
                  <span className="pcp-pill-out">SHA-256 integrity</span>
                  <span className="pcp-pill-out">Tamper-evident</span>
                </div>
              </div>

              {/* Regulatory lead */}
              <div className="pcp-card">
                <div className="pcp-card-head">
                  <h3 className="pcp-h3">Regulatory lead</h3>
                  <span className="pcp-badge" data-tone="warn">Not assigned</span>
                </div>
                <p className="pcp-section-sub">Assign a regulatory lead responsible for submission oversight, review approvals, and compliance sign-off.</p>
                <button className="pcp-btn">Assign regulatory lead</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, optional, children }) {
  return (
    <div className="pcp-field">
      <label className="pcp-label">
        {label}{optional && <span className="pcp-optional"> (optional)</span>}
      </label>
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Wrapper — owns list↔detail state
   ───────────────────────────────────────────────────────── */
function ProjectsScreen() {
  const [openId, setOpenId] = React.useState(null);
  const [creating, setCreating] = React.useState(false);
  const [switcherOpen, setSwitcherOpen] = React.useState(false);
  const [notifsOpen, setNotifsOpen] = React.useState(false);
  const project = openId ? PR_PROJECTS.find(p => p.id === openId) : null;

  // ⌘K → project switcher (when on the list)
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSwitcherOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (project) return (
    <>
      <ProjectDetail project={project} onBack={() => setOpenId(null)}/>
      <ProjectQuickSwitcher
        open={switcherOpen}
        projects={PR_PROJECTS}
        onPick={(id) => { setSwitcherOpen(false); setOpenId(id); }}
        onClose={() => setSwitcherOpen(false)}
        onCreate={() => { setSwitcherOpen(false); setCreating(true); }}
      />
      <ProjectNotifications open={notifsOpen} projects={PR_PROJECTS} onClose={() => setNotifsOpen(false)} onOpenProject={(id) => { setNotifsOpen(false); setOpenId(id); }}/>
      {creating && <NewProjectDialog onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpenId(id); }}/>}
    </>
  );

  return (
    <>
      <ProjectsList
        onOpen={setOpenId}
        onCreate={() => setCreating(true)}
        onOpenSwitcher={() => setSwitcherOpen(true)}
        onOpenNotifications={() => setNotifsOpen(true)}
      />
      <ProjectQuickSwitcher
        open={switcherOpen}
        projects={PR_PROJECTS}
        onPick={(id) => { setSwitcherOpen(false); setOpenId(id); }}
        onClose={() => setSwitcherOpen(false)}
        onCreate={() => { setSwitcherOpen(false); setCreating(true); }}
      />
      <ProjectNotifications open={notifsOpen} projects={PR_PROJECTS} onClose={() => setNotifsOpen(false)} onOpenProject={(id) => { setNotifsOpen(false); setOpenId(id); }}/>
      {creating && <NewProjectDialog onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpenId(id); }}/>}
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   New Project dialog — registry-driven 3-step flow
   Mirrors components/projects/ApplicationTypePicker.tsx +
   BootstrapPreviewPanel.tsx from v2.

   Region → Application type → Confirm. The right rail shows a live
   "what gets created" preview (sections, milestones, required artifacts)
   once a type is picked.
   ───────────────────────────────────────────────────────── */
const NPD_REGIONS = [
  { region: 'US', country: 'United States', agency: 'FDA',  agencyFullName: 'Food and Drug Administration',         count: 14 },
  { region: 'EU', country: 'European Union', agency: 'EMA', agencyFullName: 'European Medicines Agency',             count: 11 },
  { region: 'GB', country: 'United Kingdom', agency: 'MHRA', agencyFullName: 'Medicines & Healthcare Regulatory Agency', count: 8 },
  { region: 'CA', country: 'Canada',         agency: 'HC',  agencyFullName: 'Health Canada',                         count: 7 },
  { region: 'JP', country: 'Japan',          agency: 'PMDA', agencyFullName: 'Pharmaceuticals & Medical Devices Agency', count: 9 },
  { region: 'CH', country: 'Switzerland',    agency: 'Swissmedic', agencyFullName: 'Swiss Agency for Therapeutic Products', count: 6 },
];

const NPD_TYPES = {
  US: [
    { family: 'device_clearance', id: '510k',     displayName: '510(k) Premarket Notification', applicationType: '510(k)', dossierStandard: 'eSTAR', stage: 'Premarket', preset: '510K' },
    { family: 'device_approval',  id: 'pma',      displayName: 'PMA — Premarket Approval',       applicationType: 'PMA',     dossierStandard: 'eSTAR', stage: 'Premarket', preset: '510K' },
    { family: 'device_approval',  id: 'denovo',   displayName: 'De Novo Classification',         applicationType: 'De Novo', dossierStandard: 'eSTAR', stage: 'Premarket', preset: '510K' },
    { family: 'clinical_trial',   id: 'ind',      displayName: 'IND — Investigational New Drug', applicationType: 'IND',     dossierStandard: 'eCTD',  stage: 'Clinical',  preset: 'IND' },
    { family: 'marketing_authorization', id: 'nda', displayName: 'NDA — New Drug Application',   applicationType: 'NDA',     dossierStandard: 'eCTD',  stage: 'Marketing', preset: 'NDA' },
    { family: 'marketing_authorization', id: 'bla', displayName: 'BLA — Biologics License',      applicationType: 'BLA',     dossierStandard: 'eCTD',  stage: 'Marketing', preset: 'NDA' },
    { family: 'pre_submission',   id: 'qsub',     displayName: 'Q-Sub — Pre-submission Meeting', applicationType: 'Q-Sub',   dossierStandard: 'eSTAR', stage: 'Pre-submission', preset: '510K' },
  ],
  EU: [
    { family: 'device_clearance', id: 'mdr',      displayName: 'MDR Technical Documentation',   applicationType: 'MDR',     dossierStandard: 'IMDRF',   stage: 'Conformity', preset: 'CER' },
    { family: 'device_clearance', id: 'cer',      displayName: 'Clinical Evaluation Report',    applicationType: 'CER',     dossierStandard: 'MEDDEV',  stage: 'Conformity', preset: 'CER' },
    { family: 'marketing_authorization', id: 'maa', displayName: 'MAA — Marketing Authorization', applicationType: 'MAA',   dossierStandard: 'eCTD',    stage: 'Marketing', preset: 'NDA' },
    { family: 'clinical_trial',   id: 'cta',      displayName: 'CTA — Clinical Trial Application', applicationType: 'CTA', dossierStandard: 'eCTD',    stage: 'Clinical',  preset: 'IND' },
  ],
  GB: [
    { family: 'marketing_authorization', id: 'mhra-ma', displayName: 'UK Marketing Authorization', applicationType: 'MA',  dossierStandard: 'eCTD',  stage: 'Marketing', preset: 'NDA' },
    { family: 'clinical_trial',          id: 'mhra-cta', displayName: 'UK Clinical Trial Authorization', applicationType: 'CTA', dossierStandard: 'eCTD', stage: 'Clinical', preset: 'IND' },
  ],
  CA: [
    { family: 'marketing_authorization', id: 'nds', displayName: 'NDS — New Drug Submission',     applicationType: 'NDS',  dossierStandard: 'eCTD',  stage: 'Marketing', preset: 'NDA' },
    { family: 'clinical_trial',          id: 'cta-ca', displayName: 'CTA — Clinical Trial Application', applicationType: 'CTA', dossierStandard: 'eCTD', stage: 'Clinical', preset: 'IND' },
  ],
  JP: [
    { family: 'marketing_authorization', id: 'jnda', displayName: 'J-NDA — Japan New Drug',       applicationType: 'J-NDA', dossierStandard: 'eCTD', stage: 'Marketing', preset: 'NDA' },
  ],
  CH: [
    { family: 'marketing_authorization', id: 'sm-ma', displayName: 'Swissmedic Authorization',     applicationType: 'MA',   dossierStandard: 'eCTD', stage: 'Marketing', preset: 'NDA' },
  ],
};

const NPD_FAMILY_LABELS = {
  device_clearance: 'Device clearance',
  device_approval: 'Device approval',
  clinical_trial: 'Clinical trial',
  marketing_authorization: 'Marketing authorization',
  supplement: 'Supplement',
  pre_submission: 'Pre-submission',
};

/* Bootstrap previews — what each application type creates on day 1.
   Keyed by registry id. Mirrors BootstrapPreviewPanel data shape. */
const NPD_PREVIEWS = {
  '510k': {
    sections: [
      { module: 1, code: '1.1',  title: 'Cover letter',                       required: true },
      { module: 1, code: '1.2',  title: 'Indications for use',                required: true },
      { module: 2, code: '2.1',  title: 'Device description',                 required: true },
      { module: 2, code: '2.2',  title: 'Substantial equivalence discussion', required: true },
      { module: 2, code: '2.3',  title: 'Predicate comparison',               required: true },
      { module: 3, code: '3.1',  title: 'Performance testing — bench',        required: true },
      { module: 3, code: '3.2',  title: 'Biocompatibility',                   required: true },
      { module: 3, code: '3.3',  title: 'Sterilization',                      required: false },
      { module: 4, code: '4.1',  title: 'Labeling',                           required: true },
      { module: 4, code: '4.2',  title: 'Instructions for use',               required: true },
    ],
    milestones: [
      { id: 'm1', title: 'Predicate identified',          taskCount: 4 },
      { id: 'm2', title: 'Substantial equivalence drafted', taskCount: 7 },
      { id: 'm3', title: 'Bench testing complete',        taskCount: 12 },
      { id: 'm4', title: 'Internal QC pass',              taskCount: 5 },
      { id: 'm5', title: 'eSTAR submission',              taskCount: 3 },
    ],
    artifacts: ['cover_letter', 'predicate_comparison', 'se_discussion', 'bench_test_report', 'biocompatibility_report', 'labeling_pdf', 'ifu_pdf'],
    gateway: 'CDRH eSTAR',
  },
  pma: {
    sections: [
      { module: 1, code: '1.1', title: 'Cover letter',          required: true },
      { module: 2, code: '2.1', title: 'Device description',    required: true },
      { module: 3, code: '3.1', title: 'Nonclinical studies',   required: true },
      { module: 4, code: '4.1', title: 'Clinical investigations', required: true },
      { module: 5, code: '5.1', title: 'Manufacturing',         required: true },
      { module: 6, code: '6.1', title: 'Labeling',              required: true },
    ],
    milestones: [
      { id: 'm1', title: 'Pre-submission meeting',  taskCount: 6 },
      { id: 'm2', title: 'Clinical study complete', taskCount: 22 },
      { id: 'm3', title: 'Module 3 nonclinical',    taskCount: 14 },
      { id: 'm4', title: 'PMA submission',          taskCount: 4 },
    ],
    artifacts: ['device_description', 'clinical_study_report', 'manufacturing_info', 'risk_analysis', 'labeling_pdf'],
    gateway: 'CDRH eSTAR',
  },
  ind: {
    sections: [
      { module: 1, code: '1571', title: 'Form FDA 1571',           required: true },
      { module: 1, code: '1572', title: 'Form FDA 1572',           required: true },
      { module: 2, code: '2.3',  title: 'Quality summary (CMC)',   required: true },
      { module: 3, code: '3.2',  title: 'Drug substance + product', required: true },
      { module: 4, code: '4.2',  title: 'Nonclinical study reports', required: true },
      { module: 5, code: '5.2',  title: 'Clinical protocol',       required: true },
      { module: 5, code: '5.3',  title: 'Investigator brochure',   required: true },
    ],
    milestones: [
      { id: 'm1', title: 'CMC information assembled', taskCount: 9 },
      { id: 'm2', title: 'Nonclinical complete',      taskCount: 11 },
      { id: 'm3', title: 'Protocol finalized',        taskCount: 6 },
      { id: 'm4', title: 'IND submission',            taskCount: 3 },
    ],
    artifacts: ['form_1571', 'form_1572', 'cmc_summary', 'nonclinical_reports', 'clinical_protocol', 'investigator_brochure'],
    gateway: 'FDA ESG',
  },
  nda: {
    sections: [
      { module: 1, code: '1.1', title: 'Administrative',          required: true },
      { module: 2, code: '2.2', title: 'CTD introduction',        required: true },
      { module: 2, code: '2.5', title: 'Clinical overview',       required: true },
      { module: 3, code: '3.2', title: 'Quality data',            required: true },
      { module: 4, code: '4.2', title: 'Nonclinical study reports', required: true },
      { module: 5, code: '5.3', title: 'Clinical study reports',  required: true },
    ],
    milestones: [
      { id: 'm1', title: 'Module 3 quality lockdown', taskCount: 18 },
      { id: 'm2', title: 'Module 4 nonclinical',      taskCount: 12 },
      { id: 'm3', title: 'Module 5 clinical',         taskCount: 26 },
      { id: 'm4', title: 'QC pass',                   taskCount: 7 },
      { id: 'm5', title: 'NDA submission',            taskCount: 3 },
    ],
    artifacts: ['quality_overall_summary', 'clinical_overview', 'nonclinical_overview', 'study_reports', 'integrated_summaries'],
    gateway: 'FDA ESG',
  },
  cer: {
    sections: [
      { module: 1, code: 'A.1', title: 'Scope',                       required: true },
      { module: 1, code: 'A.2', title: 'Device description',          required: true },
      { module: 2, code: 'B.1', title: 'State of the art',            required: true },
      { module: 2, code: 'B.2', title: 'Literature search',           required: true },
      { module: 3, code: 'C.1', title: 'Clinical data appraisal',     required: true },
      { module: 3, code: 'C.2', title: 'Benefit-risk',                required: true },
      { module: 4, code: 'D.1', title: 'PMS / PMCF integration',      required: false },
    ],
    milestones: [
      { id: 'm1', title: 'Search protocol approved', taskCount: 4 },
      { id: 'm2', title: 'Literature appraisal',     taskCount: 9 },
      { id: 'm3', title: 'Clinical data analysis',   taskCount: 7 },
      { id: 'm4', title: 'Notified Body review',     taskCount: 5 },
    ],
    artifacts: ['search_protocol', 'literature_review', 'clinical_data_table', 'benefit_risk', 'pms_plan'],
    gateway: 'EUDAMED',
  },
};

/* default fallback when registry id has no preview */
const NPD_DEFAULT_PREVIEW = {
  sections: [
    { module: 1, code: '1.1', title: 'Project setup',          required: true },
    { module: 1, code: '1.2', title: 'Cover letter',           required: true },
    { module: 2, code: '2.1', title: 'Application overview',   required: true },
    { module: 2, code: '2.2', title: 'Supporting data',        required: false },
  ],
  milestones: [
    { id: 'm1', title: 'Project kickoff',  taskCount: 3 },
    { id: 'm2', title: 'Data assembled',   taskCount: 6 },
    { id: 'm3', title: 'Submission',       taskCount: 2 },
  ],
  artifacts: ['cover_letter', 'application_form'],
  gateway: 'Generic gateway',
};

function NewProjectDialog({ onClose, onCreated }) {
  const [step, setStep] = React.useState('region');     // region | type | confirm
  const [region, setRegion] = React.useState(null);
  const [type, setType] = React.useState(null);
  const [name, setName] = React.useState('');
  const [product, setProduct] = React.useState('');
  const [sponsor, setSponsor] = React.useState('Concept2Cure');

  // ESC closes
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const types = region ? (NPD_TYPES[region] || []) : [];
  const groupedTypes = React.useMemo(() => {
    const g = {};
    for (const t of types) { (g[t.family] = g[t.family] || []).push(t); }
    return g;
  }, [types]);

  const preview = type ? (NPD_PREVIEWS[type.id] || NPD_DEFAULT_PREVIEW) : null;
  const requiredCount = preview ? preview.sections.filter(s => s.required).length : 0;
  const optionalCount = preview ? preview.sections.length - requiredCount : 0;

  const sectionsByModule = React.useMemo(() => {
    if (!preview) return {};
    const g = {};
    for (const s of preview.sections) { (g[s.module] = g[s.module] || []).push(s); }
    return g;
  }, [preview]);

  function pickRegion(r) { setRegion(r.region); setStep('type'); }
  function pickType(t)   { setType(t); setStep('confirm'); }
  function back() {
    if (step === 'confirm') setStep('type');
    else if (step === 'type') { setStep('region'); setRegion(null); setType(null); }
  }

  function create() {
    // Push the new project to the in-memory list
    const id = `pr-${Date.now().toString(36)}`;
    const regionMeta = NPD_REGIONS.find(r => r.region === region);
    PR_PROJECTS.unshift({
      id,
      name: name.trim() || type.displayName,
      desc: product.trim() || `${type.displayName} workspace`,
      starred: false,
      chats: [],
      capacityPct: 1,
      submissionType: type.applicationType.toUpperCase().replace(/[^A-Z0-9]/g, ''),
      submissionTypeLabel: type.displayName,
      product: product.trim() || '—',
      sponsor: sponsor.trim() || 'Concept2Cure',
      targetAgency: regionMeta ? regionMeta.agency : '',
      targetDate: '',
      status: 'planning',
      phases: buildPhases(type.preset, 0),
      daysToTarget: null,
    });
    onCreated(id);
  }

  return (
    <div className="npd" role="dialog" aria-label="Create new project" aria-modal="true">
      <div className="npd-scrim" onClick={onClose}/>
      <div className="npd-shell" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <header className="npd-head">
          <div>
            <div className="npd-eyebrow">New project</div>
            <div className="npd-title">
              {step === 'region' && 'Choose region'}
              {step === 'type' && 'Choose application type'}
              {step === 'confirm' && 'Confirm and name'}
            </div>
          </div>
          <button className="npd-close" onClick={onClose} aria-label="Close">{I.close}</button>
        </header>

        {/* Stepper */}
        <div className="npd-steps">
          {['region', 'type', 'confirm'].map((s, i) => {
            const idx = ['region','type','confirm'].indexOf(step);
            const done = i < idx;
            const current = i === idx;
            return (
              <React.Fragment key={s}>
                <div className={`npd-step ${current ? 'is-current' : ''} ${done ? 'is-done' : ''}`}>
                  <span className="npd-step-num">{done ? I.check : i + 1}</span>
                  <span className="npd-step-lbl">{s === 'region' ? 'Region' : s === 'type' ? 'Application type' : 'Confirm'}</span>
                </div>
                {i < 2 && <div className={`npd-step-line ${done ? 'is-done' : ''}`}/>}
              </React.Fragment>
            );
          })}
        </div>

        <div className="npd-body">

          {/* LEFT — picker pane */}
          <div className="npd-pane npd-pane-l">

            {step === 'region' && (
              <div className="npd-list">
                {NPD_REGIONS.map(r => (
                  <button key={r.region} className="npd-row" onClick={() => pickRegion(r)}>
                    <span className="npd-row-ico">{I.globe}</span>
                    <div className="npd-row-body">
                      <div className="npd-row-title">{r.country}</div>
                      <div className="npd-row-sub">{r.agency} · {r.agencyFullName}</div>
                    </div>
                    <span className="npd-row-meta">{r.count} types</span>
                    <span className="npd-row-chev">{I.right}</span>
                  </button>
                ))}
              </div>
            )}

            {step === 'type' && (
              <div className="npd-types">
                <button className="npd-back" onClick={back}>← Back to regions</button>
                {Object.keys(groupedTypes).length === 0 && (
                  <div className="npd-empty">No application types defined for this region yet.</div>
                )}
                {Object.entries(groupedTypes).map(([family, items]) => (
                  <div key={family} className="npd-group">
                    <div className="npd-group-lbl">{NPD_FAMILY_LABELS[family] || family}</div>
                    <div className="npd-list">
                      {items.map(t => (
                        <button key={t.id} className="npd-row" onClick={() => pickType(t)}>
                          <span className="npd-row-ico">{t.dossierStandard === 'eCTD' ? I.beaker : I.shieldCheck}</span>
                          <div className="npd-row-body">
                            <div className="npd-row-title">{t.displayName}</div>
                            <div className="npd-row-sub">{t.applicationType} · {t.dossierStandard} · {t.stage}</div>
                          </div>
                          <span className="npd-row-chev">{I.right}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {step === 'confirm' && type && (
              <div className="npd-form">
                <button className="npd-back" onClick={back}>← Back to application types</button>

                <div className="npd-summary">
                  <div className="npd-summary-row"><span>Region</span><span>{NPD_REGIONS.find(r => r.region === region)?.country}</span></div>
                  <div className="npd-summary-row"><span>Agency</span><span>{type.applicationType ? NPD_REGIONS.find(r => r.region === region)?.agency : '—'}</span></div>
                  <div className="npd-summary-row"><span>Application</span><span>{type.displayName}</span></div>
                  <div className="npd-summary-row"><span>Dossier format</span><span>{type.dossierStandard}</span></div>
                  <div className="npd-summary-row"><span>Stage</span><span>{type.stage}</span></div>
                </div>

                <div className="npd-field">
                  <label className="npd-lbl">Project name</label>
                  <input className="npd-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={type.displayName} autoFocus/>
                  <div className="npd-hint">Leave blank to use the application type as the name.</div>
                </div>

                <div className="npd-field">
                  <label className="npd-lbl">Product</label>
                  <input className="npd-input" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="e.g. CT-247 cardiac monitor"/>
                </div>

                <div className="npd-field">
                  <label className="npd-lbl">Sponsor</label>
                  <input className="npd-input" value={sponsor} onChange={(e) => setSponsor(e.target.value)}/>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT — bootstrap preview */}
          <aside className="npd-pane npd-pane-r">
            {!type && (
              <div className="npd-preview-empty">
                <div className="npd-preview-empty-ico">{I.beaker}</div>
                <div className="npd-preview-empty-title">Bootstrap preview</div>
                <div className="npd-preview-empty-sub">Pick an application type to see what gets created — sections, milestones, required artifacts, and the submission gateway.</div>
              </div>
            )}
            {type && preview && (
              <>
                <div className="npd-preview-head">
                  <div className="npd-preview-eyebrow">Bootstrap preview</div>
                  <div className="npd-preview-title">{type.displayName}</div>
                  <div className="npd-preview-meta">{type.dossierStandard} · {preview.sections.length} sections · {preview.milestones.length} milestones</div>
                </div>

                <div className="npd-preview-sec">
                  <div className="npd-preview-sec-head">
                    <span>Sections</span>
                    <span className="npd-preview-counts">{requiredCount} required · {optionalCount} optional</span>
                  </div>
                  <div className="npd-preview-modules">
                    {Object.entries(sectionsByModule).map(([mod, secs]) => (
                      <div key={mod} className="npd-preview-mod">
                        <div className="npd-preview-mod-lbl">Module {mod}</div>
                        <div className="npd-preview-mod-rows">
                          {secs.map(s => (
                            <div key={s.code} className="npd-preview-mod-row">
                              <span className="npd-preview-code">{s.code}</span>
                              <span className="npd-preview-stitle">{s.title}</span>
                              {s.required && <span className="npd-preview-req">req</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="npd-preview-sec">
                  <div className="npd-preview-sec-head"><span>Milestones</span></div>
                  <div className="npd-preview-mlist">
                    {preview.milestones.map((m, i) => (
                      <div key={m.id} className="npd-preview-mrow">
                        <span className="npd-preview-mnum">{i + 1}.</span>
                        <span className="npd-preview-mtitle">{m.title}</span>
                        <span className="npd-preview-mtasks">{m.taskCount} tasks</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="npd-preview-sec">
                  <div className="npd-preview-sec-head"><span>Required artifacts</span></div>
                  <div className="npd-preview-chips">
                    {preview.artifacts.map(a => (
                      <span key={a} className="npd-preview-chip">{a.replace(/_/g, ' ')}</span>
                    ))}
                  </div>
                </div>

                <div className="npd-preview-gw">
                  <span className="npd-preview-gw-lbl">Gateway</span>
                  <span className="npd-preview-gw-val">{preview.gateway}</span>
                </div>
              </>
            )}
          </aside>
        </div>

        {/* Footer */}
        <footer className="npd-foot">
          <button className="npd-btn ghost" onClick={onClose}>Cancel</button>
          {step === 'confirm' && (
            <button className="npd-btn primary" onClick={create}>Create project</button>
          )}
          {step !== 'confirm' && (
            <button className="npd-btn primary is-disabled" disabled>Create project</button>
          )}
        </footer>
      </div>
    </div>
  );
}

Object.assign(window, { ProjectsScreen });
