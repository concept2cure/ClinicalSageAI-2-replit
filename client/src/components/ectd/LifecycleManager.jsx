import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GitBranch, GitCommit, Clock, FileText, Plus, ArrowRight, History, AlertCircle } from 'lucide-react'

const MOCK_SEQUENCES = [
  { id: '0000', type: 'Original Application', date: '2023-01-15', status: 'Submitted', description: 'Initial NDA Submission' },
  { id: '0001', type: 'Amendment', date: '2023-03-10', status: 'Submitted', description: 'Response to FDA Information Request (Quality)' },
  { id: '0002', type: 'Amendment', date: '2023-04-22', status: 'Submitted', description: 'Safety Update Report' },
  { id: '0003', type: 'Supplement', date: '2023-06-05', status: 'Draft', description: 'New Strength (100mg)' },
];

const MOCK_LIFECYCLE_OPS = [
  { file: 'm2-5-clinical-overview.pdf', op: 'Replace', target: '0000', reason: 'Updated safety data' },
  { file: 'm3-2-p-drug-product.pdf', op: 'New', target: null, reason: 'New stability data' },
  { file: 'm1-cover-letter.pdf', op: 'New', target: null, reason: 'Cover letter for 0003' },
];

export default function LifecycleManager() {
  const [sequences, setSequences] = useState(MOCK_SEQUENCES);
  const [showNewSeqDialog, setShowNewSeqDialog] = useState(false);
  const [newSeqType, setNewSeqType] = useState('Amendment');
  const [newSeqDesc, setNewSeqDesc] = useState('');

  const handleCreateSequence = () => {
    const nextId = String(sequences.length).padStart(4, '0');
    const newSeq = {
      id: nextId,
      type: newSeqType,
      date: new Date().toISOString().split('T')[0],
      status: 'Draft',
      description: newSeqDesc
    };
    setSequences([...sequences, newSeq]);
    setShowNewSeqDialog(false);
    setNewSeqDesc('');
  };

  return (
    <div className="grid grid-cols-12 gap-6 h-[calc(100vh-140px)]">
      {/* Left Panel: Sequence History */}
      <div className="col-span-4 flex flex-col gap-4">
        <Card className="flex-1 flex flex-col">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" /> Sequence History
              </CardTitle>
              <Button size="sm" onClick={() => setShowNewSeqDialog(true)}>
                <Plus className="h-4 w-4 mr-1" /> New Sequence
              </Button>
            </div>
            <CardDescription>Manage eCTD submission sequences.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            <ScrollArea className="h-[500px]">
              <div className="space-y-1 p-4">
                {sequences.slice().reverse().map((seq, index) => (
                  <div 
                    key={seq.id} 
                    className={`relative pl-6 pb-6 border-l-2 ${index === 0 ? 'border-blue-500' : 'border-gray-200'} last:pb-0`}
                  >
                    <div className={`absolute -left-[9px] top-0 h-4 w-4 rounded-full border-2 ${index === 0 ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-300'}`} />
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-lg">{seq.id}</span>
                        <Badge variant={seq.status === 'Submitted' ? 'secondary' : 'default'}>
                          {seq.status}
                        </Badge>
                      </div>
                      <div className="font-medium text-sm">{seq.type}</div>
                      <div className="text-sm text-muted-foreground">{seq.description}</div>
                      <div className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" /> {seq.date}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Right Panel: Current Sequence Operations */}
      <div className="col-span-8 flex flex-col gap-4">
        <Card className="flex-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5" /> Current Sequence: {sequences[sequences.length - 1].id}
            </CardTitle>
            <CardDescription>Document lifecycle operations for the current draft sequence.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Operation</TableHead>
                  <TableHead>Target Sequence</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MOCK_LIFECYCLE_OPS.map((op, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium flex items-center gap-2">
                      <FileText className="h-4 w-4 text-blue-500" />
                      {op.file}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        op.op === 'New' ? 'bg-green-50 text-green-700 border-green-200' :
                        op.op === 'Replace' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        op.op === 'Delete' ? 'bg-red-50 text-red-700 border-red-200' :
                        'bg-blue-50 text-blue-700 border-blue-200' // Append
                      }>
                        {op.op}
                      </Badge>
                    </TableCell>
                    <TableCell>{op.target || '-'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{op.reason}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">Edit</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-100 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-900">Lifecycle Validation</h4>
                <p className="text-sm text-blue-700 mt-1">
                  All "Replace" operations must reference a valid document ID from a previous sequence.
                  Current sequence contains 3 operations.
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2 border-t pt-4">
            <Button variant="outline">Validate Sequence</Button>
            <Button>
              <GitCommit className="h-4 w-4 mr-2" /> Finalize & Publish
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* New Sequence Dialog */}
      <Dialog open={showNewSeqDialog} onOpenChange={setShowNewSeqDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Sequence</DialogTitle>
            <DialogDescription>Start a new eCTD sequence (e.g., 0004).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Submission Type</Label>
              <Select value={newSeqType} onValueChange={setNewSeqType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Amendment">Amendment</SelectItem>
                  <SelectItem value="Supplement">Supplement</SelectItem>
                  <SelectItem value="Resubmission">Resubmission</SelectItem>
                  <SelectItem value="Annual Report">Annual Report</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input 
                value={newSeqDesc} 
                onChange={(e) => setNewSeqDesc(e.target.value)}
                placeholder="e.g., Response to Day 74 Letter" 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewSeqDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateSequence}>Create Sequence</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
