import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { X, Check, AlertCircle, Zap, Brain } from 'lucide-react'

const AIPanel = ({ processId, onClose, onRefresh }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    if (processId) {
      fetchSuggestions();
    }
  }, [processId]);

  const fetchSuggestions = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/process/processes/${processId}/ai/suggest`, {
        method: 'POST',
      });
      const data = await response.json();
      setSuggestions(data);
    } catch (error) {
      console.error('Error fetching AI suggestions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async suggestionId => {
    setProcessingId(suggestionId);
    try {
      const response = await fetch(`/api/process/ai/${suggestionId}/accept`, {
        method: 'POST',
      });
      if (response.ok) {
        setSuggestions(
          suggestions.map(s => (s.sugg_id === suggestionId ? { ...s, status: 'ACCEPTED' } : s))
        );
        onRefresh();
      }
    } catch (error) {
      console.error('Error accepting suggestion:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async suggestionId => {
    setProcessingId(suggestionId);
    try {
      const response = await fetch(`/api/process/ai/${suggestionId}/reject`, {
        method: 'POST',
      });
      if (response.ok) {
        setSuggestions(
          suggestions.map(s => (s.sugg_id === suggestionId ? { ...s, status: 'REJECTED' } : s))
        );
      }
    } catch (error) {
      console.error('Error rejecting suggestion:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const getSeverityColor = score => {
    if (score >= 0.8) return 'text-red-600 bg-red-50 border-red-200';
    if (score >= 0.6) return 'text-orange-600 bg-orange-50 border-orange-200';
    return 'text-blue-600 bg-blue-50 border-blue-200';
  };

  const getActionDescription = (action, payload) => {
    switch (action) {
      case 'promote_cpp':
        return `Promote "${payload.paramName}" to Critical Process Parameter (CPP)`;
      case 'add_ipc':
        return `Add In-Process Control for "${payload.paramName}"`;
      default:
        return 'Process optimization suggestion';
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            AI Process Optimization Suggestions
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 animate-pulse" />
                Generating AI suggestions...
              </div>
            </div>
          ) : suggestions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No AI suggestions available for this process
            </div>
          ) : (
            suggestions.map(suggestion => (
              <Card
                key={suggestion.sugg_id}
                className={`${getSeverityColor(suggestion.score)} border`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-sm font-medium">
                        {getActionDescription(suggestion.action, suggestion.payload_json)}
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          Score: {(suggestion.score * 100).toFixed(0)}%
                        </Badge>
                        {suggestion.status !== 'OPEN' && (
                          <Badge
                            variant={suggestion.status === 'ACCEPTED' ? 'default' : 'destructive'}
                          >
                            {suggestion.status}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {suggestion.status === 'OPEN' && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleAccept(suggestion.sugg_id)}
                          disabled={processingId === suggestion.sugg_id}
                          className="flex items-center gap-1"
                        >
                          <Check className="h-3 w-3" />
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReject(suggestion.sugg_id)}
                          disabled={processingId === suggestion.sugg_id}
                          className="flex items-center gap-1"
                        >
                          <X className="h-3 w-3" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm font-medium mb-1">Rationale:</div>
                      <p className="text-sm">{suggestion.rationale}</p>
                    </div>

                    {suggestion.action === 'promote_cpp' && (
                      <div className="bg-white p-3 rounded border">
                        <div className="text-sm font-medium mb-2">Proposed Changes:</div>
                        <div className="text-sm space-y-1">
                          <div>• Parameter: {suggestion.payload_json.paramName}</div>
                          <div>• Classification: KPP → CPP</div>
                          <div>
                            • Range: {suggestion.payload_json.range.low}-
                            {suggestion.payload_json.range.high}{' '}
                            {suggestion.payload_json.range.unit}
                          </div>
                          <div>• Action Required: Establish IPC method</div>
                        </div>
                      </div>
                    )}

                    {suggestion.action === 'add_ipc' && (
                      <div className="bg-white p-3 rounded border">
                        <div className="text-sm font-medium mb-2">Proposed IPC:</div>
                        <div className="text-sm space-y-1">
                          <div>• Test: {suggestion.payload_json.ipc.test}</div>
                          <div>• Limit: {suggestion.payload_json.ipc.limit}</div>
                          <div>• Method: {suggestion.payload_json.ipc.methodHint}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="flex justify-between items-center pt-4 border-t">
          <div className="text-sm text-gray-600">
            AI suggestions help optimize your process control strategy
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchSuggestions} disabled={loading}>
              Refresh Suggestions
            </Button>
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AIPanel;
