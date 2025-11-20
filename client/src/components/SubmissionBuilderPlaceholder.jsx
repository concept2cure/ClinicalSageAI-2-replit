import React from 'react';
import { Container } from '@/components/ui/container';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';

export default function SubmissionBuilderPlaceholder() {
  return (
    <div className="font-sans bg-gradient-to-br from-gray-900 to-black min-h-screen text-white">
      <Container className="py-20 text-center">
        <h1 className="text-4xl font-bold mb-6">Submission Builder</h1>
        <p className="text-xl max-w-xl mx-auto mb-8">
          The Submission Builder is currently unavailable due to missing dependencies.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link to="/">
            <Button
              size="lg"
              className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white px-8 py-2 rounded-lg"
            >
              Return to Home
            </Button>
          </Link>
        </div>
      </Container>
    </div>
  );
}
