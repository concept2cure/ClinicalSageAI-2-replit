import React from 'react';
import ConversationalAssistant from '../components/ConversationalAssistant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Toaster } from '../components/ui/toaster';
import { ToastProvider } from '../components/ui/toast';

const ChatAssistant = () => {
  return (
    <div className="container mx-auto p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold text-primary mb-4">TrialSage CSR Assistant</h1>
        <p className="text-muted-foreground mb-6">
          This standalone page provides direct access to the ConversationalAssistant component with
          improved CSR citation handling and protocol analysis.
        </p>

        <ToastProvider>
          <Card className="w-full">
            <CardHeader>
              <CardTitle>TrialSage CSR Chat</CardTitle>
              <CardDescription>
                Ask questions about CSRs or upload a protocol for comparison with 779 clinical study
                reports
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConversationalAssistant initialPrompt="You are TrialSage, an expert on clinical trial design that uses the CSR library to provide evidence-based advice. Help users optimize their trial protocols by comparing them to successful trials in the CSR database." />
            </CardContent>
          </Card>
          <Toaster />
        </ToastProvider>
      </div>
    </div>
  );
};

export default ChatAssistant;
