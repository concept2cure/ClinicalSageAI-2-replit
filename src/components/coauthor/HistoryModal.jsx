import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, Clock, User, RotateCcw, FileText, Eye } from 'lucide-react';
import coauthorService from '@/services/coauthorService';

export default function HistoryModal({ sectionId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        const historyData = await coauthorService.getDraftHistory(sectionId);
        setHistory(historyData);

        // Select the most recent version by default
        if (historyData.length > 0) {
          setSelectedVersion(historyData[0]);
        }

        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch history:', error);
        setLoading(false);
      }
    };

    fetchHistory();
  }, [sectionId]);

  const handleRestore = () => {
    if (selectedVersion) {
      // In a real implementation, this would restore the selected version
      // For now, just log and close
      console.log(`Restoring version ${selectedVersion.id}...`);
      onClose();
    }
  };

  const formatDate = dateString => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            <span>Version History - Section {sectionId}</span>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex justify-center">
            <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full"></div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1 border rounded-md overflow-hidden">
              <div className="bg-gray-100 p-2 font-medium border-b">Version History</div>
              <ScrollArea className="h-[300px]">
                <div className="divide-y">
                  {history.map(version => (
                    <div
                      key={version.id}
                      className={`p-3 cursor-pointer hover:bg-gray-50 ${
                        selectedVersion?.id === version.id ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => setSelectedVersion(version)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">
                          {version.id === 'version-3'
                            ? 'Current Version'
                            : `Version ${version.id.split('-')[1]}`}
                        </span>
                        <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                          {version.changes}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                        <Clock className="h-3 w-3" />
                        <span>{formatDate(version.timestamp)}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                        <User className="h-3 w-3" />
                        <span>{version.author}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div className="col-span-2 border rounded-md overflow-hidden">
              <div className="bg-gray-100 p-2 font-medium border-b">Preview</div>
              {selectedVersion ? (
                <ScrollArea className="h-[300px]">
                  <div className="p-4 whitespace-pre-wrap font-mono text-sm">
                    {selectedVersion.content}
                  </div>
                </ScrollArea>
              ) : (
                <div className="p-4 text-center text-gray-500">Select a version to preview</div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="flex justify-between">
          <div>
            {selectedVersion && selectedVersion.id !== 'version-3' && (
              <Button variant="secondary" onClick={handleRestore} className="gap-1.5">
                <RotateCcw className="h-4 w-4" />
                <span>Restore This Version</span>
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onClose}>Close</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
