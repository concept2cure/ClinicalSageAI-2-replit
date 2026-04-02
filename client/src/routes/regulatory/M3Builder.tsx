import * as React from 'react';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, Clock, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function M3Builder({ subId }: { subId: string }) {
  const [data, setData] = React.useState<any>({ sections: [], leaves: [] });
  const [loading, setLoading] = React.useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await apiRequest('GET', `/api/reg/submissions/${subId}/m3`);
      setData(await r.json());
    } catch (error) {
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (subId) load();
  }, [subId]);

  async function automap(secId: string) {
    try {
      await apiRequest('POST', `/api/reg/sections/${secId}/automap`);
      await load();
    } catch (error) {
      toast({ title: 'Error', description: 'Auto-map failed', variant: 'destructive' });
    }
  }

  async function draft(secId: string) {
    try {
      const res = await apiRequest('POST', `/api/reg/sections/${secId}/draft`);
      const s = await res.json();
      toast({ title: 'Draft Ready', description: 'AI draft is ready in Suggestions list' });
      await load();
    } catch (error) {
      toast({ title: 'Error', description: 'Draft generation failed', variant: 'destructive' });
    }
  }

  async function listSug(secId: string) {
    try {
      const res = await apiRequest('GET', `/api/reg/sections/${secId}/suggestions`);
      return await res.json();
    } catch (error) {
      return [];
    }
  }

  async function accept(sugId: string) {
    try {
      await apiRequest('POST', `/api/reg/suggestions/${sugId}/accept`);
      await load();
    } catch (error) {
    }
  }

  async function reject(sugId: string) {
    try {
      await fetch(`/api/reg/suggestions/${sugId}/reject`, { method: 'POST' });
      await load();
    } catch (error) {
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'READY':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'DRAFT':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'MISSING':
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (status) {
      case 'READY':
        return 'default';
      case 'DRAFT':
        return 'secondary';
      case 'MISSING':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  if (!subId) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>Please select a submission to view M3 sections</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="m3-builder">
      {loading ? (
        <div className="text-center py-8">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <div className="text-sm text-slate-600">Loading M3 sections...</div>
        </div>
      ) : (
        <>
          {data.sections.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No M3 sections found. Create a submission first.</p>
            </div>
          ) : (
            data.sections.map((s: any) => (
              <Card key={s.sec_id} data-testid={`section-${s.code}`}>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(s.status)}
                    <div>
                      <CardTitle className="text-lg">
                        {s.code} — {s.title}
                      </CardTitle>
                      <p className="text-sm text-gray-600 mt-1">{s.guidance || '—'}</p>
                    </div>
                  </div>
                  <Badge variant={getStatusVariant(s.status)}>{s.status}</Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => automap(s.sec_id)}
                      data-testid={`automap-${s.code}`}
                    >
                      Auto‑Map
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => draft(s.sec_id)}
                      data-testid={`draft-${s.code}`}
                    >
                      AI Draft
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const sug = await listSug(s.sec_id);
                        if (!sug.length) { toast({ title: 'No Suggestions', description: 'No AI suggestions available yet', variant: 'destructive' }); return; }
                        const top = sug[0];
                        const pick = confirm(
                          `Accept latest suggestion?\n\n${(top.draft_md || '').slice(0, 300)}…`
                        );
                        if (pick) await accept(top.sug_id);
                      }}
                      data-testid={`accept-${s.code}`}
                    >
                      Accept Latest
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const sug = await listSug(s.sec_id);
                        if (!sug.length) { toast({ title: 'No Suggestions', description: 'No suggestions to reject' }); return; }
                        await reject(sug[0].sug_id);
                      }}
                      data-testid={`reject-${s.code}`}
                    >
                      Reject Latest
                    </Button>
                  </div>

                  {/* Show leaves if any */}
                  {data.leaves.filter((l: any) => l.sec_id === s.sec_id).length > 0 && (
                    <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                      <h4 className="text-sm font-medium mb-2">Content:</h4>
                      {data.leaves
                        .filter((l: any) => l.sec_id === s.sec_id)
                        .map((leaf: any) => (
                          <div key={leaf.leaf_id} className="text-sm text-gray-700 mb-1">
                            • {leaf.title} ({leaf.status})
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </>
      )}
    </div>
  );
}
