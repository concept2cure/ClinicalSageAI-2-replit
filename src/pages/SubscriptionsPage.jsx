import React from 'react';
import SubscriptionTiers from '@/components/SubscriptionTiers';

export default function SubscriptionsPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-5xl mb-4">
            Intelligence Bundles
          </h1>
          <p className="text-xl text-gray-500 dark:text-gray-400 max-w-3xl mx-auto">
            Specialized report packages tailored to your specific needs in clinical trial
            development.
          </p>
        </div>

        <SubscriptionTiers />
      </div>
    </div>
  );
}
