import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose, } from '@/components/ui/drawer';
import { Textarea } from '@/components/ui/textarea';
import { FileText, CheckCircle, XCircle } from 'lucide-react'

export default function ReviewDrawer({ isOpen, onClose, documentData }) {
  const [comments, setComments] = useState('');
  const [loading, setLoading] = useState(false);

  // Sample document data (would be passed as props in real implementation)
  const document = documentData || {
    id: 'doc-123',
    name: 'CER_Enzymex_Forte_v2.0.pdf',
    requestedBy: 'Emily Chen',
    requestedOn: 'April 15, 2025',
    deadline: 'April 22, 2025',
    summary:
      'This Clinical Evaluation Report (CER) for Enzymex Forte contains a comprehensive analysis of clinical data, literature review, and post-market surveillance data in accordance with MDR 2017/745 requirements.',
    changeLog: [
      'Updated clinical data with recent study results',
      'Expanded literature review section',
      'Added risk-benefit analysis',
      'Updated conformity assessment',
    ],
  };

  const handleAction = async action => {
    setLoading(true);
    try {
      // In a real implementation, this would send a request to the API
      console.log(`Document ${document.id} ${action} with comments: ${comments}`);
      onClose();
    } catch (err) {
      console.error(`Failed to ${action} document`, err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer open={isOpen} onOpenChange={onClose}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-4xl">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <FileText size={20} />
              Review Document: {document.name}
            </DrawerTitle>
            <DrawerDescription>
              Requested by {document.requestedBy} on {document.requestedOn}. Deadline:{' '}
              {document.deadline}.
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-4 py-2">
            <div className="mb-4">
              <h4 className="font-medium mb-2">Document Summary</h4>
              <p className="text-muted-foreground">{document.summary}</p>
            </div>

            <div className="mb-4">
              <h4 className="font-medium mb-2">Change Log</h4>
              <ul className="list-disc pl-5 text-muted-foreground">
                {document.changeLog.map((change, i) => (
                  <li key={i}>{change}</li>
                ))}
              </ul>
            </div>

            <div className="mb-4">
              <h4 className="font-medium mb-2">Review Comments</h4>
              <Textarea
                value={comments}
                onChange={e => setComments(e.target.value)}
                placeholder="Enter your review comments here..."
                rows={5}
              />
            </div>
          </div>

          <DrawerFooter className="flex-row justify-end space-x-2">
            <DrawerClose asChild>
              <Button variant="outline">Cancel</Button>
            </DrawerClose>
            <Button
              variant="destructive"
              onClick={() => handleAction('reject')}
              disabled={loading}
              className="gap-2"
            >
              <XCircle size={16} />
              Reject
            </Button>
            <Button
              variant="success"
              onClick={() => handleAction('approve')}
              disabled={loading}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              <CheckCircle size={16} />
              Approve
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
