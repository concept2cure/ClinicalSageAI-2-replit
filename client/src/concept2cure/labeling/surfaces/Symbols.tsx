// ISO 15223-1 symbols — live symbol glossary for a selected document, with add
// + remove authoring. Rows from GET /api/mdx/labeling/:id/symbols. POST adds a
// symbol; DELETE /symbols/:symId removes one behind a two-step confirm
// affordance (governed-lite — a deliberate confirm, not a full e-signature).

import * as React from 'react';
import {
  useLabelingSymbols,
  useAddSymbol,
  useRemoveSymbol,
} from '../../hooks/useLabeling';
import type { LabelingSymbol, LabelingSymbolCreate } from '../../services/labelingService';
import { DocPicker } from './DocPicker';
import { LabelingIcon } from '../icons';
import { LabelingDialog } from './LabelingDialog';
import { Loading, ErrorState, Empty, NoProject } from './state';

interface SymbolsProps {
  projectId: string | null;
  onAskAna: (t: string) => void;
}

interface SymbolFormState {
  symbolCode: string;
  symbolName: string;
  description: string;
  requiredBy: string;
}

function AddSymbolDialog({ docId, onClose }: { docId: number; onClose: () => void }) {
  const add = useAddSymbol();
  const [form, setForm] = React.useState<SymbolFormState>({
    symbolCode: '', symbolName: '', description: '', requiredBy: '',
  });
  const errId = React.useId();

  const set = <K extends keyof SymbolFormState>(k: K, v: SymbolFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const valid = form.symbolCode.trim().length > 0 && form.symbolName.trim().length > 0;
  const pending = add.isPending;
  const error = add.error as Error | null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || pending) return;
    const requiredBy = form.requiredBy
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const data: LabelingSymbolCreate = {
      symbolCode: form.symbolCode.trim(),
      symbolName: form.symbolName.trim(),
      description: form.description.trim() || null,
      requiredBy: requiredBy.length > 0 ? requiredBy : null,
    };
    await add.mutateAsync({ id: docId, data });
    onClose();
  };

  const formId = 'lb-symbol-form';

  return (
    <LabelingDialog
      open
      busy={pending}
      title="Add symbol"
      subtitle="ISO 15223-1 symbol declared on this label"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="bp-btn-tert" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form={formId} className="bp-btn-primary" disabled={!valid || pending}>
            {pending ? 'Adding…' : 'Add symbol'}
          </button>
        </>
      }
    >
      <form id={formId} className="lb-form" onSubmit={onSubmit} aria-describedby={error ? errId : undefined}>
        <div className="lb-field-row">
          <div className="lb-field">
            <label htmlFor="sym-code">Symbol code<span className="lb-req" aria-hidden="true">*</span></label>
            <input
              id="sym-code"
              required
              value={form.symbolCode}
              onChange={(e) => set('symbolCode', e.target.value)}
              placeholder="e.g. 5.4.3"
            />
          </div>
          <div className="lb-field">
            <label htmlFor="sym-name">Symbol name<span className="lb-req" aria-hidden="true">*</span></label>
            <input
              id="sym-name"
              required
              value={form.symbolName}
              onChange={(e) => set('symbolName', e.target.value)}
              placeholder="e.g. Consult instructions for use"
            />
          </div>
        </div>

        <div className="lb-field">
          <label htmlFor="sym-required">Required by</label>
          <input
            id="sym-required"
            value={form.requiredBy}
            onChange={(e) => set('requiredBy', e.target.value)}
            placeholder="Standard references, comma separated — e.g. ISO 15223-1, EU MDR"
          />
        </div>

        <div className="lb-field">
          <label htmlFor="sym-desc">Description</label>
          <textarea
            id="sym-desc"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="What the symbol declares on this label"
          />
        </div>

        {error && (
          <div id={errId} className="lb-form-error" role="alert">
            <LabelingIcon name="alertCircle" size={14} />
            Could not add the symbol. {error.message}
          </div>
        )}
      </form>
    </LabelingDialog>
  );
}

/** Governed-lite remove: a deliberate inline confirm step before the DELETE. */
function RemoveSymbolCell({ symbol, docId }: { symbol: LabelingSymbol; docId: number }) {
  const remove = useRemoveSymbol();
  const [confirming, setConfirming] = React.useState(false);
  const pending = remove.isPending;

  const onConfirm = async () => {
    await remove.mutateAsync({ symId: symbol.id, docId });
    // Row disappears on invalidation; no local reset needed.
  };

  if (!confirming) {
    return (
      <button
        className="bp-btn-tert"
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Remove symbol ${symbol.symbol_code} ${symbol.symbol_name}`}
      >
        <LabelingIcon name="trash" size={14} /> Remove
      </button>
    );
  }

  return (
    <div className="lb-confirm">
      <span className="lb-confirm-text">
        <LabelingIcon name="warning" size={13} />
        Remove this symbol?
      </span>
      <button className="bp-btn-tert" type="button" onClick={() => setConfirming(false)} disabled={pending}>
        Cancel
      </button>
      <button className="bp-btn-primary" type="button" onClick={onConfirm} disabled={pending}>
        {pending ? 'Removing…' : 'Confirm remove'}
      </button>
    </div>
  );
}

export function LabelingSymbols({ projectId, onAskAna }: SymbolsProps) {
  const [docId, setDocId] = React.useState<number | null>(null);
  const symbols = useLabelingSymbols(docId);
  const rows = symbols.data ?? [];
  const [adding, setAdding] = React.useState(false);

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">Labeling · ISO 15223-1</div>
          <h1 className="bp-title">ISO 15223-1 symbols</h1>
          <div className="bp-meta">Symbols declared on the selected label, with the standard that requires each</div>
        </div>
        <div className="bp-page-actions">
          <button
            className="bp-btn-tert"
            type="button"
            disabled={docId == null}
            onClick={() => setAdding(true)}
          >
            <LabelingIcon name="plus" /> Add symbol
          </button>
          <button className="bp-btn-primary" type="button"
                  onClick={() => onAskAna('Verify the symbol set against ISO 15223-1 for this label')}>
            Ask AnA
          </button>
        </div>
      </div>

      {!projectId ? (
        <div className="bp-card"><NoProject /></div>
      ) : (
        <>
          <DocPicker projectId={projectId} value={docId} onChange={setDocId} />
          <div className="bp-card">
            <div className="bp-card-head">
              <span>Symbols</span>
              <span className="bp-meta">{rows.length} on this label</span>
            </div>
            {docId == null ? (
              <Empty>Select a document to view its symbols.</Empty>
            ) : symbols.isLoading ? (
              <Loading label="Loading symbols…" />
            ) : symbols.isError ? (
              <ErrorState message="Could not load symbols." />
            ) : rows.length === 0 ? (
              <Empty>No symbols recorded for this document yet.</Empty>
            ) : (
              <table className="bp-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Symbol</th>
                    <th>Required by</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(s => (
                    <tr key={s.id}>
                      <td className="lb-mono">{s.symbol_code}</td>
                      <td style={{ fontWeight: 500 }}>{s.symbol_name}</td>
                      <td className="lb-mut">
                        {s.required_by && s.required_by.length > 0 ? s.required_by.join(', ') : '—'}
                      </td>
                      <td>
                        {docId != null && <RemoveSymbolCell symbol={s} docId={docId} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {adding && docId != null && (
        <AddSymbolDialog docId={docId} onClose={() => setAdding(false)} />
      )}
    </div>
  );
}
