import React from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { EmptyState } from '../dataConnect';
import '../styles/project-home-v2.css';

/* ════ Dossier — document-first workspace ════

   Real-data standard (no fixture in a shipped surface). This workspace
   previously rendered a hardcoded submission architecture from
   `../fixtures/dossier-data` and inline constants:

     • the per-segment CTD / eCTD / eSTAR / MDR / IVDR spine + nested
       folder/document tree (getDossierSpine → program / spine / standard /
       tree of DossierFolder|DossierDoc, each doc carrying a fabricated
       num / owner / version / status / pct / preview / flag),
     • each document's body prose, tables and references (DSR_BODY_25 /
       getDocBody),
     • the data-room source list (DATA_ROOM),

   all fabricated — plus mock actions (the AnA co-author "drafted" on a
   setTimeout with canned replies and staged the document through fake states;
   the "PDF" / "Word" export buttons were no-ops).

   Backend gap: no endpoint returns this surface's contract. The related REAL
   endpoints serve different, project-scoped shapes already owned by other
   surfaces, none of which is this nested document tree:
     • GET /api/dossier-map                     → module-level map
       ({ m, label, pct, tone, sections }) — the DossierMap surface;
     • GET /api/dossier-readiness/:projectId     → per-CTD-section artifact
       readiness rollups (from concept2cure_artifacts);
     • GET /api/c2c/projects/:id/vault-structure → a project section tree
       ({ view, folders, documents[].sections[] }) — the Vault surface.
   None return the nested folder/document tree with per-document owner /
   version / preview / flag, the document bodies, or the data-room sources this
   workspace renders. Until a dossier document-tree service exists, the surface
   shows an honest empty state rather than presenting a fabricated dossier as
   content. */

export function Dossier({ onNav }: SurfaceViewProps) {
  return (
    <div className="dsr">
      <div className="dsr-head">
        <div>
          <div className="reg-eyebrow">Workspace · documents</div>
          <h1 className="dsr-title">Dossier</h1>
          <p className="dsr-sub">
            The document-first workspace — the full submission architecture,
            every folder and document in process, with each document and its AnA
            co-author in view.
          </p>
        </div>
      </div>

      <div style={{ padding: 24 }}>
        <EmptyState
          icon={I.folder}
          title="Dossier not yet available"
          hint={
            <>
              The submission document architecture for this workspace isn’t
              available yet — there’s no dossier document-tree service connected,
              so nothing is shown rather than a sample dossier. The module-level
              dossier map is available in the meantime.{' '}
              <button
                type="button"
                onClick={() => onNav && onNav('dossier-map')}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: 'var(--accent-100)',
                  font: 'inherit',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Open the dossier map {I.arrowRight}
              </button>
            </>
          }
        />
      </div>
    </div>
  );
}
