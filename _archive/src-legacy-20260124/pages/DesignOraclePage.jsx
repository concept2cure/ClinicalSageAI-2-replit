import React from 'react';
import DesignFromMolecule from '@/components/DesignFromMolecule';

const DesignOraclePage = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          LumenTrialGuide.AI — Molecule-Specific Study Design Oracle
        </h1>
        <p className="text-muted-foreground mt-2">
          Design evidence-backed clinical trials based on your molecule's unique characteristics
        </p>
      </div>

      <div className="grid gap-4">
        <div className="col-span-full bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-4 rounded-lg border border-blue-100 dark:border-blue-900">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-blue-100 dark:bg-blue-900 p-2.5">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5 text-blue-700 dark:text-blue-300"
                >
                  <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
                  <path d="M12 8a2 2 0 0 1 4 0c0 4.4-4 3.5-4 8" />
                  <path d="M12 18h.01" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold">Why It Works</h3>
                <p className="text-sm text-muted-foreground">
                  We analyze molecules using pharmacokinetic profiles, mechanism of action, and
                  historical CSR data to generate scientifically-backed protocol designs.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DesignFromMolecule />
    </div>
  );
};

export default DesignOraclePage;
