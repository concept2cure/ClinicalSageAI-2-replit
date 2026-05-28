// BiopharmaStub — surfaces not yet fully ported. Matches MDX InDesignSurface pattern.

import * as React from 'react';
import { BioIcon } from '../icons';

interface StubProps {
  nav:         string;
  label:       string;
  sharedWith?: string;
  onAskAna?:   (text: string) => void;
}

export function BiopharmaStub({ nav, label, sharedWith, onAskAna }: StubProps) {
  return (
    <div className="bp-surface" style={{ alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <div className="bp-kicker" style={{ marginBottom: 12 }}>Coming in next phase</div>
        <h2 className="bp-title" style={{ marginBottom: 8 }}>{label}</h2>
        {sharedWith ? (
          <p className="bp-meta">
            This surface shares its implementation with <code>{sharedWith}</code> — it renders
            the same component with <code>domain="biopharma"</code> once promoted to the shared chassis.
          </p>
        ) : (
          <p className="bp-meta">
            The <strong>{label}</strong> surface ({nav}) is designed and ships in the next phase. The
            kit is in <code>ui_kits/biopharma/surfaces.jsx</code>.
          </p>
        )}
        {onAskAna && (
          <button className="bp-btn-primary" type="button" style={{ marginTop: 20 }}
                  onClick={() => onAskAna(`What can you do in the ${label} surface?`)}>
            <BioIcon name="sparkles" /> Ask AnA about {label}
          </button>
        )}
      </div>
    </div>
  );
}
