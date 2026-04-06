import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, X, BookOpen, Database, FileText, Download } from 'lucide-react';

/**
 * CER Onboarding Guide Component
 *
 * Displays a step-by-step guide for first-time CER users.
 * Shows a sequence of helpful tooltips explaining the workflow.
 */
const CerOnboardingGuide = ({ onDismiss }) => {
 const [currentStep, setCurrentStep] = useState(0);
 const [isVisible, setIsVisible] = useState(false);

 // Check localStorage to see if the user has seen the onboarding before
 useEffect(() => {
 const hasSeenOnboarding = localStorage.getItem('cerOnboardSeen') === 'true';
 setIsVisible(!hasSeenOnboarding);
 }, []);

 // If dismissed, save to localStorage and call the onDismiss callback
 const handleDismiss = () => {
 localStorage.setItem('cerOnboardSeen', 'true');
 setIsVisible(false);
 if (onDismiss) onDismiss();
 };

 // Move to the next step or dismiss if at the end
 const handleNext = () => {
 if (currentStep < steps.length - 1) {
 setCurrentStep(currentStep + 1);
 } else {
 handleDismiss();
 }
 };

 // Define the steps in the onboarding guide
 const steps = [
 {
 title: 'Welcome to the CER Builder',
 content:
 'This guide will help you create a compliant Clinical Evaluation Report with just a few clicks.',
 icon: <FileText className="w-8 h-8 text-stone-500 mb-2" />,
 position: { bottom: '80px', right: '20px' },
 },
 {
 title: 'Step 1: Fetch Real-World Data',
 content:
 "Start by filling device information, then click 'Data Retrieval' to automatically fetch FDA FAERS data and relevant literature.",
 icon: <Database className="w-8 h-8 text-stone-500 mb-2" />,
 position: { bottom: '120px', right: '140px' },
 },
 {
 title: 'Step 2: Review Literature & Evidence',
 content:
 'The Literature tab lets you search for studies and create a compliant search methodology documentation.',
 icon: <BookOpen className="w-8 h-8 text-stone-500 mb-2" />,
 position: { top: '120px', left: '140px' },
 },
 {
 title: 'Step 3: Generate Sections',
 content:
 'The Builder tab allows you to generate each CER section with AI, backed by the evidence collected in previous steps.',
 icon: <FileText className="w-8 h-8 text-stone-500 mb-2" />,
 position: { top: '80px', left: '20px' },
 },
 {
 title: 'Step 4: Export Your Report',
 content:
 'Once sections are complete, you can preview the full document and export it as PDF or Word.',
 icon: <Download className="w-8 h-8 text-stone-500 mb-2" />,
 position: { top: '80px', right: '20px' },
 },
 ];

 // If not visible, don't render anything
 if (!isVisible) return null;

 // Get current step
 const currentStepData = steps[currentStep];

 return (
 <div
 className="fixed z-50 transition-all duration-300"
 style={{
 ...currentStepData.position,
 opacity: isVisible ? 1 : 0,
 transform: isVisible ? 'scale(1)' : 'scale(0.95)',
 maxWidth: '350px',
 }}
 >
 <Card className="border border-stone-200 shadow-lg bg-white">
 <CardContent className="p-4">
 <div className="flex justify-between items-start">
 <div className="flex-1">
 {currentStepData.icon}
 <h3 className="text-lg font-medium text-gray-900 mb-1">{currentStepData.title}</h3>
 <p className="text-sm text-gray-600">{currentStepData.content}</p>
 </div>
 <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={handleDismiss}>
 <X className="h-4 w-4" />
 </Button>
 </div>

 <div className="flex items-center justify-between mt-4">
 <div className="flex space-x-1">
 {steps.map((_, index) => (
 <div
 key={index}
 className={`w-2 h-2 rounded-full ${
 index === currentStep
 ? 'bg-stone-700'
 : index < currentStep
 ? 'bg-stone-300'
 : 'bg-gray-200'
 }`}
 />
 ))}
 </div>

 <Button size="sm" onClick={handleNext} className="h-8 gap-1">
 {currentStep < steps.length - 1 ? (
 <>
 Next <ArrowRight className="h-3.5 w-3.5" />
 </>
 ) : (
 'Got it!'
 )}
 </Button>
 </div>
 </CardContent>
 </Card>
 </div>
 );
};

export default CerOnboardingGuide;
