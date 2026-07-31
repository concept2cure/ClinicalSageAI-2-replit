import React, { useState } from 'react';
import { I } from '../icons';
import { EmptyState } from '../dataConnect';

/* ── Types ── */

interface PharmaAccProps {
  title: string;
  // Was `string` when accordion headers rendered pictograph glyphs.
  // Now takes a real icon node from the shared I set, matching every
  // EmptyState body in this file and closing the design-system
  // "no emoji" non-negotiable at the callsite.
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  badge?: string | number | null;
  children: React.ReactNode;
}

interface PharmaIntelPanelProps {
  pid: string;
  onAsk?: (q: string) => void;
}

/* ── Accordion shell ── */

function PharmaAcc({ title, icon, open, onToggle, badge, children }: PharmaAccProps) {
  return (
    <div className={'dv-acc' + (open ? ' open' : '')}>
      <button className="dv-acc-h" onClick={onToggle}>
        <span className="dv-acc-ic">{icon}</span>
        <span className="dv-acc-t">{title}</span>
        {badge != null && <span className="dv-acc-badge">{badge}</span>}
        <span className="dv-acc-chev">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="dv-acc-body">{children}</div>}
    </div>
  );
}

/* ── Main Panel ──
   Pharma-pathway intelligence: shadow review, biostatistics judgment, ATMP
   profile, CMC Module 3 status, and IND assembly. The panel is keyed only by a
   pathway id (`pid`). It previously rendered a hardcoded per-pathway fixture
   (fixtures/pharma-data → getPharmaData / CMC_OS) presented as content.

   Per the real-data standard, a surface must render real persisted data, an
   honest empty state, or an honest error state — never a fabricated fixture.
   None of these five slices has a backend endpoint that serves its display
   contract scoped by `pid`, so each renders an honest "not yet available"
   EmptyState with the specific backend gap noted inline (see comments). When a
   pathway-scoped read lands for a slice, replace its EmptyState with a
   useLiveData/useLiveRows four-state render (loading → error → empty → real),
   per Biostatistics.tsx / Nonclinical.tsx. ── */

export function PharmaIntelPanel({ pid }: PharmaIntelPanelProps) {
  const [open, setOpen] = useState<string | null>('shadow');
  const isInd = pid === 'ind';
  const isAtmp = pid === 'atmp';
  const isCmc = pid === 'ctd' || pid === 'bla' || pid === 'nda';

  return (
    <div className="dv-dock dv-dock-embed">
      <div className="dv-dock-scroll">
        <PharmaAcc title="Shadow review" icon={I.clipboardList} open={open === 'shadow'} onToggle={() => setOpen(open === 'shadow' ? null : 'shadow')}>
          {/* Backend gap: the only shadow endpoint (GET /api/shadow-review,
             register-inline-routes.ts) is org-scoped, per-lens reviewer findings
             for the dedicated Shadow Review surface. It returns no pathway-scoped
             RTF/CRL risk scores or summary, so this panel's contract cannot be
             served without fabricating those values. */}
          <EmptyState
            icon={I.clipboardList}
            title="Shadow review not yet available for this pathway"
            hint="The pre-file reviewer read (RTF / CRL risk and findings) isn't wired to a pathway-scoped backend yet. The Shadow Review surface reads the organization's live reviewer worklist."
          />
        </PharmaAcc>

        <PharmaAcc title="Biostatistics judgment" icon={I.barChart} open={open === 'biostats'} onToggle={() => setOpen(open === 'biostats' ? null : 'biostats')}>
          {/* Backend gap: /api/ana-biostats exposes only POST compute/judge/
             workflow (they compute from a supplied design, not a persisted
             per-pathway judgment) plus the governed-documents read the
             Biostatistics surface already owns. There is no GET returning this
             pathway's power/fragility/defensibility judgment object. */}
          <EmptyState
            icon={I.barChart}
            title="Biostatistics judgment not yet available for this pathway"
            hint="The design's power, fragility, and defensibility read isn't wired to a persisted per-pathway backend yet. The Biostatistics surface computes and governs statistical documents live."
          />
        </PharmaAcc>

        {isAtmp && (
          <PharmaAcc title="ATMP — Gene & Cell Therapy" icon={I.microscope} open={open === 'atmp'} onToggle={() => setOpen(open === 'atmp' ? null : 'atmp')}>
            {/* Backend gap: /advanced-therapies/framework/:region is a
               region-scoped regulatory-knowledge stub (and /classify is POST) —
               neither is a persisted, product-specific ATMP CMC/clinical/vector
               profile for this org's pathway. */}
            <EmptyState
              icon={I.microscope}
              title="ATMP profile not yet available"
              hint="The product-specific gene/cell-therapy profile (vector, CMC release specs, LTFU, GMP focus) isn't persisted to a backend yet."
            />
          </PharmaAcc>
        )}

        {isCmc && (
          <PharmaAcc title="CMC Module 3 OS" icon={I.beaker} open={open === 'cmcos'} onToggle={() => setOpen(open === 'cmcos' ? null : 'cmcos')}>
            {/* Backend gap: GET /api/cmc/module3-board returns section approval
               state only (no `stale` / `staleReason`, no contradictions) and
               requires a projectId this pathway-keyed panel does not carry — so
               the stale + contradiction view this panel is built around has no
               faithful source. */}
            <EmptyState
              icon={I.beaker}
              title="CMC Module 3 status not yet available"
              hint="The Module 3 section freshness and contradiction-detection view isn't wired to a backend here. The CMC surface reads the governed Module 3 board per project."
            />
          </PharmaAcc>
        )}

        {isInd && (
          <PharmaAcc title="IND assembly (Form 1571 / 1572)" icon={I.fileText} open={open === 'ind'} onToggle={() => setOpen(open === 'ind' ? null : 'ind')}>
            {/* Backend gap: no read endpoint returns an assembled Form 1571 cover
               sheet + per-investigator 1572 completeness for a pathway.
               /api/ind-master-data exposes org-scoped sponsor / agent /
               investigator registries only, and this panel carries no IND /
               project id to scope a query. */}
            <EmptyState
              icon={I.fileText}
              title="IND assembly data not yet available"
              hint="The assembled Form 1571 cover sheet and 1572 investigator completeness aren't wired to a pathway-scoped backend yet. Sponsor and investigator registries live under IND master data."
            />
          </PharmaAcc>
        )}
      </div>
    </div>
  );
}
