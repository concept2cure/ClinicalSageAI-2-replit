import React, { useState, useEffect } from 'react';
import { cerApiService } from '@/services/CerAPIService';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText,
  CheckCircle,
  PenTool,
  User,
  Briefcase,
  GraduationCap,
  ClipboardCheck,
  CalendarClock,
  Users,
  BadgeCheck,
} from 'lucide-react';
import LoadingSpinner from '@/components/common/LoadingSpinner';

const EvaluatorQualificationsPanel = ({ deviceName, deviceType, manufacturer, onAddToCER }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('primary-evaluator');

  // Primary Evaluator Info
  const [primaryEvaluator, setPrimaryEvaluator] = useState({
    name: '',
    title: '',
    company: '',
    qualifications: '',
    education: '',
    yearsExperience: '',
    relevantBackground: '',
    conflictOfInterest: false,
    conflictDetails: '',
    signature: '',
    date: new Date().toISOString().split('T')[0],
  });

  // Independent Reviewer Info
  const [reviewers, setReviewers] = useState([
    {
      id: 'reviewer-1',
      name: '',
      title: '',
      company: '',
      education: '',
      specialty: '',
      yearsExperience: '',
      qualifications: '',
      comments: '',
      recommendations: '',
      agreed: true,
      conflictOfInterest: false,
      conflictDetails: '',
      signature: '',
      signedDate: new Date().toISOString().split('T')[0],
    },
  ]);

  // MDR Compliance Checklist
  const [complianceChecklist, setComplianceChecklist] = useState([
    {
      id: 'check-1',
      text: 'The evaluator has sufficient demonstrable experience in the evaluation of the relevant device technology and its clinical application (EU MDR Article 61(3))',
      checked: false,
    },
    {
      id: 'check-2',
      text: 'The evaluator has knowledge of the state of the art in the device category (MEDDEV 2.7/1 Rev 4, Section 6.4)',
      checked: false,
    },
    {
      id: 'check-3',
      text: 'The evaluator has expertise in clinical research methodologies (EU MDR Article 61(3), Annex XIV, Part A)',
      checked: false,
    },
    {
      id: 'check-4',
      text: 'The evaluator has knowledge of the relevant harmonized standards and Common Specifications (EU MDR Article 8, Article 61)',
      checked: false,
    },
    {
      id: 'check-5',
      text: 'The evaluator has completed a Conflict of Interest Declaration and has no conflicts that could influence the evaluation (MEDDEV 2.7/1 Rev 4, Section 6.2.2)',
      checked: false,
    },
    {
      id: 'check-6',
      text: 'The clinical evaluation has been independently reviewed as required by MEDDEV 2.7/1 Rev 4, Section 9.3.1',
      checked: false,
    },
    {
      id: 'check-7',
      text: 'At least one evaluator has medical qualifications in a field relevant to the device (EU MDR Annex XIV, Part A, Section 3)',
      checked: false,
    },
    {
      id: 'check-8',
      text: 'The evaluation team collectively has suitable qualifications and experience for the device being evaluated (EU MDR Article 61(3))',
      checked: false,
    },
    {
      id: 'check-9',
      text: 'The evaluation process followed the MEDDEV 2.7/1 Rev 4 guidance for demonstrating conformity to General Safety and Performance Requirements',
      checked: false,
    },
    {
      id: 'check-10',
      text: 'Qualified individuals have verified that the CER is complete and accurate prior to Notified Body submission (EU MDR Article 61 and Annex XIV)',
      checked: false,
    },
  ]);

  // Update primary evaluator information
  const handlePrimaryEvaluatorChange = (field, value) => {
    setPrimaryEvaluator(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  // Update reviewer information
  const handleReviewerChange = (reviewerId, field, value) => {
    setReviewers(prev =>
      prev.map(reviewer =>
        reviewer.id === reviewerId ? { ...reviewer, [field]: value } : reviewer
      )
    );
  };

  // Add a new reviewer
  const addReviewer = () => {
    setReviewers(prev => [
      ...prev,
      {
        id: `reviewer-${prev.length + 1}`,
        name: '',
        title: '',
        company: '',
        education: '',
        specialty: '',
        yearsExperience: '',
        qualifications: '',
        comments: '',
        recommendations: '',
        agreed: true,
        conflictOfInterest: false,
        conflictDetails: '',
        signature: '',
        signedDate: new Date().toISOString().split('T')[0],
      },
    ]);
  };

  // Remove a reviewer
  const removeReviewer = reviewerId => {
    if (reviewers.length <= 1) return;
    setReviewers(prev => prev.filter(reviewer => reviewer.id !== reviewerId));
  };

  // Toggle checklist items
  const toggleChecklist = itemId => {
    setComplianceChecklist(prev =>
      prev.map(item => (item.id === itemId ? { ...item, checked: !item.checked } : item))
    );
  };

  // Generate the qualification appendix and add to CER
  const handleAddToCER = () => {
    setIsLoading(true);

    try {
      // Format the evaluator qualification for the CER
      const cerSection = {
        type: 'evaluator-qualifications',
        title: 'Evaluator Qualifications and Review Sign-Off',
        content: `
## Appendix: Evaluator Qualifications and Review Sign-Off

### Primary Clinical Evaluator
- **Name:** ${primaryEvaluator.name}
- **Title:** ${primaryEvaluator.title}
- **Company:** ${primaryEvaluator.company}
- **Education:** ${primaryEvaluator.education}
- **Years of Experience:** ${primaryEvaluator.yearsExperience}
- **Professional Qualifications:** ${primaryEvaluator.qualifications}
- **Relevant Background:**
${primaryEvaluator.relevantBackground}

${
  primaryEvaluator.conflictOfInterest
    ? `**Conflict of Interest Declaration:**
${primaryEvaluator.conflictDetails}`
    : '**Conflict of Interest Declaration:** No conflicts of interest to declare.'
}

**Signature:** ${primaryEvaluator.signature}  
**Date:** ${primaryEvaluator.date}

### Independent Review Sign-Off
${reviewers
  .map(
    reviewer => `
#### Reviewer: ${reviewer.name}
- **Title:** ${reviewer.title}
- **Company/Institution:** ${reviewer.company}
- **Education:** ${reviewer.education}
- **Clinical Specialty:** ${reviewer.specialty}
- **Years of Experience:** ${reviewer.yearsExperience}
- **Professional Qualifications:** ${reviewer.qualifications}

${
  reviewer.conflictOfInterest
    ? `**Conflict of Interest Declaration:**
${reviewer.conflictDetails}`
    : '**Conflict of Interest Declaration:** No conflicts of interest to declare.'
}

**Review Comments:**
${reviewer.comments}

**Recommendations:**
${reviewer.recommendations || 'No specific recommendations provided.'}

**Review Status:** ${reviewer.agreed ? 'Approved' : 'Revision Requested'}  
**Signature:** ${reviewer.signature || reviewer.name}  
**Date:** ${reviewer.signedDate}
`
  )
  .join('\n')}

### MDR Compliance Declaration
${complianceChecklist
  .filter(item => item.checked)
  .map(item => `- ✓ ${item.text}`)
  .join('\n')}

### Regulatory Response Capability
The following qualified individuals are designated as authorized respondents to Notified Body or Competent Authority queries regarding this clinical evaluation:

1. **Primary Respondent:** ${primaryEvaluator.name}
   - Will address technical and methodological questions related to the clinical evaluation
   - Available for regulatory meetings and clarifications as needed

2. **Secondary Respondent(s):** ${reviewers.map(reviewer => reviewer.name).join(', ')}
   - Will provide supporting expertise and address specialized queries in their area of competence

### Post-Market Evaluation Commitment
The qualified evaluators named in this document commit to periodic review of post-market data and literature to maintain the clinical evaluation as a living document as required by EU MDR Article 61 and Annex XIV.

### Compliance Statement
This clinical evaluation was performed in accordance with MEDDEV 2.7/1 Rev 4 guidance and EU MDR (2017/745) requirements. The evaluators collectively have the qualifications and experience required for the evaluation of ${deviceName || 'the medical device'}, as demonstrated above.

*Note: This appendix satisfies the requirements of EU MDR Article 61 and MEDDEV 2.7/1 Rev 4 regarding the qualification of evaluators and the independence of the clinical evaluation process.*
        `,
        author: primaryEvaluator.name || 'Clinical Evaluator',
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        sources: [
          { name: 'MEDDEV 2.7/1 Rev 4', type: 'guidance', date: new Date().toISOString() },
          { name: 'EU MDR (2017/745)', type: 'regulation', date: new Date().toISOString() },
          {
            name: 'EU MDCG 2020-13 Clinical Evaluation Assessment Report Template',
            type: 'guidance',
            date: new Date().toISOString(),
          },
        ],
        metadata: {
          outputSection: 'appendix',
          regulatoryPurpose: 'EU MDR Article 61 compliance',
          postMarketRelevant: true,
          reviewCycle: {
            initialApproval: new Date().toISOString(),
            nextReviewDate: new Date(
              new Date().setFullYear(new Date().getFullYear() + 1)
            ).toISOString(),
          },
          regulatory: {
            signatureAuthorityConfirmed: signatureAuthorityConfirmed,
            primaryEvaluatorQualified: complianceChecklist
              .filter(item => item.id === 'check-1' || item.id === 'check-3')
              .every(item => item.checked),
            independentReviewComplete: complianceChecklist
              .filter(item => item.id === 'check-6')
              .every(item => item.checked),
            mdcgCompliant: true,
            meddevCompliant: complianceChecklist
              .filter(item => item.id === 'check-9')
              .every(item => item.checked),
            euMdrArticle61Compliant: complianceChecklist
              .filter(
                item =>
                  item.id === 'check-1' ||
                  item.id === 'check-3' ||
                  item.id === 'check-4' ||
                  item.id === 'check-7' ||
                  item.id === 'check-8'
              )
              .every(item => item.checked),
          },
        },
      };

      // Add to CER
      onAddToCER(cerSection);

      setIsLoading(false);
    } catch (error) {
      console.error('Error generating evaluator qualifications appendix:', error);
      setIsLoading(false);
    }
  };

  // Render the primary evaluator form
  const renderPrimaryEvaluatorForm = () => (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center">
            <User className="h-5 w-5 mr-2 text-blue-600" />
            Primary Clinical Evaluator Information
          </CardTitle>
          <CardDescription>
            Provide details of the primary clinical evaluator responsible for this CER
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={primaryEvaluator.name}
                onChange={e => handlePrimaryEvaluatorChange('name', e.target.value)}
                placeholder="Dr. Jane Smith"
              />
            </div>
            <div>
              <Label htmlFor="title">Title/Position</Label>
              <Input
                id="title"
                value={primaryEvaluator.title}
                onChange={e => handlePrimaryEvaluatorChange('title', e.target.value)}
                placeholder="Senior Clinical Evaluator"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="company">Company/Institution</Label>
              <Input
                id="company"
                value={primaryEvaluator.company}
                onChange={e => handlePrimaryEvaluatorChange('company', e.target.value)}
                placeholder="Medical Device Consultants Inc."
              />
            </div>
            <div>
              <Label htmlFor="yearsExperience">Years of Experience</Label>
              <Input
                id="yearsExperience"
                value={primaryEvaluator.yearsExperience}
                onChange={e => handlePrimaryEvaluatorChange('yearsExperience', e.target.value)}
                placeholder="15"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="education">Education & Degrees</Label>
            <Input
              id="education"
              value={primaryEvaluator.education}
              onChange={e => handlePrimaryEvaluatorChange('education', e.target.value)}
              placeholder="Ph.D. in Biomedical Engineering, M.D."
            />
          </div>

          <div>
            <Label htmlFor="qualifications">Professional Qualifications</Label>
            <Input
              id="qualifications"
              value={primaryEvaluator.qualifications}
              onChange={e => handlePrimaryEvaluatorChange('qualifications', e.target.value)}
              placeholder="Board Certified in [Specialty], RAC (EU), CQA"
            />
          </div>

          <div>
            <Label htmlFor="relevantBackground">Relevant Background & Expertise</Label>
            <Textarea
              id="relevantBackground"
              value={primaryEvaluator.relevantBackground}
              onChange={e => handlePrimaryEvaluatorChange('relevantBackground', e.target.value)}
              placeholder="Describe specific experience with similar devices, technologies, or clinical areas relevant to this evaluation..."
              rows={4}
            />
          </div>

          <div className="flex items-start space-x-2 pt-2">
            <Checkbox
              id="conflictOfInterest"
              checked={primaryEvaluator.conflictOfInterest}
              onCheckedChange={checked =>
                handlePrimaryEvaluatorChange('conflictOfInterest', checked)
              }
            />
            <div className="grid gap-1.5 leading-none">
              <Label
                htmlFor="conflictOfInterest"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Conflict of Interest Declaration
              </Label>
              <p className="text-sm text-gray-500">
                Check if you have any potential conflicts of interest to declare
              </p>
            </div>
          </div>

          {primaryEvaluator.conflictOfInterest && (
            <div>
              <Label htmlFor="conflictDetails">Conflict of Interest Details</Label>
              <Textarea
                id="conflictDetails"
                value={primaryEvaluator.conflictDetails}
                onChange={e => handlePrimaryEvaluatorChange('conflictDetails', e.target.value)}
                placeholder="Describe any financial relationships, consulting arrangements, or other potential conflicts of interest..."
                rows={3}
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="signature">Signature (Name)</Label>
              <Input
                id="signature"
                value={primaryEvaluator.signature}
                onChange={e => handlePrimaryEvaluatorChange('signature', e.target.value)}
                placeholder="Type your name as signature"
              />
            </div>
            <div>
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={primaryEvaluator.date}
                onChange={e => handlePrimaryEvaluatorChange('date', e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Render the reviewers form
  const renderReviewersForm = () => (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center">
            <Users className="h-5 w-5 mr-2 text-blue-600" />
            Independent Reviewers
          </CardTitle>
          <CardDescription>
            EU MDR requires independent review of the clinical evaluation to ensure its validity
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {reviewers.map((reviewer, index) => (
            <div key={reviewer.id} className="border rounded-md p-4 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-md font-medium">Reviewer {index + 1}</h3>
                {reviewers.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeReviewer(reviewer.id)}
                    className="h-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    Remove
                  </Button>
                )}
              </div>

              <div className="bg-[#F3F9FE] p-3 rounded-md mb-4 border border-[#DEECF9]">
                <p className="text-xs text-[#d97757]">
                  <BadgeCheck className="h-3 w-3 inline-block mr-1 mb-1" />
                  MEDDEV 2.7/1 Rev 4 requires independent review from individuals with appropriate
                  qualifications and experience. The reviewers should not have been involved in the
                  design or clinical investigation of the device.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor={`${reviewer.id}-name`}>Full Name</Label>
                  <Input
                    id={`${reviewer.id}-name`}
                    value={reviewer.name}
                    onChange={e => handleReviewerChange(reviewer.id, 'name', e.target.value)}
                    placeholder="Dr. John Doe"
                  />
                </div>
                <div>
                  <Label htmlFor={`${reviewer.id}-title`}>Title/Position</Label>
                  <Input
                    id={`${reviewer.id}-title`}
                    value={reviewer.title}
                    onChange={e => handleReviewerChange(reviewer.id, 'title', e.target.value)}
                    placeholder="Independent Medical Reviewer"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor={`${reviewer.id}-company`}>Company/Institution</Label>
                  <Input
                    id={`${reviewer.id}-company`}
                    value={reviewer.company}
                    onChange={e => handleReviewerChange(reviewer.id, 'company', e.target.value)}
                    placeholder="Medical Experts Inc."
                  />
                </div>
                <div>
                  <Label htmlFor={`${reviewer.id}-education`}>Education & Degrees</Label>
                  <Input
                    id={`${reviewer.id}-education`}
                    value={reviewer.education}
                    onChange={e => handleReviewerChange(reviewer.id, 'education', e.target.value)}
                    placeholder="M.D., Ph.D., MBA"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor={`${reviewer.id}-specialty`}>Clinical Specialty</Label>
                  <Input
                    id={`${reviewer.id}-specialty`}
                    value={reviewer.specialty}
                    onChange={e => handleReviewerChange(reviewer.id, 'specialty', e.target.value)}
                    placeholder="Orthopedic Surgery, Cardiology, etc."
                  />
                </div>
                <div>
                  <Label htmlFor={`${reviewer.id}-yearsExperience`}>Years of Experience</Label>
                  <Input
                    id={`${reviewer.id}-yearsExperience`}
                    value={reviewer.yearsExperience}
                    onChange={e =>
                      handleReviewerChange(reviewer.id, 'yearsExperience', e.target.value)
                    }
                    placeholder="20"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor={`${reviewer.id}-qualifications`}>Professional Qualifications</Label>
                <Input
                  id={`${reviewer.id}-qualifications`}
                  value={reviewer.qualifications}
                  onChange={e =>
                    handleReviewerChange(reviewer.id, 'qualifications', e.target.value)
                  }
                  placeholder="Board Certified, RAC (EU), CQA, etc."
                />
              </div>

              <div>
                <Label htmlFor={`${reviewer.id}-comments`}>Review Comments</Label>
                <Textarea
                  id={`${reviewer.id}-comments`}
                  value={reviewer.comments}
                  onChange={e => handleReviewerChange(reviewer.id, 'comments', e.target.value)}
                  placeholder="Provide comments on the clinical evaluation, its methodology, conclusions, and any issues identified during review..."
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor={`${reviewer.id}-recommendations`}>Recommendations</Label>
                <Textarea
                  id={`${reviewer.id}-recommendations`}
                  value={reviewer.recommendations}
                  onChange={e =>
                    handleReviewerChange(reviewer.id, 'recommendations', e.target.value)
                  }
                  placeholder="Provide recommendations for improvement, additional evidence needed, or other suggestions for strengthening the clinical evaluation..."
                  rows={3}
                />
              </div>

              <div className="flex items-start space-x-2 pt-2">
                <Checkbox
                  id={`${reviewer.id}-conflictOfInterest`}
                  checked={reviewer.conflictOfInterest}
                  onCheckedChange={checked =>
                    handleReviewerChange(reviewer.id, 'conflictOfInterest', checked)
                  }
                />
                <div className="grid gap-1.5 leading-none">
                  <Label
                    htmlFor={`${reviewer.id}-conflictOfInterest`}
                    className="text-sm font-medium leading-none"
                  >
                    Conflict of Interest Declaration
                  </Label>
                  <p className="text-sm text-gray-500">
                    Check if you have any potential conflicts of interest to declare
                  </p>
                </div>
              </div>

              {reviewer.conflictOfInterest && (
                <div>
                  <Label htmlFor={`${reviewer.id}-conflictDetails`}>
                    Conflict of Interest Details
                  </Label>
                  <Textarea
                    id={`${reviewer.id}-conflictDetails`}
                    value={reviewer.conflictDetails}
                    onChange={e =>
                      handleReviewerChange(reviewer.id, 'conflictDetails', e.target.value)
                    }
                    placeholder="Describe any financial relationships, consulting arrangements, or other potential conflicts of interest..."
                    rows={2}
                  />
                </div>
              )}

              <div className="flex items-center space-x-2 pt-2">
                <Checkbox
                  id={`${reviewer.id}-agreed`}
                  checked={reviewer.agreed}
                  onCheckedChange={checked => handleReviewerChange(reviewer.id, 'agreed', checked)}
                />
                <Label
                  htmlFor={`${reviewer.id}-agreed`}
                  className="text-sm font-medium leading-none"
                >
                  I agree with the conclusions of this clinical evaluation
                </Label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor={`${reviewer.id}-signature`}>Signature (Name)</Label>
                  <Input
                    id={`${reviewer.id}-signature`}
                    value={reviewer.signature}
                    onChange={e => handleReviewerChange(reviewer.id, 'signature', e.target.value)}
                    placeholder="Type your name as signature"
                  />
                </div>
                <div>
                  <Label htmlFor={`${reviewer.id}-signedDate`}>Signature Date</Label>
                  <Input
                    id={`${reviewer.id}-signedDate`}
                    type="date"
                    value={reviewer.signedDate}
                    onChange={e => handleReviewerChange(reviewer.id, 'signedDate', e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}

          <Button variant="outline" className="w-full" onClick={addReviewer}>
            <Users className="h-4 w-4 mr-2" />
            Add Another Reviewer
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  // Render the compliance checklist
  // State for signature authority confirmation
  const [signatureAuthorityConfirmed, setSignatureAuthorityConfirmed] = useState(false);

  const renderComplianceChecklist = () => (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center">
            <ClipboardCheck className="h-5 w-5 mr-2 text-blue-600" />
            EU MDR Compliance Checklist
          </CardTitle>
          <CardDescription>
            Ensure all requirements for evaluator qualifications are met according to EU MDR and
            MEDDEV 2.7/1 Rev 4
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-[#F3F9FE] p-3 rounded-md mb-3 border border-[#DEECF9]">
            <p className="text-sm text-[#d97757]">
              <CheckCircle className="h-4 w-4 inline-block mr-1 mb-1" />
              All items below must be checked prior to final CER submission to ensure regulatory
              compliance with EU MDR requirements.
            </p>
          </div>

          <div className="mb-4">
            <h3 className="font-medium text-sm mb-2">Evaluator Requirements</h3>
            {complianceChecklist.slice(0, 5).map(item => (
              <div key={item.id} className="flex items-start space-x-2 mb-2">
                <Checkbox
                  id={item.id}
                  checked={item.checked}
                  onCheckedChange={() => toggleChecklist(item.id)}
                />
                <Label htmlFor={item.id} className="text-sm leading-tight">
                  {item.text}
                </Label>
              </div>
            ))}
          </div>

          <div className="mb-4">
            <h3 className="font-medium text-sm mb-2">Evaluation Process Requirements</h3>
            {complianceChecklist.slice(5, 10).map(item => (
              <div key={item.id} className="flex items-start space-x-2 mb-2">
                <Checkbox
                  id={item.id}
                  checked={item.checked}
                  onCheckedChange={() => toggleChecklist(item.id)}
                />
                <Label htmlFor={item.id} className="text-sm leading-tight">
                  {item.text}
                </Label>
              </div>
            ))}
          </div>

          <div className="bg-amber-50 p-3 rounded-md border border-amber-200">
            <h3 className="font-medium text-sm mb-1 text-amber-800">
              Signature Authority Confirmation
            </h3>
            <p className="text-xs text-amber-700 mb-2">
              By checking this box, you confirm that the primary evaluator and reviewers have the
              proper authority to sign and are qualified to evaluate this device according to
              company procedures.
            </p>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="signature-authority"
                checked={signatureAuthorityConfirmed}
                onCheckedChange={checked => setSignatureAuthorityConfirmed(checked)}
              />
              <Label htmlFor="signature-authority" className="text-sm font-medium">
                I confirm all evaluators have proper signature authority per company SOP
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-4">
        <h2 className="text-xl font-semibold text-[#141413]">
          Evaluator Qualifications & Sign-Off
        </h2>
        <div className="bg-[#faf0ec] rounded-md px-3 py-2 text-sm">
          <p className="text-[#d97757]">
            <BadgeCheck className="h-4 w-4 inline-block mr-1 mb-1" />
            EU MDR Article 61 and MEDDEV 2.7/1 Rev 4 require that clinical evaluations are performed
            by qualified evaluators with documented expertise
          </p>
        </div>

        <div className="bg-[#FDF6E7] border border-[#EDBE3C] rounded-md px-4 py-3">
          <h3 className="text-[#A05E03] font-medium mb-1 flex items-center">
            <CalendarClock className="h-4 w-4 mr-2" />
            Post-Market Connection
          </h3>
          <p className="text-sm text-[#6D4B17]">
            The evaluators documented here are also responsible for reviewing post-market data and
            updating the CER regularly. This creates a continuous feedback loop between the
            Submission phase and Data Retrieval phase, ensuring that the CER remains a living
            document. Evaluator qualification records will be included in EU Notified Body
            submissions.
          </p>
        </div>

        <Tabs defaultValue="primary-evaluator" className="w-full" onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="primary-evaluator">
              <User className="h-4 w-4 mr-2" />
              Primary Evaluator
            </TabsTrigger>
            <TabsTrigger value="reviewers">
              <Users className="h-4 w-4 mr-2" />
              Independent Reviewers
            </TabsTrigger>
            <TabsTrigger value="compliance-checklist">
              <ClipboardCheck className="h-4 w-4 mr-2" />
              Compliance Checklist
            </TabsTrigger>
          </TabsList>

          <TabsContent value="primary-evaluator">{renderPrimaryEvaluatorForm()}</TabsContent>

          <TabsContent value="reviewers">{renderReviewersForm()}</TabsContent>

          <TabsContent value="compliance-checklist">{renderComplianceChecklist()}</TabsContent>
        </Tabs>

        <div className="flex justify-end pt-4">
          <Button
            className="bg-[#d97757] hover:bg-[#0E5EA5]"
            onClick={handleAddToCER}
            disabled={isLoading}
          >
            {isLoading ? (
              <LoadingSpinner size="sm" />
            ) : (
              <>
                <FileText className="h-4 w-4 mr-2" />
                Add to CER as Appendix
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default EvaluatorQualificationsPanel;
