import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, } from '@/components/ui/dialog';
import {
  Target, TrendingUp, Clock, CheckCircle2, XCircle, Pause, Play, Lightbulb, Zap, ArrowUp, Users, Calendar, AlertTriangle, Info, RefreshCw, Sparkles, BarChart3, Brain, Wand2, Pin, PinOff, ThumbsUp, ThumbsDown, ChevronRight, Star } from 'lucide-react'

interface ExecutivePlaybookProps {
  subId?: string;
}

interface PlaybookCard {
  card_id: string;
  kind: string;
  title: string;
  rationale: string;
  details: any;
  expected_rpi_gain: number;
  effort: 'S' | 'M' | 'L';
  priority: number;
  due_date?: string;
  status: 'OPEN' | 'SNOOZED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  snooze_until?: string;
  pinned: boolean;
  created_by?: string;
  created_at: string;
}

interface RPISimulation {
  current: number;
  projected: number;
  gain: number;
  cards: number;
}

const ExecutivePlaybookPanel: React.FC<ExecutivePlaybookProps> = ({ subId }) => {
  const [cards, setCards] = React.useState<PlaybookCard[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [selectedCards, setSelectedCards] = React.useState<string[]>([]);
  const [simulation, setSimulation] = React.useState<RPISimulation | null>(null);
  const [showSnoozeDialog, setShowSnoozeDialog] = React.useState<string | null>(null);
  const [showRejectDialog, setShowRejectDialog] = React.useState<string | null>(null);
  const [snoozeDate, setSnoozeDate] = React.useState('');
  const [snoozeReason, setSnoozeReason] = React.useState('');
  const [rejectReason, setRejectReason] = React.useState('');

  // Load playbook cards
  const loadCards = React.useCallback(async () => {
    if (!subId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/reg/playbook/${subId}/cards`);
      const data = await response.json();
      setCards(data);
    } catch (error) {
      console.error('Failed to load playbook cards:', error);
    } finally {
      setLoading(false);
    }
  }, [subId]);

  // Generate new playbook
  const generatePlaybook = async () => {
    if (!subId) return;
    setGenerating(true);
    try {
      const response = await fetch(`/api/reg/playbook/${subId}/generate`);
      const data = await response.json();
      if (data.error) {
        alert(`Generation failed: ${data.error}`);
      } else {
        setCards(data.cards);
        alert(`Generated ${data.generated} new recommendations`);
      }
    } catch (error) {
      alert('Failed to generate playbook');
    } finally {
      setGenerating(false);
    }
  };

  // Accept card
  const acceptCard = async (cardId: string) => {
    try {
      const response = await fetch(`/api/reg/playbook/cards/${cardId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: 'user' }),
      });
      const result = await response.json();
      if (result.error) {
        alert(`Accept failed: ${result.error}`);
      } else {
        alert(`Card accepted! Task created: ${result.task.title}`);
        loadCards();
      }
    } catch (error) {
      alert('Failed to accept card');
    }
  };

  // Snooze card
  const snoozeCard = async () => {
    if (!showSnoozeDialog || !snoozeDate) return;
    try {
      const response = await fetch(`/api/reg/playbook/cards/${showSnoozeDialog}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          until: snoozeDate,
          reason: snoozeReason || 'Snoozed via playbook',
          actor: 'user',
        }),
      });
      const result = await response.json();
      if (result.error) {
        alert(`Snooze failed: ${result.error}`);
      } else {
        setShowSnoozeDialog(null);
        setSnoozeDate('');
        setSnoozeReason('');
        loadCards();
      }
    } catch (error) {
      alert('Failed to snooze card');
    }
  };

  // Reject card
  const rejectCard = async () => {
    if (!showRejectDialog) return;
    try {
      const response = await fetch(`/api/reg/playbook/cards/${showRejectDialog}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: rejectReason || 'Rejected via playbook',
          actor: 'user',
        }),
      });
      const result = await response.json();
      if (result.error) {
        alert(`Reject failed: ${result.error}`);
      } else {
        setShowRejectDialog(null);
        setRejectReason('');
        loadCards();
      }
    } catch (error) {
      alert('Failed to reject card');
    }
  };

  // Simulate RPI gain
  const simulateRPI = async () => {
    if (!subId || selectedCards.length === 0) return;
    try {
      const response = await fetch(`/api/reg/playbook/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subId, cardIds: selectedCards }),
      });
      const data = await response.json();
      setSimulation(data);
    } catch (error) {
      console.error('Failed to simulate RPI:', error);
    }
  };

  React.useEffect(() => {
    loadCards();
  }, [loadCards]);

  React.useEffect(() => {
    if (selectedCards.length > 0) {
      simulateRPI();
    } else {
      setSimulation(null);
    }
  }, [selectedCards, subId]);

  const getEffortColor = (effort: string) => {
    switch (effort) {
      case 'S':
        return 'bg-green-100 text-green-800';
      case 'M':
        return 'bg-yellow-100 text-yellow-800';
      case 'L':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getEffortLabel = (effort: string) => {
    switch (effort) {
      case 'S':
        return 'Small';
      case 'M':
        return 'Medium';
      case 'L':
        return 'Large';
      default:
        return effort;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'border-blue-200 bg-blue-50';
      case 'ACCEPTED':
        return 'border-green-200 bg-green-50';
      case 'REJECTED':
        return 'border-red-200 bg-red-50';
      case 'SNOOZED':
        return 'border-yellow-200 bg-yellow-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  const openCards = cards.filter(c => c.status === 'OPEN');
  const totalRPIGain = openCards.reduce((sum, c) => sum + c.expected_rpi_gain, 0);

  if (!subId) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Target className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <p>Select a submission to view executive playbook recommendations</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Target className="w-6 h-6 text-purple-600" />
                <Sparkles className="w-3 h-3 text-yellow-500 absolute -top-1 -right-1" />
              </div>
              <div>
                <CardTitle>Executive Playbook: Top 5 Moves This Week</CardTitle>
                <p className="text-sm text-muted-foreground">
                  AI-powered regulatory action prioritization with RPI impact simulation
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={loadCards} variant="outline" size="sm" disabled={loading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                onClick={generatePlaybook}
                disabled={generating}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {generating ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Brain className="w-4 h-4 mr-2" />
                )}
                {generating ? 'Generating...' : 'AI Generate'}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* RPI Simulation Dashboard */}
      {simulation && (
        <Card className="border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-purple-600" />
              RPI Impact Simulation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-700">{simulation.current}</div>
                <div className="text-sm text-muted-foreground">Current RPI</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{simulation.projected}</div>
                <div className="text-sm text-muted-foreground">Projected RPI</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">+{simulation.gain}</div>
                <div className="text-sm text-muted-foreground">Expected Gain</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{simulation.cards}</div>
                <div className="text-sm text-muted-foreground">Selected Cards</div>
              </div>
            </div>
            <Progress value={(simulation.projected / 100) * 100} className="mt-4" />
          </CardContent>
        </Card>
      )}

      {/* Playbook Cards */}
      <div className="grid grid-cols-1 gap-4">
        {cards.length === 0 && !loading ? (
          <Card>
            <CardContent className="text-center py-8">
              <Lightbulb className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p className="text-muted-foreground">No playbook recommendations yet</p>
              <p className="text-sm text-muted-foreground mt-2">
                Click "AI Generate" to create AI-powered action recommendations
              </p>
            </CardContent>
          </Card>
        ) : (
          cards.map(card => (
            <Card
              key={card.card_id}
              className={`${getStatusColor(card.status)} transition-all hover:shadow-md`}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <input
                      type="checkbox"
                      checked={selectedCards.includes(card.card_id)}
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedCards([...selectedCards, card.card_id]);
                        } else {
                          setSelectedCards(selectedCards.filter(id => id !== card.card_id));
                        }
                      }}
                      disabled={card.status !== 'OPEN'}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <CardTitle className="text-lg">{card.title}</CardTitle>
                        {card.pinned && <Pin className="w-4 h-4 text-yellow-600" />}
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{card.rationale}</p>

                      <div className="flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-1">
                          <TrendingUp className="w-3 h-3 text-green-600" />
                          <span>+{card.expected_rpi_gain} RPI</span>
                        </div>
                        <Badge variant="outline" className={getEffortColor(card.effort)}>
                          {getEffortLabel(card.effort)} effort
                        </Badge>
                        <div className="flex items-center gap-1">
                          <Star className="w-3 h-3 text-blue-600" />
                          <span>Priority {card.priority}</span>
                        </div>
                        {card.due_date && (
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-orange-600" />
                            <span>{new Date(card.due_date).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 ml-4">
                    {card.status === 'OPEN' && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => acceptCard(card.card_id)}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <ThumbsUp className="w-3 h-3 mr-1" />
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowSnoozeDialog(card.card_id)}
                        >
                          <Pause className="w-3 h-3 mr-1" />
                          Snooze
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowRejectDialog(card.card_id)}
                        >
                          <ThumbsDown className="w-3 h-3 mr-1" />
                          Reject
                        </Button>
                      </>
                    )}
                    {card.status === 'ACCEPTED' && (
                      <Badge className="bg-green-600">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Accepted
                      </Badge>
                    )}
                    {card.status === 'REJECTED' && (
                      <Badge variant="destructive">
                        <XCircle className="w-3 h-3 mr-1" />
                        Rejected
                      </Badge>
                    )}
                    {card.status === 'SNOOZED' && (
                      <Badge className="bg-yellow-600">
                        <Pause className="w-3 h-3 mr-1" />
                        Snoozed
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))
        )}
      </div>

      {/* Summary Stats */}
      {openCards.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Playbook Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-xl font-bold text-blue-600">{openCards.length}</div>
                <div className="text-sm text-muted-foreground">Open Recommendations</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-green-600">+{totalRPIGain}</div>
                <div className="text-sm text-muted-foreground">Total RPI Potential</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-purple-600">{selectedCards.length}</div>
                <div className="text-sm text-muted-foreground">Selected for Simulation</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Snooze Dialog */}
      <Dialog open={!!showSnoozeDialog} onOpenChange={() => setShowSnoozeDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Snooze Recommendation</DialogTitle>
            <DialogDescription>
              Temporarily hide this recommendation until a specified date.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="snooze-date">Snooze until</Label>
              <Input
                id="snooze-date"
                type="date"
                value={snoozeDate}
                onChange={e => setSnoozeDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div>
              <Label htmlFor="snooze-reason">Reason (optional)</Label>
              <Textarea
                id="snooze-reason"
                value={snoozeReason}
                onChange={e => setSnoozeReason(e.target.value)}
                placeholder="Why are you snoozing this recommendation?"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSnoozeDialog(null)}>
              Cancel
            </Button>
            <Button onClick={snoozeCard} disabled={!snoozeDate}>
              <Pause className="w-4 h-4 mr-2" />
              Snooze
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={!!showRejectDialog} onOpenChange={() => setShowRejectDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Recommendation</DialogTitle>
            <DialogDescription>
              Mark this recommendation as not applicable or relevant.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="reject-reason">Reason for rejection</Label>
              <Textarea
                id="reject-reason"
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Why are you rejecting this recommendation?"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={rejectCard}>
              <XCircle className="w-4 h-4 mr-2" />
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExecutivePlaybookPanel;
