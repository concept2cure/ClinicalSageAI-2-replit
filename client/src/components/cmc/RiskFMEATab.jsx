import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Plus, X } from 'lucide-react'

const RiskFMEATab = ({ processId }) => {
  const [rows, setRows] = useState([]);
  const [fm, setFm] = useState('');
  const [s, setS] = useState(7);
  const [o, setO] = useState(3);
  const [d, setD] = useState(4);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const r = await fetch(`/api/process/processes/${processId}/fmea`);
      if (r.ok) {
        const data = await r.json();
        setRows(data);
      }
    } catch (error) {
      console.error('Error loading FMEA:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (processId) {
      load();
    }
  }, [processId]);

  const add = async () => {
    if (!fm.trim()) return;
    try {
      const r = await fetch(`/api/process/processes/${processId}/fmea`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ failure_mode: fm, s, o, d }),
      });
      if (r.ok) {
        setFm('');
        await load();
      } else {
        alert('Failed to add FMEA item');
      }
    } catch (error) {
      console.error('Error adding FMEA:', error);
      alert('Failed to add FMEA item');
    }
  };

  const closeItem = async id => {
    try {
      const r = await fetch(`/api/process/fmea/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CLOSED' }),
      });
      if (r.ok) {
        await load();
      }
    } catch (error) {
      console.error('Error closing FMEA:', error);
    }
  };

  const getRpnColor = rpn => {
    if (rpn >= 120) return 'text-red-600 font-bold';
    if (rpn >= 80) return 'text-orange-600 font-medium';
    return 'text-green-600';
  };

  const getStatusVariant = status => {
    switch (status) {
      case 'CLOSED':
        return 'secondary';
      case 'MITIGATING':
        return 'warning';
      default:
        return 'destructive';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Risk — FMEA
          </CardTitle>
        </CardHeader>
        <CardContent>Loading FMEA data...</CardContent>
      </Card>
    );
  }

  const highRpnCount = rows.filter(r => r.rpn >= 120 && r.status !== 'CLOSED').length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Risk — FMEA
          </div>
          {highRpnCount > 0 && <Badge variant="destructive">{highRpnCount} High RPN Items</Badge>}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Failure Mode and Effects Analysis - S×O×D = RPN (Risk Priority Number)
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add New FMEA Item */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2 p-4 bg-muted/30 rounded-lg">
          <Input
            placeholder="Failure mode"
            value={fm}
            onChange={e => setFm(e.target.value)}
            data-testid="input-failure-mode"
          />
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Severity (1-10)</label>
            <Input
              type="number"
              min={1}
              max={10}
              value={s}
              onChange={e => setS(Number(e.target.value))}
              data-testid="input-severity"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Occurrence (1-10)</label>
            <Input
              type="number"
              min={1}
              max={10}
              value={o}
              onChange={e => setO(Number(e.target.value))}
              data-testid="input-occurrence"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Detection (1-10)</label>
            <Input
              type="number"
              min={1}
              max={10}
              value={d}
              onChange={e => setD(Number(e.target.value))}
              data-testid="input-detection"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">RPN = {s * o * d}</label>
            <Button onClick={add} className="w-full" size="sm" data-testid="button-add-fmea">
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        </div>

        {/* FMEA Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="p-3 text-left font-medium">Failure Mode</th>
                <th className="p-3 text-center font-medium w-16">S</th>
                <th className="p-3 text-center font-medium w-16">O</th>
                <th className="p-3 text-center font-medium w-16">D</th>
                <th className="p-3 text-center font-medium w-20">RPN</th>
                <th className="p-3 text-center font-medium">Status</th>
                <th className="p-3 text-center font-medium w-20">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    No FMEA items yet. Add failure modes to start risk analysis.
                  </td>
                </tr>
              ) : (
                rows.map(r => (
                  <tr
                    key={r.fmea_id}
                    className="border-b hover:bg-muted/20"
                    data-testid={`row-fmea-${r.fmea_id}`}
                  >
                    <td className="p-3">{r.failure_mode}</td>
                    <td className="p-3 text-center">{r.s}</td>
                    <td className="p-3 text-center">{r.o}</td>
                    <td className="p-3 text-center">{r.d}</td>
                    <td className={`p-3 text-center ${getRpnColor(r.rpn)}`}>
                      {r.rpn}
                      {r.rpn >= 120 && <AlertTriangle className="h-3 w-3 inline ml-1" />}
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant={getStatusVariant(r.status)}>{r.status}</Badge>
                    </td>
                    <td className="p-3 text-center">
                      {r.status !== 'CLOSED' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => closeItem(r.fmea_id)}
                          data-testid={`button-close-${r.fmea_id}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* RPN Legend */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-600 rounded"></div>
            <span>High Risk (RPN ≥ 120) - Blocks VALIDATED stage</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-orange-600 rounded"></div>
            <span>Medium Risk (RPN 80-119)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-600 rounded"></div>
            <span>Low Risk (RPN &lt; 80)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default RiskFMEATab;
