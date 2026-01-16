import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { X, Eye, FileText, AlertTriangle, CheckCircle, Clock } from 'lucide-react'

export default function RegulatorViewDrawer({ open, onClose }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState(null);

  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const r = await fetch('/api/cmc/manufacturing/regulator-view', { credentials: 'include' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (alive) setData(j);
      } catch (e) {
        if (alive) setErr(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      aria-hidden={false}
    >
      {/* backdrop */}
      <div 
        className="absolute inset-0 bg-black/20 transition-opacity opacity-100" 
        onClick={onClose}
        data-testid="regulator-view-backdrop"
      />
      {/* panel */}
      <aside className={`absolute right-0 top-0 h-full w-full max-w-lg bg-white dark:bg-gray-900 border-l shadow-xl transform transition-transform duration-300 ease-in-out z-50 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center gap-2 border-b p-4 bg-gray-50">
          <Eye className="w-5 h-5 text-blue-600" />
          <div className="text-base font-semibold text-gray-900">Regulator View</div>
          <div className="grow" />
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onClose} 
            className="flex items-center gap-1 z-50"
            data-testid="btn-close-regulator-view"
          >
            <X className="w-4 h-4" />
            Close
          </Button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto h-[calc(100%-72px)]">
          {loading && (
            <div className="flex items-center justify-center p-8">
              <div className="text-sm text-gray-600">Loading regulatory snapshot...</div>
            </div>
          )}
          
          {err && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="p-4">
                <div className="text-sm text-red-700">Failed to load: {String(err.message)}</div>
              </CardContent>
            </Card>
          )}

          {data && (
            <>
              <Card className="bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-gray-900 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    Module 3 Anchors
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <div className="text-sm font-medium text-gray-700 mb-2">3.2.S (Drug Substance)</div>
                      <div className="space-y-2">
                        {Object.entries(data.module3.S).map(([k,v])=>(
                          <div key={k} className="flex items-center gap-2 text-sm">
                            <div className={`w-2 h-2 rounded-full ${v.ok ? 'bg-green-500' : 'bg-amber-500'}`} />
                            <span className="font-mono text-xs text-gray-600">{k}</span>
                            <span className="text-gray-700">{v.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-700 mb-2">3.2.P (Drug Product)</div>
                      <div className="space-y-2">
                        {Object.entries(data.module3.P).map(([k,v])=>(
                          <div key={k} className="flex items-center gap-2 text-sm">
                            <div className={`w-2 h-2 rounded-full ${v.ok ? 'bg-green-500' : 'bg-amber-500'}`} />
                            <span className="font-mono text-xs text-gray-600">{k}</span>
                            <span className="text-gray-700">{v.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                    <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-1"></span>Evidence present
                    <span className="inline-block w-2 h-2 bg-amber-500 rounded-full ml-3 mr-1"></span>Likely query risk
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-gray-900 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Risk Assessment
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">CPP↔CQA gaps:</span>
                        <Badge variant={data.risks.cppMissing > 0 ? "destructive" : "outline"} className="text-xs">
                          {data.risks.cppMissing}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Open Change Controls:</span>
                        <Badge variant={data.risks.openChangeControls.length > 0 ? "destructive" : "outline"} className="text-xs">
                          {data.risks.openChangeControls.length}
                        </Badge>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Open Deviations:</span>
                        <Badge variant={data.risks.deviations.length > 0 ? "destructive" : "outline"} className="text-xs">
                          {data.risks.deviations.length}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">High-risk equipment:</span>
                        <Badge variant={data.risks.equipmentHighRisk.length > 0 ? "destructive" : "outline"} className="text-xs">
                          {data.risks.equipmentHighRisk.length}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-gray-900 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Validation Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">PPQ Progress:</span>
                    <span className="font-medium">{data.validation.ppq.completedRuns}/{data.validation.ppq.targetRuns}</span>
                  </div>
                  {data.validation.cpv && (
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-gray-600">CPV Metric:</span>
                        <span className="font-medium">{data.validation.cpv.metric}</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        LCL: {data.validation.cpv.lcl} / UCL: {data.validation.cpv.ucl}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-gray-900 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-600" />
                    Packaging & Serialization
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Format:</span>
                    <span className="font-medium">{data.packaging?.format || 'Not specified'}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    Components: {(data.packaging?.components||[]).join(', ') || 'Not specified'}
                  </div>
                </CardContent>
              </Card>

              <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded">
                Generated: {new Date(data.generatedAt).toLocaleString()}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}