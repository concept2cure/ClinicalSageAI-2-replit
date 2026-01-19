import React from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';

export default function CoAuthorSafe() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
      <div className="max-w-xl w-full bg-white border border-slate-200 rounded-2xl shadow-lg p-8 space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">eCTD Co-Author</h1>
        <p className="text-slate-600">
          The Co-Author workspace is being re-synced. Please return shortly or use another module.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/client-portal">
            <Button variant="outline">Back to Client Portal</Button>
          </Link>
          <Link href="/login">
            <Button>Return to Login</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
