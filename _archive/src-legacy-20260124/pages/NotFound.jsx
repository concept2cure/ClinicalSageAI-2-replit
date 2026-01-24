import React from 'react';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="text-center max-w-md mx-auto px-4">
        <h1 className="text-4xl font-bold text-[#1d1d1f] mb-4">Page Not Found</h1>
        <p className="text-[#86868b] mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to="/"
          className="inline-flex items-center px-5 py-2.5 bg-[#0071e3] text-white rounded-lg font-medium"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
