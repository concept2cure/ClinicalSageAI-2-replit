import React, { useEffect } from 'react';
import { EmptyState, useLiveData } from '../dataConnect';
import { registerCeremonyOpen } from '../ceremony';
import { useDialog } from '../useDialog';
import { I } from '../icons';

interface Usage { id: number; name: string; keyPrefix: string; requestCount: number; lastUsedAt: string | null; createdAt: string; status: string }
function isUsage(value: unknown): value is Usage {
  if (!value || typeof value !== 'object') return false;
  const u = value as Usage;
  return Number.isInteger(u.id) && typeof u.name === 'string' && typeof u.keyPrefix === 'string'
    && Number.isInteger(u.requestCount) && u.requestCount >= 0 && typeof u.status === 'string'
    && typeof u.createdAt === 'string' && Number.isFinite(Date.parse(u.createdAt))
    && (u.lastUsedAt === null || (typeof u.lastUsedAt === 'string' && Number.isFinite(Date.parse(u.lastUsedAt))));
}
const when = (value: string | null) => value ? new Date(value).toLocaleString() : 'Never used';

export function AdminApiKeyUsage({ keyId, name, onClose }: { keyId: number; name: string; onClose: () => void }) {
  const ref = useDialog(onClose);
  const uid = React.useId();
  const [epoch, setEpoch] = React.useState(0);
  const path = `/api/api-keys/${keyId}/usage`;
  const live = useLiveData<Usage>(path, [path, epoch], isUsage);
  useEffect(() => registerCeremonyOpen(), []);
  return <div className="de-bd" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="de" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`}>
      <div className="de-h"><div><div className="de-h-eye">API keys · usage</div><div className="de-h-t" id={`${uid}-title`}>Usage for {name}</div></div><button className="de-x" onClick={onClose} aria-label="Close">{I.close}</button></div>
      <div className="de-body">
        {live.loading ? <EmptyState busy icon={I.key} title="Reading key usage…" />
          : live.error || !live.data ? <EmptyState tone="error" icon={I.alertTriangle} title="Key usage could not be read" hint={live.error || 'The response did not contain usage details.'} retry={() => setEpoch(n => n + 1)} />
          : <dl className="adm-key-usage">
            <dt>Key prefix</dt><dd className="mono">{live.data.keyPrefix}…</dd>
            <dt>Status</dt><dd>{live.data.status}</dd>
            <dt>Total requests</dt><dd>{live.data.requestCount.toLocaleString()}</dd>
            <dt>Last used</dt><dd>{when(live.data.lastUsedAt)}</dd>
            <dt>Created</dt><dd>{when(live.data.createdAt)}</dd>
          </dl>}
      </div>
      <div className="de-f"><button className="de-btn primary" onClick={onClose}>Done</button></div>
    </div>
  </div>;
}
