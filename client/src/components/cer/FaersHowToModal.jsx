import React from 'react';
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
 DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { BarChart4, FileText, SearchIcon, ArrowUpDown, Activity, Beaker } from 'lucide-react';

/**
 * FAERS How-To Modal Component
 *
 * Provides user instructions on how to use the FDA Adverse Event Reporting System
 * integration in the Clinical Evaluation Report module.
 */
export function FaersHowToModal({ isOpen, onClose }) {
 return (
 <Dialog open={isOpen} onOpenChange={onClose}>
 <DialogContent className="max-w-3xl">
 <DialogHeader>
 <DialogTitle className="flex items-center text-xl">
 <BarChart4 className="mr-2 h-5 w-5 text-stone-600" />
 How to Use FAERS Data in CERs
 </DialogTitle>
 <DialogDescription>
 Learn how to incorporate FDA Adverse Event Reporting System data into your Clinical
 Evaluation Reports
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-6 my-4">
 {/* Introduction */}
 <div className="text-sm text-muted-foreground">
 <p>
 The FDA Adverse Event Reporting System (FAERS) is a database that contains adverse
 event reports, medication error reports, and product quality complaints submitted to
 FDA. This data is valuable for post-market safety surveillance and can enhance your
 Clinical Evaluation Reports with real-world safety data.
 </p>
 </div>

 {/* Step 1: Search */}
 <div className="border rounded-lg p-4">
 <h3 className="flex items-center text-base font-semibold mb-2">
 <SearchIcon className="h-4 w-4 mr-2 text-stone-600" />
 Step 1: Query FAERS Database
 </h3>
 <p className="text-sm mb-3">
 Enter the exact product name as registered with the FDA. For better results, you can
 optionally include the manufacturer name and specify a date range to focus on recent
 data.
 </p>
 <div className="bg-muted p-3 rounded text-sm">
 <strong>Pro Tip:</strong> For medical devices, use the exact model/catalog number. For
 drugs, use the brand name rather than the generic name for more precise results.
 </div>
 </div>

 {/* Step 2: Analyze */}
 <div className="border rounded-lg p-4">
 <h3 className="flex items-center text-base font-semibold mb-2">
 <BarChart4 className="h-4 w-4 mr-2 text-stone-600" />
 Step 2: Review Analysis
 </h3>
 <p className="text-sm mb-3">
 After retrieval, the system automatically analyzes the FAERS data and presents key
 insights, including:
 </p>
 <ul className="list-disc list-inside text-sm space-y-1 mb-3">
 <li>Total number of adverse event reports</li>
 <li>Proportion of serious events</li>
 <li>Demographic distribution (age and gender)</li>
 <li>Most frequently reported adverse events</li>
 <li>Pre-formatted text for inclusion in your CER</li>
 </ul>
 <div className="bg-muted p-3 rounded text-sm">
 <strong>Pro Tip:</strong> The severity assessment combines the frequency, seriousness,
 and patterns of adverse events to provide a standardized risk categorization for your
 device or drug.
 </div>
 </div>

 {/* Step 3: Compare */}
 <div className="border rounded-lg p-4">
 <h3 className="flex items-center text-base font-semibold mb-2">
 <ArrowUpDown className="h-4 w-4 mr-2 text-stone-600" />
 Step 3: Comparative Analysis
 </h3>
 <p className="text-sm mb-3">
 The system uses ATC codes, mechanism of action (MoA), and pharmacological class to
 automatically identify similar products for safety comparison:
 </p>
 <ul className="list-disc list-inside text-sm space-y-1 mb-3">
 <li>Products in the same pharmacological classification</li>
 <li>Products with the same mechanism of action</li>
 <li>Drugs in the same therapeutic category</li>
 </ul>
 <p className="text-sm">
 This provides valuable context for interpreting your product's safety profile compared
 to alternatives.
 </p>
 </div>

 {/* Step 4: Generate Report */}
 <div className="border rounded-lg p-4">
 <h3 className="flex items-center text-base font-semibold mb-2">
 <FileText className="h-4 w-4 mr-2 text-stone-600" />
 Step 4: Generate Full CER Report
 </h3>
 <p className="text-sm mb-3">
 Click the "Generate Full CER Report" button to create a comprehensive Clinical
 Evaluation Report that incorporates the FAERS analysis alongside other clinical data.
 </p>
 <div className="bg-muted p-3 rounded text-sm">
 <strong>Pro Tip:</strong> The generated report follows MEDDEV 2.7/1 Rev. 4 guidelines
 and can be exported in different formats for regulatory submissions.
 </div>
 </div>

 {/* Advanced Features */}
 <div className="border border-stone-200 bg-stone-50 rounded-lg p-4">
 <h3 className="flex items-center text-base font-semibold mb-2">
 <Beaker className="h-4 w-4 mr-2 text-stone-600" />
 Advanced Features
 </h3>
 <p className="text-sm mb-3">This module incorporates several advanced features:</p>
 <ul className="list-disc list-inside text-sm space-y-1">
 <li>
 <strong>ATC Code Analysis:</strong> Uses Anatomical Therapeutic Chemical
 classification system to find truly comparable products
 </li>
 <li>
 <strong>Mechanism of Action Matching:</strong> Identifies comparators based on
 pharmacological mechanisms
 </li>
 <li>
 <strong>Risk Scoring:</strong> Applies weighting algorithms to quantify the relative
 risk profile
 </li>
 <li>
 <strong>Automated Clinical Evaluation:</strong> Generates pre-formatted text
 suitable for inclusion in regulatory documents
 </li>
 </ul>
 </div>
 </div>

 <DialogFooter>
 <Button onClick={onClose}>Close Guide</Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}

export default FaersHowToModal;
