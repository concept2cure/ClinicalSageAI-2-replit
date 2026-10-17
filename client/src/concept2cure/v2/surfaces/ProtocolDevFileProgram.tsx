import React, { useRef, useState } from 'react';
import { apiCall, apiErrorText } from '../apiCall';
import { C2CForm } from '../C2CForm';

interface FileProtocolProps {
  documentId: number; programId: string; programName: string | null;
  onCancel: () => void; onDone: () => void;
}

async function confirmProgram(documentId: number, programId: string, reason: string) {
  const result = await apiCall('POST', `/api/protocol-development/documents/${documentId}/program`, { programId, reason });
  if (!result.ok) throw new Error(apiErrorText(result, 'Could not file this protocol in the open program.'));
  if (result.body?.programId !== programId) throw new Error('The server did not confirm the program association. Refresh this protocol before retrying.');
}

export function FileProtocolProgramDrawer({ documentId, programId, programName, onCancel, onDone }: FileProtocolProps) {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (values: Record<string, string>) => {
    if (running.current) return;
    const reason = (values.reason || '').trim();
    if (reason.length < 8) { setError('The governed reason must be at least 8 characters. Nothing was written.'); return; }
    running.current = true; setBusy(true); setError(null);
    try { await confirmProgram(documentId, programId, reason); onDone(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { running.current = false; setBusy(false); }
  };
  return <C2CForm config={{ title: 'File protocol in open program', eyebrow: 'Protocol · program association', governed: true,
    sub: `${programName || programId} — explicitly records this unfiled protocol’s program. An existing program association cannot be moved.`,
    notice: error || undefined, busy: busy ? 'Filing the protocol…' : undefined, submitLabel: 'File protocol',
    fields: [{ key: 'reason', label: 'Reason for change (governed)', type: 'textarea', required: true }] }}
    onCancel={onCancel} onSubmit={submit} />;
}
