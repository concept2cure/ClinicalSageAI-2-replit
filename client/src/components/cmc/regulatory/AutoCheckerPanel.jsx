import React from 'react';
import { Button } from '@/components/ui/button';

export default function AutoCheckerPanel({ submissionId }) {
  const [rows, setRows] = React.useState([]);
  const [busy, setBusy] = React.useState(false);

  function add(name, ok, status, path) {
    setRows(r => [...r, { name, ok, status, path }]);
  }

  async function run() {
    setRows([]);
    setBusy(true);
    const base = ''; // same-origin

    const list = await fetch(
      `${base}/api/cmc/blueprint/regulatory/submissions/${submissionId}/questions`
    );
    add('List questions', list.ok, list.status, list.url);

    const create = await fetch(
      `${base}/api/cmc/blueprint/regulatory/submissions/${submissionId}/questions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '[AUTO-CHECK] Clarify assay validation',
          sec_code: '3.2.P.5',
          question_text: 'Provide validation details for assay method.',
          due_date: new Date(Date.now() + 30 * 86400e3).toISOString().slice(0, 10),
        }),
      }
    );
    const cj = await create.json().catch(() => ({}));
    const qid = cj?.q_id || cj?.q?.q_id;
    add('Create temp IR', create.ok && !!qid, create.status, create.url);

    let draftOk = false,
      draftStatus = 0;
    if (qid) {
      const draft = await fetch(`${base}/api/cmc/blueprint/regulatory/questions/${qid}/ai-draft`, {
        method: 'POST',
      });
      const dj = await draft.json().catch(() => ({}));
      draftOk = draft.ok && (!!dj.ai_draft_md || !!dj.question?.ai_draft_md);
      draftStatus = draft.status;
    }
    add(
      'AI draft',
      draftOk,
      draftStatus,
      `/api/cmc/blueprint/regulatory/questions/${qid}/ai-draft`
    );

    let saveOk = false,
      saveStatus = 0;
    if (qid) {
      const save = await fetch(`${base}/api/cmc/blueprint/regulatory/questions/${qid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          final_md: '**Response**: Validated per ICH Q2(R2).',
          status: 'IN_REVIEW',
        }),
      });
      saveOk = save.ok;
      saveStatus = save.status;
    }
    add('Save final', saveOk, saveStatus, `/api/cmc/blueprint/regulatory/questions/${qid}`);

    const pack = await fetch(
      `${base}/api/cmc/blueprint/regulatory/submissions/${submissionId}/questions/pack`,
      { method: 'POST' }
    );
    const zipType = (pack.headers.get('content-type') || '').includes('zip');
    const size = (await pack.arrayBuffer()).byteLength;
    add('Package ZIP', pack.ok && zipType && size > 0, pack.status, pack.url);

    let delOk = false,
      delStatus = 0;
    if (qid) {
      const del = await fetch(`${base}/api/cmc/blueprint/regulatory/questions/${qid}`, {
        method: 'DELETE',
        headers: { 'x-auto-check': 'true' },
      });
      delOk = del.ok;
      delStatus = del.status;
    }
    add('Cleanup temp', delOk, delStatus, `/api/cmc/blueprint/regulatory/questions/${qid}`);

    setBusy(false);
  }

  return (
    <div className="space-y-2 border rounded p-3" data-tour="reg.autocheck">
      <div className="flex items-center justify-between">
        <div className="font-medium">Regulatory IR Auto‑Checker</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={run} disabled={busy}>
            {busy ? 'Running…' : 'Run Checks'}
          </Button>
          <a
            className="text-xs text-blue-600 underline"
            href="/help/regulatory/questions"
            target="_blank"
            rel="noreferrer"
          >
            Help
          </a>
        </div>
      </div>
      <div className="overflow-auto border rounded">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-slate-50">
              <th className="text-left p-2">Check</th>
              <th className="text-left p-2">Status</th>
              <th className="p-2">HTTP</th>
              <th className="text-left p-2">Endpoint</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="p-2">{r.name}</td>
                <td className={`p-2 ${r.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                  {r.ok ? 'PASS' : 'FAIL'}
                </td>
                <td className="p-2 text-center">{r.status}</td>
                <td className="p-2">{r.path}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="p-2 text-slate-600" colSpan={4}>
                  Click "Run Checks".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="text-[11px] text-slate-600">
        Note: The checker creates a temporary IR labeled <b>[AUTO‑CHECK]</b>, then deletes it via a
        guarded endpoint.
      </div>
    </div>
  );
}
