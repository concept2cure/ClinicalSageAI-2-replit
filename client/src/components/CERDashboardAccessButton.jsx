import React from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { FileCheck } from 'lucide-react'

const CERDashboardAccessButton = () => {
  return (
    <div className="fixed bottom-5 right-5 z-50">
      <Link href="/enhanced-cer-dashboard">
        <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg">
          <FileCheck className="mr-2 h-5 w-5" />
          CER Dashboard
        </Button>
      </Link>
    </div>
  );
};

export default CERDashboardAccessButton;
