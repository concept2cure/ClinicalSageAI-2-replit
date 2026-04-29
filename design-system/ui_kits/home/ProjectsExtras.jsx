/* global React, I */

/* ProjectsExtras — closes the gaps around Projects:
   • ProjectActivityScreen   — 21 CFR Part 11 audit-log viewer (filter + group + integrity badge)
   • ProjectLinkedScreen     — predicate↔subject + parent IND↔child NDA + sister CER
   • ProjectArchiveModal     — confirmation modal (archive / restore / delete)
   • ProjectsListEmpty       — zero-state for the list
   • ProjectsListFilters     — chip rail + saved-views row
   • ProjectsListBulkBar     — multi-select toolbar (archive/export/transfer)
   • ProjectQuickSwitcher    — ⌘K project switcher
   • ProjectNotifications    — bell-icon panel for project-scoped notifications
   • ProjectInternalSearch   — unified search across Memory + Instructions + Files + Chats
   All exported to window so Projects.jsx can use them.
*/

/* ─────────────────────────────────────────────────────────
   ACTIVITY / AUDIT LOG  — 21 CFR Part 11 trail viewer
   ───────────────────────────────────────────────────────── */
const PACT_EVENTS = {
  'mdx-510k': [
    { ts: '2026-04-28 09:42:18Z', actor: 'JM Smith',   role: 'Owner',     action: 'export.pdf',          target: 'OR-801_predicate_workup.md',           kind: 'export',     ip: '10.42.18.7',    sig: 'sha256:9f4a…b71c', e: true },
    { ts: '2026-04-28 09:14:02Z', actor: 'A Park',     role: 'Editor',    action: 'file.update',         target: 'biocompat_summary_v2.pdf',             kind: 'file',       ip: '10.42.18.99',   sig: 'sha256:2ed8…7c44' },
    { ts: '2026-04-28 08:51:33Z', actor: 'A Park',     role: 'Editor',    action: 'memory.write',        target: 'Predicate K221847 confirmed',          kind: 'memory',     ip: '10.42.18.99',   sig: 'sha256:01ba…2cf9' },
    { ts: '2026-04-27 17:08:11Z', actor: 'JM Smith',   role: 'Owner',     action: 'instructions.update', target: 'Project instructions v3',              kind: 'instr',      ip: '10.42.18.7',    sig: 'sha256:b3f1…8e22' },
    { ts: '2026-04-27 16:42:55Z', actor: 'D Reyes',    role: 'Reviewer',  action: 'review.signoff',      target: 'SE Discussion §4',                     kind: 'esig',       ip: '10.99.4.18',    sig: 'sha256:7a09…41bd', e: true },
    { ts: '2026-04-27 16:18:00Z', actor: 'D Reyes',    role: 'Reviewer',  action: 'comment.create',      target: 'Performance testing — torque ratio',   kind: 'comment',    ip: '10.99.4.18',    sig: 'sha256:c4d0…9b71' },
    { ts: '2026-04-26 11:22:09Z', actor: 'A Park',     role: 'Editor',    action: 'phase.advance',       target: 'Performance testing → in progress',    kind: 'lifecycle',  ip: '10.42.18.99',   sig: 'sha256:88aa…3ef0' },
    { ts: '2026-04-25 14:09:42Z', actor: 'JM Smith',   role: 'Owner',     action: 'member.invite',       target: 'd.reyes@bionova.com (Reviewer)',       kind: 'access',     ip: '10.42.18.7',    sig: 'sha256:5a2e…c103' },
    { ts: '2026-04-24 09:51:30Z', actor: 'JM Smith',   role: 'Owner',     action: 'project.create',     target: 'OR-801 510(k) submission',             kind: 'lifecycle',  ip: '10.42.18.7',    sig: 'sha256:0001…0001' },
  ],
  'c2c-ana': [
    { ts: '2026-04-28 10:11:08Z', actor: 'JM Smith',   role: 'Owner',     action: 'memory.write',        target: 'Region picker — 6 regions confirmed',  kind: 'memory',     ip: '10.42.18.7',    sig: 'sha256:f23c…71d8' },
    { ts: '2026-04-28 09:01:24Z', actor: 'JM Smith',   role: 'Owner',     action: 'instructions.update', target: 'Project instructions v2',              kind: 'instr',      ip: '10.42.18.7',    sig: 'sha256:e4b1…07a9' },
    { ts: '2026-04-22 16:33:40Z', actor: 'JM Smith',   role: 'Owner',     action: 'project.create',     target: 'Concept2cure AnA 1.0 Skills',          kind: 'lifecycle',  ip: '10.42.18.7',    sig: 'sha256:0001…0001' },
  ],
  'biopharma-nda': [
    { ts: '2026-04-28 13:02:14Z', actor: 'L Tanaka',   role: 'Editor',    action: 'file.update',         target: 'BX-204_clinical_overview.md',           kind: 'file',       ip: '10.74.2.14',    sig: 'sha256:aa01…5b72' },
    { ts: '2026-04-27 11:50:00Z', actor: 'L Tanaka',   role: 'Editor',    action: 'phase.advance',       target: 'Module 3 quality → in progress',        kind: 'lifecycle',  ip: '10.74.2.14',    sig: 'sha256:9100…7d2c' },
    { ts: '2026-04-20 09:00:00Z', actor: 'JM Smith',   role: 'Owner',     action: 'project.create',     target: 'NDA 212345 — BX-204 oral',              kind: 'lifecycle',  ip: '10.42.18.7',    sig: 'sha256:0001…0001' },
  ],
  'eu-mdr-iv415': [
    { ts: '2026-04-28 06:18:51Z', actor: 'F Müller',   role: 'Editor',    action: 'file.update',         target: 'IV-415_CER_outline.md',                 kind: 'file',       ip: '10.55.1.4',     sig: 'sha256:dd80…34a1' },
    { ts: '2026-04-27 22:10:09Z', actor: 'F Müller',   role: 'Editor',    action: 'memory.write',        target: 'Article 61 confirmed; Class III',      kind: 'memory',     ip: '10.55.1.4',     sig: 'sha256:7b29…ee0c' },
    { ts: '2026-04-15 09:00:00Z', actor: 'JM Smith',   role: 'Owner',     action: 'project.create',     target: 'IV-415 EU MDR — companion Dx',         kind: 'lifecycle',  ip: '10.42.18.7',    sig: 'sha256:0001…0001' },
  ],
};

const PACT_KIND_LABEL = {
  export: 'Export', file: 'File', memory: 'Memory', instr: 'Instructions',
  esig: 'E-signature', comment: 'Comment', lifecycle: 'Lifecycle', access: 'Access',
};

function ProjectActivityScreen({ project }) {
  const events = PACT_EVENTS[project.id] || [];
  const [filter, setFilter] = React.useState('all'); // all | export | file | memory | instr | esig | comment | lifecycle | access
  const [query, setQuery] = React.useState('');

  const filtered = events.filter(e =>
    (filter === 'all' || e.kind === filter)
    && (!query || (e.action + ' ' + e.target + ' ' + e.actor).toLowerCase().includes(query.toLowerCase()))
  );

  const byDay = React.useMemo(() => {
    const g = {};
    for (const e of filtered) {
      const d = e.ts.slice(0, 10);
      (g[d] = g[d] || []).push(e);
    }
    return Object.entries(g);
  }, [filtered]);

  const counts = React.useMemo(() => {
    const c = { all: events.length };
    for (const e of events) c[e.kind] = (c[e.kind] || 0) + 1;
    return c;
  }, [events]);

  const FILTERS = [
    { id: 'all',       label: 'All' },
    { id: 'lifecycle', label: 'Lifecycle' },
    { id: 'file',      label: 'Files' },
    { id: 'memory',    label: 'Memory' },
    { id: 'instr',     label: 'Instructions' },
    { id: 'comment',   label: 'Comments' },
    { id: 'esig',      label: 'E-signatures' },
    { id: 'export',    label: 'Exports' },
    { id: 'access',    label: 'Access' },
  ];

  return (
    <div className="pact" data-screen-label={`Activity · ${project.name}`}>
      <header className="pact-head">
        <div>
          <div className="pact-eyebrow">Activity log</div>
          <h2 className="pact-title">Tamper-evident audit trail</h2>
          <p className="pact-sub">Every change in this project is recorded with actor, timestamp, IP, and a SHA-256 signature. Append-only and exportable for inspection per 21 CFR Part 11.</p>
        </div>
        <div className="pact-head-r">
          <span className="pact-integrity">
            <span className="pact-integrity-dot"/>
            Integrity verified
          </span>
          <button className="prj-btn">Export CSV</button>
          <button className="prj-btn">Export PDF</button>
        </div>
      </header>

      {/* Filter chips + search */}
      <div className="pact-toolbar">
        <div className="pact-chips">
          {FILTERS.map(f => (
            <button key={f.id} className={`pact-chip ${filter === f.id ? 'is-on' : ''}`} onClick={() => setFilter(f.id)}>
              {f.label}
              {counts[f.id] != null && <span className="pact-chip-c">{counts[f.id]}</span>}
            </button>
          ))}
        </div>
        <div className="pact-search">
          <span className="pact-search-ico">{I.search || '🔍'}</span>
          <input className="pact-search-input" placeholder="Search actor, action, or target…" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      </div>

      {/* Timeline grouped by day */}
      <div className="pact-list">
        {byDay.length === 0 && (
          <div className="pact-empty">
            <div className="pact-empty-title">No matching events</div>
            <div className="pact-empty-sub">Try a different filter or clear the search.</div>
          </div>
        )}
        {byDay.map(([day, items]) => (
          <section key={day} className="pact-day">
            <header className="pact-day-h">
              <span className="pact-day-d">{day}</span>
              <span className="pact-day-c">{items.length} event{items.length === 1 ? '' : 's'}</span>
            </header>
            <ul className="pact-rows">
              {items.map((e, i) => (
                <li key={i} className="pact-row" data-kind={e.kind}>
                  <span className="pact-time">{e.ts.slice(11, 19)}Z</span>
                  <span className="pact-kind">{PACT_KIND_LABEL[e.kind] || e.kind}</span>
                  <div className="pact-body">
                    <div className="pact-action">
                      <span className="pact-actor">{e.actor}</span>
                      <span className="pact-actor-role">{e.role}</span>
                      <span className="pact-verb">{e.action}</span>
                    </div>
                    <div className="pact-target">{e.target}</div>
                  </div>
                  <div className="pact-meta">
                    <span className="pact-ip" title="IP address">{e.ip}</span>
                    {e.e && <span className="pact-esig" title="E-signature attached">e-sig</span>}
                    <span className="pact-sig" title="Cryptographic signature">{e.sig}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   LINKED PROJECTS
   ───────────────────────────────────────────────────────── */
const PLNK_LINKS = {
  'mdx-510k': [
    { id: 'lk-1', kind: 'predicate',     dir: 'out', otherName: 'K221847 — TitanFix cortical screw',          otherType: '510(k)',     status: 'submitted',  via: 'Substantial equivalence', date: '2022-09-14' },
    { id: 'lk-2', kind: 'sister',        dir: 'out', otherName: 'OR-802 Pediatric — 510(k)',                  otherType: '510(k)',     status: 'draft',      via: 'Same product family',     date: '2026-03-01' },
    { id: 'lk-3', kind: 'reference',     dir: 'out', otherName: 'OR-801 IFU and labeling',                    otherType: 'Artifact',   status: 'active',     via: 'Cited in §6 labeling',    date: '2026-04-12' },
  ],
  'biopharma-nda': [
    { id: 'lk-4', kind: 'parent_ind',    dir: 'in',  otherName: 'IND 152841 — BX-204 oral',                   otherType: 'IND',         status: 'submitted',  via: 'Parent IND',              date: '2024-02-08' },
    { id: 'lk-5', kind: 'sister',        dir: 'out', otherName: 'NDA 212346 — BX-204 modified release',       otherType: 'NDA',         status: 'draft',      via: 'Companion submission',    date: '2026-04-04' },
    { id: 'lk-6', kind: 'reference',     dir: 'out', otherName: 'BX-204 Phase 3 study report',               otherType: 'Artifact',    status: 'active',     via: 'Cited in §2.7.3',         date: '2026-03-22' },
  ],
  'eu-mdr-iv415': [
    { id: 'lk-7', kind: 'parent_510k',   dir: 'in',  otherName: 'K198440 — companion Dx US predicate',        otherType: '510(k)',      status: 'submitted',  via: 'US predicate',            date: '2020-11-30' },
    { id: 'lk-8', kind: 'reference',     dir: 'out', otherName: 'IV-415 PMS plan',                            otherType: 'Artifact',    status: 'active',     via: 'Cited in §9 PMS',         date: '2026-04-22' },
  ],
  'c2c-ana': [],
};

const PLNK_KIND_META = {
  predicate:   { label: 'Predicate device',     hint: 'Cleared device this submission claims substantial equivalence to' },
  parent_ind:  { label: 'Parent IND',           hint: 'IND under which this NDA was developed' },
  parent_510k: { label: 'Parent 510(k)',        hint: '510(k) cleared device this CER references' },
  sister:      { label: 'Sister submission',    hint: 'Related submission in the same family' },
  reference:   { label: 'Referenced artifact',  hint: 'Document or study cited from this project' },
};

function ProjectLinkedScreen({ project }) {
  const links = PLNK_LINKS[project.id] || [];
  const groups = React.useMemo(() => {
    const g = {};
    for (const l of links) (g[l.kind] = g[l.kind] || []).push(l);
    return Object.entries(g);
  }, [links]);

  return (
    <div className="plnk" data-screen-label={`Linked · ${project.name}`}>
      <header className="plnk-head">
        <div>
          <div className="plnk-eyebrow">Linked projects</div>
          <h2 className="plnk-title">What this project depends on, and what depends on it</h2>
          <p className="plnk-sub">Predicates, parent submissions, sister applications, and referenced artifacts. Claude follows these links when reasoning across submissions.</p>
        </div>
        <div className="plnk-head-r">
          <button className="prj-btn primary">{I.plus} Link project</button>
        </div>
      </header>

      {links.length === 0 && (
        <div className="plnk-empty">
          <div className="plnk-empty-ico">{I.beaker}</div>
          <div className="plnk-empty-title">No linked projects yet</div>
          <div className="plnk-empty-sub">Link a predicate device, a parent IND, or a sister submission to share context. Claude will pull memory from linked projects when relevant.</div>
          <button className="prj-btn primary">{I.plus} Link a project</button>
        </div>
      )}

      {groups.map(([kind, items]) => {
        const meta = PLNK_KIND_META[kind] || { label: kind, hint: '' };
        return (
          <section key={kind} className="plnk-group">
            <header className="plnk-group-h">
              <div>
                <div className="plnk-group-name">{meta.label}</div>
                <div className="plnk-group-hint">{meta.hint}</div>
              </div>
              <span className="plnk-group-c">{items.length}</span>
            </header>
            <ul className="plnk-list">
              {items.map(l => (
                <li key={l.id} className="plnk-row" data-dir={l.dir}>
                  <span className="plnk-arrow" title={l.dir === 'in' ? 'Incoming' : 'Outgoing'}>{l.dir === 'in' ? '↓' : '↑'}</span>
                  <div className="plnk-body">
                    <div className="plnk-name-row">
                      <span className="plnk-name">{l.otherName}</span>
                      <span className="plnk-type-pill">{l.otherType}</span>
                      <span className={`plnk-status-pill is-${l.status}`}>{l.status.replace('_', ' ')}</span>
                    </div>
                    <div className="plnk-via">{l.via} · linked {l.date}</div>
                  </div>
                  <div className="plnk-row-actions">
                    <button className="prj-btn" title="Open linked project">Open</button>
                    <button className="prj-icon-btn" title="Unlink">{I.close || '✕'}</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {links.length > 0 && (
        <div className="plnk-graph">
          <div className="plnk-graph-h">Dependency map</div>
          <svg className="plnk-graph-svg" viewBox="0 0 800 200" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            <defs>
              <marker id="plnk-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>
              </marker>
            </defs>
            {/* center node */}
            <g>
              <rect x="320" y="80" width="160" height="40" rx="6" fill="var(--bg-100)" stroke="var(--text-100)"/>
              <text x="400" y="105" textAnchor="middle" fontSize="11" fill="var(--text-100)">{project.name.length > 22 ? project.name.slice(0, 22) + '…' : project.name}</text>
            </g>
            {/* surrounding nodes */}
            {links.slice(0, 6).map((l, i) => {
              const angle = (i / links.slice(0, 6).length) * Math.PI * 2 - Math.PI / 2;
              const cx = 400 + Math.cos(angle) * 220;
              const cy = 100 + Math.sin(angle) * 60;
              const x = Math.max(20, Math.min(680, cx - 70));
              const y = Math.max(10, Math.min(170, cy - 14));
              return (
                <g key={l.id}>
                  <line x1={400} y1={100} x2={x + 70} y2={y + 14} stroke="var(--border)" strokeWidth="1" markerEnd="url(#plnk-arr)" color="var(--text-400)"/>
                  <rect x={x} y={y} width="140" height="28" rx="5" fill="var(--bg-000)" stroke="var(--border)"/>
                  <text x={x + 70} y={y + 18} textAnchor="middle" fontSize="10" fill="var(--text-200)">
                    {l.otherName.length > 22 ? l.otherName.slice(0, 22) + '…' : l.otherName}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   ARCHIVE / RESTORE / DELETE confirmation modal
   ───────────────────────────────────────────────────────── */
function ProjectArchiveModal({ open, project, mode, onClose, onConfirm }) {
  const [confirmText, setConfirmText] = React.useState('');
  React.useEffect(() => { if (open) setConfirmText(''); }, [open]);
  React.useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open || !project) return null;

  const isDelete = mode === 'delete';
  const isArchive = mode === 'archive';
  const isRestore = mode === 'restore';
  const expectedConfirm = isDelete ? project.name : '';
  const canConfirm = isDelete ? confirmText === expectedConfirm : true;

  const title = isDelete ? `Delete "${project.name}"?` : isArchive ? `Archive "${project.name}"?` : `Restore "${project.name}"?`;
  const cta   = isDelete ? 'Delete project' : isArchive ? 'Archive project' : 'Restore project';

  return (
    <div className="parch" role="dialog" aria-label={title}>
      <div className="parch-scrim" onClick={onClose}/>
      <div className="parch-shell" data-mode={mode}>
        <header className="parch-head">
          <div className="parch-ico">{isDelete ? (I.trash || '✕') : isArchive ? (I.archive || '⌫') : (I.refresh || '↺')}</div>
          <h2 className="parch-title">{title}</h2>
        </header>

        <div className="parch-body">
          {isArchive && (
            <>
              <p className="parch-p">Archiving moves the project out of your active list. Memory, instructions, files, chats, and the audit trail are preserved.</p>
              <ul className="parch-list">
                <li><span className="parch-li-ico">{I.check || '✓'}</span> All data is retained per your retention policy</li>
                <li><span className="parch-li-ico">{I.check || '✓'}</span> Audit trail continues — restore is a logged action</li>
                <li><span className="parch-li-ico">{I.check || '✓'}</span> Submission gateways and links remain intact</li>
                <li><span className="parch-li-ico">{I.close || '✕'}</span> Claude will not surface this project in chat suggestions</li>
              </ul>
            </>
          )}
          {isRestore && (
            <p className="parch-p">Restoring moves this project back to your active list. All data is intact — nothing was deleted during archive.</p>
          )}
          {isDelete && (
            <>
              <p className="parch-p parch-p-danger">Deletion is final after the 30-day soft-delete window. After that, all chats, files, memory, and audit trail entries are unrecoverable.</p>
              <ul className="parch-list">
                <li><span className="parch-li-ico is-danger">{I.close || '✕'}</span> {project.chats.length} chats and {project.files.length} files will be deleted</li>
                <li><span className="parch-li-ico is-danger">{I.close || '✕'}</span> Memory ({(PMEM_LEARNINGS && PMEM_LEARNINGS[project.id] || []).length} learnings) will be erased</li>
                <li><span className="parch-li-ico is-danger">{I.close || '✕'}</span> Audit trail will be exported to inspection-grade PDF, then sealed</li>
                <li><span className="parch-li-ico">{I.check || '✓'}</span> Linked projects will see this as "removed reference"</li>
              </ul>
              <div className="parch-confirm">
                <label className="parch-confirm-lbl">Type <span className="parch-confirm-target">{project.name}</span> to confirm</label>
                <input className="parch-confirm-input" value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder={project.name} autoFocus/>
              </div>
            </>
          )}
        </div>

        <footer className="parch-foot">
          <button className="prj-btn" onClick={onClose}>Cancel</button>
          <button
            className={`prj-btn ${isDelete ? 'is-danger' : 'primary'}`}
            disabled={!canConfirm}
            onClick={() => canConfirm && onConfirm && onConfirm()}
          >{cta}</button>
        </footer>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   LIST screen — empty state, filter chip rail, bulk-action bar
   ───────────────────────────────────────────────────────── */
function ProjectsListEmpty({ kind, onCreate, onClear }) {
  if (kind === 'no-projects') {
    return (
      <div className="ple">
        <div className="ple-ico">{I.beaker || '◯'}</div>
        <div className="ple-title">No projects yet</div>
        <div className="ple-sub">A project is a persistent workspace — chats, memory, instructions and files Claude carries across sessions. Start with a template, or build from scratch.</div>
        <div className="ple-actions">
          <button className="prj-btn primary" onClick={onCreate}>{I.plus} New project</button>
          <button className="prj-btn">Browse templates</button>
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
      <div className="ple-ico">{I.search || '◯'}</div>
      <div className="ple-title">No projects match your filters</div>
      <div className="ple-sub">Try clearing one or more filters, or search by name, sponsor, or product.</div>
      <button className="prj-btn" onClick={onClear}>Clear filters</button>
    </div>
  );
}

const PLF_TYPES    = ['510(k)', 'IND', 'NDA', 'BLA', 'PMA', 'EU MDR CER', 'IVDR'];
const PLF_STATUSES = ['Active', 'In review', 'Submitted', 'Draft', 'Archived'];
const PLF_AGENCIES = ['FDA', 'EMA', 'PMDA', 'MHRA', 'Health Canada'];
const PLF_OWNERS   = ['JM Smith', 'A Park', 'L Tanaka', 'F Müller', 'D Reyes'];
const PLF_ACTIVITY = ['Today', 'This week', 'This month', 'This quarter'];

const PLF_SAVED_VIEWS = [
  { id: 'mine-active',     label: 'My active 510(k)s',         filters: { type: ['510(k)'], status: ['Active', 'In review'], owner: ['JM Smith'] } },
  { id: 'pending-agency',  label: 'Pending agency response',    filters: { status: ['Submitted'] } },
  { id: 'eu-mdr-q3',       label: 'EU MDR — this quarter',     filters: { agency: ['EMA'], activity: ['This quarter'] } },
  { id: 'archived',        label: 'Archived',                   filters: { status: ['Archived'] } },
];

function ProjectsListFilters({ filters, onChange, savedView, onSavedView, query, onQuery }) {
  const set = (k, v) => onChange({ ...filters, [k]: v });
  const toggle = (k, val) => {
    const arr = filters[k] || [];
    set(k, arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
  };
  const totalChips = Object.values(filters).reduce((n, arr) => n + (arr ? arr.length : 0), 0);

  return (
    <div className="plf">
      <div className="plf-row plf-row-views">
        <span className="plf-views-lbl">Saved views</span>
        <div className="plf-views">
          {PLF_SAVED_VIEWS.map(v => (
            <button key={v.id} className={`plf-view ${savedView === v.id ? 'is-on' : ''}`} onClick={() => onSavedView(v)}>
              {v.label}
            </button>
          ))}
          <button className="plf-view-add" title="Save current filters as a view">{I.plus} Save view</button>
        </div>
      </div>

      <div className="plf-row">
        <div className="plf-search">
          <span className="plf-search-ico">{I.search || '🔍'}</span>
          <input className="plf-search-input" placeholder="Search by project, sponsor, or product…" value={query} onChange={e => onQuery(e.target.value)}/>
        </div>
        <FilterPill label="Type"     options={PLF_TYPES}    selected={filters.type}     onToggle={v => toggle('type', v)}/>
        <FilterPill label="Status"   options={PLF_STATUSES} selected={filters.status}   onToggle={v => toggle('status', v)}/>
        <FilterPill label="Agency"   options={PLF_AGENCIES} selected={filters.agency}   onToggle={v => toggle('agency', v)}/>
        <FilterPill label="Owner"    options={PLF_OWNERS}   selected={filters.owner}    onToggle={v => toggle('owner', v)}/>
        <FilterPill label="Activity" options={PLF_ACTIVITY} selected={filters.activity} onToggle={v => toggle('activity', v)}/>
        {totalChips > 0 && (
          <button className="plf-clear" onClick={() => onChange({ type: [], status: [], agency: [], owner: [], activity: [] })}>
            Clear all ({totalChips})
          </button>
        )}
      </div>
    </div>
  );
}

function FilterPill({ label, options, selected = [], onToggle }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);
  return (
    <div className="plf-pill-wrap" ref={ref}>
      <button className={`plf-pill ${selected.length ? 'has-selected' : ''}`} onClick={() => setOpen(o => !o)}>
        {label}
        {selected.length > 0 && <span className="plf-pill-c">{selected.length}</span>}
        <span className="plf-pill-chev">{I.down}</span>
      </button>
      {open && (
        <div className="plf-menu">
          {options.map(o => {
            const on = selected.includes(o);
            return (
              <button key={o} className={`plf-menu-row ${on ? 'is-on' : ''}`} onClick={() => onToggle(o)}>
                <span className="plf-menu-check">{on ? (I.check || '✓') : ''}</span>
                <span>{o}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProjectsListBulkBar({ count, onClear, onArchive, onExport, onTransfer, onDelete }) {
  if (count === 0) return null;
  return (
    <div className="plb">
      <span className="plb-count">{count} selected</span>
      <button className="plb-btn" onClick={onArchive}>{I.archive || '⌫'} Archive</button>
      <button className="plb-btn" onClick={onExport}>{I.download || '↓'} Export</button>
      <button className="plb-btn" onClick={onTransfer}>{I.users || '◯'} Transfer owner</button>
      <button className="plb-btn is-danger" onClick={onDelete}>{I.trash || '✕'} Delete</button>
      <span className="plb-spacer"/>
      <button className="plb-clear" onClick={onClear}>Clear selection</button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   PROJECT QUICK SWITCHER — ⌘K within Projects
   ───────────────────────────────────────────────────────── */
function ProjectQuickSwitcher({ open, projects, onPick, onClose, onCreate }) {
  const [query, setQuery] = React.useState('');
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => { if (open) { setQuery(''); setIdx(0); } }, [open]);

  const filtered = projects.filter(p =>
    !query || (p.name + ' ' + p.product + ' ' + p.sponsor + ' ' + p.submissionTypeLabel).toLowerCase().includes(query.toLowerCase())
  );

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(filtered.length - 1, i + 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
      if (e.key === 'Enter')     { e.preventDefault(); const p = filtered[idx]; if (p) onPick(p.id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, idx, onPick, onClose]);

  if (!open) return null;
  return (
    <div className="pqs" role="dialog" aria-label="Quick switch project">
      <div className="pqs-scrim" onClick={onClose}/>
      <div className="pqs-shell">
        <div className="pqs-head">
          <span className="pqs-search-ico">{I.search || '🔍'}</span>
          <input className="pqs-input" placeholder="Jump to project — search by name, sponsor, or product…" value={query} onChange={e => { setQuery(e.target.value); setIdx(0); }} autoFocus/>
          <span className="pqs-kbd">esc</span>
        </div>
        <div className="pqs-list">
          {filtered.length === 0 && (
            <div className="pqs-empty">
              No projects match "{query}".
              <button className="pqs-empty-cta" onClick={() => onCreate(query)}>Create "{query}" as a new project</button>
            </div>
          )}
          {filtered.map((p, i) => (
            <button
              key={p.id}
              className={`pqs-row ${i === idx ? 'is-cur' : ''}`}
              onMouseEnter={() => setIdx(i)}
              onClick={() => onPick(p.id)}
            >
              <span className="pqs-row-type">{p.submissionTypeLabel}</span>
              <div className="pqs-row-body">
                <span className="pqs-row-name">{p.name}</span>
                <span className="pqs-row-meta">{p.product} · {p.sponsor}</span>
              </div>
              {p.starred && <span className="pqs-row-star">{I.star || '★'}</span>}
              <span className="pqs-row-arrow">{I.right}</span>
            </button>
          ))}
        </div>
        <footer className="pqs-foot">
          <span className="pqs-foot-kbd">↑↓</span><span className="pqs-foot-lbl">navigate</span>
          <span className="pqs-foot-kbd">↵</span><span className="pqs-foot-lbl">open</span>
          <span className="pqs-foot-kbd">esc</span><span className="pqs-foot-lbl">close</span>
          <span className="pqs-foot-spacer"/>
          <span className="pqs-foot-meta">{filtered.length} of {projects.length}</span>
        </footer>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   NOTIFICATIONS — bell icon panel
   ───────────────────────────────────────────────────────── */
const PNOT_NOTIFS = [
  { id: 'n1', when: '2 hours ago',  unread: true,  kind: 'agency',     icon: 'shieldCheck', title: 'FDA acknowledgement received',           sub: 'OR-801 510(k) — accession K260473 assigned',       project: 'mdx-510k' },
  { id: 'n2', when: '5 hours ago',  unread: true,  kind: 'predicate',  icon: 'beaker',      title: 'Predicate K221847 updated by sponsor',   sub: 'New labeling supplement filed; review impact on SE', project: 'mdx-510k' },
  { id: 'n3', when: 'today',        unread: true,  kind: 'supplier',   icon: 'check',       title: 'Biocompatibility supplier signature returned', sub: 'ISO 10993-5 cytotoxicity report countersigned',    project: 'mdx-510k' },
  { id: 'n4', when: 'yesterday',    unread: false, kind: 'review',     icon: 'users',       title: 'D Reyes signed off SE Discussion §4',    sub: 'E-signature attached, audit trail updated',         project: 'mdx-510k' },
  { id: 'n5', when: '2 days ago',   unread: false, kind: 'agency',     icon: 'shieldCheck', title: 'FAERS Q3 signals adjudicated',           sub: '47 signals reviewed, 3 require benefit-risk update', project: 'eu-mdr-iv415' },
  { id: 'n6', when: '3 days ago',   unread: false, kind: 'lifecycle',  icon: 'arrowRight',  title: 'Module 3 quality advanced',              sub: 'BX-204 — drug substance section in active draft',  project: 'biopharma-nda' },
];

function ProjectNotifications({ open, onClose, projects, onOpenProject }) {
  const [filter, setFilter] = React.useState('all'); // all | unread
  React.useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const visible = filter === 'unread' ? PNOT_NOTIFS.filter(n => n.unread) : PNOT_NOTIFS;
  const unreadN = PNOT_NOTIFS.filter(n => n.unread).length;

  return (
    <div className="pnot" role="dialog" aria-label="Notifications">
      <div className="pnot-scrim" onClick={onClose}/>
      <div className="pnot-shell">
        <header className="pnot-head">
          <div>
            <h2 className="pnot-title">Notifications</h2>
            <p className="pnot-sub">{unreadN} unread · across {[...new Set(PNOT_NOTIFS.map(n => n.project))].length} projects</p>
          </div>
          <div className="pnot-head-r">
            <div className="pnot-tabs">
              <button className={`pnot-tab ${filter === 'all' ? 'is-on' : ''}`} onClick={() => setFilter('all')}>All</button>
              <button className={`pnot-tab ${filter === 'unread' ? 'is-on' : ''}`} onClick={() => setFilter('unread')}>Unread {unreadN > 0 && <span className="pnot-tab-c">{unreadN}</span>}</button>
            </div>
            <button className="prj-icon-btn" onClick={onClose} title="Close">{I.close || '✕'}</button>
          </div>
        </header>

        <ul className="pnot-list">
          {visible.length === 0 && (
            <li className="pnot-empty">You're all caught up.</li>
          )}
          {visible.map(n => {
            const p = projects.find(x => x.id === n.project);
            return (
              <li key={n.id} className={`pnot-row ${n.unread ? 'is-unread' : ''}`}>
                <span className="pnot-row-ico" data-kind={n.kind}>{I[n.icon] || '◯'}</span>
                <div className="pnot-row-body">
                  <div className="pnot-row-title">{n.title}</div>
                  <div className="pnot-row-sub">{n.sub}</div>
                  <div className="pnot-row-meta">
                    <span className="pnot-row-when">{n.when}</span>
                    {p && <button className="pnot-row-project" onClick={() => onOpenProject(p.id)}>{p.name}</button>}
                  </div>
                </div>
                {n.unread && <span className="pnot-unread-dot" aria-label="Unread"/>}
              </li>
            );
          })}
        </ul>

        <footer className="pnot-foot">
          <button className="pnot-foot-btn">Mark all as read</button>
          <span className="pnot-foot-spacer"/>
          <button className="pnot-foot-btn">Notification settings</button>
        </footer>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   PROJECT INTERNAL SEARCH — Memory + Instructions + Files + Chats
   ───────────────────────────────────────────────────────── */
function ProjectInternalSearch({ open, project, onClose, onJump }) {
  const [q, setQ] = React.useState('');
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => { if (open) { setQ(''); setIdx(0); } }, [open]);

  const learnings = (typeof PMEM_LEARNINGS !== 'undefined' && PMEM_LEARNINGS[project?.id]) || [];

  const results = React.useMemo(() => {
    if (!project || !q) return [];
    const out = [];
    const ql = q.toLowerCase();
    project.chats.forEach(c => { if (c.title.toLowerCase().includes(ql)) out.push({ kind: 'chat', tab: 'chats', label: c.title, sub: 'Chat · last ' + c.last }); });
    project.files.forEach(f => { if (f.name.toLowerCase().includes(ql)) out.push({ kind: 'file', tab: 'files', label: f.name, sub: 'File · ' + (f.lines || '?') + ' lines · ' + f.kind }); });
    learnings.forEach(l => { if (l.text.toLowerCase().includes(ql) || l.kind.toLowerCase().includes(ql)) out.push({ kind: 'memory', tab: 'memory', label: l.text, sub: 'Memory · ' + l.kind + ' · ' + l.when }); });
    if (project.instructions && project.instructions.toLowerCase().includes(ql)) out.push({ kind: 'instr', tab: 'instructions', label: 'Project instructions', sub: 'Instructions · ' + project.instructions.length + ' chars' });
    if (project.memory && project.memory.summary && project.memory.summary.toLowerCase().includes(ql)) out.push({ kind: 'memory', tab: 'memory', label: 'Memory summary', sub: 'Memory · updated ' + project.memory.updated });
    return out;
  }, [project, q, learnings]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(results.length - 1, i + 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
      if (e.key === 'Enter')     { e.preventDefault(); const r = results[idx]; if (r) onJump(r.tab); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, results, idx, onJump, onClose]);

  if (!open || !project) return null;
  const groups = React.useMemo(() => {
    const g = {};
    for (const r of results) (g[r.kind] = g[r.kind] || []).push(r);
    return Object.entries(g);
  }, [results]);

  return (
    <div className="pis" role="dialog" aria-label="Search this project">
      <div className="pis-scrim" onClick={onClose}/>
      <div className="pis-shell">
        <div className="pis-head">
          <span className="pis-ico">{I.search || '🔍'}</span>
          <input className="pis-input" autoFocus placeholder={`Search ${project.name} — chats, files, memory, instructions…`} value={q} onChange={e => { setQ(e.target.value); setIdx(0); }}/>
          <span className="pis-kbd">esc</span>
        </div>
        <div className="pis-list">
          {!q && <div className="pis-hint">Start typing to search across chats, files, memory, and instructions in this project. Results group by kind.</div>}
          {q && results.length === 0 && <div className="pis-empty">No results in this project for "{q}".</div>}
          {groups.map(([kind, items]) => (
            <section key={kind} className="pis-group">
              <header className="pis-group-h">{kind === 'chat' ? 'Chats' : kind === 'file' ? 'Files' : kind === 'memory' ? 'Memory' : 'Instructions'} · {items.length}</header>
              {items.map((r, i) => {
                const flat = results.indexOf(r);
                return (
                  <button key={i} className={`pis-row ${flat === idx ? 'is-cur' : ''}`} onMouseEnter={() => setIdx(flat)} onClick={() => onJump(r.tab)}>
                    <span className="pis-row-kind">{r.kind}</span>
                    <div className="pis-row-body">
                      <div className="pis-row-label">{r.label}</div>
                      <div className="pis-row-sub">{r.sub}</div>
                    </div>
                    <span className="pis-row-arrow">{I.right}</span>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── exports ─── */
Object.assign(window, {
  ProjectActivityScreen,
  ProjectLinkedScreen,
  ProjectArchiveModal,
  ProjectsListEmpty,
  ProjectsListFilters,
  ProjectsListBulkBar,
  ProjectQuickSwitcher,
  ProjectNotifications,
  ProjectInternalSearch,
  PLF_SAVED_VIEWS,
  PNOT_NOTIFS,
});
