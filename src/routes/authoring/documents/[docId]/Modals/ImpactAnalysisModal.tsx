import React from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ImpactAnalysisModalProps {
  open: boolean;
  datasetName: string;
  impact: {
    tables: number;
    chips: number;
  };
  onCancel: () => void;
  onConfirm: () => void;
}

const formatCount = (count: number, singular: string, plural: string) =>
  `${count} ${count === 1 ? singular : plural}`;

const ImpactAnalysisModal: React.FC<ImpactAnalysisModalProps> = ({
  open,
  datasetName,
  impact,
  onCancel,
  onConfirm,
}) => {
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Impact Assessment: {datasetName}</DialogTitle>
          <DialogDescription>
            Updating this dataset will affect the following document elements. Confirm before
            proceeding to maintain audit readiness.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-md border border-border bg-muted/30 p-4 text-sm">
          <div className="flex items-start gap-3 rounded-md bg-amber-50 p-3 text-amber-900">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Warning: Traceability Impact</p>
              <p className="text-xs text-amber-800">
                All references tagged to this dataset will enter review mode until a human confirms the
                changes.
              </p>
            </div>
          </div>

          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between rounded-md border border-amber-200 bg-white px-3 py-2">
              <span className="flex items-center gap-2 font-medium text-amber-900">
                ⚠️ {formatCount(impact.tables, 'Table', 'Tables')}
              </span>
              <span className="text-xs text-muted-foreground">Will be re-rendered</span>
            </li>
            <li className="flex items-center justify-between rounded-md border border-amber-200 bg-white px-3 py-2">
              <span className="flex items-center gap-2 font-medium text-amber-900">
                ⚠️ {formatCount(impact.chips, 'Narrative Data Point', 'Narrative Data Points')}
              </span>
              <span className="text-xs text-muted-foreground">Will be marked for review</span>
            </li>
          </ul>
        </div>

        <DialogFooter className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Confirm &amp; Update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImpactAnalysisModal;
