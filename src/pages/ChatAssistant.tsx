import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import ConversationalAssistant from '../components/ConversationalAssistant';

export default function ChatAssistant() {
  return (
    <div className="container mx-auto py-8">
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle>TrialSage CSR Assistant</CardTitle>
          <CardDescription>
            Ask questions and upload protocols for analysis against our library of 779 Clinical
            Study Reports
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConversationalAssistant initialPrompt="You are TrialSage, an expert on clinical trial design that uses the CSR library to provide evidence-based advice. Help users optimize their trial protocols by comparing them to successful trials in the CSR database." />
        </CardContent>
      </Card>
    </div>
  );
}
