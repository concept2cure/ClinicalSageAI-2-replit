// React Component: CSRCompareViewer.tsx
// Side-by-side comparison of selected CSRs from API data

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, FolderIcon, FileIcon, ArrowRightIcon, FileDownIcon } from 'lucide-react';
import axios from 'axios';
import { useToast } from '@/hooks/use-toast';
import html2pdf from 'html2pdf.js';
import { useLocation } from 'wouter';

interface CSRCompareViewerProps {
  selectedIds: string[];
  onClose?: () => void;
}

export default function CSRCompareViewer({ selectedIds = [], onClose }: CSRCompareViewerProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingToDossier, setSendingToDossier] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  useEffect(() => {
    const fetchCSRs = async () => {
      setLoading(true);
      try {
        const loaded = await Promise.all(
          selectedIds.map(async (id) => {
            const res = await axios.get(`/api/csrs/${id}`);
            return { id, ...res.data };
          })
        );
        setData(loaded);
      } catch (error) {
        console.error("Error fetching CSR data:", error);
        // toast call replaced
  // Original: toast({
          title: "Error loading CSR data",
          description: "There was a problem retrieving the clinical study reports.",
          variant: "destructive"
        })
  console.log('Toast would show:', {
          title: "Error loading CSR data",
          description: "There was a problem retrieving the clinical study reports.",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };
    
    if (selectedIds.length) fetchCSRs();
  }, [selectedIds, toast]);

  const renderField = (label: string, key: string) => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm py-3 border-b">
      <strong className="col-span-1 text-muted-foreground flex items-center">{label}</strong>
      {data.map((d) => (
        <div key={d.id + key} className="bg-slate-50 dark:bg-slate-900 p-3 rounded">
          {Array.isArray(d[key]) 
            ? d[key].join(', ') 
            : (d[key] || '—')}
        </div>
      ))}
    </div>
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
        <p className="text-muted-foreground">Loading CSR data for comparison...</p>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Select clinical study reports to compare.</p>
      </div>
    );
  }

  const exportToPdf = () => {
    const element = document.getElementById('csr-comparison-content');
    if (element) {
      html2pdf().from(element).set({
        margin: 0.5,
        filename: 'TrialSage_CSR_Comparison.pdf',
        pagebreak: { mode: ['avoid-all'] },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
        html2canvas: { scale: 2 }
      }).save();
    }
  };

  const sendToDossier = async () => {
    if (selectedIds.length < 1) {
      // toast call replaced
  // Original: toast({
        title: "No CSRs selected",
        description: "Please select at least one CSR to add to dossier.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "No CSRs selected",
        description: "Please select at least one CSR to add to dossier.",
        variant: "destructive"
      });
      return;
    }

    setSendingToDossier(true);
    try {
      const response = await axios.post('/api/dossier/create-from-csrs', {
        csr_ids: selectedIds
      });
      
      if (response.data?.dossier_id) {
        // toast call replaced
  // Original: toast({
          title: "Dossier created",
          description: `Successfully created dossier with ${selectedIds.length} CSRs.`,
        })
  console.log('Toast would show:', {
          title: "Dossier created",
          description: `Successfully created dossier with ${selectedIds.length} CSRs.`,
        });
        // Navigate to the dossier page
        setLocation(`/dossier/${response.data.dossier_id}`);
      } else {
        throw new Error("No dossier ID returned");
      }
    } catch (error) {
      console.error("Error creating dossier:", error);
      // toast call replaced
  // Original: toast({
        title: "Error creating dossier",
        description: "There was a problem creating the dossier from selected CSRs.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Error creating dossier",
        description: "There was a problem creating the dossier from selected CSRs.",
        variant: "destructive"
      });
    } finally {
      setSendingToDossier(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold">📊 Compare Clinical Study Reports</h3>
        <div className="flex space-x-2">
          {onClose && (
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={exportToPdf}
            className="flex items-center gap-1"
          >
            <FileDownIcon size={16} /> Export PDF
          </Button>
          <Button 
            variant="default" 
            size="sm" 
            onClick={sendToDossier}
            disabled={sendingToDossier}
            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700"
          >
            {sendingToDossier ? (
              <><Loader2 size={16} className="animate-spin" /> Processing...</>
            ) : (
              <><FolderIcon size={16} /> Add to Dossier</>
            )}
          </Button>
        </div>
      </div>
      
      <div id="csr-comparison-content">
        <Card>
          <CardContent className="space-y-2 pt-6">
            {renderField('CSR ID', 'csr_id')}
            {renderField('Title', 'title')}
            {renderField('Indication', 'indication')}
            {renderField('Phase', 'phase')}
            {renderField('Study Type', 'study_type')}
            {renderField('Sponsor', 'sponsor')}
            {renderField('Date', 'date')}
            {renderField('Sample Size', 'sample_size')}
            {renderField('Arms', 'arms')}
            {renderField('Primary Endpoints', 'primary_endpoints')}
            {renderField('Secondary Endpoints', 'secondary_endpoints')}
            {renderField('Outcome', 'outcome')}
            {renderField('Adverse Events', 'common_adverse_events')}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}