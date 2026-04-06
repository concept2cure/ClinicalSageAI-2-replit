import PreSubmissionDashboard from '@/components/ectd/PreSubmissionDashboard';
import { useParams } from 'wouter';
import { Card } from '@/components/ui/card';

export default function PreSubmissionValidation() {
 const { submissionId } = useParams();
 
 return (
 <div className="container mx-auto px-4 py-8">
 <PreSubmissionDashboard 
 submissionId={submissionId || 'default'} 
 moduleType="full"
 />
 </div>
 );
}