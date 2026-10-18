import React, { useState } from 'react';
import { NOTIFICATION_CATEGORIES, NOTIFICATION_CATEGORY_LABELS } from '@shared/constants/notifications';
import { useLiveRows, isRowsWith } from './dataConnect';
import { apiCall, apiErrorText } from './apiCall';
import { useDialog } from './useDialog';

interface Preference { category: string; in_app_enabled: boolean; }
export function NotificationPreferences({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const ref = useDialog(onClose);
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preferences = useLiveRows<Preference>('/api/mdx/notification-subscriptions', ['notification-preferences',reload], isRowsWith<Preference>('category', 'in_app_enabled'));
  const save = async (category: string, enabled: boolean) => {
    setSaving(category); setError(null);
    try {
      const result = await apiCall('PUT', `/api/mdx/notification-subscriptions/${category}`, { inAppEnabled: enabled });
      if (!result.ok) { setError(apiErrorText(result, 'The preference was not saved.')); return; }
      setReload(value=>value+1); onSaved();
    } catch { setError('The preference was not saved. Please try again.'); }
    finally { setSaving(null); }
  };
  return <><div className="tt-scrim" onClick={onClose}/><aside ref={ref} className="tt-panel" role="dialog" aria-modal="true" aria-label="Notification preferences" tabIndex={-1}>
    <div className="tt-head"><b>Notification preferences</b><button className="tt-close" onClick={onClose} aria-label="Close notification preferences">Close</button></div>
    <div className="tt-scroll">
      <p>Choose which in-app alerts appear in your inbox for this organization. Email and push alerts are not available.</p>
      {(error || preferences.error) && <p role="alert">{error || preferences.error}</p>}
      {preferences.loading ? <p>Loading preferences…</p> : preferences.error ? <button onClick={()=>setReload(value=>value+1)}>Retry</button> :
        NOTIFICATION_CATEGORIES.map(category=>{
          const enabled = preferences.rows.find(row=>row.category===category)?.in_app_enabled !== false;
          return <label className="tt-item" key={category}><span className="tt-item-body">{NOTIFICATION_CATEGORY_LABELS[category]}</span><input type="checkbox" checked={enabled} disabled={saving !== null} onChange={event=>void save(category,event.target.checked)}/></label>;
        })}
    </div>
  </aside></>;
}
