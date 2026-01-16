import { useState } from 'react';
import { ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button';
import { generateQAChecklistPDF } from '@/utils/generateQAChecklistPDF';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';

/**
 * QA Checklist Button Component
 *
 * Provides a button to view and download the CER Generator QA checklist
 * for final verification before stakeholder review.
 */
export default function QAChecklistButton({ variant = 'default' }) {
  const [isOpen, setIsOpen] = useState(false);

  const handleDownloadPDF = () => {
    generateQAChecklistPDF();
    // Leave dialog open so user can see the checklist while the PDF downloads
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} className="gap-2">
          <ClipboardList size={16} />
          QA Checklist
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-blue-700">CER QA Checklist</DialogTitle>
          <DialogDescription>
            Use this checklist to verify all features are working correctly before stakeholder
            review.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-6 max-h-[60vh] overflow-y-auto">
          <section>
            <h3 className="text-lg font-medium mb-2">1. Navigation & Entry</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Sidebar shows "CER Generator" in blue highlight</li>
              <li>Clicking it routes to /cer</li>
              <li>Page loads without console errors</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-medium mb-2">2. Instructional Flow</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Instruction card shows all 3 steps</li>
              <li>- Select section</li>
              <li>- Generate content</li>
              <li>- Preview/export</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-medium mb-2">3. Section Builder Panel</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Section type dropdown works (4 types)</li>
              <li>Textarea accepts input</li>
              <li>"Generate Section" calls /api/cer/generate-section</li>
              <li>Generated content is displayed clearly</li>
              <li>New section is added to live draft</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-medium mb-2">4. Live Preview</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>CER title renders at top</li>
              <li>Drafted sections display correctly with formatting</li>
              <li>FAERS table displays adverse events (if present)</li>
              <li>Comparator list shows risk scores</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-medium mb-2">5. Export Buttons</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>"Export as PDF" downloads a file with FAERS + sections</li>
              <li>"Export as Word" downloads same in .docx format</li>
              <li>Files are readable and professionally formatted</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-medium mb-2">6. Backend API Test</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>/api/cer/fetch-faers works with valid product name</li>
              <li>/api/cer/export-docx and /api/cer/export-pdf respond with correct files</li>
              <li>/api/cer/generate-section generates expected content using GPT-4o</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-medium mb-2">7. State Sync (Advanced)</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Generated sections are stored in local state</li>
              <li>Preview reflects all added sections without page reload</li>
              <li>Export pulls the correct title, FAERS, and comparators at time of click</li>
            </ul>
          </section>
        </div>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Close
          </Button>
          <Button onClick={handleDownloadPDF}>Download PDF Checklist</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
