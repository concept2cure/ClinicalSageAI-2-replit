import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Download, ExternalLink, Clock, CheckCircle } from 'lucide-react'

export default function DocumentExportsPanel() {
  const [dirty, setDirty] = React.useState([]);
  const [exporting, setExporting] = React.useState(false);
  const [out, setOut] = React.useState(null);
  const [err, setErr] = React.useState(null);

  React.useEffect(()=>{
    let alive=true;
    (async()=>{
      try {
        // Mock dirty sections for demo
        setDirty(['3.2.P.3.3', '3.2.S.2.5', '3.2.P.3.5']);
      } catch {}
    })();
    return ()=>{alive=false};
  },[]);

  const runExport = async () => {
    setExporting(true); setErr(null); setOut(null);
    try {
      const res = await fetch('/api/cmc/manufacturing/export/module3',{
        method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
        // TODO: pull real snapshot from server; we pass empty to demo.
        body: JSON.stringify({ snapshot: {} })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setOut(await res.json());
    } catch(e) { setErr(e); } finally { setExporting(false); }
  };

  const frag = out?.fragments;

  return (
    <div className="space-y-4">
      <Card className="bg-white">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            <CardTitle className="text-base text-gray-900">Module 3 Export — 3.2.S / 3.2.P</CardTitle>
            <div className="grow"/>
            <Button 
              onClick={runExport} 
              disabled={exporting}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="btn-export-module3"
            >
              {exporting ? 'Building…' : 'Build & Export'}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="text-sm">
            {dirty.length===0 ? <div>No sections marked dirty.</div> :
              <div>
                <div className="text-xs text-gray-600 mb-2">Sections Requiring Update</div>
                <div className="flex flex-wrap gap-2">
                  {dirty.map((s,i)=><Badge key={i} variant="outline" className="text-amber-700 border-amber-200 bg-amber-50">{s}</Badge>)}
                </div>
              </div>}
          </div>

          {err && <div className="text-sm text-red-600 p-3 bg-red-50 border border-red-200 rounded-lg">Export failed: {String(err.message)}</div>}

          {frag && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border border-gray-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-gray-900">3.2.S (Drug Substance)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-xs">{frag.S.S_2_2.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-xs">{frag.S.S_2_3.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-xs">{frag.S.S_2_4.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-xs">{frag.S.S_2_5.title}</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-gray-100">
                    <div className="text-xs text-gray-500">Traceability: site/steps/materials/PPQ</div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-gray-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-gray-900">3.2.P (Drug Product)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-xs">{frag.P.P_3_3.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-xs">{frag.P.P_3_4.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-xs">{frag.P.P_3_5.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-xs">{frag.P.P_7.title}</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-gray-100">
                    <div className="text-xs text-gray-500">Traceability: steps, CPP↔CQA, PPQ, packaging</div>
                  </div>
                </CardContent>
              </Card>

              <div className="md:col-span-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>Generated: {frag.generatedAt}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="text-xs h-7 px-2">
                      <Download className="w-3 h-3 mr-1" />
                      Download DOCX
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-7 px-2">
                      <ExternalLink className="w-3 h-3 mr-1" />
                      View JSON
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}