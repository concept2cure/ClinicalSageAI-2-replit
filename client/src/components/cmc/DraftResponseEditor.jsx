import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { 
  FileText, 
  Plus, 
  Save, 
  Send, 
  Link2, 
  CheckCircle, 
  AlertCircle,
  Loader2,
  Edit3,
  X
} from 'lucide-react';

export default function DraftResponseEditor({ finding, open, onClose }) {
  const [text, setText] = React.useState('');
  const [evidenceIds, setEvidenceIds] = React.useState([]);
  const [evidenceItems, setEvidenceItems] = React.useState([]);
  const [responses, setResponses] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [pushing, setPushing] = React.useState(false);
  const [currentResponseId, setCurrentResponseId] = React.useState(null);
  const { toast } = useToast();

  // Load evidence candidates and existing responses when opened
  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [evidenceRes, responsesRes] = await Promise.all([
          fetch('/api/cmc/manufacturing/evidence', { credentials: 'include' }),
          fetch('/api/cmc/manufacturing/responses', { credentials: 'include' })
        ]);
        
        if (evidenceRes.ok && responsesRes.ok) {
          const evidenceData = await evidenceRes.json();
          const responsesData = await responsesRes.json();
          
          if (alive) {
            setEvidenceItems(evidenceData.items || []);
            setResponses(responsesData.responses || []);
            
            // Check if there's already a draft for this finding
            if (finding) {
              const existingResponse = responsesData.responses.find(r => r.findingId === finding.ruleId);
              if (existingResponse) {
                setText(existingResponse.text || '');
                setEvidenceIds(existingResponse.evidenceIds || []);
                setCurrentResponseId(existingResponse.id);
              } else {
                // Auto-seed response template
                const template = `We acknowledge the Agency's comment regarding ${finding.module3Sections?.[0] || 'the submission'}.

Rationale & Data: We performed an impact assessment and identified the following gaps related to "${finding.title}".

Actions & Commitments: We will ${finding.actions?.[0] || 'address the finding appropriately'}.

Timing: We anticipate completing corrective actions within 60–90 days and will update Module 3 accordingly.`;
                setText(template);
              }
            }
          }
        }
      } catch (e) {
        console.error('Failed to load data:', e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [open, finding]);

  const handleSave = async () => {
    if (!finding) return;
    setSaving(true);
    try {
      const response = await fetch('/api/cmc/manufacturing/response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: currentResponseId,
          findingId: finding.ruleId,
          section: finding.module3Sections?.[0] || '3.2.P.3.5',
          text,
          evidenceIds
        })
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const saved = await response.json();
      
      setCurrentResponseId(saved.id);
      toast({
        title: "Draft Saved",
        description: `Response draft saved successfully (${saved.id})`,
      });
    } catch (e) {
      toast({
        title: "Save Failed",
        description: e.message,
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePush = async () => {
    if (!currentResponseId) {
      toast({
        title: "Save First",
        description: "Please save the draft before pushing to Document Authoring",
        variant: "destructive"
      });
      return;
    }
    
    setPushing(true);
    try {
      const response = await fetch('/api/cmc/manufacturing/response/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ responseId: currentResponseId })
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      
      toast({
        title: "Pushed to Document Authoring",
        description: `Response pushed successfully (${result.documentId})`,
      });
      onClose();
    } catch (e) {
      toast({
        title: "Push Failed",
        description: e.message,
        variant: "destructive"
      });
    } finally {
      setPushing(false);
    }
  };

  const toggleEvidence = (evidenceId) => {
    setEvidenceIds(prev => 
      prev.includes(evidenceId) 
        ? prev.filter(id => id !== evidenceId)
        : [...prev, evidenceId]
    );
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/20">
      <div className="absolute inset-4 bg-white rounded-lg shadow-xl flex flex-col max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="text-lg font-semibold">Draft Response Editor</h2>
              {finding && (
                <p className="text-sm text-gray-600">
                  {finding.ruleId}: {finding.title}
                </p>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <div className="flex-1 flex gap-4 p-4 overflow-hidden">
            {/* Main Editor */}
            <div className="flex-1 flex flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Response Draft</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Compose your response to the regulatory finding..."
                    className="min-h-[300px] resize-none"
                  />
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <Button onClick={handleSave} disabled={saving} className="flex items-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {currentResponseId ? 'Update Draft' : 'Save Draft'}
                </Button>
                
                <Button 
                  onClick={handlePush} 
                  disabled={pushing || !currentResponseId}
                  variant="default"
                  className="flex items-center gap-2"
                >
                  {pushing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Push to Document Authoring
                </Button>
                
                {currentResponseId && (
                  <Badge variant="outline" className="ml-auto">
                    Draft: {currentResponseId}
                  </Badge>
                )}
              </div>
            </div>

            {/* Evidence Panel */}
            <div className="w-80 flex flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Link2 className="w-4 h-4" />
                    Link Evidence
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 max-h-60 overflow-y-auto">
                  {evidenceItems.map((item) => (
                    <div 
                      key={item.id}
                      className={`p-2 border rounded cursor-pointer transition-colors ${
                        evidenceIds.includes(item.id) 
                          ? 'bg-blue-50 border-blue-200' 
                          : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                      }`}
                      onClick={() => toggleEvidence(item.id)}
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {item.type}
                        </Badge>
                        {evidenceIds.includes(item.id) && (
                          <CheckCircle className="w-3 h-3 text-blue-600" />
                        )}
                      </div>
                      <div className="text-sm mt-1">{item.label}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {finding && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Finding Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div>
                      <Badge variant={finding.severity === 'high' ? 'destructive' : 'secondary'}>
                        {finding.severity}
                      </Badge>
                    </div>
                    <div className="text-sm">
                      <strong>Rationale:</strong> {finding.rationale}
                    </div>
                    {finding.evidence && (
                      <div className="text-sm">
                        <strong>Evidence:</strong> {finding.evidence.join(', ')}
                      </div>
                    )}
                    {finding.module3Sections && (
                      <div className="text-sm">
                        <strong>Sections:</strong> {finding.module3Sections.join(', ')}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}