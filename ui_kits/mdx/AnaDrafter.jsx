/* AnaDrafter.jsx
   ─────────────────────────────────────────────────────────────────
   The full-page workspace that opens from "Draft response with AnA"
   on a correspondence item. Two-pane layout:

     Left pane:  the agency/NB letter as authored, with each
                 deficiency numbered and highlighted; clicking a
                 deficiency on the left scrolls the right pane to
                 the corresponding response card.

     Right pane: a structured response — one card per deficiency.
                 Each card has:
                   • restated ask (deficiency title + body)
                   • response prose (editable, AnA-drafted)
                   • optional response table (e.g. stratified MARD)
                   • discussion paragraph (editable)
                   • evidence picker (existing files + AnA-generated)
                   • dossier updates (which §sections will change)
                   • citation chips for every §, attachment, reg

     Top bar:    status pill, due chip, reviewer roster (Reg / QA /
                 Med Affairs / Biostat) with sign-off state.
     Bottom bar: Discard · Save draft · Send to FDA (gated on
                 reviewer sign-off).

   Renders inline inside the program surface — when active, takes
   over the workspace tab area; ESC or Discard returns to the
   correspondence list.
   ─────────────────────────────────────────────────────────────────
*/

const { useState: useDS, useMemo: useDMemo, useEffect: useDEffect, useRef: useDRef } = React;

function AnaDrafter({ correspondence, onClose, onOpenSection }) {
  const detail = (window.CORRESP_DETAIL || {})[correspondence.id];
  // Hooks run on every render, so the empty state returns after them, not before.
  const letter = detail?.letter;
  const deficiencies = detail?.deficiencies || [];
  const initialDraft = detail?.draft || { status: 'unstarted' };

  const [draft, setDraft] = useDS(initialDraft);
  const [activeDefId, setActiveDefId] = useDS(deficiencies[0]?.id);
  const [generating, setGenerating] = useDS(false);
  const [showCitations, setShowCitations] = useDS(true);

  const due = correspondence.due;
  const days = useDMemo(() => daysUntil(due), [due]);
  const overdue = days !== null && days < 0;

  // Scroll right pane to the active deficiency
  const responseScrollRef = useDRef(null);
  useDEffect(() => {
    if (!activeDefId || !responseScrollRef.current) return;
    const el = responseScrollRef.current.querySelector(`[data-def="${activeDefId}"]`);
    if (el && el.scrollIntoView) {
      // Programmatic; user can ignore by scrolling. Avoid jumpy block:'center' on initial load.
      el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, [activeDefId]);

  if (!detail) {
    return (
      <div className="drafter-empty">
        <div className="drafter-empty-icon">{I.fileText}</div>
        <div className="drafter-empty-title">No structured letter on file for this item.</div>
        <div className="drafter-empty-sub">Open the original document to begin drafting manually, or contact the lead reviewer to request a structured copy.</div>
        <button className="drafter-empty-act" onClick={onClose}>Back to correspondence</button>
      </div>
    );
  }

  const generate = () => {
    setGenerating(true);
    setTimeout(() => {
      // Pull the saved draft from CORRESP_DETAIL — for items where AnA hasn't drafted yet,
      // we synthesize a skeleton so the UI is never empty.
      const saved = detail.draft && detail.draft.deficiencies ? detail.draft : null;
      const skeleton = saved || {
        status:       'drafted',
        generated_at: new Date().toISOString(),
        generated_by: 'AnA',
        intro:        `Concept2Cure acknowledges receipt of ${letter.ref} dated ${fmtDate(letter.dated)}. We respond to each item below in the order presented in your letter.`,
        deficiencies: deficiencies.map(d => ({
          id: d.id,
          response: `Response to ${d.title}: drafted from current dossier sources. Awaiting review.`,
          evidence: [],
          updates:  d.refs.map(r => ({ section: r.label, diff: '+0 / −0', summary: 'No change yet — review and edit the response, then attach evidence to generate the section update.' })),
        })),
        closing: 'We respectfully request that review be resumed upon receipt of this response.',
        reviewers: [
          { role: 'Reg Lead',    name: 'Jordan Chen',     status: 'pending' },
          { role: 'Biostat',     name: 'Marcus Wei',      status: 'pending' },
          { role: 'Med Affairs', name: 'Dr. Lee Hartman', status: 'pending' },
          { role: 'QA',          name: 'Priya Shah',      status: 'pending' },
        ],
      };
      setDraft(skeleton);
      setGenerating(false);
    }, 850);
  };

  const status = draft.status || 'unstarted';
  const allApproved = status === 'drafted' && draft.reviewers && draft.reviewers.every(r => r.status === 'approved');

  return (
    <div className="ana-drafter">
      <DrafterTopBar
        correspondence={correspondence}
        letter={letter}
        draft={draft}
        days={days}
        overdue={overdue}
        onRegenerate={generate}
        generating={generating}
        showCitations={showCitations}
        setShowCitations={setShowCitations}
        onClose={onClose}
      />

      <div className="drafter-body">
        <DrafterLetter
          letter={letter}
          deficiencies={deficiencies}
          activeDefId={activeDefId}
          setActiveDefId={setActiveDefId}
        />

        <div className="drafter-response" ref={responseScrollRef}>
          {status === 'unstarted' ? (
            <DrafterUnstarted letter={letter} deficiencies={deficiencies} onGenerate={generate} generating={generating}/>
          ) : (
            <DrafterDraftedBody
              draft={draft}
              setDraft={setDraft}
              deficiencies={deficiencies}
              activeDefId={activeDefId}
              setActiveDefId={setActiveDefId}
              showCitations={showCitations}
              onOpenSection={onOpenSection}
            />
          )}
        </div>
      </div>

      <DrafterFooter
        draft={draft}
        setDraft={setDraft}
        allApproved={allApproved}
        onClose={onClose}
      />
    </div>
  );
}

/* ─────────── Top bar ─────────── */

function DrafterTopBar({ correspondence, letter, draft, days, overdue, onRegenerate, generating, showCitations, setShowCitations, onClose }) {
  const status = draft.status || 'unstarted';
  return (
    <div className="drafter-top">
      <button className="drafter-back" onClick={onClose} title="Back to correspondence (Esc)">
        {I.left} <span>Correspondence</span>
      </button>
      <div className="drafter-top-mid">
        <div className="drafter-top-title">
          <span className={`drafter-kind-chip kind-${kindClass(correspondence.kind)}`}>{correspondence.kind}</span>
          <span className="drafter-top-subject">{correspondence.subject}</span>
        </div>
        <div className="drafter-top-meta">
          <span>{letter.ref}</span>
          <span className="drafter-top-dot">·</span>
          <span>From {letter.from_name} · {letter.from_office}</span>
          <span className="drafter-top-dot">·</span>
          <span>Received {fmtDate(letter.received_at)}</span>
        </div>
      </div>
      <div className="drafter-top-right">
        <DueChip days={days} overdue={overdue} due={correspondence.due}/>
        <StatusPill status={status}/>
        <div className="drafter-top-actions">
          <button className={`drafter-toggle ${showCitations ? 'is-on' : ''}`} onClick={() => setShowCitations(!showCitations)} title="Toggle inline citations">
            {I.bookOpen}<span>Citations</span>
          </button>
          {status !== 'unstarted' && (
            <button className="drafter-regen" onClick={onRegenerate} disabled={generating}>
              {I.sparkles}
              <span>{generating ? 'Drafting…' : 'Regenerate'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DueChip({ days, overdue, due }) {
  if (days === null) return null;
  const tone = overdue ? 'late' : days < 5 ? 'warn' : 'ok';
  return (
    <span className={`drafter-due tone-${tone}`}>
      {I.clock}
      <span>{overdue ? `${Math.abs(days)} days late` : `${days} days · due ${fmtDate(due)}`}</span>
    </span>
  );
}

function StatusPill({ status }) {
  const map = {
    unstarted: { label: 'Not started', tone: 'idle' },
    drafted:   { label: 'Draft',       tone: 'draft' },
    in_review: { label: 'In review',   tone: 'review' },
    approved:  { label: 'Approved',    tone: 'success' },
    sent:      { label: 'Sent',        tone: 'success' },
  };
  const s = map[status] || map.unstarted;
  return <span className={`drafter-status tone-${s.tone}`}><span className="drafter-status-dot"/> {s.label}</span>;
}

/* ─────────── Letter pane (left) ─────────── */

function DrafterLetter({ letter, deficiencies, activeDefId, setActiveDefId }) {
  return (
    <div className="drafter-letter">
      <div className="drafter-letter-paper">
        <div className="dl-hdr">
          <div className="dl-from">
            <div className="dl-from-org">{letter.from_office}</div>
            <div className="dl-from-name">{letter.from_name}</div>
            <div className="dl-from-title">{letter.from_title}</div>
          </div>
          <div className="dl-meta">
            <div><span className="dl-meta-k">Ref</span><span className="dl-meta-v">{letter.ref}</span></div>
            <div><span className="dl-meta-k">Re</span><span className="dl-meta-v">{letter.our_ref}</span></div>
            <div><span className="dl-meta-k">Dated</span><span className="dl-meta-v">{fmtDate(letter.dated)}</span></div>
            <div><span className="dl-meta-k">Via</span><span className="dl-meta-v">{letter.via}</span></div>
          </div>
        </div>

        <div className="dl-body">
          {letter.body.map((para, i) => {
            // Highlight deficiency anchors inline if the paragraph mentions
            // "Item N" or "deficiency N." We pull these from the deficiency list.
            const enriched = enrichParagraph(para, deficiencies, activeDefId, setActiveDefId);
            return <p key={i}>{enriched}</p>;
          })}

          <div className="dl-deficiencies-rail">
            <div className="dl-defs-label">{deficiencies.length} item{deficiencies.length === 1 ? '' : 's'} requested</div>
            {deficiencies.map((d) => (
              <button
                key={d.id}
                className={`dl-def ${activeDefId === d.id ? 'is-active' : ''}`}
                onClick={() => setActiveDefId(d.id)}
              >
                <span className={`dl-def-num sev-${d.severity}`}>D{d.n}</span>
                <span className="dl-def-body">
                  <span className="dl-def-title">{d.title}</span>
                  <span className="dl-def-meta">
                    {d.refs.map((r) => <span key={r.section} className="dl-def-ref">{r.label}</span>)}
                    {d.regs.slice(0, 1).map((r) => <span key={r.ref} className="dl-def-reg">{r.ref}</span>)}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div className="dl-signoff">
            <div>{letter.signature.sign_off}</div>
            <div className="dl-signoff-name">{letter.signature.name}</div>
            <div className="dl-signoff-title">{letter.signature.title}</div>
            {letter.signature.cc && (
              <div className="dl-signoff-cc">cc: {letter.signature.cc.join(' · ')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function enrichParagraph(para, deficiencies, activeDefId, setActiveDefId) {
  // Match "Item N" or leading "N. " patterns and turn into clickable chips
  // pointing at deficiency Dn. Best-effort.
  const parts = [];
  const re = /(\bItem\s+(\d+)\b|^\s*(\d+)\.\s)/g;
  let last = 0; let m;
  while ((m = re.exec(para)) !== null) {
    parts.push(para.slice(last, m.index));
    const n = parseInt(m[2] || m[3], 10);
    const def = deficiencies.find(d => d.n === n);
    if (def) {
      parts.push(
        <button
          key={`d-${m.index}`}
          className={`dl-inline-def ${activeDefId === def.id ? 'is-active' : ''}`}
          onClick={() => setActiveDefId(def.id)}
        >D{def.n}</button>
      );
      // skip the leading "N. " or "Item N" form
      last = m.index + m[0].length;
    } else {
      parts.push(m[0]);
      last = m.index + m[0].length;
    }
  }
  parts.push(para.slice(last));
  return parts;
}

/* ─────────── Response pane (right) — unstarted ─────────── */

function DrafterUnstarted({ deficiencies, onGenerate, generating }) {
  return (
    <div className="drafter-unstarted">
      <div className="du-hero">
        <div className="du-icon">{I.sparkles}</div>
        <div className="du-title">Draft a response with AnA</div>
        <div className="du-sub">
          AnA will draft a structured response addressing each of the {deficiencies.length} item{deficiencies.length === 1 ? '' : 's'} in this letter,
          pulling from the relevant dossier sections and attached evidence. You review and edit before sending.
        </div>
      </div>
      <div className="du-plan">
        <div className="du-plan-label">AnA will:</div>
        <ol className="du-plan-list">
          <li>Read each deficiency and identify the dossier sections it touches.</li>
          <li>Pull current text + attached evidence from the relevant §sections.</li>
          <li>Generate response prose, tables, and discussion against each ask.</li>
          <li>Propose §section updates (with diff) where the response requires them.</li>
          <li>Attach citation footnotes for every claim, evidence file, and reg.</li>
        </ol>
        <div className="du-plan-foot">No changes are written to the dossier until you accept the proposed updates.</div>
      </div>
      <button className="du-cta" onClick={onGenerate} disabled={generating}>
        {I.sparkles}
        <span>{generating ? 'AnA is drafting…' : 'Generate draft'}</span>
      </button>
    </div>
  );
}

/* ─────────── Response pane — drafted ─────────── */

function DrafterDraftedBody({ draft, setDraft, deficiencies, activeDefId, setActiveDefId, showCitations, onOpenSection }) {
  const updateDef = (id, patch) => {
    setDraft({
      ...draft,
      deficiencies: draft.deficiencies.map(d => d.id === id ? { ...d, ...patch } : d),
    });
  };

  return (
    <div className="dr-body">
      <DrafterIntro draft={draft} setDraft={setDraft}/>

      <div className="dr-defs">
        {deficiencies.map((def) => {
          const draftDef = draft.deficiencies.find(dd => dd.id === def.id) || { id: def.id, response: '', evidence: [], updates: [] };
          return (
            <DrafterDefCard
              key={def.id}
              def={def}
              draftDef={draftDef}
              isActive={activeDefId === def.id}
              onActivate={() => setActiveDefId(def.id)}
              onPatch={(p) => updateDef(def.id, p)}
              showCitations={showCitations}
              onOpenSection={onOpenSection}
            />
          );
        })}
      </div>

      <DrafterClosing draft={draft} setDraft={setDraft}/>
      <DrafterReviewers draft={draft} setDraft={setDraft}/>
    </div>
  );
}

function DrafterIntro({ draft, setDraft }) {
  return (
    <div className="dr-section dr-intro">
      <div className="dr-section-hdr">
        <div className="dr-section-num">A</div>
        <div className="dr-section-titles">
          <div className="dr-section-title">Acknowledgment</div>
          <div className="dr-section-sub">First paragraph of the response — sets receipt, ref, and scope.</div>
        </div>
      </div>
      <DrafterTextarea
        value={draft.intro}
        onChange={(v) => setDraft({ ...draft, intro: v })}
        rows={4}
      />
    </div>
  );
}

function DrafterClosing({ draft, setDraft }) {
  return (
    <div className="dr-section dr-closing">
      <div className="dr-section-hdr">
        <div className="dr-section-num">Z</div>
        <div className="dr-section-titles">
          <div className="dr-section-title">Closing</div>
          <div className="dr-section-sub">Request to resume review + truthfulness statement.</div>
        </div>
      </div>
      <DrafterTextarea
        value={draft.closing}
        onChange={(v) => setDraft({ ...draft, closing: v })}
        rows={3}
      />
    </div>
  );
}

function DrafterDefCard({ def, draftDef, isActive, onActivate, onPatch, showCitations, onOpenSection }) {
  return (
    <div className={`dr-def-card ${isActive ? 'is-active' : ''}`} data-def={def.id} onClick={onActivate}>
      <div className="dr-def-hdr">
        <div className={`dr-def-num sev-${def.severity}`}>D{def.n}</div>
        <div className="dr-def-titles">
          <div className="dr-def-ask-label">Reviewer ask</div>
          <div className="dr-def-title">{def.title}</div>
          <div className="dr-def-body">{def.body}</div>
        </div>
      </div>

      <div className="dr-def-section">
        <div className="dr-section-label">Response</div>
        <DrafterTextarea
          value={draftDef.response}
          onChange={(v) => onPatch({ response: v })}
          rows={4}
        />
      </div>

      {draftDef.table && (
        <div className="dr-def-section">
          <div className="dr-section-label">Result table</div>
          <div className="dr-def-table-wrap">
            <table className="dr-def-table">
              <thead>
                <tr>{draftDef.table.cols.map((c) => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {draftDef.table.rows.map((row, i) => (
                  <tr key={i} className={row[0] === 'Overall' ? 'is-overall' : ''}>
                    {row.map((cell, j) => <td key={j}>{cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {draftDef.discussion && (
        <div className="dr-def-section">
          <div className="dr-section-label">Discussion</div>
          <DrafterTextarea
            value={draftDef.discussion}
            onChange={(v) => onPatch({ discussion: v })}
            rows={3}
          />
        </div>
      )}

      {draftDef.evidence?.length > 0 && (
        <div className="dr-def-section">
          <div className="dr-section-label">Evidence to attach <span className="dr-def-count">{draftDef.evidence.length}</span></div>
          <div className="dr-evidence">
            {draftDef.evidence.map((f) => (
              <div key={f.name} className={`dr-ev ${f.new ? 'is-new' : ''}`}>
                <div className={`dr-ev-icon kind-${f.kind}`}>{fileIco(f.kind)}</div>
                <div className="dr-ev-meta">
                  <div className="dr-ev-name">
                    {f.name}
                    {f.new && <span className="dr-ev-new">generated</span>}
                  </div>
                  <div className="dr-ev-sub">{fmtBytes(f.size)} · {f.source}</div>
                </div>
                <button className="dr-ev-rm" title="Remove">{I.close}</button>
              </div>
            ))}
            <button className="dr-ev-add">{I.plus} <span>Attach more</span></button>
          </div>
        </div>
      )}

      {draftDef.updates?.length > 0 && draftDef.updates[0].section && (
        <div className="dr-def-section">
          <div className="dr-section-label">Dossier updates</div>
          <div className="dr-updates">
            {draftDef.updates.map((u, i) => (
              <button key={i} className="dr-update" onClick={() => onOpenSection && onOpenSection({ id: def.refs[0]?.section, label: u.section })}>
                <div className="dr-update-section">{u.section}</div>
                <div className="dr-update-diff">{u.diff}</div>
                <div className="dr-update-summary">{u.summary || '—'}</div>
                <div className="dr-update-act">Open in dossier {I.right}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {showCitations && (
        <div className="dr-citations">
          <span className="dr-cit-label">Citations</span>
          {def.refs.map((r) => <span key={r.section} className="dr-cit-chip cit-section">{r.label}</span>)}
          {def.regs.map((r) => <span key={r.ref} className="dr-cit-chip cit-reg">{r.ref}</span>)}
        </div>
      )}
    </div>
  );
}

function DrafterReviewers({ draft, setDraft }) {
  if (!draft.reviewers) return null;
  const toggle = (i) => {
    const r = draft.reviewers[i];
    const next = r.status === 'approved'
      ? { ...r, status: 'pending', signed_at: null }
      : { ...r, status: 'approved', signed_at: new Date().toISOString() };
    setDraft({ ...draft, reviewers: draft.reviewers.map((x, j) => j === i ? next : x) });
  };
  return (
    <div className="dr-reviewers">
      <div className="dr-section-label">Internal sign-off · required before send</div>
      <div className="dr-rev-grid">
        {draft.reviewers.map((r, i) => (
          <div key={i} className={`dr-rev ${r.status}`}>
            <div className="dr-rev-role">{r.role}</div>
            <div className="dr-rev-name">{r.name}</div>
            <button
              className={`dr-rev-act ${r.status}`}
              onClick={() => toggle(i)}
            >
              {r.status === 'approved' ? `Approved · ${fmtTime(r.signed_at)}` : 'Approve'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────── Footer ─────────── */

function DrafterFooter({ draft, setDraft, allApproved, onClose }) {
  const status = draft.status || 'unstarted';
  if (status === 'unstarted') return null;

  const send = () => {
    if (!allApproved) return;
    setDraft({ ...draft, status: 'sent', sent_at: new Date().toISOString() });
  };

  return (
    <div className="drafter-foot">
      <div className="drafter-foot-l">
        {draft.acknowledged_by && <span className="drafter-foot-ack">Acknowledged by {draft.acknowledged_by}</span>}
      </div>
      <div className="drafter-foot-r">
        <button className="drafter-foot-act ghost" onClick={onClose}>Save draft</button>
        <button className="drafter-foot-act ghost danger">Discard</button>
        <button
          className={`drafter-foot-act primary ${allApproved ? '' : 'is-disabled'}`}
          disabled={!allApproved}
          onClick={send}
          title={allApproved ? 'Send to FDA via eSTAR portal' : 'All reviewers must approve before sending'}
        >
          {I.send} <span>{status === 'sent' ? 'Sent to FDA' : `Send to ${draft.send_to || 'FDA'}`}</span>
        </button>
      </div>
    </div>
  );
}

/* ─────────── Helpers ─────────── */

function kindClass(kind) {
  const k = (kind || '').toLowerCase();
  if (k.includes('hold'))    return 'hold';
  if (k.includes('rta'))     return 'rta';
  if (k.includes('day-100')) return 'day100';
  if (k.includes('major'))   return 'major';
  if (k.includes('minor'))   return 'minor';
  if (k.includes('q&a'))     return 'qa';
  if (k.includes('interactive')) return 'interactive';
  return 'default';
}

function fmtBytes(b) {
  if (!b) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function fileIco() {
  return I.fileText;  // single icon for all kinds — color tells the rest
}

function DrafterTextarea({ value, onChange, rows = 3 }) {
  return (
    <textarea
      className="drafter-textarea"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
    />
  );
}

Object.assign(window, { AnaDrafter });
